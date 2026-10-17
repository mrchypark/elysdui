#if DEBUG
import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import ElyNativeCore
@testable import SelectionUITestSupport

@MainActor
final class SelectionUITestTransportTests: XCTestCase {
    @MainActor
    func testHooksRequireBothExplicitArgumentAndWhitelistedScenario() async {
        typealias Scenario = SelectionUITestTransport.Scenario
        XCTAssertNil(Scenario.optedIn(arguments: [], environment: [:]))
        XCTAssertNil(Scenario.optedIn(arguments: [], environment: ["ELY_SELECTION_UI_SCENARIO": "interrupted-save"]))
        XCTAssertNil(Scenario.optedIn(arguments: ["--selection-ui-test"], environment: [:]))
        XCTAssertNil(Scenario.optedIn(arguments: ["--selection-ui-test"], environment: ["ELY_SELECTION_UI_SCENARIO": "unknown"]))
        XCTAssertEqual(Scenario.optedIn(arguments: ["--selection-ui-test"], environment: ["ELY_SELECTION_UI_SCENARIO": "interrupted-save"]), .interruptedSave)
        XCTAssertEqual(Scenario.optedIn(arguments: ["--selection-ui-test"], environment: ["ELY_SELECTION_UI_SCENARIO": "disabled"]), .disabled)
    }

    @MainActor
    func testMatchingReleaseRetainsExactRetryAndNewerSelections() async throws {
        var state = try loadedState()
        state.edit(field: "digestConsent", value: "true")
        state.edit(field: "colorTheme", value: "dark")
        let original = try state.beginSave(requestID: "save-1")
        let response = try savedReply(to: original)
        let live = RecordingTransport(response: response)
        let gate = SelectionSaveGate()
        defer { gate.tearDown() }
        let transport = SelectionUITestTransport(live: live, scenario: .interruptedSave, gate: gate)
        let pending = await startHeld(transport, request: original, gate: gate)
        let sentBeforeRelease = await live.requests
        XCTAssertEqual(sentBeforeRelease, [original])
        XCTAssertEqual(state.phase, .sending)
        state.edit(field: "digestConsent", value: "false")
        XCTAssertEqual(gate.state, .held(original.requestID))
        XCTAssertEqual(state.phase, .sending)
        state.edit(field: "colorTheme", value: "light")
        XCTAssertEqual(gate.state, .held(original.requestID))
        XCTAssertEqual(state.phase, .sending)
        XCTAssertTrue(gate.release(requestID: original.requestID, phase: state.phase,
                                   pendingRequestID: state.pending?.requestID))
        do {
            _ = try await pending.value
            XCTFail("Only the released save should produce the injected retryable fault.")
        } catch let failure as TransportFailure {
            XCTAssertTrue(failure.retryable)
            state.fail(requestID: original.requestID, message: failure.message, retryable: failure.retryable)
        }
        XCTAssertEqual(state.phase, .retryable)
        let retry = try state.retry()
        XCTAssertEqual(retry, original)
        XCTAssertEqual(retry.body, original.body)
        XCTAssertEqual(retry.csrfToken, original.csrfToken)
        let wire = try JSONDecoder().decode(SaveRequest.self, from: XCTUnwrap(retry.body))
        XCTAssertEqual(wire.fields["digestConsent"], "true")
        XCTAssertEqual(wire.fields["colorTheme"], "dark")
        let replay = try await transport.send(retry)
        try state.receive(replay)
        let sentAfterRetry = await live.requests
        XCTAssertEqual(sentAfterRetry, [original, original])
        XCTAssertEqual(state.drafts["digestConsent"], "false")
        XCTAssertEqual(state.drafts["colorTheme"], "light")
        XCTAssertEqual(state.baseline["digestConsent"], "true")
        XCTAssertEqual(state.baseline["colorTheme"], "dark")
        XCTAssertTrue(state.hasUnsavedChanges)
        XCTAssertNil(state.failureMessage)
    }

    @MainActor
    func testChangedRetrySnapshotIsRejectedBeforeAnotherHTTPCall() async throws {
        var state = try loadedState()
        let original = try state.beginSave(requestID: "save-1")
        let live = RecordingTransport(response: try savedReply(to: original))
        let gate = SelectionSaveGate()
        let transport = SelectionUITestTransport(live: live, scenario: .interruptedSave, gate: gate)
        let pending = await startHeld(transport, request: original, gate: gate)
        XCTAssertTrue(gate.release(requestID: original.requestID, phase: .sending, pendingRequestID: original.requestID))
        do { _ = try await pending.value; XCTFail("Expected interrupted save") }
        catch let failure as TransportFailure { XCTAssertTrue(failure.retryable) }
        var otherState = try loadedState()
        otherState.edit(field: "colorTheme", value: "light")
        // Same ID, changed body and submitted revision: the entire snapshot must match.
        let changed = try otherState.beginSave(requestID: original.requestID)
        do { _ = try await transport.send(changed); XCTFail("Changed retry must fail") }
        catch { XCTAssertTrue(error is ProtocolFailure) }
        let sent = await live.requests
        XCTAssertEqual(sent, [original])
        XCTAssertEqual(gate.state, .failed("save-1", "retry-snapshot-changed"))
    }

    @MainActor
    func testMismatchedOrUncommittedResponseNeverPublishesHeld() async throws {
        for defect in ["request", "session", "screen", "status", "acknowledgments", "version"] {
            var state = try loadedState()
            let request = try state.beginSave(requestID: "save-1")
            var response = try savedReply(to: request)
            switch defect {
            case "request": response.requestID = "wrong"
            case "session": response.sessionID = "wrong"
            case "screen": response.screenID = "wrong"
            case "status": response.status = .invalid
            case "acknowledgments": response.acknowledgedEdits = [:]
            default: response.dataVersion = 0
            }
            let gate = SelectionSaveGate()
            var publishedHeld = false
            gate.stateChanged = { if case .held = $0 { publishedHeld = true } }
            let transport = SelectionUITestTransport(live: RecordingTransport(response: response), scenario: .interruptedSave, gate: gate)
            do { _ = try await transport.send(request); XCTFail("Invalid response must fail: \(defect)") }
            catch { XCTAssertTrue(error is ProtocolFailure) }
            XCTAssertFalse(publishedHeld)
            XCTAssertEqual(gate.state, .failed("save-1", "unexpected-save-response"))
            XCTAssertFalse(gate.hasWaiter)
        }
    }

    @MainActor
    func testTimeoutCannotBecomeInjectedRetryableFaultOrPermitRetry() async throws {
        var state = try loadedState()
        let request = try state.beginSave(requestID: "save-1")
        let live = RecordingTransport(response: try savedReply(to: request))
        let gate = SelectionSaveGate(watchdogWait: {})
        let transport = SelectionUITestTransport(live: live, scenario: .interruptedSave, gate: gate)
        do { _ = try await transport.send(request); XCTFail("Watchdog must fail closed") }
        catch {
            XCTAssertTrue(error is ProtocolFailure)
            state.fail(requestID: request.requestID, message: error.localizedDescription, retryable: false)
        }
        XCTAssertEqual(state.phase, .blocked)
        XCTAssertThrowsError(try state.retry())
        XCTAssertFalse(gate.release(requestID: request.requestID, phase: .sending, pendingRequestID: request.requestID))
        do { _ = try await transport.send(request); XCTFail("Latched failure must remain blocked") }
        catch { XCTAssertTrue(error is ProtocolFailure) }
        let sent = await live.requests
        XCTAssertEqual(sent, [request])
    }

    @MainActor
    func testCancellationAndTeardownBeforeLiveReplyCannotPublishHeld() async throws {
        for cancelled in [true, false] {
            var state = try loadedState()
            let request = try state.beginSave(requestID: "save-1")
            let started = expectation(description: "The real transport call has started")
            let failed = expectation(description: "Cancellation or teardown is latched before a late response")
            let live = SuspendedTransport(response: try savedReply(to: request), started: { started.fulfill() })
            let gate = SelectionSaveGate()
            var publishedHeld = false
            gate.stateChanged = {
                if case .held = $0 { publishedHeld = true }
                if case .failed = $0 { failed.fulfill() }
            }
            let transport = SelectionUITestTransport(live: live, scenario: .interruptedSave, gate: gate)
            let pending = Task { try await transport.send(request) }
            await fulfillment(of: [started], timeout: 2)
            if cancelled { pending.cancel() } else { gate.tearDown() }
            await fulfillment(of: [failed], timeout: 2)
            await live.complete() // An uncancellable HTTP operation may deliver late.
            do { _ = try await pending.value; XCTFail("A late reply cannot become the injected retryable fault") }
            catch { XCTAssertTrue(error is ProtocolFailure) }
            XCTAssertFalse(publishedHeld)
            XCTAssertFalse(gate.hasWaiter)
            XCTAssertFalse(gate.hasWatchdog)
            XCTAssertFalse(gate.release(requestID: request.requestID, phase: .sending, pendingRequestID: request.requestID))
            XCTAssertThrowsError(try gate.checkFailure())
        }
    }

    @MainActor
    func testLiveGoHeldSaveExactReplayAndExplicitReload() async throws {
        guard let base = ProcessInfo.processInfo.environment["ELY_NATIVE_CONTROLS_BASE_URL"] else {
            throw XCTSkip("Set ELY_NATIVE_CONTROLS_BASE_URL with the real controls server running.")
        }
        let live = try HTTPProfileTransport(baseURL: XCTUnwrap(URL(string: base)), allowLocalHTTP: true,
                                            configuration: .ephemeral)
        let gate = SelectionSaveGate()
        defer { gate.tearDown() }
        let transport = SelectionUITestTransport(live: live, scenario: .interruptedSave, gate: gate)
        var state = ProfileState()
        let ready = try await transport.send(state.beginLoad())
        try state.receive(ready)
        state.edit(field: "digestConsent", value: "true")
        state.edit(field: "colorTheme", value: "dark")
        let original = try state.beginSave()
        let pending = await startHeld(transport, request: original, gate: gate, timeout: 30)
        XCTAssertEqual(state.phase, .sending)
        state.edit(field: "digestConsent", value: "false")
        XCTAssertEqual(gate.state, .held(original.requestID))
        state.edit(field: "colorTheme", value: "light")
        XCTAssertEqual(gate.state, .held(original.requestID))
        XCTAssertEqual(state.phase, .sending)
        XCTAssertTrue(gate.release(requestID: original.requestID, phase: state.phase,
                                   pendingRequestID: state.pending?.requestID))
        do { _ = try await pending.value; XCTFail("Expected the released save fault") }
        catch let failure as TransportFailure {
            XCTAssertTrue(failure.retryable)
            state.fail(requestID: original.requestID, message: failure.message, retryable: failure.retryable)
        }
        let exactRetry = try state.retry()
        XCTAssertEqual(exactRetry, original)
        let replay = try await transport.send(exactRetry)
        try state.receive(replay)
        XCTAssertEqual(state.drafts["digestConsent"], "false")
        XCTAssertEqual(state.drafts["colorTheme"], "light")
        XCTAssertTrue(state.hasUnsavedChanges)
        XCTAssertNil(state.failureMessage)
        let reload = try state.beginLoad(discardingDrafts: true)
        try state.receive(await transport.send(reload))
        XCTAssertEqual(state.drafts["digestConsent"], "true")
        XCTAssertEqual(state.drafts["colorTheme"], "dark")
        XCTAssertFalse(state.hasUnsavedChanges)
    }

    @MainActor
    private func startHeld(_ transport: SelectionUITestTransport, request: PendingRequest,
                           gate: SelectionSaveGate, timeout: TimeInterval = 2) async -> Task<ProfileEnvelope, Error> {
        let held = expectation(description: "The actual wrapped response reaches the held gate")
        gate.stateChanged = { if $0 == .held(request.requestID) { held.fulfill() } }
        let pending = Task { try await transport.send(request) }
        await fulfillment(of: [held], timeout: timeout)
        return pending
    }

    private func loadedState() throws -> ProfileState {
        let ready = try fixture("profile-controls-ready")
        var state = ProfileState()
        try state.beginLoad(requestID: ready.requestID)
        try state.receive(ready)
        return state
    }

    private func savedReply(to request: PendingRequest) throws -> ProfileEnvelope {
        guard case .save(let submitted) = request.kind else { throw ProtocolFailure("Expected save") }
        var response = try fixture("profile-controls-saved")
        response.requestID = request.requestID
        response.sessionID = submitted.sessionID
        response.screenID = submitted.screenID
        response.acknowledgedEdits = submitted.editRevisions
        response.dataVersion = submitted.dataVersion + 1
        return response
    }

    private func fixture(_ name: String) throws -> ProfileEnvelope {
        let directory = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("fixtures")
        return try EnvelopeDecoder.decode(Data(contentsOf: directory.appendingPathComponent("\(name).json")))
    }
}

private actor RecordingTransport: ProfileTransport {
    let response: ProfileEnvelope
    private(set) var requests: [PendingRequest] = []
    init(response: ProfileEnvelope) { self.response = response }
    func send(_ request: PendingRequest) async throws -> ProfileEnvelope {
        requests.append(request)
        return response
    }
}
private actor SuspendedTransport: ProfileTransport {
    let response: ProfileEnvelope
    let started: @Sendable () -> Void
    private var continuation: CheckedContinuation<ProfileEnvelope, Error>?
    init(response: ProfileEnvelope, started: @escaping @Sendable () -> Void) {
        self.response = response; self.started = started
    }
    func send(_ request: PendingRequest) async throws -> ProfileEnvelope {
        try await withCheckedThrowingContinuation {
            continuation = $0
            started()
        }
    }
    func complete() {
        let waiting = continuation
        continuation = nil
        waiting?.resume(returning: response)
    }
}
#endif
