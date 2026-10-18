// Package searchablefixture supplies test-only data and a document shell for
// SearchableMenu confirmation contracts. The caller supplies the production
// renderer; this package adds no component markup or interaction behavior and
// has no SDUI/adapter dependency.
package searchablefixture

import (
	"fmt"
	"io"
)

const Label = "Search commands <safe>"
const Placeholder = "Find commands <safe>"
const Query = "root-query"

type Spec struct {
	ID, Rows string
}

type Renderer func(io.Writer, Spec) error

func GoRows(kind string) []map[string]any {
	if kind == "empty" {
		return []map[string]any{}
	}
	off := map[string]any{"Label": "Alpha blocked", "Value": "off", "Action": "blocked-action", "Disabled": true}
	if kind == "alloff" {
		return []map[string]any{off}
	}
	return []map[string]any{
		{"Heading": "Commands <safe>"},
		{"Label": "Unrelated", "Value": "hidden", "Action": "hidden-action"},
		off,
		{"Label": "Alpha one", "Value": "alpha-one", "Action": "choose-one"},
		{"Label": "Alpha two", "Value": "alpha-two", "Action": "choose-two"},
	}
}

func GoProps(spec Spec) map[string]any {
	return map[string]any{
		"Label": Label, "Placeholder": Placeholder, "Value": Query,
		"Icon": "search", "Items": GoRows(spec.Rows),
	}
}

func Specs() []Spec {
	return []Spec{
		{ID: "primary"}, {ID: "peer"},
		{ID: "empty", Rows: "empty"}, {ID: "alloff", Rows: "alloff"},
	}
}

// Write renders a fragment or the fixed four-root document. Initial filtering
// and production mounting are deliberately left to the browser runner/runtime.
func Write(w io.Writer, render Renderer, full bool, primary Spec) error {
	if primary.Rows != "" && primary.Rows != "empty" && primary.Rows != "alloff" {
		return fmt.Errorf("invalid searchable fixture rows %q", primary.Rows)
	}
	if !full {
		return render(w, primary)
	}
	if _, err := io.WriteString(w, `<!doctype html><html><head><meta charset="utf-8"><title>Searchable menu confirmation contracts</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/ely-api.css"><link rel="stylesheet" href="/assets/ely-api-interaction.css"><script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-interaction-entry.js"></script><style>body{margin:20px}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;align-items:start}[data-fixture-slot]{min-height:100px}#outside-blank{height:100px;margin-top:30px}#swap-status{min-height:10px}</style></head><body><button id="before" type="button">Before menus</button><button id="swap-source" type="button">Swap request source</button><form id="host-form"><input type="hidden" name="scope" value="caller-value"><main>`); err != nil {
		return err
	}
	for _, spec := range Specs() {
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
