// Package contextfixture supplies test-only fixture data and document shells.
// It deliberately has no dependency on SDUI or an adapter. All component markup
// is supplied by the caller's actual production renderer.
package contextfixture

import (
	"fmt"
	"io"
)

type Spec struct {
	ID, Component, Mode, Number, Rows string
	X, Y                              float64
	Disabled                          bool
}

type Renderer func(io.Writer, Spec) error

func GoRows(kind string) []map[string]any {
	if kind == "empty" {
		return []map[string]any{}
	}
	if kind == "alloff" {
		return []map[string]any{{"Label": "Unavailable", "Value": "off", "Disabled": true}}
	}
	return []map[string]any{
		{"Heading": "Commands <safe>"},
		{"Label": "Unavailable", "Value": "off", "Disabled": true},
		{"Label": "Open <safe>", "Value": "open", "Action": "open-file"},
		{"Label": "Sidebar", "Value": "check", "Checkbox": true, "Action": "toggle-sidebar"},
		{"Label": "Comfortable", "Value": "radio-a", "Radio": true, "Group": "density", "Selected": true, "Action": "density"},
		{"Label": "Compact", "Value": "radio-b", "Radio": true, "Group": "density", "Action": "density"},
		{"Label": "Branch", "Value": "branch", "Items": []map[string]any{
			{"Label": "Disabled child", "Value": "child-off", "Disabled": true},
			{"Label": "Child", "Value": "child", "Action": "child-action"},
			{"Label": "Empty", "Value": "empty-child", "Items": []map[string]any{}},
		}},
		{"Label": "Last", "Value": "last", "Action": "last-action"},
	}
}

func GoProps(s Spec) map[string]any {
	p := map[string]any{"Label": "Canvas commands <safe>", "Items": GoRows(s.Rows)}
	if s.Component != "Menu" {
		p["Content"] = "Owner canvas <safe>"
		p["ActionLabel"] = "Fallback menu"
		p["ContextMode"] = s.Mode
		if s.Number != "" {
			p["ContextRequest"] = map[string]any{"Number": s.Number, "X": s.X, "Y": s.Y}
		}
	}
	if s.Disabled {
		p["Disabled"] = true
	}
	return p
}

func Specs() []Spec {
	return []Spec{
		{ID: "manual", Component: "ContextMenu", Mode: "manual"},
		{ID: "peer", Component: "ContextMenu", Mode: "manual"},
		{ID: "automatic", Component: "ContextMenu", Mode: "automatic"},
		{ID: "automatic-seed", Component: "ContextMenu", Mode: "automatic", Number: "41", X: 120.5, Y: 80.25},
		{ID: "disabled", Component: "ContextMenu", Mode: "manual", Disabled: true},
		{ID: "empty", Component: "ContextMenu", Mode: "manual", Rows: "empty"},
		{ID: "alloff", Component: "ContextMenu", Mode: "manual", Rows: "alloff"},
		{ID: "wrong", Component: "Menu"},
		{ID: "nested", Component: "ContextMenu", Mode: "manual"},
		{ID: "seeded", Component: "ContextMenu", Mode: "manual", Number: "18446744073709551615", X: 120.5, Y: 80.25},
	}
}

func Write(w io.Writer, render Renderer, full bool, s Spec) error {
	if !full {
		return render(w, s)
	}
	fmt.Fprint(w, `<!doctype html><html><head><meta charset="utf-8"><title>Owner ContextMenu contracts</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/ely-api.css"><link rel="stylesheet" href="/assets/ely-api-interaction.css"><script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-interaction-entry.js"></script><style>body{margin:20px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:start}#outside-blank{height:100px;margin-top:30px}.ely-interaction__context{min-height:80px}#swap-status{min-height:10px}</style></head><body><button id="before">Before menus</button><button id="owner-open" type="button">Open canvas commands</button><button id="swap-source" type="button">Swap request source</button><button id="after">After menus</button><form id="host-form"><input type="hidden" name="scope" value="caller-value"><main>`)
	for _, spec := range Specs() {
		fmt.Fprintf(w, `<div id="fixture-slot-%s" data-fixture-slot="%s">`, spec.ID, spec.ID)
		if err := render(w, spec); err != nil {
			return err
		}
		fmt.Fprint(w, `</div>`)
	}
	fmt.Fprint(w, `</main></form><div id="outside-blank">Outside nonfocusable destination</div><div id="swap-status"></div></body></html>`)
	return nil
}
