package uiexamples

import (
	"bytes"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"strings"
	"testing"
)

func TestInteractionMotionAndDirectSourceFixtures(t *testing.T) {
	expected := map[string]int{"Stagger": 5, "AnimatePresence": 3, "Flip": 5, "Reorder": 5, "Marquee": 4, "Ripple": 0, "Glow": 0, "Blink": 0, "ParticleBackground": 0, "Draggable": 0, "Resizable": 12, "LongPress": 0, "Hotkeys": 0, "Undo": 0, "VirtualScroller": 0, "Autofocus": 4}
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, fixture := range advancedInteractionCases() {
		c := fixture.Component
		want, ok := expected[c.Name]
		if !ok || (c.Chapter != "motion" && c.Chapter != "interaction") {
			continue
		}
		count++
		if c.Props["Disabled"] != false {
			t.Errorf("%s disabled", c.Name)
		}
		if want > 0 && len(c.Props["Items"].([]map[string]any)) != want {
			t.Errorf("%s has incomplete source rows", c.Name)
		}
		var body bytes.Buffer
		if err := ui.RenderComponent(tpl, &body, c); err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		for _, text := range map[string][]string{"Draggable": {"Today", "Later", "Design", "Build", "Ship"}, "Resizable": {"tile-11", "Upcoming", "Someday"}, "Hotkeys": {"save-all", "shout"}, "VirtualScroller": {"data-direct-count=\"10000\"", "Before line 40", "After line 40"}, "Autofocus": {"Grape", "Blueberry", "Strikethrough", "Show a field"}, "Blink": {"Sign in", "Wrong password"}, "ParticleBackground": {"Quiet motion", "Tonal drift"}}[c.Name] {
			if !strings.Contains(body.String(), text) {
				t.Errorf("%s missing %s", c.Name, text)
			}
		}
	}
	if count != 16 {
		t.Fatalf("%d source fixtures, want 16", count)
	}
}
