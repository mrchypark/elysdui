import XCTest
final class GalleryTests: XCTestCase {
  func testSafariPinch() {
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    safari.activate()
    let web = safari.webViews.firstMatch
    XCTAssertTrue(web.waitForExistence(timeout: 20), "Open the chart gallery in Safari")
    XCTAssertTrue(safari.staticTexts["Ely web chart gallery"].waitForExistence(timeout: 20))
    web.pinch(withScale: 2, velocity: 1)
    let viewport = safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Viewport:")).firstMatch
    XCTAssertTrue(viewport.waitForExistence(timeout: 10), "Pinch must change the chart viewport")
    print("ECHARTS_PINCH: \(viewport.label)")
  }
}
