// This fixture renders real shared components; it does not duplicate their markup.
package main

import (
	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"os"
	"strings"
)

// Compile real JSON through the catalogue: map-based rendering would hide a
// regression in the generated groups[].value schema.
func renderGroupedSelection() {
	const raw = `{"version":"1","id":"grouped-screen","root":{"id":"grouped","type":"buttons/SegmentedControl","props":{"groups":[{"name":"range","value":"b","items":[{"value":"a","selected":true},{"value":"b"},{"value":"c","selected":true,"disabled":true}]},{"name":"locked","value":"a","disabled":true,"items":[{"value":"a"},{"value":"b"}]},{"name":"fallback","items":[{"value":"a","selected":true},{"value":"b","selected":true}]}]}}}`
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		panic(err)
	}
	screen, err := sdui.Decode(strings.NewReader(raw))
	if err != nil {
		panic(err)
	}
	plan, err := sdui.Compile(screen, registry)
	if err != nil {
		panic(err)
	}
	if err := plan.Render(os.Stdout, sdui.RenderContext{}); err != nil {
		panic(err)
	}
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "grouped-fragment" {
		renderGroupedSelection()
		return
	}
	tpl, err := ui.NewTemplates()
	if err != nil {
		panic(err)
	}
	fragment := len(os.Args) > 1
	if !fragment {
		os.Stdout.WriteString(`<!doctype html><html><head><script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-interaction-entry.js"></script></head><body><button id="replace" hx-get="/fragment" hx-target="#tabs-a" hx-swap="outerHTML">Replace tabs</button><button id="replace-grouped" hx-get="/grouped-fragment" hx-target="#grouped-screen" hx-swap="outerHTML">Replace grouped selection</button>`)
	}
	render := func(name, id string, props map[string]any) {
		chapter := "buttons"
		if name == "Tabs" {
			chapter = "navigation"
		}
		if err := ui.RenderComponent(tpl, os.Stdout, ui.Component{Chapter: chapter, Name: name, ID: id, Props: props}); err != nil {
			panic(err)
		}
	}
	items := []map[string]any{{"Value": "a", "Label": "Alpha <safe>", "Content": "Alpha body", "Selected": true}, {"Value": "off", "Label": "Unavailable", "Content": "Disabled body", "Disabled": true}, {"Value": "b", "Label": "Beta", "Content": "Beta body"}}
	render("Tabs", "tabs-a", map[string]any{"Value": "b", "Placement": "left", "ContextAction": "tab-menu", "Items": items})
	if fragment {
		return
	}
	render("Tabs", "tabs-b", map[string]any{"Value": "off", "Items": items})
	render("Tabs", "tabs-disabled", map[string]any{"Disabled": true, "Items": items})
	render("Tabs", "tabs-empty", map[string]any{"Items": []map[string]any{}})
	render("SegmentedControl", "segments-a", map[string]any{"Value": "b", "Name": "view", "Items": items})
	render("SegmentedControl", "segments-b", map[string]any{"Value": "a", "Items": items})
	render("SegmentedControl", "segments-disabled", map[string]any{"Disabled": true, "Items": items})
	renderGroupedSelection()
	render("ToggleGroup", "toggles-a", map[string]any{"Multiple": true, "Items": items})
	render("ToggleGroup", "toggles-b", map[string]any{"Items": items})
	render("ToggleGroup", "toggles-disabled", map[string]any{"Disabled": true, "Items": items})
	os.Stdout.WriteString(`</body></html>`)
}
