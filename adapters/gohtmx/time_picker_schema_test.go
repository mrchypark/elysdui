package gohtmx_test

import (
	"strings"
	"testing"

	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
)

func TestCatalogueTimePickerMaxRendersTimeAndPreservesInteger(t *testing.T) {
	r, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name string
		max  any
		want string
	}{
		{"overnight time", "01:00", `max="01:00"`},
		{"existing integer", 5, `max="5"`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			markup, err := renderCatalogue("forms/TimePicker", map[string]any{
				"name": "time", "min": "23:00", "max": tc.max,
			}, r)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(markup, `type="time"`) || !strings.Contains(markup, `min="23:00"`) || !strings.Contains(markup, tc.want) {
				t.Fatalf("time input lost caller bounds: %s", markup)
			}
		})
	}
	if _, err := renderCatalogue("forms/TimePicker", map[string]any{"max": true}, r); err == nil {
		t.Fatal("boolean max unexpectedly accepted")
	}
}
