package ui

import "testing"

func TestSharedComboboxRetainsFreeTextAndDisabledState(t *testing.T) {
	for _, free := range []bool{false, true} {
		doc := renderSharedForm(t, "combobox", "ID", "custom-label", "Name", "label", "Value", "<Custom label>", "Free", free, "Disabled", true)
		roots := formNodes(doc, "div")
		if len(roots) != 1 {
			t.Fatalf("expected one combobox root, got %d", len(roots))
		}
		if _, marked := formAttr(roots[0], "data-ui-combobox-free"); marked != free {
			t.Fatalf("free-text mode = %v, want %v", marked, free)
		}
		for _, input := range formNodes(doc, "input") {
			requireFormAttr(t, input, "value", "<Custom label>")
			requireFormAttr(t, input, "disabled", "")
		}
	}
}
