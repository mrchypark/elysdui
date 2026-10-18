import XCTest
@testable import ElyNativeCore

final class ProfileStateTests: XCTestCase {
    static let fixtureDirectory = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("contracts/native/profile-v1/fixtures")

    func fixture(_ name: String = "profile-ready") throws -> ProfileEnvelope {
        try EnvelopeDecoder.decode(Data(contentsOf: Self.fixtureDirectory.appendingPathComponent("\(name).json")))
    }

    func loadedState() throws -> ProfileState {
        let ready = try fixture()
        var state = ProfileState()
        try state.beginLoad(requestID: ready.requestID)
        XCTAssertEqual(try state.receive(ready), .applied)
        return state
    }

    func reply(to request: PendingRequest, status: ResponseStatus = .saved, value: String = "Grace Hopper") throws -> ProfileEnvelope {
        guard case .save(let save) = request.kind else { throw ProtocolFailure("Expected save request.") }
        var response = try fixture()
        response.requestID = request.requestID
        response.sessionID = save.sessionID
        response.screenRevision = save.screenRevision
        response.dataVersion = save.dataVersion + (status == .saved ? 1 : 0)
        response.status = status
        response.fields = ["displayName": value]
        response.acknowledgedEdits = save.editRevisions
        response.message = status == .saved ? "Profile saved." : "No changes saved."
        if status == .invalid { response.errors = ["displayName": "Use 2 to 60 characters."] }
        return response
    }

    func testSharedGoFixturesDecode() throws {
        XCTAssertEqual(try fixture().status, .ready)
        XCTAssertEqual(try fixture("profile-invalid").errors.count, 1)
        XCTAssertEqual(try fixture("profile-saved").fields["displayName"], "Grace Hopper")
    }

    func testLoadInitializesSeparateDraftAndBaseline() throws {
        var state = try loadedState()
        XCTAssertEqual(state.drafts, ["displayName": "Ada"])
        XCTAssertEqual(state.editRevisions, ["displayName": 0])
        state.edit(field: "displayName", value: "Grace")
        XCTAssertEqual(state.baseline["displayName"], "Ada")
        XCTAssertEqual(state.drafts["displayName"], "Grace")
        XCTAssertEqual(state.editRevisions["displayName"], 1)
        XCTAssertTrue(state.hasUnsavedChanges)
    }

    func testSaveAdoptsCanonicalValueWhenUnedited() throws {
        var state = try loadedState()
        state.edit(field: "displayName", value: "  Grace Hopper  ")
        let pending = try state.beginSave()
        XCTAssertEqual(try state.receive(reply(to: pending)), .applied)
        XCTAssertEqual(state.drafts["displayName"], "Grace Hopper")
        XCTAssertFalse(state.hasUnsavedChanges)
        XCTAssertTrue(state.canSave)
    }

    func testEditsDuringSaveSurviveCanonicalResponse() throws {
        var state = try loadedState()
        state.edit(field: "displayName", value: "  Grace Hopper  ")
        let pending = try state.beginSave()
        state.edit(field: "displayName", value: "Newer local edit")
        try state.receive(reply(to: pending))
        XCTAssertEqual(state.baseline["displayName"], "Grace Hopper")
        XCTAssertEqual(state.drafts["displayName"], "Newer local edit")
        XCTAssertEqual(state.editRevisions["displayName"], 2)
        XCTAssertTrue(state.hasUnsavedChanges)
    }

    func testRetryRetainsExactBodyIDCSRFAndSubmittedRevisions() throws {
        var state = try loadedState()
        state.edit(field: "displayName", value: "First edit")
        let original = try state.beginSave()
        state.fail(requestID: original.requestID, message: "Timeout", retryable: true)
        state.edit(field: "displayName", value: "Later edit")
        let retried = try state.retry()
        XCTAssertEqual(original, retried)
        XCTAssertEqual(original.body, retried.body)
        XCTAssertEqual(state.phase, .sending)
        XCTAssertThrowsError(try state.beginSave())
        try state.receive(reply(to: retried, value: "First edit"))
        XCTAssertEqual(state.drafts["displayName"], "Later edit")
    }

    func testSaveCannotBeDuplicatedWhileInFlight() throws {
        var state = try loadedState()
        _ = try state.beginSave()
        XCTAssertThrowsError(try state.beginSave())
        XCTAssertThrowsError(try state.retry())
    }

    func testValidationErrorsAreRevisionScopedAndClearOnEdit() throws {
        var state = try loadedState()
        state.edit(field: "displayName", value: "")
        let pending = try state.beginSave()
        try state.receive(reply(to: pending, status: .invalid, value: "Ada"))
        XCTAssertEqual(state.drafts["displayName"], "")
        XCTAssertEqual(state.baseline["displayName"], "Ada")
        XCTAssertNotNil(state.fieldErrors["displayName"])
        state.edit(field: "displayName", value: "New name")
        XCTAssertTrue(state.fieldErrors.isEmpty)
        XCTAssertEqual(state.statusMessage, "")
    }

    func testLateValidationDoesNotShowErrorForNewerEdit() throws {
        var state = try loadedState()
        state.edit(field: "displayName", value: "")
        let pending = try state.beginSave()
        state.edit(field: "displayName", value: "New name")
        try state.receive(reply(to: pending, status: .invalid, value: "Ada"))
        XCTAssertEqual(state.drafts["displayName"], "New name")
        XCTAssertTrue(state.fieldErrors.isEmpty)
        XCTAssertEqual(state.statusMessage, "")
    }

    func testConflictKeepsDraftAndUsesLatestRevisionForNextExplicitSave() throws {
        var state = try loadedState()
        state.edit(field: "displayName", value: "My local edit")
        let pending = try state.beginSave()
        var conflict = try reply(to: pending, status: .conflict, value: "Other device")
        conflict.dataVersion = 8
        conflict.screenRevision = "new-definition"
        try state.receive(conflict)
        XCTAssertEqual(state.drafts["displayName"], "My local edit")
        XCTAssertEqual(state.baseline["displayName"], "Other device")
        let next = try state.beginSave()
        guard case .save(let body) = next.kind else { return XCTFail("Expected save") }
        XCTAssertEqual(body.dataVersion, 8)
        XCTAssertEqual(body.screenRevision, "new-definition")
    }

    func testOutOfOrderOrWrongSessionResponsesDoNotChangeState() throws {
        var state = try loadedState()
        let pending = try state.beginSave()
        let before = state
        var wrong = try reply(to: pending)
        wrong.requestID = UUID().uuidString
        XCTAssertEqual(try state.receive(wrong), .ignored)
        XCTAssertEqual(state, before)
        wrong.requestID = pending.requestID
        wrong.sessionID = "different-session"
        XCTAssertEqual(try state.receive(wrong), .ignored)
        XCTAssertEqual(state, before)
        wrong.sessionID = before.envelope!.sessionID
        wrong.screenID = "other-screen"
        XCTAssertEqual(try state.receive(wrong), .ignored)
        XCTAssertEqual(state, before)
    }

    func testOlderDataVersionIsIgnored() throws {
        var state = try loadedState()
        let first = try state.beginSave()
        try state.receive(reply(to: first))
        let next = try state.beginSave()
        let before = state
        var stale = try reply(to: next, status: .conflict)
        stale.dataVersion = 0
        XCTAssertEqual(try state.receive(stale), .ignored)
        XCTAssertEqual(state, before)
    }

    func testMalformedResponseNeverReplacesTreeOrDrafts() throws {
        var state = try loadedState()
        state.edit(field: "displayName", value: "Keep me")
        let pending = try state.beginSave()
        let before = state
        var unsupported = try reply(to: pending)
        unsupported.region.type = "webview"
        XCTAssertThrowsError(try state.receive(unsupported))
        XCTAssertEqual(state, before)
        var wrongAcknowledgment = try reply(to: pending)
        wrongAcknowledgment.acknowledgedEdits = ["displayName": 99]
        XCTAssertThrowsError(try state.receive(wrongAcknowledgment))
        XCTAssertEqual(state, before)
    }

    func testHardFailureRetainsEditsAndRequiresExplicitReload() throws {
        var state = try loadedState()
        state.edit(field: "displayName", value: "Keep me")
        let pending = try state.beginSave()
        state.fail(requestID: pending.requestID, message: "Session expired", retryable: false)
        XCTAssertEqual(state.drafts["displayName"], "Keep me")
        XCTAssertEqual(state.phase, .blocked)
        XCTAssertThrowsError(try state.retry())
        XCTAssertThrowsError(try state.beginSave())
        XCTAssertThrowsError(try state.beginLoad())
        let reload = try state.beginLoad(discardingDrafts: true)
        var ready = try fixture()
        ready.requestID = reload.requestID
        ready.sessionID = "new-session"
        try state.receive(ready)
        XCTAssertEqual(state.drafts["displayName"], "Ada")
        XCTAssertEqual(state.editRevisions["displayName"], 0)
        XCTAssertTrue(state.canSave)
        XCTAssertEqual(try state.receive(reply(to: pending)), .ignored)
    }

    func testReloadBlocksNewEditsUntilReadyInsteadOfSilentlyDiscardingThem() throws {
        var state = try loadedState()
        state.edit(field: "displayName", value: "Old edit")
        let reload = try state.beginLoad(discardingDrafts: true)
        XCTAssertTrue(state.isLoading)
        state.edit(field: "displayName", value: "Ignored while reload controls are disabled")
        XCTAssertEqual(state.drafts["displayName"], "Old edit")
        var ready = try fixture()
        ready.requestID = reload.requestID
        try state.receive(ready)
        XCTAssertFalse(state.isLoading)
        state.edit(field: "displayName", value: "Fresh edit")
        XCTAssertEqual(state.drafts["displayName"], "Fresh edit")
    }

    func testFailureFromOldRequestCannotBlockNewLoad() throws {
        var state = try loadedState()
        let old = try state.beginSave()
        let new = try state.beginLoad(discardingDrafts: true)
        state.fail(requestID: old.requestID, message: "Old failure", retryable: false)
        XCTAssertEqual(state.pending?.requestID, new.requestID)
        XCTAssertEqual(state.phase, .sending)
        XCTAssertNil(state.failureMessage)
    }

    func testRequestUsesClosedRegisteredActionTuple() throws {
        var state = try loadedState()
        let pending = try state.beginSave()
        let body = try JSONDecoder().decode(SaveRequest.self, from: XCTUnwrap(pending.body))
        XCTAssertEqual(body.nodeID, "profile-form")
        XCTAssertEqual(body.event, "submit")
        XCTAssertEqual(body.action, "save-profile")
        XCTAssertEqual(body.target, "profile-region")
        XCTAssertEqual(body.capabilities, NativeProtocol.capabilities)
        XCTAssertEqual(pending.csrfToken, "fixture-csrf")
    }
}
