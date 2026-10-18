package ui

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProjectChartsRenderCallerData(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"GanttChart", map[string]any{"Title": "<Caller>", "Today": "2026-10-15", "Items": []map[string]any{{"Value": "<id>", "Label": "<task>", "Start": "2026-10-12", "End": "2026-10-14", "Progress": 25.5, "After": []int{0, 2}}}}, []string{`data-project-chart="gantt"`, `data-progress="25.5"`, `data-after="0 2 "`, `&lt;task&gt;`, `&lt;Caller&gt;`, `data-today="2026-10-15"`}},
		{"Burndown Chart", map[string]any{"Start": "2026-10-12", "End": "2026-10-18", "Scope": 40.5, "Remaining": []float64{40.5, 45, 20}, "Disabled": true}, []string{`data-project-chart="burndown"`, `data-scope="40.5"`, `data-remaining="40.5"`, `data-remaining="45"`, `aria-disabled="true"`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var b bytes.Buffer
			if err := RenderComponent(tpl, &b, Component{Chapter: "project", Name: tc.name, ID: "caller-chart", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(b.String(), want) {
					t.Errorf("missing %s", want)
				}
			}
			if strings.Contains(b.String(), "<progress") || strings.Contains(b.String(), "<meter") {
				t.Fatal("old chart placeholder returned")
			}
		})
	}
	mux := http.NewServeMux()
	if err := BindAssets(mux); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("GET", "/assets/ely-project-charts.js", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), "mountProjectCharts") {
		t.Fatal("production chart module not served")
	}
}
