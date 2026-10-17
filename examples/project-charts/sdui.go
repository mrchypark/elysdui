package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"golang.org/x/net/html"
	"math"
	"net/http"
	"strconv"

	"github.com/mrchypark/ely-htmx/sdui"
)

// This loopback fixture echoes validated selections only. Its fixed demonstration
// principal and CSRF value are not production authentication or persistence.
func chartSDUI() (http.Handler, error) {
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		return nil, err
	}
	payload := func(day bool) map[string]sdui.PayloadBinding {
		p := map[string]sdui.PayloadBinding{"chartID": {Path: "/id", Type: sdui.String}, "index": {Path: "/index", Type: sdui.Integer}, "value": {Path: "/value", Type: sdui.String}}
		if day {
			p["date"] = sdui.PayloadBinding{Path: "/date", Type: sdui.String}
			p["remaining"] = sdui.PayloadBinding{Path: "/remaining", Type: sdui.Number}
		} else {
			p["progress"] = sdui.PayloadBinding{Path: "/progress", Type: sdui.Number}
		}
		return p
	}
	screen := sdui.Screen{Version: sdui.Version, ID: "chart-actions", Loader: "initial", Root: sdui.Node{ID: "layout", Type: "stack", Children: []sdui.Node{
		{ID: "sdui-gantt", Type: "project/GanttChart", Props: map[string]any{"title": "SDUI task selection", "items": []any{map[string]any{"value": "design", "label": "Design", "start": "2026-10-12", "end": "2026-10-14", "progress": 50.5}, map[string]any{"value": "build", "label": "Build", "start": "2026-10-15", "end": "2026-10-18", "progress": 25.25, "after": []any{0}}}}, Events: []sdui.Event{{On: "ely:action", SourceAction: "select-task", Action: "inspect-task", Target: "selection-result", Payload: payload(false)}}},
		{ID: "sdui-burn", Type: "project/Burndown Chart", Props: map[string]any{"title": "SDUI day selection", "start": "2026-10-12", "end": "2026-10-14", "scope": 40.5, "remaining": []any{40.5, 45.25, 30.5}}, Events: []sdui.Event{{On: "ely:action", SourceAction: "select-day", Action: "inspect-day", Target: "selection-result", Payload: payload(true)}}},
		{ID: "selection-result", Type: "region", Children: []sdui.Node{{ID: "selection-text", Type: "text", Bindings: map[string]string{"text": "selection"}}}},
	}}}
	plan, err := sdui.Compile(screen, registry)
	if err != nil {
		return nil, err
	}
	controlIDs, err := renderedChartControlIDs(plan)
	if err != nil {
		return nil, err
	}
	run := func(day bool) sdui.Action {
		return sdui.Action{Targets: []string{"selection-result"}, Authorize: func(context.Context, sdui.Request) error { return nil }, Run: func(_ context.Context, r sdui.Request) (sdui.Result, error) {
			id := r.Values.Get("chartID")
			index, err := strconv.Atoi(r.Values.Get("index"))
			if err != nil || index < 0 || index > 6 || day && id != controlIDs["project/Burndown Chart"] || !day && id != controlIDs["project/GanttChart"] {
				return sdui.Result{}, fmt.Errorf("invalid selection")
			}
			field := "progress"
			if day {
				field = "remaining"
			}
			value, err := strconv.ParseFloat(r.Values.Get(field), 64)
			if err != nil || math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
				return sdui.Result{}, fmt.Errorf("invalid work value")
			}
			expectedValues := []string{"design", "build"}
			expectedWork := []float64{50.5, 25.25}
			if day {
				expectedValues = []string{"2026-10-12", "2026-10-13", "2026-10-14"}
				expectedWork = []float64{40.5, 45.25, 30.5}
			}
			if index >= len(expectedValues) || r.Values.Get("value") != expectedValues[index] || value != expectedWork[index] || day && r.Values.Get("date") != expectedValues[index] {
				return sdui.Result{}, fmt.Errorf("selection does not match caller data")
			}
			result := map[string]any{"chartID": id, "index": index, "value": r.Values.Get("value"), field: value}
			if day {
				result["date"] = r.Values.Get("date")
			}
			encoded, _ := json.Marshal(result)
			return sdui.Result{Data: map[string]any{"selection": string(encoded)}}, nil
		}}
	}
	return sdui.NewHandler(plan, sdui.Config{Endpoint: "/sdui", Loaders: map[string]sdui.Loader{"initial": func(context.Context, sdui.Request) (map[string]any, error) {
		return map[string]any{"selection": "No selection yet."}, nil
	}}, Authenticate: func(*http.Request) (string, error) { return "local-chart-demo", nil }, Authorize: func(context.Context, string) error { return nil }, CSRF: func(*http.Request) (string, error) { return "local-chart-demo-csrf", nil }, Actions: map[string]sdui.Action{"inspect-task": run(false), "inspect-day": run(true)}})
}

// Event detail.id is the rendered component control ID, not its SDUI wrapper ID.
// Read the production render instead of duplicating SDUI's private ID algorithm.
func renderedChartControlIDs(plan *sdui.Plan) (map[string]string, error) {
	var out bytes.Buffer
	if err := plan.Render(&out, sdui.RenderContext{Data: map[string]any{"selection": "No selection yet."}}); err != nil {
		return nil, err
	}
	doc, err := html.Parse(&out)
	if err != nil {
		return nil, err
	}
	ids := map[string]string{}
	var visit func(*html.Node)
	visit = func(n *html.Node) {
		var id, component string
		for _, a := range n.Attr {
			if a.Key == "id" {
				id = a.Val
			}
			if a.Key == "data-ely-component" {
				component = a.Val
			}
		}
		if component == "project/GanttChart" || component == "project/Burndown Chart" {
			ids[component] = id
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			visit(c)
		}
	}
	visit(doc)
	if len(ids) != 2 || ids["project/GanttChart"] == "" || ids["project/Burndown Chart"] == "" {
		return nil, fmt.Errorf("missing rendered chart control IDs")
	}
	return ids, nil
}
