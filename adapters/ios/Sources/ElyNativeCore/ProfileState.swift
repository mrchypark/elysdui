import Foundation

public enum PendingKind: Equatable, Sendable {
    case load
    case save(SaveRequest)
}

/// The immutable wire request is retained after uncertain network failures.
public struct PendingRequest: Equatable, Sendable {
    public let kind: PendingKind
    public let requestID: String
    public let csrfToken: String?
    public let body: Data?
}

public enum RequestPhase: Equatable, Sendable { case idle, sending, retryable, blocked }
public enum Acceptance: Equatable, Sendable { case applied, ignored }

/// Value-type state machine shared by the app and deterministic unit tests.
public struct ProfileState: Equatable, Sendable {
    public private(set) var envelope: ProfileEnvelope?
    public private(set) var baseline: [String: String] = [:]
    public private(set) var drafts: [String: String] = [:]
    public private(set) var editRevisions: [String: Int64] = [:]
    public private(set) var fieldErrors: [String: String] = [:]
    public private(set) var pending: PendingRequest?
    public private(set) var phase: RequestPhase = .idle
    public private(set) var failureMessage: String?
    public private(set) var statusMessage = ""
    public init() {}

    public var isSending: Bool { phase == .sending }
    public var isLoading: Bool {
        guard let pending else { return false }
        if case .load = pending.kind { return true }
        return false
    }
    public var canSave: Bool { envelope != nil && pending == nil && phase == .idle }
    public var hasUnsavedChanges: Bool { drafts != baseline }

    /// Only an explicit reload may replace an existing request and discard drafts.
    @discardableResult
    public mutating func beginLoad(discardingDrafts: Bool = false, requestID: String = UUID().uuidString) throws -> PendingRequest {
        guard discardingDrafts || (envelope == nil && pending == nil) else {
            throw ProtocolFailure("Reloading discards local edits. Confirm reload first.")
        }
        let request = PendingRequest(kind: .load, requestID: requestID, csrfToken: nil, body: nil)
        pending = request
        phase = .sending
        failureMessage = nil
        // Existing edits remain visible until the replacement load succeeds.
        return request
    }

    public mutating func edit(field: String, value: String) {
        guard drafts[field] != nil, envelope != nil, !isLoading, drafts[field] != value else { return }
        let revision = editRevisions[field, default: 0]
        guard revision < 9_007_199_254_740_991 else {
            failureMessage = "The local edit limit was reached. Reload before editing again."
            return
        }
        drafts[field] = value
        editRevisions[field] = revision + 1
        fieldErrors.removeValue(forKey: field)
        if envelope?.status == .invalid { statusMessage = "" }
    }

    @discardableResult
    public mutating func beginSave(requestID: String = UUID().uuidString) throws -> PendingRequest {
        guard canSave, let envelope else { throw ProtocolFailure("Resolve the current request before saving again.") }
        let save = SaveRequest(envelope: envelope, requestID: requestID, fields: drafts, revisions: editRevisions)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let request = PendingRequest(kind: .save(save), requestID: requestID,
                                     csrfToken: envelope.csrfToken, body: try encoder.encode(save))
        pending = request
        phase = .sending
        failureMessage = nil
        return request
    }

    @discardableResult
    public mutating func retry() throws -> PendingRequest {
        guard phase == .retryable, let pending else { throw ProtocolFailure("No retryable request is available.") }
        phase = .sending
        failureMessage = nil
        return pending
    }

    public mutating func fail(requestID: String, message: String, retryable: Bool) {
        guard pending?.requestID == requestID else { return }
        phase = retryable ? .retryable : .blocked
        failureMessage = message
    }

    @discardableResult
    public mutating func receive(_ response: ProfileEnvelope) throws -> Acceptance {
        guard let pending, response.requestID == pending.requestID else { return .ignored }
        if case .save(let submitted) = pending.kind {
            guard response.screenID == submitted.screenID, response.sessionID == submitted.sessionID else { return .ignored }
        }
        if let current = envelope, response.sessionID == current.sessionID,
           response.dataVersion < current.dataVersion { return .ignored }
        try EnvelopeDecoder.validate(response)
        if case .save(let submitted) = pending.kind, Set(response.fields.keys) != Set(submitted.fields.keys) {
            throw ProtocolFailure("The field set changed during a save. Reload the screen before continuing.")
        }

        // A save must not change the meaning or available values of newer local edits.
        if case .save = pending.kind, let current = envelope {
            func controls(_ node: NativeNode) -> [String: NativeNode] {
                var result: [String: NativeNode] = [:]
                if ["input", "switch", "checkbox", "select"].contains(node.type), let name = node.props.name {
                    result[name] = node
                }
                for child in node.children { result.merge(controls(child)) { first, _ in first } }
                return result
            }
            let old = controls(current.region), new = controls(response.region)
            guard old.keys.allSatisfy({ name in
                guard let previous = old[name], let replacement = new[name] else { return false }
                return previous.id == replacement.id && previous.type == replacement.type
                    && previous.props.options == replacement.props.options
                    && previous.props.disabled == replacement.props.disabled
                    && previous.props.readonly == replacement.props.readonly
                    && previous.props.required == replacement.props.required
                    && previous.props.multiple == replacement.props.multiple
                    && previous.props.type == replacement.props.type
            }) else {
                throw ProtocolFailure("The control modes or options changed during a save. Reload the screen before continuing.")
            }
        }

        switch pending.kind {
        case .load:
            guard response.status == .ready, response.acknowledgedEdits.isEmpty else {
                throw ProtocolFailure("The load response has an invalid status or acknowledgment.")
            }
            baseline = response.fields
            drafts = response.fields
            editRevisions = response.fields.mapValues { _ in 0 }
            fieldErrors = [:]
        case .save(let submitted):
            guard response.status != .ready, response.acknowledgedEdits == submitted.editRevisions else {
                throw ProtocolFailure("The server did not acknowledge the submitted edit revisions.")
            }
            if response.status == .saved {
                guard response.dataVersion > submitted.dataVersion else {
                    throw ProtocolFailure("The saved response did not advance the data version.")
                }
                for (name, value) in response.fields where editRevisions[name] == response.acknowledgedEdits[name] {
                    drafts[name] = value
                }
            }
            baseline = response.fields
            fieldErrors = response.errors.filter { editRevisions[$0.key] == response.acknowledgedEdits[$0.key] }
        }
        envelope = response
        statusMessage = response.status == .invalid && fieldErrors.isEmpty ? "" : response.message
        self.pending = nil
        phase = .idle
        failureMessage = nil
        return .applied
    }
}
