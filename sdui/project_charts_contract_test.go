package sdui_test

import (
	"bytes"
	"github.com/mrchypark/ely-htmx/sdui"
	"strings"
	"testing"
)

func TestProjectChartContracts(t *testing.T) {
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name  string
		props map[string]any
		want  string
	}{
		{"project/GanttChart", map[string]any{"today": "2026-10-15", "items": []any{map[string]any{"value": "task", "label": "<safe>", "start": "2026-10-12", "end": "2026-10-14", "progress": 25.5, "after": []any{0}}}}, `data-progress="25.5"`},
		{"project/Burndown Chart", map[string]any{"start": "2026-10-12", "end": "2026-10-18", "scope": 40.5, "remaining": []any{40.5, 45.25, 20}, "disabled": true}, `data-remaining="45.25"`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			screen := sdui.Screen{Version: sdui.Version, ID: "chart-screen", Root: sdui.Node{ID: "chart", Type: tc.name, Props: tc.props}}
			plan, err := sdui.Compile(screen, registry)
			if err != nil {
				t.Fatal(err)
			}
			var out bytes.Buffer
			if err := plan.Render(&out, sdui.RenderContext{}); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(out.String(), tc.want) {
				t.Fatalf("missing %s", tc.want)
			}
			screen.Root.Props = map[string]any{"remaining": []any{"not numeric"}}
			if _, err := sdui.Compile(screen, registry); err == nil {
				t.Fatal("malformed series accepted")
			}
		})
	}
}
