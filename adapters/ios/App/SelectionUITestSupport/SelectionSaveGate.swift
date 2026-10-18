#if DEBUG
import Foundation
import ElyNativeCore

/// App-owned, one-shot test synchronization. No shipping library API or Release code.
@MainActor
final class SelectionSaveGate {
    enum State: Equatable {
        case idle
        case held(String)
        case released(String)
        case failed(String?, String)

        var requestID: String? {
            switch self {
            case .idle: return nil
            case .held(let id), .released(let id): return id
            case .failed(let id, _): return id
            }
        }
        var name: String {
            switch self {
            case .idle: return "idle"
            case .held: return "held"
            case .released: return "released"
            case .failed: return "failed"
            }
        }
    }

    private(set) var state: State = .idle
    var stateChanged: ((State) -> Void)?
    private var continuation: CheckedContinuation<Void, Error>?
    private var watchdog: Task<Void, Never>?
    // A cleanup bound only: expiry is a latched protocol failure, never a release.
    private let watchdogWait: @Sendable () async throws -> Void

    init(watchdogWait: @escaping @Sendable () async throws -> Void = {
        try await Task.sleep(nanoseconds: 120_000_000_000)
    }) {
        self.watchdogWait = watchdogWait
    }

    var hasWaiter: Bool { continuation != nil }
    var hasWatchdog: Bool { watchdog != nil }

    func checkFailure() throws {
        if case .failed(_, let reason) = state { throw ProtocolFailure("Selection UI handshake failed: \(reason).") }
    }

    func hold(requestID: String) async throws {
        try checkFailure()
        guard state == .idle else {
            fail("duplicate-start", requestID: requestID)
            try checkFailure()
            return
        }
        if Task.isCancelled {
            fail("cancelled", requestID: requestID)
            try checkFailure()
        }
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (waiting: CheckedContinuation<Void, Error>) in
                // Install FIRST. A synchronous observer may release as soon as held is published.
                continuation = waiting
                if Task.isCancelled {
                    fail("cancelled", requestID: requestID)
                    return
                }
                watchdog = Task { [weak self, watchdogWait] in
                    do { try await watchdogWait() } catch { return }
                    guard !Task.isCancelled else { return }
                    self?.expire(requestID: requestID)
                }
                transition(to: .held(requestID))
            }
        } onCancel: {
            Task { @MainActor in self.fail("cancelled", requestID: requestID) }
        }
        // Cancellation must not turn a simultaneous release into the expected injected fault.
        if Task.isCancelled { fail("cancelled", requestID: requestID) }
        try checkFailure()
        guard state == .released(requestID) else {
            fail("missing-release", requestID: requestID)
            try checkFailure()
            return
        }
    }

    @discardableResult
    func release(requestID: String, phase: RequestPhase, pendingRequestID: String?) -> Bool {
        guard state == .held(requestID) else { return false }
        guard phase == .sending, pendingRequestID == requestID else {
            fail("model-not-sending-matching-request", requestID: requestID)
            return false
        }
        let waiting = takeWaiter()
        transition(to: .released(requestID))
        waiting?.resume()
        return true
    }

    func cancel(requestID: String? = nil) { fail("cancelled", requestID: requestID) }
    func tearDown() { fail("screen-torn-down") }

    func expire(requestID: String) {
        guard state == .held(requestID) else { return }
        fail("watchdog-expired", requestID: requestID)
    }

    func fail(_ reason: String, requestID: String? = nil) {
        if case .failed = state { return } // The first failure survives late release/cleanup.
        let id = state.requestID ?? requestID
        let waiting = takeWaiter()
        transition(to: .failed(id, reason))
        waiting?.resume(throwing: ProtocolFailure("Selection UI handshake failed: \(reason)."))
    }

    private func takeWaiter() -> CheckedContinuation<Void, Error>? {
        let waiting = continuation
        continuation = nil
        watchdog?.cancel()
        watchdog = nil
        return waiting
    }

    private func transition(to next: State) {
        state = next
        stateChanged?(next)
    }
}
#endif
