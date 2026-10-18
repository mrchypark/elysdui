// Package pointerfixture supplies test-only data and document shells for menu
// pointer contracts. Actual component markup always comes from the production
// renderer supplied by the caller. This package has no SDUI/adapter dependency.
package pointerfixture

import (
	"fmt"
	"io"
	"strings"
)

const Label = "Pointer commands <safe>"
const Content = "Pointer surface <safe>"
const ActionLabel = "Fallback menu"

type Spec struct {
	ID, Component, ContextMode, Rows string
	Disabled                         bool
}

type Renderer func(io.Writer, Spec) error

func Aliases() []string {
	return []string{"Menu", "SubMenu", "DropdownMenu", "OverflowMenu", "CheckboxMenuItem", "RadioMenuItem", "ContextMenu"}
}

func ValidateAlias(alias string) error {
	for _, allowed := range Aliases() {
		if alias == allowed {
			return nil
		}
	}
	return fmt.Errorf("unsupported pointer fixture alias %q (want %s)", alias, strings.Join(Aliases(), ", "))
}

func GoRows(kind string) []map[string]any {
	if kind == "empty" {
		return []map[string]any{}
	}
	if kind == "alloff" {
		return []map[string]any{{"Label": "Unavailable", "Value": "off", "Action": "blocked", "Disabled": true, "Radio": false, "Icon": "circle"}}
	}
	return []map[string]any{
		{"Heading": "Commands <safe>"},
		{"Label": "First <safe>", "Value": "first", "Action": "first-action", "Radio": false, "Icon": "circle"},
		{"Label": "Plain", "Value": "plain", "Action": "plain-action", "Radio": false, "Icon": "circle"},
		{"Label": "Checkbox", "Value": "check", "Checkbox": true, "Action": "check-action", "Icon": "circle"},
		{"Label": "Comfortable", "Value": "radio-a", "Radio": true, "Group": "density", "Selected": true, "Action": "density", "Icon": "circle"},
		{"Label": "Compact", "Value": "radio-b", "Radio": true, "Group": "density", "Action": "density", "Icon": "circle"},
		{"Label": "Branch", "Value": "branch", "Icon": "circle", "Items": []map[string]any{
			{"Label": "Child first", "Value": "child-first", "Action": "child-action", "Radio": false, "Icon": "circle"},
			{"Label": "Child plain", "Value": "child-plain", "Action": "child-plain-action", "Radio": false, "Icon": "circle"},
			{"Label": "Child comfortable", "Value": "child-radio-a", "Radio": true, "Group": "density", "Selected": true, "Action": "density", "Icon": "circle"},
			{"Label": "Child compact", "Value": "child-radio-b", "Radio": true, "Group": "density", "Action": "density", "Icon": "circle"},
		}},
		{"Label": "Unavailable", "Value": "off", "Disabled": true, "Action": "blocked", "Radio": false, "Icon": "circle"},
		{"Label": "Unavailable branch", "Value": "off-branch", "Icon": "circle", "Disabled": true, "Items": []map[string]any{
			{"Label": "Unavailable child", "Value": "off-child", "Action": "blocked", "Radio": false, "Icon": "circle"},
		}},
		{"Label": "Empty child", "Value": "empty-child", "Icon": "circle", "Items": []map[string]any{}},
		{"Label": "All unavailable child", "Value": "alloff-child", "Icon": "circle", "Items": []map[string]any{
			{"Label": "Unavailable descendant", "Value": "alloff-child-off", "Disabled": true, "Action": "blocked", "Radio": false, "Icon": "circle"},
		}},
		{"Label": "Last", "Value": "last", "Action": "last-action", "Radio": false, "Icon": "circle"},
	}
}

func GoProps(s Spec) map[string]any {
	props := map[string]any{"Label": Label, "Items": GoRows(s.Rows)}
	if s.Component == "ContextMenu" {
		props["Content"] = Content
		props["ActionLabel"] = ActionLabel
		if s.ContextMode != "" {
			props["ContextMode"] = s.ContextMode
		}
	}
	if s.Disabled {
		props["Disabled"] = true
	}
	return props
}

func Specs(alias string) []Spec {
	return []Spec{
		{ID: "primary", Component: alias},
		{ID: "peer", Component: "Menu"},
		{ID: "nested", Component: "Menu"},
		{ID: "empty", Component: "Menu", Rows: "empty"},
		{ID: "alloff", Component: "Menu", Rows: "alloff"},
		{ID: "disabled", Component: "Menu", Disabled: true},
		{ID: "automatic", Component: "ContextMenu", ContextMode: "automatic"},
		{ID: "manual", Component: "ContextMenu", ContextMode: "manual"},
	}
}

func Write(w io.Writer, render Renderer, full bool, primary Spec) error {
	if err := ValidateAlias(primary.Component); err != nil {
		return err
	}
	if !full {
		return render(w, primary)
	}
	if _, err := io.WriteString(w, `<!doctype html><html><head><meta charset="utf-8"><title>Menu pointer selection contracts</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/ely-api.css"><link rel="stylesheet" href="/assets/ely-api-interaction.css"><script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-interaction-entry.js"></script><style>body{margin:20px}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;align-items:start}[data-fixture-slot]{min-height:100px}.ely-interaction__context{min-height:100px}#outside-blank{height:100px;margin-top:30px}#swap-status{min-height:10px}</style></head><body><button id="before" type="button">Before menus</button><button id="swap-source" type="button">Swap request source</button><form id="host-form"><input type="hidden" name="scope" value="caller-value"><main>`); err != nil {
		return err
	}
	for _, spec := range Specs(primary.Component) {
		if _, err := fmt.Fprintf(w, `<div id="fixture-slot-%s" data-fixture-slot="%s">`, spec.ID, spec.ID); err != nil {
			return err
		}
		if err := render(w, spec); err != nil {
			return err
		}
		if _, err := io.WriteString(w, `</div>`); err != nil {
			return err
		}
	}
	_, err := io.WriteString(w, `</main></form><button id="after" type="button">After menus</button><div id="outside-blank">Outside nonfocusable destination</div><div id="swap-status"></div></body></html>`)
	return err
}
