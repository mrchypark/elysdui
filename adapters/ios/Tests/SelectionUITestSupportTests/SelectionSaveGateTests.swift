#if DEBUG
import XCTest
import ElyNativeCore
@testable import SelectionUITestSupport

@MainActor
final class SelectionSaveGateTests: XCTestCase {
    @MainActor
    func testContinuationIsInstalledBeforeHeldObserverCanRelease() async throws {
        let gate = SelectionSaveGate()
        defer { gate.tearDown() }
        var observedHeld = false
        gate.stateChanged = { state in
            guard state == .held("save-1") else { return }
            observedHeld = true
            XCTAssertTrue(gate.hasWaiter)
            XCTAssertTrue(gate.hasWatchdog)
            XCTAssertTrue(gate.release(requestID: "save-1", phase: .sending, pendingRequestID: "save-1"))
        }
        try await gate.hold(requestID: "save-1")
        XCTAssertTrue(observedHeld)
        XCTAssertEqual(gate.state, .released("save-1"))
        assertClean(gate)
    }

    @MainActor
    func testEarlyWrongAndDuplicateReleasesNeverOpenGate() async throws {
        let gate = SelectionSaveGate()
        defer { gate.tearDown() }
        XCTAssertFalse(gate.release(requestID: "save-1", phase: .sending, pendingRequestID: "save-1"))
        XCTAssertEqual(gate.state, .idle)
        let pending = await startHeld(gate)
        XCTAssertFalse(gate.release(requestID: "wrong", phase: .sending, pendingRequestID: "save-1"))
        XCTAssertEqual(gate.state, .held("save-1"))
        XCTAssertTrue(gate.hasWaiter)
        XCTAssertTrue(gate.release(requestID: "save-1", phase: .sending, pendingRequestID: "save-1"))
        try await pending.value
        XCTAssertFalse(gate.release(requestID: "save-1", phase: .sending, pendingRequestID: "save-1"))
        gate.expire(requestID: "save-1") // Late watchdog delivery cannot change a completed gate.
        XCTAssertEqual(gate.state, .released("save-1"))
        assertClean(gate)
    }

    @MainActor
    func testActualRetryablePhaseOrChangedPendingIDCannotRelease() async {
        for (phase, pendingID) in [(RequestPhase.retryable, "save-1"), (.sending, "other")] {
            let gate = SelectionSaveGate()
            let pending = await startHeld(gate)
            XCTAssertFalse(gate.release(requestID: "save-1", phase: phase, pendingRequestID: pendingID))
            await assertProtocolFailure(pending)
            XCTAssertEqual(gate.state, .failed("save-1", "model-not-sending-matching-request"))
            assertClean(gate)
        }
    }

    @MainActor
    func testCancellationBeforeRegistrationIsSticky() async {
        let gate = SelectionSaveGate()
        let pending = Task { try await gate.hold(requestID: "save-1") }
        pending.cancel()
        await assertProtocolFailure(pending)
        assertFailedAndUnreleasable(gate, reason: "cancelled")
    }

    @MainActor
    func testCancellationWhileHeldCleansContinuationAndWatchdog() async {
        let gate = SelectionSaveGate()
        let pending = await startHeld(gate)
        pending.cancel()
        await assertProtocolFailure(pending)
        assertFailedAndUnreleasable(gate, reason: "cancelled")
    }

    @MainActor
    func testCancellationRacingMatchingReleaseFailsClosed() async {
        let gate = SelectionSaveGate()
        let pending = await startHeld(gate)
        XCTAssertTrue(gate.release(requestID: "save-1", phase: .sending, pendingRequestID: "save-1"))
        pending.cancel() // Before the resumed task gets the MainActor again.
        await assertProtocolFailure(pending)
        assertFailedAndUnreleasable(gate, reason: "cancelled")
    }

    @MainActor
    func testScreenTeardownRacingReleaseWinsBeforeWaiterResumes() async {
        let gate = SelectionSaveGate()
        let pending = await startHeld(gate)
        XCTAssertTrue(gate.release(requestID: "save-1", phase: .sending, pendingRequestID: "save-1"))
        gate.tearDown()
        await assertProtocolFailure(pending)
        assertFailedAndUnreleasable(gate, reason: "screen-torn-down")
    }

    @MainActor
    func testScreenTeardownBeforeAndDuringHoldIsSticky() async {
        let before = SelectionSaveGate()
        before.tearDown()
        let unstarted = Task { try await before.hold(requestID: "save-1") }
        await assertProtocolFailure(unstarted)
        XCTAssertEqual(before.state, .failed(nil, "screen-torn-down"))
        assertClean(before)

        let during = SelectionSaveGate()
        let pending = await startHeld(during)
        during.tearDown()
        await assertProtocolFailure(pending)
        assertFailedAndUnreleasable(during, reason: "screen-torn-down")
        during.cancel()
        during.expire(requestID: "save-1")
        XCTAssertEqual(during.state, .failed("save-1", "screen-torn-down"))
    }

    @MainActor
    func testWatchdogExpiresWithoutSuccessfulOrRetryableRelease() async {
        // The injected watchdog finishes immediately: no wall-clock sleep in this control.
        let gate = SelectionSaveGate(watchdogWait: {})
        let pending = Task { try await gate.hold(requestID: "save-1") }
        await assertProtocolFailure(pending)
        assertFailedAndUnreleasable(gate, reason: "watchdog-expired")
    }

    @MainActor
    func testWrongTimeoutCannotEndHoldAndDuplicateStartFailsBothWaiters() async {
        let gate = SelectionSaveGate()
        let first = await startHeld(gate)
        gate.expire(requestID: "wrong")
        XCTAssertEqual(gate.state, .held("save-1"))
        XCTAssertTrue(gate.hasWaiter)
        let second = Task { try await gate.hold(requestID: "save-2") }
        await assertProtocolFailure(second)
        await assertProtocolFailure(first)
        assertFailedAndUnreleasable(gate, reason: "duplicate-start")
    }

    @MainActor
    private func startHeld(_ gate: SelectionSaveGate) async -> Task<Void, Error> {
        let held = expectation(description: "The gate publishes held only after installing its waiter")
        gate.stateChanged = { state in
            if state == .held("save-1") {
                XCTAssertTrue(gate.hasWaiter)
                held.fulfill()
            }
        }
        let pending = Task { try await gate.hold(requestID: "save-1") }
        await fulfillment(of: [held], timeout: 2)
        return pending
    }

    @MainActor
    private func assertProtocolFailure(_ pending: Task<Void, Error>,
                                       file: StaticString = #filePath, line: UInt = #line) async {
        do {
            try await pending.value
            XCTFail("The gate must fail closed.", file: file, line: line)
        } catch {
            XCTAssertTrue(error is ProtocolFailure, "Unexpected error: \(error)", file: file, line: line)
            XCTAssertFalse(error is TransportFailure, file: file, line: line)
        }
    }

    @MainActor
    private func assertFailedAndUnreleasable(_ gate: SelectionSaveGate, reason: String,
                                           file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(gate.state, .failed("save-1", reason), file: file, line: line)
        XCTAssertFalse(gate.release(requestID: "save-1", phase: .sending, pendingRequestID: "save-1"),
                       file: file, line: line)
        XCTAssertThrowsError(try gate.checkFailure(), file: file, line: line)
        assertClean(gate, file: file, line: line)
    }

    @MainActor
    private func assertClean(_ gate: SelectionSaveGate, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertFalse(gate.hasWaiter, file: file, line: line)
        XCTAssertFalse(gate.hasWatchdog, file: file, line: line)
    }
}
#endif
