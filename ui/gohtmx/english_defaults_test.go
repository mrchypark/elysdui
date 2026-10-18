package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestSharedControlsUseEnglishDefaults(t *testing.T) {
	templates, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"theme-toggle", nil, []string{`aria-label="Toggle color theme"`}},
		{"field-label", map[string]any{"Label": "Name"}, []string{"Name", "<small>Optional</small>"}},
		{"field-label", map[string]any{"Label": "Name", "Required": true}, []string{"Name", "<small>Required</small>"}},
		{"progress", nil, []string{`aria-label="Progress"`}},
		{"calendar", map[string]any{"ID": "default-calendar"}, []string{"<span>Sun</span>", "<span>Mon</span>", "<span>Tue</span>", "<span>Wed</span>", "<span>Thu</span>", "<span>Fri</span>", "<span>Sat</span>"}},
		// English defaults must not change caller-provided translations.
		{"progress", map[string]any{"AriaLabel": "진행률"}, []string{`aria-label="진행률"`}},
		{"field-label", map[string]any{"Label": "이름"}, []string{"이름", "<small>Optional</small>"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var output bytes.Buffer
			if err := templates.ExecuteTemplate(&output, tc.name, tc.props); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(output.String(), want) {
					t.Errorf("missing %q in %s", want, output.String())
				}
			}
		})
	}
}
