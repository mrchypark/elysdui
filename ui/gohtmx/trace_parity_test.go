package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestTraceCallerParity(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"TraceViewer"} {
		t.Run(name, func(t *testing.T) {
			var out bytes.Buffer
			err := RenderComponent(tpl, &out, Component{Chapter: "agent", Name: name, ID: "caller-trace", Props: map[string]any{
				"Title": "Caller trace", "Duration": 900, "RangeStart": -100, "RangeEnd": 0, "SelectedLabel": "Caller selection", "Disabled": true,
				"Tracks": []map[string]any{{"Label": "Caller track", "Spans": []map[string]any{{"Value": "caller-id", "Label": "<Caller label>", "Start": -50, "End": 100, "Selected": true}}}},
			}})
			if err != nil {
				t.Fatal(err)
			}
			for _, want := range []string{"Caller trace", "Caller track", "Caller selection", `class="ely-agent-trace-span"`, `data-trace-range-start="-100"`, `data-trace-range-end="0"`, `data-ely-trace-duration="900"`, `value="caller-id"`, `data-trace-label="&lt;Caller label&gt;"`, `aria-pressed="true" disabled`, `data-trace-disabled="true"`, `data-ely-trace-ruler`, `data-ely-trace-zoom disabled`} {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q", want)
				}
			}
		})
	}
	for _, name := range []string{"TraceViewer", "EvalResultTable"} {
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: "agent", Name: name, ID: "empty-trace", Props: map[string]any{"HideHeading": true, "HideControls": true}}); err != nil {
			t.Fatalf("empty %s: %v", name, err)
		}
		if strings.Contains(out.String(), "<h2>") {
			t.Errorf("hidden heading rendered: %s", name)
		}
	}
	var out bytes.Buffer
	if err := RenderComponent(tpl, &out, Component{Chapter: "agent", Name: "EvalResultTable", ID: "caller-evals", Props: map[string]any{"Title": "Caller evaluations", "Disabled": true, "Columns": []map[string]any{{"Value": "custom", "Label": "Caller column"}}, "Rows": []map[string]any{{"Cells": []string{"<Caller cell>"}}}}}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Caller evaluations", "Caller column", `value="custom"`, "&lt;Caller cell&gt;", `aria-sort="none"`, "disabled"} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("missing %q", want)
		}
	}
}
