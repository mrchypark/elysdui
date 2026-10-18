import XCTest
@testable import ElyNativeCore

final class ControlsTests: XCTestCase {
    func fixture(_ name: String = "profile-controls-ready") throws -> ProfileEnvelope {
        try EnvelopeDecoder.decode(Data(contentsOf: ProfileStateTests.fixtureDirectory.appendingPathComponent("\(name).json")))
    }
    func testMultipleFieldsReconcileIndependentlyAndRetryExactSnapshot() throws {
        let ready = try fixture()
        var state = ProfileState()
        try state.beginLoad(requestID: ready.requestID)
        try state.receive(ready)
        state.edit(field: "displayName", value: "  Grace Hopper  ")
        state.edit(field: "company", value: "  Example Labs  ")
        state.edit(field: "notifications", value: "true")
        state.edit(field: "digestConsent", value: "true")
        state.edit(field: "colorTheme", value: "dark")
        let pending = try state.beginSave()
        XCTAssertTrue(state.isSending)
        state.edit(field: "company", value: "Later company")
        state.edit(field: "digestConsent", value: "false")
        state.edit(field: "colorTheme", value: "light")
        state.fail(requestID: pending.requestID, message: "Offline", retryable: true)
        XCTAssertEqual(try state.retry(), pending)
        let wire = try JSONDecoder().decode(SaveRequest.self, from: XCTUnwrap(pending.body))
        XCTAssertEqual(wire.fields["digestConsent"], "true")
        XCTAssertEqual(wire.fields["colorTheme"], "dark")
        var saved = try fixture("profile-controls-saved")
        saved.requestID = pending.requestID
        if case .save(let save) = pending.kind { saved.acknowledgedEdits = save.editRevisions }
        try state.receive(saved)
        XCTAssertEqual(state.drafts["company"], "Later company")
        XCTAssertEqual(state.baseline["company"], "Example Labs")
        XCTAssertEqual(state.drafts["digestConsent"], "false")
        XCTAssertEqual(state.drafts["colorTheme"], "light")
        XCTAssertEqual(state.baseline["digestConsent"], "true")
        XCTAssertEqual(state.baseline["colorTheme"], "dark")
        XCTAssertEqual(state.drafts["displayName"], "Grace Hopper")
        XCTAssertEqual(state.drafts["notifications"], "true")
    }
    func testUnknownMissingDuplicateAndInvalidBooleanFieldsFailClosed() throws {
        var ready = try fixture()
        ready.fields["undeclared"] = "secret"
        XCTAssertThrowsError(try EnvelopeDecoder.validate(ready))
        ready = try fixture(); ready.fields["notifications"] = "yes"
        XCTAssertThrowsError(try EnvelopeDecoder.validate(ready))
        ready = try fixture(); ready.fields.removeValue(forKey: "company")
        XCTAssertThrowsError(try EnvelopeDecoder.validate(ready))
        ready = try fixture()
        var duplicate = ready.region.children[0].children[2].children[0]
        duplicate.id = "other-input"
        ready.region.children[0].children[2].children.append(duplicate)
        XCTAssertThrowsError(try EnvelopeDecoder.validate(ready))
    }
    func testTrailingLineBreakFieldNamesAndNodeIDsAreRejected() throws {
        for suffix in ["\n", "\r", "\r\n", "\u{2028}"] {
            var ready = try fixture()
            let value = ready.fields.removeValue(forKey: "company")!
            ready.fields["company" + suffix] = value
            ready.region.children[0].children[2].children[1].props.name = "company" + suffix
            XCTAssertThrowsError(try EnvelopeDecoder.validate(ready))
            ready = try fixture()
            ready.region.children[0].children[2].children[1].id += suffix
            XCTAssertThrowsError(try EnvelopeDecoder.validate(ready))
        }
    }
    func testRealServerInvalidSelectionFixture() throws {
        let invalid = try fixture("profile-controls-invalid")
        XCTAssertEqual(invalid.status, .invalid)
        XCTAssertEqual(invalid.fields["digestConsent"], "true")
        XCTAssertEqual(invalid.fields["colorTheme"], "dark")
        XCTAssertNotNil(invalid.errors["colorTheme"])
        XCTAssertEqual(Set(invalid.acknowledgedEdits.keys), Set(invalid.fields.keys))
    }
    func testSelectionPropertiesAndClosedOptionsDecodeStrictly() throws {
        let data = try Data(contentsOf: ProfileStateTests.fixtureDirectory.appendingPathComponent("profile-controls-ready.json"))
        func changed(type: String, mutate: (inout [String: Any]) -> Void) throws -> Data {
            var object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            func visit(_ node: inout [String: Any]) {
                if node["type"] as? String == type {
                    var props = node["props"] as! [String: Any]
                    mutate(&props); node["props"] = props
                }
                if var children = node["children"] as? [[String: Any]] {
                    for i in children.indices { visit(&children[i]) }
                    node["children"] = children
                }
            }
            var region = object["region"] as! [String: Any]
            visit(&region); object["region"] = region
            return try JSONSerialization.data(withJSONObject: object)
        }
        for type in ["checkbox", "select"] {
            for key in ["required", "readonly", "multiple", "indeterminate", "unknown"] {
                XCTAssertThrowsError(try EnvelopeDecoder.decode(changed(type: type) { $0[key] = false }))
            }
            XCTAssertThrowsError(try EnvelopeDecoder.decode(changed(type: type) { $0["disabled"] = "false" }))
            XCTAssertThrowsError(try EnvelopeDecoder.decode(changed(type: type) { $0["label"] = "" }))
        }
        let invalidOptions: [Any] = [[], NSNull(), "dark", [["value": "dark"]],
            [["value": "dark", "label": "Dark", "disabled": false]],
            [["value": "", "label": "Empty"]], [["value": "system", "label": ""]],
            [["value": 1, "label": "Dark"]],
            [["value": "system", "label": "System"], ["value": "system", "label": "Duplicate"]],
            [["value": "system", "label": String(repeating: "é", count: 8193)]],
            [["value": String(repeating: "é", count: 8193), "label": "Long"]],
            (0..<65).map { ["value": "option-\($0)", "label": "Option"] }]
        for options in invalidOptions {
            XCTAssertThrowsError(try EnvelopeDecoder.decode(changed(type: "select") { $0["options"] = options }))
        }
        var ready = try fixture()
        ready.fields["digestConsent"] = "yes"
        XCTAssertThrowsError(try EnvelopeDecoder.validate(ready))
        ready = try fixture(); ready.fields["colorTheme"] = "missing"
        XCTAssertThrowsError(try EnvelopeDecoder.validate(ready))
        let duplicate = #"{"options":[{"value":"system","label":"System","\u0076alue":"dark"}]}"#
        XCTAssertThrowsError(try EnvelopeDecoder.rejectAmbiguousJSON(Data(duplicate.utf8)))
    }

    func testSaveRejectsControlModeAndOptionChangesWithoutMutatingState() throws {
        for change in ["type", "options", "disabled", "id", "readonly", "required", "multiple", "inputType"] {
            let ready = try fixture()
            var state = ProfileState()
            try state.beginLoad(requestID: ready.requestID); try state.receive(ready)
            state.edit(field: "digestConsent", value: "true")
            state.edit(field: "colorTheme", value: "dark")
            let pending = try state.beginSave()
            state.edit(field: "digestConsent", value: "false")
            state.edit(field: "colorTheme", value: "light")
            var saved = try fixture("profile-controls-saved")
            saved.requestID = pending.requestID
            if case .save(let save) = pending.kind { saved.acknowledgedEdits = save.editRevisions }
            func mutate(_ node: inout NativeNode) {
                if change == "type" && node.type == "checkbox" { node.type = "switch" }
                if change == "options" && node.type == "select" { node.props.options?.removeAll { $0.value == "light" } }
                if change == "disabled" && node.type == "checkbox" { node.props.disabled = true }
                if change == "id" && node.type == "select" { node.id = "replacement-theme" }
                if node.props.name == "company" {
                    if change == "readonly" { node.props.readonly = true }
                    if change == "required" { node.props.required = true }
                    if change == "multiple" { node.props.multiple = nil }
                    if change == "inputType" { node.props.type = nil }
                }
                for index in node.children.indices { mutate(&node.children[index]) }
            }
            mutate(&saved.region)
            XCTAssertNoThrow(try EnvelopeDecoder.validate(saved))
            let before = state
            XCTAssertThrowsError(try state.receive(saved))
            XCTAssertEqual(state, before)
        }
    }

    func testSelectionValidationAndConflictKeepNewerDraftsAndHideStaleErrors() throws {
        for status in [ResponseStatus.invalid, .conflict] {
            let ready = try fixture()
            var state = ProfileState()
            try state.beginLoad(requestID: ready.requestID); try state.receive(ready)
            state.edit(field: "digestConsent", value: "true")
            state.edit(field: "colorTheme", value: "dark")
            let pending = try state.beginSave()
            state.edit(field: "digestConsent", value: "false")
            state.edit(field: "colorTheme", value: "light")
            var response = try fixture("profile-controls-saved")
            response.status = status
            response.requestID = pending.requestID
            response.errors = ["digestConsent": "Review consent.", "colorTheme": "Choose a theme."]
            if case .save(let save) = pending.kind { response.acknowledgedEdits = save.editRevisions }
            try state.receive(response)
            XCTAssertEqual(state.drafts["digestConsent"], "false")
            XCTAssertEqual(state.drafts["colorTheme"], "light")
            XCTAssertTrue(state.fieldErrors.isEmpty)
            XCTAssertTrue(state.hasUnsavedChanges)
        }
    }

    func testRealGoControlsSaveAndReload() async throws {
        guard let base = ProcessInfo.processInfo.environment["ELY_NATIVE_CONTROLS_BASE_URL"] else {
            throw XCTSkip("Set ELY_NATIVE_CONTROLS_BASE_URL with the controls server running.")
        }
        let transport = try HTTPProfileTransport(baseURL: XCTUnwrap(URL(string: base)), allowLocalHTTP: true)
        var state = ProfileState()
        let load = try state.beginLoad()
        let ready = try await transport.send(load)
        try state.receive(ready)
        XCTAssertEqual(state.drafts.count, 5)
        state.edit(field: "company", value: "  Native Company  ")
        state.edit(field: "notifications", value: "true")
        state.edit(field: "digestConsent", value: "true")
        state.edit(field: "colorTheme", value: "dark")
        let save = try state.beginSave()
        let saved = try await transport.send(save)
        try state.receive(saved)
        XCTAssertEqual(state.drafts["company"], "Native Company")
        XCTAssertEqual(state.drafts["notifications"], "true")
        let reload = try state.beginLoad(discardingDrafts: true)
        let reloaded = try await transport.send(reload)
        try state.receive(reloaded)
        XCTAssertEqual(state.drafts["notifications"], "true")
        XCTAssertEqual(state.drafts["digestConsent"], "true")
        XCTAssertEqual(state.drafts["colorTheme"], "dark")
    }
}
