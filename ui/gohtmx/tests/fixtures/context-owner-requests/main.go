// Command context-owner-requests renders only the standalone Go UI path.
package main

import (
	"flag"
	"io"
	"os"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/contextfixture"
)

func main() {
	full := flag.Bool("full", false, "render a full production document")
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
	err = contextfixture.Write(os.Stdout, render, *full, contextfixture.Spec{ID: *id, Component: "ContextMenu", Mode: *mode, Number: *number, X: *x, Y: *y, Disabled: *disabled})
	if err != nil {
		panic(err)
	}
}

func renderer() (contextfixture.Renderer, error) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		return nil, err
	}
	return func(w io.Writer, s contextfixture.Spec) error {
		return ui.RenderComponent(tpl, w, ui.Component{Chapter: "menus", Name: s.Component, ID: s.ID, Props: contextfixture.GoProps(s)})
	}, nil
}
