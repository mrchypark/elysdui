// Command searchable-menu-confirmation exercises the real CatalogueRegistry
// pipeline using independently authored lower-camel wire properties.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"io"
	"os"

	gohtmx "github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/searchablefixture"
)

// Do not derive this JSON from the standalone Go props: the real wire spelling,
// root query, row payloads and allocated empty array are separate test inputs.
const wireRows = `[
 {"heading":"Commands <safe>"},
 {"label":"Unrelated","value":"hidden","action":"hidden-action"},
 {"label":"Alpha blocked","value":"off","action":"blocked-action","disabled":true},
 {"label":"Alpha one","value":"alpha-one","action":"choose-one"},
 {"label":"Alpha two","value":"alpha-two","action":"choose-two"}
]`

func wireScreen(spec searchablefixture.Spec) ([]byte, error) {
	rows := json.RawMessage(wireRows)
	if spec.Rows == "empty" {
		rows = json.RawMessage(`[]`)
	}
	if spec.Rows == "alloff" {
		rows = json.RawMessage(`[{"label":"Alpha blocked","value":"off","action":"blocked-action","disabled":true}]`)
	}
	return json.Marshal(map[string]any{
		"version": "1", "id": spec.ID + "-screen",
		"root": map[string]any{
			"id": spec.ID, "type": "menus/SearchableMenu",
			"props": map[string]any{
				"label": "Search commands <safe>", "placeholder": "Find commands <safe>",
				"value": "root-query", "icon": "search", "items": rows,
			},
		},
	})
}

func main() {
	full := flag.Bool("full", false, "render a full production document")
	id := flag.String("id", "primary", "fragment component owner ID")
	flag.Parse()
	render, err := renderer()
	if err != nil {
		panic(err)
	}
	if err := searchablefixture.Write(os.Stdout, render, *full, searchablefixture.Spec{ID: *id}); err != nil {
		panic(err)
	}
}

func renderer() (searchablefixture.Renderer, error) {
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		return nil, err
	}
	return func(w io.Writer, spec searchablefixture.Spec) error {
		raw, err := wireScreen(spec)
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
