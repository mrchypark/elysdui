import XCTest

/// Run against the real Go example on the simulator host, never a bundled web view.
final class ElyProfileUITests: XCTestCase {
    @MainActor
    func testNoticeExposesCombinedAccessibleTitleAndBody() {
        let app = XCUIApplication()
        app.launchEnvironment["ELY_API_BASE_URL"] = "http://127.0.0.1:8094"
        app.launch()
        let notice = app.descendants(matching: .any)["demo-notice"]
        XCTAssertTrue(notice.waitForExistence(timeout: 15))
        XCTAssertEqual(notice.label, "Local demo only. Your profile lives in a temporary local session. This is not production authentication or storage.")
    }

    @MainActor
    func testNativeLoadValidationSaveAndExplicitReload() throws {
        let app = XCUIApplication()
        app.launchEnvironment["ELY_API_BASE_URL"] = "http://127.0.0.1:8094"
        app.launch()
        let input = app.textFields["input-displayName"]
        XCTAssertTrue(input.waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["selection-save-state"].exists)
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "selection-save-release-")).count, 0)
        XCTAssertEqual(app.webViews.count, 0)
        assertVisible(input, in: app)
        assertVisible(app.buttons["save-profile"], in: app)
        XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label == %@", "Edit your display name.")).count, 1)
        attachScreenshot(app, named: "01 - Native profile loaded")
        replaceText(input, with: "", app: app)
        app.buttons["save-profile"].tap()
        assertVisible(app.staticTexts["error-displayName"], in: app)
        assertVisible(app.buttons["save-profile"], in: app)
        attachScreenshot(app, named: "02 - Native validation error")
        replaceText(input, with: "Native Ada", app: app)
        XCTAssertFalse(app.staticTexts["error-displayName"].exists)
        app.buttons["save-profile"].tap()
        let saved = NSPredicate(format: "label CONTAINS[c] %@", "saved")
        expectation(for: saved, evaluatedWith: app.staticTexts["profile-status"])
        waitForExpectations(timeout: 10)
        XCTAssertEqual(input.value as? String, "Native Ada")
        assertVisible(app.staticTexts["profile-status"], in: app)
        assertVisible(app.buttons["save-profile"], in: app)
        attachScreenshot(app, named: "03 - Native profile saved")
        replaceText(input, with: "Unsaved draft", app: app)
        app.buttons["reload-profile"].tap()
        let keepEditing = app.alerts.buttons["Keep editing"]
        XCTAssertTrue(keepEditing.waitForExistence(timeout: 5))
        keepEditing.tap()
        XCTAssertEqual(input.value as? String, "Unsaved draft")
        app.buttons["reload-profile"].tap()
        let discardAndReload = app.alerts.buttons["Discard edits and reload"]
        XCTAssertTrue(discardAndReload.waitForExistence(timeout: 5))
        discardAndReload.tap()
        let restored = NSPredicate(format: "value == %@", "Native Ada")
        expectation(for: restored, evaluatedWith: input)
        waitForExpectations(timeout: 10)
    }

    @MainActor
    func testMultipleFieldsAndNativeSelectionControlsSaveThroughGo() throws {
        let app = XCUIApplication()
        app.launchEnvironment["ELY_API_BASE_URL"] = "http://127.0.0.1:8095"
        app.launch()
        let company = app.textFields["input-company"]
        XCTAssertTrue(company.waitForExistence(timeout: 15))
        XCTAssertEqual(app.webViews.count, 0)
        for _ in 0..<4 where !company.isHittable { app.swipeUp() }
        XCTAssertTrue(company.isHittable)
        replaceText(company, with: "  Mobile Company  ", app: app)
        let toggle = app.switches["notifications"]
        if !toggle.isHittable { app.swipeUp() }
        XCTAssertTrue(toggle.isHittable)
        toggle.tap()
        assertNativeSelectionAccessibility(in: app)
        let checkbox = app.switches["digest-consent"]
        for _ in 0..<4 where !checkbox.isHittable { app.swipeUp() }
        XCTAssertTrue(checkbox.isHittable)
        XCTAssertEqual(checkbox.value as? String, "0")
        checkbox.tap()
        XCTAssertEqual(checkbox.value as? String, "1")
        let picker = app.buttons["color-theme"]
        for _ in 0..<4 where !picker.isHittable { app.swipeUp() }
        XCTAssertTrue(picker.isHittable)
        picker.tap()
        let dark = app.buttons["Dark"]
        XCTAssertTrue(dark.waitForExistence(timeout: 5)); dark.tap()
        let save = app.buttons["save-profile"]
        if !save.isHittable { app.swipeUp() }
        save.tap()
        let saved = NSPredicate(format: "label CONTAINS[c] %@", "saved")
        expectation(for: saved, evaluatedWith: app.staticTexts["profile-status"])
        waitForExpectations(timeout: 15)
        XCTAssertEqual(company.value as? String, "Mobile Company")
        XCTAssertEqual(toggle.value as? String, "1")
        XCTAssertEqual(checkbox.value as? String, "1")
        XCTAssertTrue(picker.label.contains("Dark") || (picker.value as? String) == "Dark")
        attachScreenshot(app, named: "04 - Native switch, checkbox and select saved")
        app.buttons["reload-profile"].tap()
        let discard = app.alerts.buttons["Discard edits and reload"]
        XCTAssertTrue(discard.waitForExistence(timeout: 5)); discard.tap()
        expectation(for: NSPredicate(format: "label == %@", "Edit your display name."), evaluatedWith: app.staticTexts["profile-status"])
        waitForExpectations(timeout: 15)
        XCTAssertTrue(company.waitForExistence(timeout: 15))
        XCTAssertEqual(company.value as? String, "Mobile Company")
        XCTAssertEqual(toggle.value as? String, "1")
        XCTAssertEqual(checkbox.value as? String, "1")
        XCTAssertTrue(picker.label.contains("Dark") || (picker.value as? String) == "Dark")
    }

    @MainActor
    func testDisabledNativeCheckboxAndPickerCannotEdit() throws {
        let app = selectionTestApp(scenario: "disabled")
        app.launch()
        XCTAssertTrue(app.textFields["input-company"].waitForExistence(timeout: 15))
        assertNativeSelectionAccessibility(in: app)
        let checkbox = app.switches["digest-consent"]
        let picker = app.buttons["color-theme"]
        scrollTo(checkbox, in: app)
        XCTAssertTrue(checkbox.exists)
        XCTAssertFalse(checkbox.isEnabled)
        XCTAssertEqual(checkbox.value as? String, "0")
        scrollTo(picker, in: app)
        XCTAssertTrue(picker.exists)
        XCTAssertFalse(picker.isEnabled)
        assertSelection(picker, equals: "System")
        XCTAssertFalse(app.staticTexts["unsaved-changes"].exists)
        XCTAssertEqual(app.webViews.count, 0)
        attachScreenshot(app, named: "05 - Native selections disabled")
    }

    @MainActor
    func testNewerNativeSelectionsSurviveInterruptedSaveAndExactRetry() throws {
        // A failed prerequisite must abort before the test-only release can run.
        continueAfterFailure = false
        let app = selectionTestApp(scenario: "interrupted-save")
        app.launch()
        XCTAssertTrue(app.textFields["input-company"].waitForExistence(timeout: 15))
        assertNativeSelectionAccessibility(in: app)
        let checkbox = app.switches["digest-consent"]
        let picker = app.buttons["color-theme"]
        scrollTo(checkbox, in: app)
        XCTAssertEqual(checkbox.value as? String, "0")
        checkbox.tap()
        chooseTheme("Dark", picker: picker, app: app)
        let save = app.buttons["save-profile"]
        scrollTo(save, in: app); save.tap()
        XCTAssertFalse(save.isEnabled)

        // The real Go response must be held for this exact still-sending model request.
        // There is no timer-based normal release, so each edit is inside this window.
        let requestID = try waitForHeldSave(in: app)
        scrollTo(checkbox, in: app)
        try requireHeldSave(requestID, in: app)
        XCTAssertTrue(checkbox.isEnabled)
        checkbox.tap()
        XCTAssertEqual(checkbox.value as? String, "0")
        try requireHeldSave(requestID, in: app)
        XCTAssertTrue(picker.isEnabled)
        try requireHeldSave(requestID, in: app)
        chooseTheme("Light", picker: picker, app: app)
        try requireHeldSave(requestID, in: app)
        XCTAssertFalse(save.isEnabled)
        XCTAssertFalse(app.buttons["retry-request"].exists)

        let release = app.buttons["selection-save-release-\(requestID)"]
        try require(release.exists && release.isHittable, "The matching release control must be available.")
        XCTAssertEqual(checkbox.value as? String, "0")
        assertSelection(picker, equals: "Light")
        try requireHeldSave(requestID, in: app)
        release.tap()

        let retry = app.buttons["retry-request"]
        XCTAssertTrue(retry.waitForExistence(timeout: 30))
        let released = "gate=released;request=\(requestID);phase=retryable;pending=\(requestID)"
        try require(app.staticTexts["selection-save-state"].label == released,
                    "Only explicit release of the same request may expose Retry.")
        try require(app.staticTexts["transport-error"].label ==
                    "UI test interrupted a completed save. Retry the same request.",
                    "Retry must come from the deliberate released-save fault.")
        scrollTo(retry, in: app, upwards: false); retry.tap()
        expectation(for: NSPredicate(format: "label CONTAINS[c] %@", "saved"), evaluatedWith: app.staticTexts["profile-status"])
        waitForExpectations(timeout: 30)
        scrollTo(checkbox, in: app)
        XCTAssertEqual(checkbox.value as? String, "0")
        assertSelection(picker, equals: "Light")
        XCTAssertTrue(app.staticTexts["unsaved-changes"].exists)
        XCTAssertFalse(app.staticTexts["transport-error"].exists)
        attachScreenshot(app, named: "06 - Newer native selections preserved after retry")

        // Reload confirms the original true/dark request reached Go; retry must
        // not submit the newer false/light drafts under a new request identity.
        app.buttons["reload-profile"].tap()
        let discard = app.alerts.buttons["Discard edits and reload"]
        XCTAssertTrue(discard.waitForExistence(timeout: 5)); discard.tap()
        expectation(for: NSPredicate(format: "label == %@", "Edit your display name."), evaluatedWith: app.staticTexts["profile-status"])
        waitForExpectations(timeout: 30)
        scrollTo(checkbox, in: app)
        XCTAssertEqual(checkbox.value as? String, "1")
        assertSelection(picker, equals: "Dark")
        XCTAssertFalse(app.staticTexts["unsaved-changes"].exists)
        XCTAssertEqual(app.webViews.count, 0)
    }

    @MainActor
    private func waitForHeldSave(in app: XCUIApplication) throws -> String {
        let marker = app.staticTexts["selection-save-state"]
        try require(marker.waitForExistence(timeout: 15), "The opted-in save marker must exist.")
        let held = XCTNSPredicateExpectation(predicate: NSPredicate(
            format: "label MATCHES %@",
            #"gate=held;request=([A-Fa-f0-9-]+);phase=sending;pending=\1"#), object: marker)
        try require(XCTWaiter.wait(for: [held], timeout: 30) == .completed,
                    "Expected a committed Go save held for the actual sending model request; got \(marker.label).")
        let requestID = try XCTUnwrap(selectionMarkerValues(marker.label)["request"])
        try requireHeldSave(requestID, in: app)
        return requestID
    }

    @MainActor
    private func requireHeldSave(_ requestID: String, in app: XCUIApplication,
                                 file: StaticString = #filePath, line: UInt = #line) throws {
        let marker = app.staticTexts["selection-save-state"]
        let expected = "gate=held;request=\(requestID);phase=sending;pending=\(requestID)"
        try require(marker.exists && marker.label == expected,
                    "The original save must still be held and sending; got \(marker.label).", file: file, line: line)
        try require(!app.buttons["retry-request"].exists,
                    "Retry must remain absent until explicit release.", file: file, line: line)
    }

    private func selectionMarkerValues(_ label: String) -> [String: String] {
        label.split(separator: ";").reduce(into: [:]) { values, pair in
            let parts = pair.split(separator: "=", maxSplits: 1)
            if parts.count == 2 { values[String(parts[0])] = String(parts[1]) }
        }
    }

    private func require(_ condition: Bool, _ message: String,
                         file: StaticString = #filePath, line: UInt = #line) throws {
        guard condition else {
            XCTFail(message, file: file, line: line)
            throw NSError(domain: "SelectionUIHandshake", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: message])
        }
    }

    @MainActor
    private func assertNativeSelectionAccessibility(in app: XCUIApplication,
                                                    file: StaticString = #filePath, line: UInt = #line) {
        // SwiftUI retains Toggle's native switch accessibility role despite the
        // checkbox's custom visual style. Assert identity/role rather than using
        // a broad first-match fallback that could hide duplicate controls.
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "digest-consent").count, 1,
                       file: file, line: line)
        XCTAssertEqual(app.switches.matching(identifier: "digest-consent").count, 1,
                       file: file, line: line)
        let checkbox = app.switches["digest-consent"]
        XCTAssertEqual(checkbox.elementType, .switch, file: file, line: line)
        XCTAssertEqual(checkbox.label, "Receive a weekly digest", file: file, line: line)
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "color-theme").count, 1,
                       file: file, line: line)
        XCTAssertEqual(app.buttons.matching(identifier: "color-theme").count, 1,
                       file: file, line: line)
        let picker = app.buttons["color-theme"]
        XCTAssertEqual(picker.elementType, .button, file: file, line: line)
        XCTAssertEqual(picker.label, "Color theme, System", file: file, line: line)
    }

    @MainActor
    private func selectionTestApp(scenario: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["ELY_API_BASE_URL"] = "http://127.0.0.1:8095"
        app.launchArguments.append("--selection-ui-test")
        app.launchEnvironment["ELY_SELECTION_UI_SCENARIO"] = scenario
        return app
    }

    @MainActor
    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication, upwards: Bool = true) {
        for _ in 0..<6 where !element.isHittable {
            if upwards { app.swipeUp() } else { app.swipeDown() }
        }
    }

    @MainActor
    private func chooseTheme(_ theme: String, picker: XCUIElement, app: XCUIApplication) {
        scrollTo(picker, in: app)
        XCTAssertTrue(picker.isHittable)
        picker.tap()
        let option = app.buttons[theme]
        XCTAssertTrue(option.waitForExistence(timeout: 5)); option.tap()
        assertSelection(picker, equals: theme)
    }

    @MainActor
    private func assertSelection(_ picker: XCUIElement, equals theme: String,
                                 file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(picker.label.contains(theme) || (picker.value as? String) == theme,
                      "Expected native picker selection \(theme).", file: file, line: line)
    }

    @MainActor
    private func assertVisible(_ element: XCUIElement, in app: XCUIApplication,
                               file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: 10), file: file, line: line)
        let hittable = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [hittable], timeout: 5), .completed, file: file, line: line)
        XCTAssertTrue(app.frame.contains(element.frame), "Expected the complete element inside the visible screen.", file: file, line: line)
    }

    @MainActor
    private func attachScreenshot(_ app: XCUIApplication, named name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    private func replaceText(_ field: XCUIElement, with text: String, app: XCUIApplication) {
        field.tap()
        let old = field.value as? String ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count) + text)
        // The return key may be a checkmark rather than a localized "Done" button.
        // Send Return to the actual control so UITextFieldDelegate handles dismissal.
        field.typeText("\n")
        let dismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch
        )
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 5), .completed,
                       "The native Return key must dismiss the keyboard before saving or taking screenshots.")
    }
}
