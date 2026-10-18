import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct TransportFailure: Error, LocalizedError, Sendable {
    public let message: String
    public let retryable: Bool
    public init(_ message: String, retryable: Bool) { self.message = message; self.retryable = retryable }
    public var errorDescription: String? { message }
}

public protocol ProfileTransport: Sendable {
    func send(_ request: PendingRequest) async throws -> ProfileEnvelope
}

/// URLSession retains and resends the server's HttpOnly cookie. The screen sessionID
/// and CSRF token never substitute for this authentication cookie.
public final class HTTPProfileTransport: ProfileTransport, @unchecked Sendable {
    private let baseURL: URL
    private let configuration: URLSessionConfiguration

    public init(baseURL: URL, allowLocalHTTP: Bool = false,
                configuration: URLSessionConfiguration = .default) throws {
        let local = ["localhost", "127.0.0.1", "::1", "[::1]"].contains(baseURL.host?.lowercased() ?? "")
        guard baseURL.scheme == "https" || (allowLocalHTTP && local && baseURL.scheme == "http"),
              baseURL.host != nil, baseURL.user == nil, baseURL.password == nil,
              baseURL.query == nil, baseURL.fragment == nil,
              baseURL.path.isEmpty || baseURL.path == "/" else {
            throw ProtocolFailure("Configure an HTTPS API origin. Debug HTTP is restricted to loopback hosts.")
        }
        self.baseURL = baseURL
        self.configuration = configuration.copy() as! URLSessionConfiguration
        self.configuration.httpShouldSetCookies = true
        self.configuration.httpCookieAcceptPolicy = .always
        self.configuration.httpCookieStorage = configuration.httpCookieStorage ?? .shared
        self.configuration.urlCache = nil
        self.configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.configuration.timeoutIntervalForRequest = 20
        self.configuration.timeoutIntervalForResource = 30
    }

    public func send(_ pending: PendingRequest) async throws -> ProfileEnvelope {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.path = "/native/profile"
        if case .load = pending.kind {
            components.queryItems = [
                URLQueryItem(name: "protocolVersion", value: NativeProtocol.version),
                URLQueryItem(name: "requestID", value: pending.requestID),
                URLQueryItem(name: "capabilities", value: NativeProtocol.capabilities.joined(separator: ","))
            ]
        }
        guard let url = components.url else { throw ProtocolFailure("The API origin is invalid.") }
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if case .save = pending.kind {
            request.httpMethod = "POST"
            request.httpBody = pending.body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(pending.csrfToken, forHTTPHeaderField: "X-CSRF-Token")
        }
        let (data, response): (Data, HTTPURLResponse)
        do {
            (data, response) = try await BoundedDataRequest.perform(request, configuration: configuration)
        } catch let error as ProtocolFailure { throw error }
        catch { throw TransportFailure("Could not reach the server. Your edits are retained. Retry the same request.", retryable: true) }
        guard [200, 422, 409].contains(response.statusCode) else {
            struct APIError: Decodable {
                struct Detail: Decodable { let message: String }
                let error: Detail
            }
            let detail = (try? JSONDecoder().decode(APIError.self, from: data))?.error.message
            let retryable = response.statusCode == 408 || response.statusCode == 429 || response.statusCode >= 500
            throw TransportFailure(detail ?? "The server returned HTTP \(response.statusCode).", retryable: retryable)
        }
        guard response.mimeType?.lowercased() == "application/json" else {
            throw ProtocolFailure("The server did not return JSON.")
        }
        let envelope = try EnvelopeDecoder.decode(data)
        let expectedCode = envelope.status == .invalid ? 422 : (envelope.status == .conflict ? 409 : 200)
        guard response.statusCode == expectedCode else { throw ProtocolFailure("The HTTP status does not match the response status.") }
        return envelope
    }
}

/// Streaming delegate: enforce the limit while bytes arrive, including chunked responses.
/// Redirects are rejected so a remote response cannot redirect credentials or actions.
private final class BoundedDataRequest: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private var continuation: CheckedContinuation<(Data, HTTPURLResponse), Error>?
    private var bytes = Data()
    private var response: HTTPURLResponse?
    private var failure: Error?

    static func perform(_ request: URLRequest, configuration: URLSessionConfiguration) async throws -> (Data, HTTPURLResponse) {
        let delegate = BoundedDataRequest()
        return try await withCheckedThrowingContinuation { continuation in
            delegate.continuation = continuation
            let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
            session.dataTask(with: request).resume()
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse else {
            failure = ProtocolFailure("The response is not HTTP.")
            completionHandler(.cancel)
            return
        }
        guard response.expectedContentLength <= Int64(NativeProtocol.maximumResponseBytes) else {
            failure = ProtocolFailure("The response exceeds the 1 MiB limit.")
            completionHandler(.cancel)
            return
        }
        self.response = http
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard bytes.count <= NativeProtocol.maximumResponseBytes - data.count else {
            failure = ProtocolFailure("The response exceeds the 1 MiB limit.")
            dataTask.cancel()
            return
        }
        bytes.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        defer { continuation = nil; session.finishTasksAndInvalidate() }
        if let error = failure ?? error { continuation?.resume(throwing: error) }
        else if let response { continuation?.resume(returning: (bytes, response)) }
        else { continuation?.resume(throwing: ProtocolFailure("The server returned no response.")) }
    }
}
