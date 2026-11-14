import XCTest
final class DensityTests: XCTestCase {
  func testDensityTouchGestures() {
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    safari.activate()
    let web = safari.webViews.firstMatch
    XCTAssertTrue(web.waitForExistence(timeout: 20))
    XCTAssertTrue(safari.staticTexts["HexbinChart"].waitForExistence(timeout: 20))
    let reset=safari.buttons["Reset chart zoom and pan"]
    XCTAssertTrue(reset.waitForExistence(timeout: 5)); reset.tap()
    let status=safari.staticTexts.matching(NSPredicate(format:"label BEGINSWITH %@", "View scale")).firstMatch
    XCTAssertTrue(status.waitForExistence(timeout: 5)); let initial=status.label
    web.pinch(withScale: 2, velocity: 1)
    expectation(for:NSPredicate(format:"label != %@",initial),evaluatedWith:status)
    waitForExpectations(timeout:10); let zoomed=status.label
    XCTAssertFalse(zoomed.hasPrefix("View scale 1.00"),"Pinch must change scale")
    print("DENSITY_PINCH: \(zoomed)")
    let start=web.coordinate(withNormalizedOffset:CGVector(dx:0.7,dy:0.5))
    let end=web.coordinate(withNormalizedOffset:CGVector(dx:0.3,dy:0.5))
    start.press(forDuration:0.1,thenDragTo:end)
    expectation(for:NSPredicate(format:"label != %@",zoomed),evaluatedWith:status)
    waitForExpectations(timeout:10)
    print("DENSITY_PAN: \(status.label)")
  }
}
