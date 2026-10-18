// Command menu-pointer-selection renders only standalone production components.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/pointerfixture"
)

func main() {
	full := flag.Bool("full", false, "render a full production document")
	id := flag.String("id", "primary", "fragment component owner ID")
	alias := flag.String("alias", "Menu", "exact public menus alias")
	mode := flag.String("mode", "qualified", "standalone naming mode: qualified or chapter")
	flag.Parse()
	render, err := renderer(*mode)
	if err != nil {
		panic(err)
	}
	if err := pointerfixture.Write(os.Stdout, render, *full, pointerfixture.Spec{ID: *id, Component: *alias}); err != nil {
		panic(err)
	}
}

func renderer(mode string) (pointerfixture.Renderer, error) {
	if mode != "qualified" && mode != "chapter" {
		return nil, fmt.Errorf("invalid standalone mode %q", mode)
	}
	tpl, err := ui.NewTemplates()
	if err != nil {
		return nil, err
	}
	return func(w io.Writer, spec pointerfixture.Spec) error {
		component := ui.Component{Name: "menus/" + spec.Component, ID: spec.ID, Props: pointerfixture.GoProps(spec)}
		if mode == "chapter" {
			component.Chapter, component.Name = "menus", spec.Component
		}
		return ui.RenderComponent(tpl, w, component)
	}, nil
}
