package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestInteractionVisualCallerContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		chapter, name string
		props         map[string]any
		want          []string
	}{
		{"navigation", "QuickSwitcher", map[string]any{"Icon": "folder", "Label": "Caller switch", "Disabled": true}, []string{`class="ely-interaction__palette-trigger"`, `data-interaction-icon="folder"`, `Caller switch`, ` disabled`, `data-interaction-dialog=`}},
		{"navigation", "SearchPalette", map[string]any{"Label": "Find"}, []string{`data-interaction-icon="search"`, `class="ely-interaction__palette-trigger"`}},
		{"navigation", "Steps", map[string]any{"Vertical": true, "Items": []map[string]any{{"Label": "One", "Value": "one", "Selected": true}}}, []string{`ely-interaction__wizard is-vertical`, `aria-current="step"`, `data-interaction-step`}},
		{"buttons", "QuickActions", map[string]any{"Hint": "Caller guidance", "Items": []map[string]any{{"Label": "Open", "Icon": "folder", "Value": "project", "Action": "open-project"}}}, []string{`ely-interaction__quick-icon`, `tabindex="0"`, `data-ely-action="open-project"`, `Caller guidance`}},
		{"buttons", "FloatingActionButton", map[string]any{"Items": []map[string]any{{"Label": "Add", "Icon": "plus", "IconOnly": true, "Action": "add-row"}}}, []string{`ely-interaction__fab`, `aria-label="Add"`, `data-interaction-icon-only="true"`, `data-ely-action="add-row"`}},
		{"menus", "DropdownMenu", map[string]any{"Host": "overflow", "Label": "Caller actions"}, []string{`data-interaction-host="overflow"`, `aria-label="Caller actions"`, `aria-haspopup="menu"`}},
		{"overlays", "Popover", map[string]any{"ButtonVariant": "link", "Before": "Read", "Label": "terms", "After": "now"}, []string{`data-variant="link"`, `<span>Read</span>`, `<span>now</span>`, `aria-haspopup="dialog"`}},
		{"interaction", "Resizable", map[string]any{"Shapes": true}, []string{`ely-interaction__rotate-arrow`, `role="img" aria-label="Arrow"`, `data-direct-rotate=`}},
		{"interaction", "Resizable", map[string]any{"Shapes": true, "RotateSrc": "/caller.svg", "Alt": "Caller image"}, []string{`<img src="/caller.svg" alt="Caller image">`}},
		{"interaction", "Hotkeys", map[string]any{"Bindings": []map[string]any{{"Keys": "Meta+k Meta+s", "Action": "save"}}}, []string{`data-direct-keycaps="Meta&#43;k Meta&#43;s"`, `data-direct-binding="Meta&#43;k Meta&#43;s"`, `data-action="save"`}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "visual-caller", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(out.String(), want) {
					t.Fatalf("missing %s in %s", want, out.String())
				}
			}
			if tc.name == "Steps" && strings.Contains(out.String(), "data-interaction-step-next") {
				t.Fatal("Vertical steps gained wizard actions")
			}
		})
	}
}
