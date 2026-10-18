// Command copy-contracts renders only production component markup.
package main

import (
	ui "github.com/mrchypark/ely-htmx"
	"os"
)

func main() {
	t, err := ui.NewTemplates()
	if err != nil {
		panic(err)
	}
	fragment := len(os.Args) > 1 && os.Args[1] == "fragment"
	if !fragment {
		os.Stdout.WriteString(`<!doctype html><html><head><script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-interaction-entry.js"></script></head><body><button id="replace" hx-get="/fragment" hx-target="#copy-a" hx-swap="outerHTML">Replace</button>`)
	}
	ids := []string{"copy-a"}
	if !fragment {
		ids = append(ids, "copy-b", "copy-disabled")
	}
	for _, id := range ids {
		err = ui.RenderComponent(t, os.Stdout, ui.Component{Chapter: "buttons", Name: "CopyButton", ID: id, Props: map[string]any{"Label": "Copy text", "Value": "literal <text> & secret", "Disabled": id == "copy-disabled"}})
		if err != nil {
			panic(err)
		}
	}
	if !fragment {
		os.Stdout.WriteString(`</body></html>`)
	}
}
