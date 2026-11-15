import XCTest

final class ScatterTests: XCTestCase {
  func testMillionScatterPinchAndPan() {
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    safari.activate()
    let web = safari.webViews.firstMatch
    XCTAssertTrue(web.waitForExistence(timeout: 20))
    XCTAssertTrue(safari.staticTexts["Scatter1M"].waitForExistence(timeout: 20))
    let ready = safari.staticTexts.matching(NSPredicate(format:"label BEGINSWITH %@", "Ready: 1,000,000")).firstMatch
    XCTAssertTrue(ready.waitForExistence(timeout: 90), "The million-point index must finish")
    web.pinch(withScale: 2, velocity: 1)
    let status = safari.staticTexts.matching(NSPredicate(format:"label BEGINSWITH %@", "Viewport:")).firstMatch
    XCTAssertTrue(status.waitForExistence(timeout: 15), "Pinch must change the viewport")
    let zoomed = status.label
    print("SCATTER_PINCH: \(zoomed)")
    let start = web.coordinate(withNormalizedOffset:CGVector(dx:0.7,dy:0.45))
    let end = web.coordinate(withNormalizedOffset:CGVector(dx:0.3,dy:0.45))
    start.press(forDuration:0.1,thenDragTo:end)
    expectation(for:NSPredicate(format:"label != %@",zoomed),evaluatedWith:status)
    waitForExpectations(timeout:15)
    print("SCATTER_PAN: \(status.label)")
  }
}
