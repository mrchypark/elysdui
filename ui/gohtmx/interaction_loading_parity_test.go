package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestInteractionLoadingCallerContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"Countdown", map[string]any{"Clocks": []map[string]any{{"Value": 15, "Restart": true, "Label": "Caller deadline"}, {"Value": 7, "Mode": "timer", "Label": "Elapsed"}}}, []string{`data-clock-value="15"`, `data-clock-mode="timer"`, `Caller deadline`, `Elapsed`}},
		{"Spinner", map[string]any{"Items": []map[string]any{{"Style": "bars", "Size": 32, "Label": "Caller wait"}}}, []string{`is-bars`, `data-loading-size="32"`, `Caller wait`}},
		{"Skeleton", map[string]any{"Label": "Caller placeholder", "Rows": []map[string]any{{"Cells": []map[string]any{{"Width": 72}}}}}, []string{`Caller placeholder`, `data-loading-width="72"`, `is-avatar`, `is-media`}},
		{"Shimmer", map[string]any{"ContentTitle": "Loaded title", "Content": "Caller content"}, []string{`data-loading-shimmer-content hidden`, `Loaded title`, `Caller content`}},
		{"LoadingButton", map[string]any{"Label": "Save", "Action": "caller-save", "Value": "record"}, []string{`data-interaction-pending-action="caller-save"`, `value="record"`, `ely-loading-spinner`}},
		{"LoadMore", map[string]any{"Shown": 2, "PageSize": 3, "Action": "caller-page", "Items": []map[string]any{{"Label": "Caller row"}}}, []string{`data-page-size="3"`, `data-shown="2"`, `Caller row`, `data-interaction-pending-action="caller-page"`}},
		{"ProgressBar", map[string]any{"Items": []map[string]any{{"Label": "Caller progress", "Value": 7, "Max": 10, "Buffer": 9, "Segments": 5}}, "Rings": []map[string]any{{"Value": 25, "Percent": true}}}, []string{`data-progress-max="10"`, `data-progress-buffer="9"`, `data-progress-segments="5"`, `data-loading-ring-fill`}},
		{"LoadingOverlay", map[string]any{"Action": "reload-caller", "Content": "Caller covered view", "Cancellable": false}, []string{`data-loading-action="reload-caller"`, `Caller covered view`}},
		{"LazyLoad", map[string]any{"Items": []map[string]any{{"Label": "Caller lazy row"}}}, []string{`data-interaction-lazy-row`, `Caller lazy row`}},
		{"Suspense", map[string]any{"Action": "fetch-caller", "Content": "Caller result", "Error": "Caller failure"}, []string{`data-loading-action="fetch-caller"`, `Caller result`, `Caller failure`, `Try again`}},
		{"RefreshIndicator", map[string]any{"Action": "refresh-caller", "Typing": []map[string]any{{"Who": "Alex", "Label": "Caller typing"}}}, []string{`data-ely-action="refresh-caller"`, `Alex is typing…`, `Caller typing`}},
		{"UploadList", map[string]any{"Items": []map[string]any{{"Label": "caller.pdf", "Value": "upload-1", "State": "failed", "Error": "Caller error", "Content": "5 MB"}}}, []string{`data-value="upload-1"`, `data-upload-size="5 MB"`, `data-upload-error="Caller error"`, `data-interaction-upload-retry`}},
		{"Transition", map[string]any{"Items": []map[string]any{{"Entrance": "slide", "Content": "Caller transition"}}}, []string{`data-loading-entrance="slide"`, `Caller transition`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			chapter := "motion"
			if tc.name == "Countdown" {
				chapter = "feedback"
			}
			var b bytes.Buffer
			if err := RenderComponent(tpl, &b, Component{Chapter: chapter, Name: tc.name, ID: "caller-loading", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(b.String(), want) {
					t.Errorf("missing %s in %s", want, b.String())
				}
			}
			if strings.Contains(b.String(), `data-loading-delay="1600"`) {
				t.Error("production caller acquired a fixture completion timer")
			}
		})
	}
}
