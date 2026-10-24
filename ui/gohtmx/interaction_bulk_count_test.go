package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestBulkActionBarEffectiveInitialCount(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, qualified := range []bool{false, true} {
		for _, tc := range []struct {
			name   string
			props  map[string]any
			count  string
			hidden bool
		}{
			{"omitted", map[string]any{}, "0", true},
			{"legacy-positive", map[string]any{"Value": "2"}, "2", false},
			{"legacy-zero", map[string]any{"Value": "0"}, "0", true},
			{"numeric-positive", map[string]any{"Value": 2}, "2", false},
			{"explicit-zero-wins", map[string]any{"Value": "2", "SelectedCount": 0}, "0", true},
			{"explicit-positive-wins", map[string]any{"Value": "0", "SelectedCount": 2}, "2", false},
			{"explicit-string-zero", map[string]any{"Value": "2", "SelectedCount": "0"}, "0", true},
		} {
			t.Run(tc.name+map[bool]string{false: "-chapter", true: "-qualified"}[qualified], func(t *testing.T) {
				component := Component{Chapter: "buttons", Name: "BulkActionBar", ID: "bulk-count", Props: tc.props}
				if qualified {
					component.Chapter, component.Name = "", "buttons/BulkActionBar"
				}
				var body bytes.Buffer
				if err := RenderComponent(tpl, &body, component); err != nil {
					t.Fatal(err)
				}
				output := body.String()
				for _, want := range []string{
					`data-interaction-bulk-count="` + tc.count + `"`,
					`<output data-interaction-bulk-summary>` + tc.count + ` selected</output>`,
					`<output data-interaction-bulk-count>` + tc.count + `</output>`,
				} {
					if !strings.Contains(output, want) {
						t.Errorf("missing %s in %s", want, output)
					}
				}
				if got := strings.Contains(output, `class="ely-interaction__bar is-bulk" hidden`); got != tc.hidden {
					t.Errorf("hidden = %t, want %t: %s", got, tc.hidden, output)
				}
			})
		}
	}
}
