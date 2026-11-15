import XCTest
final class GestureTests: XCTestCase {
  func testSafariPinch() throws {
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    safari.activate()
    let web = safari.webViews.firstMatch
    XCTAssertTrue(web.waitForExistence(timeout: 20), "Safari chart must be open")
    let viewport = safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Viewport:")).firstMatch
    XCTAssertTrue(viewport.waitForExistence(timeout: 20), "Viewport status must be accessible")
    let reset = safari.buttons["Reset"]
    XCTAssertTrue(reset.waitForExistence(timeout: 5), "Chart controls must be visible")
    reset.tap()
    let fullRange = NSPredicate(format: "label CONTAINS %@", "2023-11-14T22:13:20.000Z")
    expectation(for: fullRange, evaluatedWith: viewport)
    waitForExpectations(timeout: 10)
    let before = viewport.label
    web.pinch(withScale: 2, velocity: 1)
    let changed = NSPredicate(format: "label != %@", before)
    expectation(for: changed, evaluatedWith: viewport)
    waitForExpectations(timeout: 10)
    print("PINCH_BEFORE: \(before)")
    print("PINCH_AFTER: \(viewport.label)")
    let panBefore = viewport.label
    let start = web.coordinate(withNormalizedOffset: CGVector(dx: 0.70, dy: 0.50))
    let end = web.coordinate(withNormalizedOffset: CGVector(dx: 0.30, dy: 0.50))
    start.press(forDuration: 0.1, thenDragTo: end)
    expectation(for: NSPredicate(format: "label != %@", panBefore), evaluatedWith: viewport)
    waitForExpectations(timeout: 10)
    print("PAN_BEFORE: \(panBefore)")
    print("PAN_AFTER: \(viewport.label)")
  }
}
