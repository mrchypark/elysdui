// Command context-owner-requests exercises the real CatalogueRegistry renderer.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"io"
	"os"

	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/contextfixture"
)

// These are literal wire keys, intentionally independent of GoProps remapping.
const wireRows = `[{"heading":"Commands <safe>"},{"label":"Unavailable","value":"off","disabled":true},{"label":"Open <safe>","value":"open","action":"open-file"},{"label":"Sidebar","value":"check","checkbox":true,"action":"toggle-sidebar"},{"label":"Comfortable","value":"radio-a","radio":true,"group":"density","selected":true,"action":"density"},{"label":"Compact","value":"radio-b","radio":true,"group":"density","action":"density"},{"label":"Branch","value":"branch","items":[{"label":"Disabled child","value":"child-off","disabled":true},{"label":"Child","value":"child","action":"child-action"},{"label":"Empty","value":"empty-child","items":[]}]},{"label":"Last","value":"last","action":"last-action"}]`

func wireProps(s contextfixture.Spec) map[string]any {
	rows := json.RawMessage(wireRows)
	if s.Rows == "empty" {
		rows = json.RawMessage(`[]`)
	}
	if s.Rows == "alloff" {
		rows = json.RawMessage(`[{"label":"Unavailable","value":"off","disabled":true}]`)
	}
	p := map[string]any{"label": "Canvas commands <safe>", "items": rows}
	if s.Component != "Menu" {
		p["content"] = "Owner canvas <safe>"
		p["actionLabel"] = "Fallback menu"
		p["contextMode"] = s.Mode
		if s.Number != "" {
			p["contextRequest"] = map[string]any{"number": s.Number, "x": s.X, "y": s.Y}
		}
	}
	if s.Disabled {
		p["disabled"] = true
	}
	return p
}
func main() {
	full := flag.Bool("full", false, "render full production document")
	id := flag.String("id", "manual", "component owner ID")
	mode := flag.String("mode", "manual", "automatic or manual")
	number := flag.String("number", "", "optional canonical request number")
	x := flag.Float64("x", 120.5, "viewport x")
	y := flag.Float64("y", 80.25, "viewport y")
	disabled := flag.Bool("disabled", false, "disable component")
	flag.Parse()
	render, err := renderer()
	if err != nil {
		panic(err)
	}
	if err := contextfixture.Write(os.Stdout, render, *full, contextfixture.Spec{ID: *id, Component: "ContextMenu", Mode: *mode, Number: *number, X: *x, Y: *y, Disabled: *disabled}); err != nil {
		panic(err)
	}
}

func renderer() (contextfixture.Renderer, error) {
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		return nil, err
	}
	return func(w io.Writer, s contextfixture.Spec) error {
		raw, err := json.Marshal(map[string]any{"version": "1", "id": s.ID + "-screen", "root": map[string]any{"id": s.ID, "type": "menus/" + s.Component, "props": wireProps(s)}})
		if err != nil {
			return err
		}
		screen, err := sdui.Decode(bytes.NewReader(raw))
		if err != nil {
			return err
		}
		plan, err := sdui.Compile(screen, registry)
		if err != nil {
			return err
		}
		return plan.Render(w, sdui.RenderContext{})
	}, nil
}
