import XCTest

final class SurfaceTests: XCTestCase {
  func testSurfaceDragRotatesAndTapSelects() {
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    safari.activate()

    let web = safari.webViews.firstMatch
    XCTAssertTrue(web.waitForExistence(timeout: 20), "Open the SurfaceChart gallery page in Safari")
    XCTAssertTrue(safari.staticTexts["SurfaceChart"].waitForExistence(timeout: 20))

    let cell = safari.buttons["Next cell"]
    XCTAssertTrue(cell.waitForExistence(timeout: 10), "Surface must offer accessible cell selection")
    cell.tap()
    let selected = safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Cell ")).firstMatch
    XCTAssertTrue(selected.waitForExistence(timeout: 10), "A surface selection must announce the cell")
    print("SURFACE_SELECTED: \(selected.label)")

    let start = web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.38))
    let end = web.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.42))
    start.press(forDuration: 0.1, thenDragTo: end)

    let rotation = safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "View azimuth ")).firstMatch
    XCTAssertTrue(rotation.waitForExistence(timeout: 10), "A surface drag must change azimuth, not only select a cell")
    print("SURFACE_ROTATED: \(rotation.label)")
  }
}
