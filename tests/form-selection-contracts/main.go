// Production-rendered form selection regression fixture; no gallery defaults.
package main

import (
	"bytes"
	"fmt"
	ui "github.com/mrchypark/ely-htmx"
	"os"
	"strings"
)

func main() {
	t, err := ui.NewTemplates()
	if err != nil {
		panic(err)
	}
	if len(os.Args) > 1 && os.Args[1] == "children" {
		var out bytes.Buffer
		err := t.ExecuteTemplate(&out, "combobox", map[string]any{"ID": "Combobox-enabled-control", "Name": "Combobox-enabled", "Value": "a", "Options": []ui.Option{{Value: "a", Label: "Alpha", Disabled: true}, {Value: "b", Label: "Beta"}}})
		if err != nil {
			panic(err)
		}
		markup := strings.TrimSpace(out.String())
		fmt.Print(markup[strings.Index(markup, ">")+1 : strings.LastIndex(markup, "</div>")])
		return
	}
	fragment := len(os.Args) > 1 && os.Args[1] == "fragment"
	if !fragment {
		fmt.Print(`<!doctype html><html><head><script src="/assets/htmx.min.js"></script><script src="/assets/ely-controls.js" defer></script></head><body><form id="form" hx-post="/submit" hx-target="#result">`)
	}
	fmt.Print(`<div id="fragment">`)
	for _, name := range []string{"Combobox", "Autocomplete", "Select", "NativeSelect"} {
		value := "a"
		if fragment {
			value = "c"
		}
		for _, state := range []string{"enabled", "disabled", "readonly"} {
			id := name + "-" + state
			err := ui.RenderComponent(t, os.Stdout, ui.Component{Chapter: "forms", Name: name, ID: id, Props: map[string]any{"Name": id, "Value": value, "Label": "Caller choice", "Readonly": state == "readonly", "Disabled": state == "disabled", "Options": []ui.Option{{Value: "a", Label: "Alpha", Disabled: true}, {Value: "b", Label: "Beta"}, {Value: "c", Label: "Gamma"}}}})
			if err != nil {
				panic(err)
			}
		}
	}
	fmt.Print(`</div>`)
	if !fragment {
		fmt.Print(`<button id="submit" type="submit">Submit</button></form><button id="swap" hx-get="/fragment" hx-target="#fragment" hx-swap="outerHTML">Swap</button><button id="children" hx-get="/children" hx-target="#Combobox-enabled-control" hx-swap="innerHTML">Replace children</button><div id="result"></div></body></html>`)
	}
}
