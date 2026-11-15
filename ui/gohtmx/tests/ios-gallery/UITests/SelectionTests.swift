import XCTest

final class ParallelSetsTests: XCTestCase {
  func testParallelSetsTapSelectsRibbon() {
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    safari.activate()

    XCTAssertTrue(safari.staticTexts["Parallel sets"].waitForExistence(timeout: 20), "Open the ParallelSetsChart gallery page in Safari")
    safari.buttons["Choose a flow"].tap()
    let ribbon = safari.buttons["Select East, A, Won: 20"]
    XCTAssertTrue(ribbon.waitForExistence(timeout: 10), "Flow choices must be accessible buttons")
    ribbon.tap()
    XCTAssertTrue(safari.staticTexts["East, A, Won: 20"].waitForExistence(timeout: 10), "A ribbon tap must announce its path and count")
    XCTAssertTrue(safari.buttons["Clear selection"].waitForExistence(timeout: 10), "A ribbon tap must reveal Clear selection")
  }
}

final class RelationChartTests: XCTestCase {
  func testCirclePackingTapSelectsNode() {
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    safari.activate()

    XCTAssertTrue(safari.staticTexts["CirclePacking"].waitForExistence(timeout: 20), "Open the CirclePacking gallery page in Safari")
    let node = safari.buttons["West: 15"]
    XCTAssertTrue(node.waitForExistence(timeout: 10), "Circle Packing nodes must be accessible buttons")
    node.tap()
    XCTAssertTrue(safari.staticTexts["West: 15"].waitForExistence(timeout: 10), "A node tap must announce its label and value")
  }
}
