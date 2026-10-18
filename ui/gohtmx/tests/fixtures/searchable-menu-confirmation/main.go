// Command searchable-menu-confirmation renders standalone production components.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/searchablefixture"
)

func main() {
	full := flag.Bool("full", false, "render a full production document")
	id := flag.String("id", "primary", "fragment component owner ID")
	mode := flag.String("mode", "qualified", "standalone naming mode: qualified or chapter")
	flag.Parse()
	render, err := renderer(*mode)
	if err != nil {
		panic(err)
	}
	if err := searchablefixture.Write(os.Stdout, render, *full, searchablefixture.Spec{ID: *id}); err != nil {
		panic(err)
	}
}

func renderer(mode string) (searchablefixture.Renderer, error) {
	if mode != "qualified" && mode != "chapter" {
		return nil, fmt.Errorf("invalid standalone mode %q", mode)
	}
	tpl, err := ui.NewTemplates()
	if err != nil {
		return nil, err
	}
	return func(w io.Writer, spec searchablefixture.Spec) error {
		component := ui.Component{Name: "menus/SearchableMenu", ID: spec.ID, Props: searchablefixture.GoProps(spec)}
		if mode == "chapter" {
			component.Chapter, component.Name = "menus", "SearchableMenu"
		}
		return ui.RenderComponent(tpl, w, component)
	}, nil
}
