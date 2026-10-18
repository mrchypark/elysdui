package ui

import (
	"bytes"
	"html/template"
	"strings"
	"testing"
)

func TestNativeToolingCallerContracts(t *testing.T) {
	tpl, err := template.New("tooling").Funcs(Funcs()).ParseFS(Files, "templates/ely-api-native-tooling.html")
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		kind  string
		props map[string]any
		want  []string
	}{
		{"InspectorOverlay", map[string]any{"Content": "Caller box"}, []string{"data-tool-inspect-toggle", "Caller box", "data-tool-inspect-panel"}},
		{"FPSMeter", map[string]any{"Measuring": true}, []string{"data-tool-measure checked", "data-tool-fps-bars"}},
		{"RenderCounter", map[string]any{"Items": []map[string]any{{"Label": "Caller", "Value": "caller", "Count": 7, "Redraw": true}}}, []string{`data-tool-render-count="caller" data-count="7"`, `data-tool-redraw="caller"`}},
		{"EventLogger", map[string]any{"Value": "<caller>"}, []string{`value="&lt;caller&gt;"`, `data-tool-event-target`}},
		{"DesignTokenViewer", map[string]any{"Groups": []map[string]any{{"Label": "Caller", "Items": []map[string]any{{"Label": "Ink", "Token": "--caller", "Color": "#123456"}}}}}, []string{`data-token="--caller"`, `#123456`}},
		{"IconBrowser", map[string]any{"Value": "star", "Icons": []string{"star", "search"}, "Action": "pick"}, []string{`data-selected="star"`, `data-action="pick"`, `data-tool-icon-option="search"`}},
		{"A11yChecker", map[string]any{"Items": []map[string]any{{"Label": "Caller", "Foreground": "#000", "Background": "#fff", "Need": 3}}}, []string{`data-need="3"`, `data-front="#000"`}},
		{"ScreenshotTest Harness", map[string]any{"Command": "echo <caller>", "Action": "capture-caller"}, []string{"echo &lt;caller&gt;", `data-tool-host-action="capture-caller"`}},
		{"ComponentGallery", map[string]any{"Items": []map[string]any{{"Label": "Caller page", "URL": "/caller"}}}, []string{`href="/caller"`}},
		{"PlaygroundPanel", map[string]any{"Preview": "host", "Content": "Caller preview", "Action": "draw-preview", "Knobs": []map[string]any{{"Name": "amount", "Type": "number", "Min": 0, "Max": 10, "Step": .5, "Value": 0}}}, []string{"Caller preview", `data-action="draw-preview"`, `step="0.5" value="0"`}},
		{"RenderSurface", map[string]any{"Position": 0, "Ratio": 1.5, "Width": 320, "Action": "draw", "Ground": "#123456"}, []string{`data-place="0"`, `data-ratio="1.5"`, `data-width="320"`, `data-action="draw"`, `data-ground="#123456"`}},
	}
	for _, tc := range cases {
		t.Run(tc.kind, func(t *testing.T) {
			tc.props["Kind"] = tc.kind
			tc.props["Title"] = "Caller title"
			tc.props["Description"] = "Caller description"
			var out bytes.Buffer
			if err := tpl.ExecuteTemplate(&out, "native-tooling", tc.props); err != nil {
				t.Fatal(err)
			}
			s := out.String()
			for _, want := range append(tc.want, "Caller title", "Caller description") {
				if !strings.Contains(s, want) {
					t.Errorf("missing %q", want)
				}
			}
			if strings.Contains(s, "style=") || strings.Contains(s, "ZgotmplZ") {
				t.Fatal("unsafe or inline template output")
			}
		})
	}
	var out bytes.Buffer
	if err := tpl.ExecuteTemplate(&out, "native-tooling", map[string]any{"Kind": "ScreenshotTest Harness", "Command": "cargo run"}); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out.String(), "<button") {
		t.Fatal("explanatory harness must not simulate a command")
	}
}
