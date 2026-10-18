// Command menu-contracts renders shared components for real-browser contracts.
package main

import (
	"fmt"
	"os"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func main() {
	tpl, err := ui.NewTemplates()
	if err != nil {
		panic(err)
	}
	fragment := len(os.Args) > 1 && os.Args[1] == "fragment"
	if !fragment {
		fmt.Print(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/ely-api.css"><link rel="stylesheet" href="/assets/ely-api-interaction.css"><script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-interaction-entry.js"></script><style>body{padding:16px}#region{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:start;gap:32px;padding:24px}#context-a{grid-column:span 2}#edge{position:fixed;right:4px;bottom:4px;width:max-content}.test-gap{min-height:30px}</style></head><body><button id="before">Before menus</button><button id="replace" hx-get="/fragment" hx-target="#menu-a" hx-swap="outerHTML">Replace menu</button><main id="region">`)
	}
	rows := []map[string]any{
		{"Heading": "Commands <safe>"}, {"Separator": true},
		{"Label": "Unavailable", "Value": "off", "Action": "blocked", "Disabled": true},
		{"Label": "Open <safe>", "Value": "open", "Action": "open-file", "Icon": "folder", "Shortcut": "Ctrl+O"},
		{"Label": "Sidebar", "Value": "sidebar", "Action": "toggle-sidebar", "Checkbox": true},
		{"Label": "Comfortable", "Value": "comfortable", "Radio": true, "Group": "density", "Selected": true, "Action": "density"},
		{"Label": "Compact", "Value": "compact", "Radio": true, "Group": "density", "Action": "density"},
		{"Label": "Recent", "Value": "recent", "Items": []map[string]any{
			{"Label": "Nested off", "Value": "nested-off", "Disabled": true},
			{"Label": "Nested comfortable", "Value": "nested-comfortable", "Radio": true, "Group": "density", "Selected": true},
			{"Label": "Nested compact", "Value": "nested-compact", "Radio": true, "Group": "density"},
			{"Label": "Deep", "Value": "deep", "Items": []map[string]any{{"Label": "Deep leaf", "Value": "deep-leaf", "Action": "deep"}}},
		}},
		{"Label": "Last", "Value": "last", "Action": "last"},
	}
	render := func(name, id string, props map[string]any) {
		if err := ui.RenderComponent(tpl, os.Stdout, ui.Component{Chapter: "menus", Name: name, ID: id, Props: props}); err != nil {
			panic(err)
		}
	}
	render("Menu", "menu-a", map[string]any{"Label": "File menu", "Items": rows})
	if fragment {
		return
	}
	render("Menu", "menu-b", map[string]any{"Label": "Peer menu", "Items": rows})
	render("DropdownMenu", "dropdown", map[string]any{"Host": "dropdown", "Label": "Dropdown menu", "Items": rows})
	render("DropdownMenu", "split", map[string]any{"Host": "split", "Label": "Publish", "Action": "publish", "Value": "branch", "Items": rows})
	render("DropdownMenu", "overflow", map[string]any{"Host": "overflow", "Label": "More commands", "Items": rows})
	render("CheckboxMenuItem", "checks", map[string]any{"Label": "View", "Items": []map[string]any{{"Label": "Nested views", "Value": "parent", "Items": []map[string]any{{"Label": "Child action", "Value": "child"}}}, {"Label": "Ruler", "Value": "ruler", "Selected": true}}})
	render("ContextMenu", "context-a", map[string]any{"Label": "Canvas commands", "Content": "Right click this canvas", "Items": rows})
	render("Menu", "empty", map[string]any{"Label": "Empty menu", "Items": []map[string]any{}})
	render("Menu", "all-off", map[string]any{"Label": "All unavailable", "Items": []map[string]any{{"Label": "Off", "Value": "off", "Disabled": true}}})
	for _, name := range []string{"Menu", "DropdownMenu", "ContextMenu"} {
		render(name, "disabled-"+name, map[string]any{"Label": "Disabled " + name, "Host": "dropdown", "Disabled": true, "Items": rows})
	}
	render("DropdownMenu", "edge", map[string]any{"Host": "dropdown", "Label": "Edge menu", "Items": rows})
	fmt.Print(`<form id="caller-form"><input type="hidden" name="scope" value="caller-value">`)
	render("Menu", "form-menu", map[string]any{"Label": "Form commands", "Items": []map[string]any{{"Label": "Submit command", "Value": "form-leaf"}}})
	fmt.Print(`</form>`)
	fmt.Print(`</main><button id="after">After menus</button><div id="outside-blank" style="height:80px">Outside nonfocusable space</div></body></html>`)
}
