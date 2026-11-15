# Time series example

Run `go run ./examples/gohtmx/timeseries` and open <http://127.0.0.1:8097>.
The page generates one million timestamps and three aligned series locally;
the setup time shown on the page measures synchronous indexing and chart
construction. It does not include browser paint, network transfer, or a
production data source.

The standalone JavaScript component is served by `gohtmx.BindAssets`. Include
`/assets/uPlot.min.css` and `/assets/ely-timeseries.css`, then import
`mountTimeSeries` from `/assets/ely-timeseries.js`. Supply a `Float64Array` of
strictly increasing Unix timestamps in seconds and an array of aligned numeric
series. Use `NaN` for missing values. The component builds an index once and
uses the visible range and pixel width to choose representative points. Treat
the input arrays as immutable. Use `chart.append(newX, newSeries, {follow:
true})` for sorted, aligned batches. It incrementally updates the extrema index;
when capacity grows it copies the data and rebuilds that index. The optional
`follow` keeps the newest data in view. The chart handles
`htmx:beforeCleanupElement`; call `destroy()` for non-htmx removal.

The example uses generated data only. Large input arrays and the index occupy
memory proportional to the source data; many gaps can also increase draw work.
Measure actual data, series counts and devices before choosing production limits.
The controls zoom and reset the view; touch supports horizontal pan and pinch.
Mouse drag selects a range and `onSelect` receives its bounds. Modifier-wheel
zooms. `onCursor` reports the nearest retained point's original index and values.
`onCursorX` reports the cursor's data-coordinate X, `onSelectX` reports a
clicked or tapped X, and `onViewport` reports the current X bounds. Call
`setSelectedX(x)` to set a persistent selection marker from another component,
or `setSelectedX(null)` to clear it.
