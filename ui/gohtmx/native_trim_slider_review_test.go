package ui

import (
	"bytes"
	"regexp"
	"strings"
	"testing"
)

func TestNativeTrimSliderRenderedValues(t *testing.T) {
	tpl := nativeTemplates(t)
	buttons := regexp.MustCompile(`<button[^>]*data-native-trim-handle="(?:start|end)"[^>]*>`)
	for _, tc := range []struct {
		name  string
		props map[string]any
		start string
		end   string
	}{
		{"caller", map[string]any{"Duration": 90, "TrimStart": 12, "TrimEnd": 66}, "12", "66"},
		{"zero", map[string]any{"Duration": 90, "TrimStart": 0, "TrimEnd": 0}, "0", "0"},
		{"defaultEnd", map[string]any{"Duration": 90, "TrimStart": 0}, "0", "90"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "media", Name: "VideoThumbnailStrip", ID: "trim-review", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			handles := buttons.FindAllString(out.String(), -1)
			if len(handles) != 2 {
				t.Fatalf("got %d trim handles", len(handles))
			}
			for i, value := range []string{tc.start, tc.end} {
				for _, attr := range []string{`role="slider"`, `aria-valuemin="0"`, `aria-valuemax="90"`, `aria-valuenow="` + value + `"`, `aria-valuetext="` + value + ` seconds"`} {
					if !strings.Contains(handles[i], attr) {
						t.Errorf("handle %d missing %s: %s", i, attr, handles[i])
					}
				}
			}
		})
	}
}
