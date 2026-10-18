#if DEBUG
import Foundation
import ElyNativeCore

/// Test-only fault injection around actual Go requests. The app supplies HTTPProfileTransport.
@MainActor
final class SelectionUITestTransport: ProfileTransport {
    enum Scenario: String, Sendable {
        case disabled, interruptedSave = "interrupted-save"

        static func optedIn(arguments: [String], environment: [String: String]) -> Self? {
            guard arguments.contains("--selection-ui-test") else { return nil }
            return Self(rawValue: environment["ELY_SELECTION_UI_SCENARIO"] ?? "")
        }
    }

    let live: any ProfileTransport
    let scenario: Scenario
    let gate: SelectionSaveGate?
    private var interruptedRequest: PendingRequest?
    private var didInterrupt = false

    init(live: any ProfileTransport, scenario: Scenario, gate: SelectionSaveGate? = nil) {
        self.live = live; self.scenario = scenario; self.gate = gate
    }

    func send(_ request: PendingRequest) async throws -> ProfileEnvelope {
        try gate?.checkFailure()
        if let interruptedRequest, case .save = request.kind {
            guard request == interruptedRequest else {
                gate?.fail("retry-snapshot-changed", requestID: request.requestID)
                throw ProtocolFailure("The UI test retry changed the original request snapshot.")
            }
        }
        if scenario == .interruptedSave, !didInterrupt, case .save(let submitted) = request.kind {
            guard let gate else { throw ProtocolFailure("The interrupted-save UI test requires its release gate.") }
            didInterrupt = true
            interruptedRequest = request
            return try await withTaskCancellationHandler {
                do {
                    if Task.isCancelled { gate.cancel(requestID: request.requestID); try gate.checkFailure() }
                    let response = try await live.send(request)
                    // Do not advertise a held save until this exact request really committed.
                    guard response.status == .saved, response.requestID == request.requestID,
                          response.sessionID == submitted.sessionID, response.screenID == submitted.screenID,
                          response.acknowledgedEdits == submitted.editRevisions,
                          response.dataVersion > submitted.dataVersion else {
                        gate.fail("unexpected-save-response", requestID: request.requestID)
                        try gate.checkFailure()
                        throw ProtocolFailure("The UI test expected a matching committed save.")
                    }
                    try await gate.hold(requestID: request.requestID)
                    if Task.isCancelled { gate.cancel(requestID: request.requestID); try gate.checkFailure() }
                    // Only the matching explicit release reaches this retryable fault.
                    throw TransportFailure("UI test interrupted a completed save. Retry the same request.", retryable: true)
                } catch {
                    if Task.isCancelled { gate.cancel(requestID: request.requestID); try gate.checkFailure() }
                    try gate.checkFailure()
                    throw error
                }
            } onCancel: {
                Task { @MainActor in gate.cancel(requestID: request.requestID) }
            }
        }
        var response = try await live.send(request)
        try gate?.checkFailure()
        if scenario == .disabled {
            func disableSelections(_ node: inout NativeNode) {
                if ["checkbox", "select"].contains(node.type) { node.props.disabled = true }
                for index in node.children.indices { disableSelections(&node.children[index]) }
            }
            disableSelections(&response.region)
        }
        if request == interruptedRequest { interruptedRequest = nil }
        return response
    }
}
#endif
