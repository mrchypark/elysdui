// Command overlay-contracts renders real library components for browser verification.
package main

import (
	"fmt"
	"os"

	ui "github.com/mrchypark/ely-htmx"
)

func main() {
	t, err := ui.NewTemplates()
	if err != nil {
		panic(err)
	}
	fragment := len(os.Args) > 1 && os.Args[1] == "fragment"
	if !fragment {
		fmt.Print(`<!doctype html><html><head><link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/ely-api.css"><link rel="stylesheet" href="/assets/ely-api-interaction.css"><link rel="stylesheet" href="/assets/ely-api-foundation.css"><script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-interaction-entry.js"></script><script type="module" src="/assets/ely-api-foundation-entry.js"></script></head><body><button id="outside">Outside</button><button id="replace" hx-get="/fragment" hx-target="#region" hx-swap="outerHTML">Replace overlays</button>`)
	}
	fmt.Print(`<div id="region">`)
	for _, c := range []ui.Component{
		{Chapter: "overlays", Name: "Dialog", ID: "dialog", Props: map[string]any{"Label": "Open dialog", "Title": "Edit account", "Content": "Account detail", "Name": "account", "Value": "original", "Required": true, "Action": "save"}},
		{Chapter: "overlays", Name: "Dialog", ID: "prompt", Props: map[string]any{"Label": "Open prompt", "Title": "Rename", "Content": "Choose a name", "Presentation": "prompt", "Name": "name", "Value": "original", "TrimRequired": true, "Disallow": "/", "Action": "rename"}},
		{Chapter: "overlays", Name: "Dialog", ID: "alert", Props: map[string]any{"Label": "Open alert", "Title": "Confirm deletion", "Content": "This cannot be undone", "Presentation": "alert", "Action": "confirm"}},
		{Chapter: "overlays", Name: "Dialog", ID: "held", Props: map[string]any{"Label": "Open held dialog", "Title": "Required decision", "Name": "decision", "Value": "yes", "Dismissible": false, "Action": "decide"}},
		{Chapter: "overlays", Name: "Dialog", ID: "disabled-dialog", Props: map[string]any{"Label": "Disabled dialog", "Disabled": true}},
		{Chapter: "overlays", Name: "Popover", ID: "popover", Props: map[string]any{"Label": "Open popover", "Title": "Preferences", "Content": "Popover detail", "CloseLabel": "Done", "Items": []map[string]any{{"Label": "Toggle preference", "Value": "option", "Toggle": true, "Action": "toggle"}, {"Label": "Disabled option", "Disabled": true}}}},
		{Chapter: "overlays", Name: "Popover", ID: "peer", Props: map[string]any{"Label": "Open peer", "Title": "Peer", "Content": "Separate instance", "CloseLabel": "Done"}},
		{Chapter: "overlays", Name: "Popover", ID: "disabled-popover", Props: map[string]any{"Label": "Disabled popover", "Disabled": true}},
		{Chapter: "layout", Name: "Drawer", ID: "drawer", Props: map[string]any{"Label": "Open drawer", "Title": "Drawer title", "Text": "Drawer content", "Items": []string{"One", "Two"}}},
		{Chapter: "layout", Name: "Drawer", ID: "hidden-drawer", Props: map[string]any{"Label": "Untitled drawer", "HideTitle": true, "HideClose": true, "Text": "Dismiss with Escape"}},
		{Chapter: "layout", Name: "Drawer", ID: "disabled-drawer", Props: map[string]any{"Label": "Disabled drawer", "Disabled": true}},
	} {
		if err := ui.RenderComponent(t, os.Stdout, c); err != nil {
			panic(err)
		}
	}
	fmt.Print(`</div>`)
	if !fragment {
		fmt.Print(`</body></html>`)
	}
}
