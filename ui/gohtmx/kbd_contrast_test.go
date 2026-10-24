package ui

import (
	"strings"
	"testing"
)

func TestSharedKbdUsesContrastingThemeTokens(t *testing.T) {
	for _, tc := range []struct {
		name, template string
		props          []any
		groupSlot      string
		ariaLabel      string
		wantKeys       int
	}{
		{"single", "kbd", []any{"Text", "Esc", "AriaLabel", "Escape key"}, "kbd", "Escape key", 1},
		{"group", "kbd-group", []any{"Keys", []string{"Ctrl", "Shift", "R"}, "AriaLabel", "Refresh shortcut"}, "kbd-group", "Refresh shortcut", 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			doc := renderSharedForm(t, tc.template, tc.props...)
			keycapCount := 0
			labelFound := false
			for _, node := range formNodes(doc, "kbd") {
				slot, _ := formAttr(node, "data-slot")
				if slot == tc.groupSlot {
					labelFound = true
					if label, _ := formAttr(node, "aria-label"); label != tc.ariaLabel {
						t.Errorf("%s aria-label = %q, want %q", slot, label, tc.ariaLabel)
					}
				}
				if slot == "kbd" {
					keycapCount++
					class, _ := formAttr(node, "class")
					for _, token := range []string{"bg-background", "text-foreground"} {
						if !strings.Contains(" "+class+" ", " "+token+" ") {
							t.Errorf("keycap class %q lacks contrasting token %q", class, token)
						}
					}
					if strings.Contains(class, "bg-muted") || strings.Contains(class, "text-muted-foreground") {
						t.Errorf("keycap retains same-token foreground/background classes: %q", class)
					}
				}
			}
			if keycapCount != tc.wantKeys {
				t.Fatalf("keycap count = %d, want %d", keycapCount, tc.wantKeys)
			}
			if !labelFound {
				t.Errorf("native %s wrapper missing", tc.groupSlot)
			}
		})
	}

	css, err := Files.ReadFile("assets/app.css")
	if err != nil {
		t.Fatal(err)
	}
	for _, rule := range []string{
		".bg-background{background-color:var(--color-background)}",
		".text-foreground{color:var(--color-foreground)}",
	} {
		if !strings.Contains(string(css), rule) {
			t.Errorf("shared stylesheet lacks token utility rule %q", rule)
		}
	}
}
