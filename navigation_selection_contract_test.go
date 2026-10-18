package ui

import (
	"bytes"
	"golang.org/x/net/html"
	"strings"
	"testing"
)

func renderSelection(t *testing.T, name string, props map[string]any) *html.Node {
	t.Helper()
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	chapter := "buttons"
	if name == "Tabs" {
		chapter = "navigation"
	}
	var out bytes.Buffer
	if err = RenderComponent(tpl, &out, Component{Chapter: chapter, Name: name, ID: "selection", Props: props}); err != nil {
		t.Fatal(err)
	}
	doc, err := html.Parse(strings.NewReader(out.String()))
	if err != nil {
		t.Fatal(err)
	}
	return doc
}
func TestNavigationSelectionValueAndExclusiveState(t *testing.T) {
	for _, name := range []string{"Tabs", "SegmentedControl"} {
		t.Run(name, func(t *testing.T) {
			items := []map[string]any{{"Value": "a", "Label": "A", "Selected": true}, {"Value": "b", "Label": "B"}, {"Value": "c", "Label": "C", "Selected": true}}
			for _, value := range []string{"b", "", "unknown"} {
				doc := renderSelection(t, name, map[string]any{"Value": value, "Items": items})
				attr := "aria-selected"
				if name == "SegmentedControl" {
					attr = "aria-checked"
				}
				count := 0
				for _, n := range formNodes(doc, "button") {
					if selected, _ := formAttr(n, attr); selected == "true" {
						count++
						want := "b"
						if value == "" {
							want = "a"
						}
						requireFormAttr(t, n, "value", want)
					}
				}
				want := 1
				if value == "unknown" {
					want = 0
				}
				if count != want {
					t.Fatalf("%s Value %q selected %d, want %d", name, value, count, want)
				}
			}
		})
	}
}
func TestNavigationSelectionDisabledAndGroupState(t *testing.T) {
	doc := renderSelection(t, "Tabs", map[string]any{"Items": []map[string]any{{"Value": "a", "Disabled": true}, {"Value": "b"}}})
	buttons := formNodes(doc, "button")
	requireFormAttr(t, buttons[0], "aria-selected", "false")
	requireFormAttr(t, buttons[1], "aria-selected", "true")
	doc = renderSelection(t, "SegmentedControl", map[string]any{"Groups": []map[string]any{{"Name": "range", "Value": "b", "Disabled": true, "Items": []map[string]any{{"Value": "a"}, {"Value": "b"}}}, {"Value": "a", "Items": []map[string]any{{"Value": "a"}, {"Value": "b"}}}}})
	buttons = formNodes(doc, "button")
	for _, n := range buttons[:2] {
		requireFormAttr(t, n, "disabled", "")
		requireFormAttr(t, n, "tabindex", "-1")
		requireFormAttr(t, n, "name", "range")
	}
	requireFormAttr(t, buttons[1], "aria-checked", "true")
	requireFormAttr(t, buttons[2], "aria-checked", "true")
}

func TestToggleGroupCallerSemantics(t *testing.T) {
	doc := renderSelection(t, "ToggleGroup", map[string]any{"Name": "format", "Size": "sm", "Items": []map[string]any{{"Value": "bold", "Label": "Bold", "Icon": "bold", "IconOnly": true}}})
	button := formNodes(doc, "button")[0]
	requireFormAttr(t, button, "name", "format")
	requireFormAttr(t, button, "aria-label", "Bold")
	requireFormAttr(t, button, "data-interaction-button-icon", "bold")
	requireFormAttr(t, button, "data-interaction-icon-only", "true")
	doc = renderSelection(t, "ToggleGroup", map[string]any{"Groups": []map[string]any{{"Disabled": true, "Name": "alignment", "Items": []map[string]any{{"Value": "left"}}}}})
	button = formNodes(doc, "button")[0]
	requireFormAttr(t, button, "name", "alignment")
	requireFormAttr(t, button, "disabled", "")
	doc = renderSelection(t, "Tabs", map[string]any{"ContextAction": "tab-menu", "Items": []map[string]any{{"Value": "a"}}})
	requireFormAttr(t, formNodes(doc, "button")[0], "data-interaction-tab-context", "tab-menu")
}

func TestNavigationSelectionFocusIndependentOfState(t *testing.T) {
	for _, name := range []string{"Tabs", "SegmentedControl"} {
		for _, value := range []string{"off", "unknown"} {
			doc := renderSelection(t, name, map[string]any{"Value": value, "Items": []map[string]any{{"Value": "off", "Disabled": true}, {"Value": "enabled"}}})
			buttons := formNodes(doc, "button")
			requireFormAttr(t, buttons[0], "tabindex", "-1")
			requireFormAttr(t, buttons[1], "tabindex", "0")
		}
	}
}
