// Command menu-pointer-selection exercises the real CatalogueRegistry pipeline.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"io"
	"os"

	gohtmx "github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/pointerfixture"
)

// Literal wire keys are authored independently of the standalone Go fixture.
// In particular, allocated empty items and explicit false radio values must
// survive Decode and Compile without a Go-property case-conversion helper.
const wireRows = `[
 {"heading":"Commands <safe>"},
 {"label":"First <safe>","value":"first","action":"first-action","radio":false,"icon":"circle"},
 {"label":"Plain","value":"plain","action":"plain-action","radio":false,"icon":"circle"},
 {"label":"Checkbox","value":"check","checkbox":true,"action":"check-action","icon":"circle"},
 {"label":"Comfortable","value":"radio-a","radio":true,"group":"density","selected":true,"action":"density","icon":"circle"},
 {"label":"Compact","value":"radio-b","radio":true,"group":"density","action":"density","icon":"circle"},
 {"label":"Branch","value":"branch","icon":"circle","items":[
  {"label":"Child first","value":"child-first","action":"child-action","radio":false,"icon":"circle"},
  {"label":"Child plain","value":"child-plain","action":"child-plain-action","radio":false,"icon":"circle"},
  {"label":"Child comfortable","value":"child-radio-a","radio":true,"group":"density","selected":true,"action":"density","icon":"circle"},
  {"label":"Child compact","value":"child-radio-b","radio":true,"group":"density","action":"density","icon":"circle"}
 ]},
 {"label":"Unavailable","value":"off","disabled":true,"action":"blocked","radio":false,"icon":"circle"},
 {"label":"Unavailable branch","value":"off-branch","icon":"circle","disabled":true,"items":[
  {"label":"Unavailable child","value":"off-child","action":"blocked","radio":false,"icon":"circle"}
 ]},
 {"label":"Empty child","value":"empty-child","icon":"circle","items":[]},
 {"label":"All unavailable child","value":"alloff-child","icon":"circle","items":[
  {"label":"Unavailable descendant","value":"alloff-child-off","disabled":true,"action":"blocked","radio":false,"icon":"circle"}
 ]},
 {"label":"Last","value":"last","action":"last-action","radio":false,"icon":"circle"}
]`

func wireProps(spec pointerfixture.Spec) map[string]any {
	rows := json.RawMessage(wireRows)
	if spec.Rows == "empty" {
		rows = json.RawMessage(`[]`)
	}
	if spec.Rows == "alloff" {
		rows = json.RawMessage(`[{"label":"Unavailable","value":"off","disabled":true,"action":"blocked","radio":false,"icon":"circle"}]`)
	}
	props := map[string]any{"label": "Pointer commands <safe>", "items": rows}
	if spec.Component == "ContextMenu" {
		props["content"] = "Pointer surface <safe>"
		props["actionLabel"] = "Fallback menu"
		if spec.ContextMode != "" {
			props["contextMode"] = spec.ContextMode
		}
	}
	if spec.Disabled {
		props["disabled"] = true
	}
	return props
}

func main() {
	full := flag.Bool("full", false, "render a full production document")
	id := flag.String("id", "primary", "fragment component owner ID")
	alias := flag.String("alias", "Menu", "exact public menus alias")
	flag.Parse()
	render, err := renderer()
	if err != nil {
		panic(err)
	}
	if err := pointerfixture.Write(os.Stdout, render, *full, pointerfixture.Spec{ID: *id, Component: *alias}); err != nil {
		panic(err)
	}
}

func renderer() (pointerfixture.Renderer, error) {
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		return nil, err
	}
	return func(w io.Writer, spec pointerfixture.Spec) error {
		raw, err := json.Marshal(map[string]any{"version": "1", "id": spec.ID + "-screen", "root": map[string]any{"id": spec.ID, "type": "menus/" + spec.Component, "props": wireProps(spec)}})
		if err != nil {
			return err
		}
		screen, err := gohtmx.Decode(bytes.NewReader(raw))
		if err != nil {
			return err
		}
		plan, err := gohtmx.Compile(screen, registry)
		if err != nil {
			return err
		}
		return plan.Render(w, gohtmx.RenderContext{})
	}, nil
}
