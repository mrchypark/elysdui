# Interactive web charts

These components use caller-supplied data and do not require SDUI. Run
`go run ./examples/gohtmx/chart-gallery` for the interactive chart gallery, or
`go run ./examples/gohtmx/timeseries` for the million-timestamp example.
Call `gohtmx.BindAssets` on the host's mux. Assets are local; the general
chart engine is loaded only by pages that import it.
Go templates can include the matching stylesheet helper in the page shell:
`ui-time-series-assets`, `ui-chart-assets`, `ui-stat-chart-assets`,
`ui-density-chart-assets`, or `ui-relation-chart-assets`. Helpers do not mount
charts or load the JavaScript engines; import the module needed by the host.

## Large time series

Include `/assets/uPlot.min.css` and `/assets/ely-timeseries.css`; import
`mountTimeSeries` from `/assets/ely-timeseries.js`. It accepts an X
`Float64Array` and aligned Y series. X must be finite and strictly increasing;
Y gaps use `NaN` or `null`. Time values are Unix seconds. Set `time: false`
for a numeric X axis. See the [example](../../examples/gohtmx/timeseries/README.md)
for callbacks, touch controls and incremental append.
Set `timeZone: 'Asia/Seoul'` to format and align time ticks in KST independently
of the browser's local time zone. The underlying X values stay in Unix seconds.

Y supports `yScale: {type: 'linear'}`, `{type: 'log', base: 10}`, and
`{type: 'symlog', constant: 1}`. Log Y requires positive finite samples;
missing samples remain gaps. Symmetric log accepts negative and zero values.

The source arrays remain caller-owned and must not be changed while the chart
is mounted. A sorted append batch updates the summary index incrementally, but
a capacity increase copies the data and rebuilds the index. Preserve returned
handles rather than remounting on every update. Each Y series has its own
min/max index, so memory grows with both points and series; large numbers of
gaps increase the number of rendered points. Benchmark the actual workload.

Create a group with `createTimeSeriesLink()` and pass the same `link` to each
`mountTimeSeries` call to synchronize X viewports and selected X markers.
Late-mounted charts receive the group state. A viewport is clamped to each
chart's X domain. If the domains do not overlap, that chart retains its current
viewport; charts with different domains can therefore show different ranges.

## Spatial scatter

Include `/assets/uPlot.min.css` and `/assets/ely-scatter.css`; import
`createScatterIndex` and `mountScatter` from `/assets/ely-scatter.js`.
The index accepts aligned `Float64Array` X and Y values and omits non-finite
pairs. Build it once, preserve it, and pass `index` to `mountScatter` when
remounting; otherwise mounting builds an index synchronously. Do not mutate
source arrays while an index is in use. Spatial summaries represent dense
regions; selection returns a nearby original point. The initial index build is
linear or higher and consumes memory proportional to the input, so benchmark
the target device. The gallery's `?chart=Scatter1M` page creates one million
synthetic points. Zoom buttons, Ctrl/Cmd-wheel, pan, pinch and reset controls change the view.
`onSelect` receives the original point; `onViewport` receives the visible bounds.

## General charts

Include `/assets/ely-charts.css`; import `mountElyChart` from
`/assets/ely-charts.js`. Supply a descriptive `label` and a trusted JavaScript
ECharts `option` object with a nonempty `series` array:

```js
const handle = mountElyChart(document.querySelector('#sales'), {
  label: 'Sales by day',
  option: {
    xAxis: {type: 'category', data: ['Mon', 'Tue', 'Wed']},
    yAxis: {type: 'value'},
    tooltip: {trigger: 'axis'},
    dataZoom: [{type: 'inside'}],
    series: [{type: 'bar', data: [10, 15, 12]}],
  },
  onSelect: item => console.log(item),
});
```

The gallery exercises line, area, bar, scatter, pie, radar, polar, heatmap,
calendar heatmap, tree,
treemap, sunburst, Sankey, network, funnel, parallel coordinates, box plot,
gauge, progress, bullet and candlestick options. These are ECharts configurations, not a claim
of one-to-one parity with every GPUI builder property. Zoom, pan, drill-down,
and other interactions depend on the selected ECharts options. Selections
call `onSelect` and dispatch a bubbling `ely:chart-select` event. Data zoom
calls `onViewport` and dispatches `ely:chart-viewport`. The value
list offers keyboard selection for the first 100 items, including nested
nodes; it notes truncation. Provide a separate accessible data view when the
complete dataset is needed. Chart labels and values are inserted as text.

Tooltip rich-text mode avoids HTML tooltips. Treat the option object and custom
callbacks as application code. Validate external data and do not execute
formatter functions or raw option scripts received from an untrusted source.
The large time-series module is the preferred path for million-point lines;
the general chart gallery has not established an equivalent performance limit.

## Distribution charts

Include `/assets/ely-stat-charts.css`; import `mountStatChart` from
`/assets/ely-stat-charts.js`. The supported types are `Histogram` with a
numeric array; `BoxPlot` and `ViolinPlot` with `{label, values}` groups; and
`WaterfallChart` with `{label, value, total?}` steps. Selection calls
`onSelect`, emits `ely:stat-select`, and is available by pointer, touch or
keyboard. A table contains the chart summary. Histograms accept at most
10,000 bins; violin density computation grows with the input size.

## Density and relationship charts

Include `/assets/ely-density-charts.css` and import `mountDensityChart` from
`/assets/ely-density-charts.js` for `ContourChart` and `HexbinChart`. Both take
an array of `{x, y}` points. Contours rasterize the points, smooth the grid
with a bounded Gaussian kernel, and draw marching-squares isolines. They are
an approximation of GPUI's density field, not identical filled contours.
Hexbins report point indices and centroids. Selection uses `onSelect` and
`ely:density-select`; mouse wheel, drag, touch pinch, and controls change the
view. `onViewport` and `ely:density-viewport` report the current scale and
translation. Limits are 100,000 input points, 10,000 grid cells or hexagons, and 12
contour levels. `bandwidth` is Gaussian sigma in grid cells, from 0 to 8.

Include `/assets/ely-relation-charts.css` and import `mountRelationChart` from
`/assets/ely-relation-charts.js` for `CirclePacking` and `ChordDiagram`.
Circle packing takes nested `{label, children}` branches and `{label, value}`
leaves. It supports at most 1,000 nodes, 32 levels and 64 siblings; select a
branch and use the zoom button to inspect it. Chord data uses
`{labels: string[], matrix: number[][]}` with nonnegative directed flows.
Selection calls `onSelect` and emits `ely:relation-select`. Both include
keyboard targets and a text table.

The chart modules clean up after the chart root or its contents are removed,
including htmx swaps and `htmx:beforeCleanupElement`.
For other removal paths call the returned handle's `destroy()` for time series
and general or density charts, or call the function returned by
`mountStatChart`, `mountRelationChart`, or `mountComparisonChart`. For
`mountHorizonChart`, call the returned handle’s `destroy()` method. The host must mount a new chart after
an htmx swap; the modules do not infer data sources from markup.

## Comparison charts

Include `/assets/ely-comparison-charts.css` and import `mountComparisonChart`
from `/assets/ely-comparison-charts.js`. `DifferenceChart` accepts paired,
strictly increasing `{x, y}` points in `primary` and `baseline`, including
`null` gaps. `RidgelineChart` accepts `{label, values}` groups and computes a
bounded density estimate. Selection emits `ely:comparison-select` and calls
`onSelect`. Call the returned function to destroy the chart.

## Horizon and radial line charts

Include `/assets/ely-horizon-charts.css` and import `mountHorizonChart`
from `/assets/ely-horizon-charts.js`. `HorizonChart` folds signed bands around
one baseline. `RadialLineChart` places samples at evenly spaced angles. Both
accept `{label, values}` series with `null` gaps, emit `ely:horizon-select`,
and call `onSelect`. The returned handle has a `destroy()` method. Radial
angles cannot be set individually; axes and legends are not supplied.

## Parallel sets

Include `/assets/ely-parallel-sets.css` and import `mountParallelSetsChart`
from `/assets/ely-parallel-sets.js`. Data has `dimensions` and `ribbons`;
each ribbon supplies a category `path` and a positive `count`. Selection emits
`ely:parallel-sets-select`; the returned handle has `destroy()`. The chart
bounds its dimensions, ribbons and categories to limit SVG work.

## Surface chart

Include `/assets/ely-surface-chart.css` and import `mountSurfaceChart` from
`/assets/ely-surface-chart.js`. It projects a rectangular numerical grid into
an interactive surface. Drag or use the controls to rotate; select a cell by
pointer or keyboard. Grid size is capped at 100 by 100 values. Selection emits
`ely:surface-select`; the returned handle has `destroy()`.

## GPUI reference coverage

The general engine and gallery provide web equivalents for the Cartesian,
pie, radar, polar, heatmap, calendar, hierarchy, Sankey, network, funnel,
parallel, progress, bullet and box-plot families. The standalone modules add
histogram, violin, waterfall, density contours, hexbins, circle packing and
chords. Existing Go/htmx project charts provide Gantt and burndown. The uPlot
module covers high-volume line data and incremental appends.

Coverage is not complete builder or interaction parity. Geographic charts need caller-provided map data and
configuration. The million-point scatter path has a separate spatial index; performance depends on data distribution and device.
