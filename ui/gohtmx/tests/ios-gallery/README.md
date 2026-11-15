# iPad Safari chart checks

Start the gallery from the repository root. Keep it running while the tests run.

```sh
go run ./examples/gohtmx/chart-gallery
```

Use the iPad simulator UDID with each single-chart page. These commands open the
page in Safari before the corresponding XCUITest.

```sh
cd ui/gohtmx/tests/ios-gallery
SIMULATOR_UDID=<iPad simulator UDID>
xcrun simctl openurl "$SIMULATOR_UDID" 'http://127.0.0.1:8098/?chart=SurfaceChart'
xcodegen generate
xcodebuild test -project UPlotGestureCheck.xcodeproj -scheme UPlotGestureCheck -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" -only-testing:UPlotGestureCheckUITests/SurfaceTests

xcrun simctl openurl "$SIMULATOR_UDID" 'http://127.0.0.1:8098/?chart=ParallelSetsChart'
xcodebuild test -project UPlotGestureCheck.xcodeproj -scheme UPlotGestureCheck -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" -only-testing:UPlotGestureCheckUITests/ParallelSetsTests

xcrun simctl openurl "$SIMULATOR_UDID" 'http://127.0.0.1:8098/?chart=CirclePacking'
xcodebuild test -project UPlotGestureCheck.xcodeproj -scheme UPlotGestureCheck -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" -only-testing:UPlotGestureCheckUITests/RelationChartTests
```

`SurfaceTests` taps the accessible Next cell control and asserts its `Cell …` status.
It then drags inside the surface group and requires a `View azimuth …` status.
A drag that only changes the selected cell fails the test.

`ParallelSetsTests` opens the flow selector, taps `East, A, Won: 20` and requires that same live status
and the `Clear selection` button. `RelationChartTests` taps `West: 15` in Circle
Packing and requires the live node status. Existing checks remain available for
the line-chart pinch (`GalleryTests`) and Hexbin pinch and pan (`DensityTests`).

The gallery does not mount linked time series at port 8098. Linked time-series
gesture coverage remains outside this test target until that demo is exposed here.

For the million-point scatter, open `http://127.0.0.1:8098/?chart=Scatter1M`
and run `-only-testing:UPlotGestureCheckUITests/ScatterTests`. The test waits
for index construction and checks that a pinch and a drag change the viewport.
