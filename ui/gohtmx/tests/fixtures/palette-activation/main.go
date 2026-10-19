// Command palette-activation dumps standalone production CommandPalette fixtures.
// It has no SDUI dependency and never starts a server or browser.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/paletteactivation"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/palettefixture"
)

func main() {
	surface := flag.String("surface", "go-qualified", "go-qualified or go-chapter")
	route := flag.String("dump", "/", "render /, /fragment, or /manifest.json to stdout")
	flag.Parse()
	if flag.NArg() != 0 {
		panic("unexpected fixture arguments")
	}
	if err := dump(os.Stdout, *surface, *route); err != nil {
		panic(err)
	}
}

func renderer(surface, variant string) (palettefixture.Renderer, func(io.Writer) error, error) {
	if surface != "go-qualified" && surface != "go-chapter" {
		return nil, nil, fmt.Errorf("invalid standalone surface %q", surface)
	}
	tpl, err := ui.NewTemplates()
	if err != nil {
		return nil, nil, err
	}
	render := func(w io.Writer, spec palettefixture.Spec) error {
		component := ui.Component{Name: palettefixture.Component, ID: spec.ComponentID, Props: paletteactivation.Props(spec, variant)}
		if surface == "go-chapter" {
			component.Chapter, component.Name = "navigation", "CommandPalette"
		}
		return ui.RenderComponent(tpl, w, component)
	}
	assets := func(w io.Writer) error {
		if _, err := io.WriteString(w, `<link rel="stylesheet" href="/assets/app.css">`); err != nil {
			return err
		}
		if err := tpl.ExecuteTemplate(w, "ui-component-assets", nil); err != nil {
			return err
		}
		// Only the actual palette family is needed. Optional Lottie is unrelated.
		_, err := io.WriteString(w, `<link rel="stylesheet" href="/assets/ely-api.css"><link rel="stylesheet" href="/assets/ely-api-interaction.css"><script type="module" src="/assets/ely-api-interaction-entry.js"></script>`)
		return err
	}
	return render, assets, nil
}

func dump(w io.Writer, surface, route string) error {
	render, assets, err := renderer(surface, paletteactivation.Variant(route))
	if err != nil {
		return err
	}
	switch route {
	case "/", "/empty-initial", "/empty-disabled":
		return paletteactivation.Page(w, surface, render, assets)
	case "/manifest.json":
		return paletteactivation.Manifest(w, surface, map[string]any{"routes": []string{"/", "/empty-initial", "/empty-disabled", "/manifest.json"}})
	default:
		return fmt.Errorf("unknown standalone fixture route %q", route)
	}
}
