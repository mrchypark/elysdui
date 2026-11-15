# iOS Safari gesture check

This optional XCUITest checks the million-timestamp example in the iOS
simulator. It needs Xcode, an iOS simulator, and XcodeGen. Start the example
with `go run ./examples/gohtmx/timeseries`, then open
`http://127.0.0.1:8097` in Safari on the simulator. Keep the chart and its
Reset button visible. Use a dedicated simulator: the test activates Safari.

From this directory, run `xcodegen generate`, then run the test using Xcode
or `xcodebuild test -project UPlotGestureCheck.xcodeproj -scheme UPlotGestureCheck -destination 'platform=iOS Simulator,id=<SIMULATOR_UDID>'`.
The test resets the chart, performs a two-finger pinch and a horizontal drag,
and asserts that the reported viewport changes after each gesture. The example
must stay available for the duration of the test.
