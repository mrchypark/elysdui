// Render real production components; no gallery defaults or copied markup.
package main

import (
	"fmt"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"os"
)

func main() {
	t, err := ui.NewTemplates()
	if err != nil {
		panic(err)
	}
	fragment := len(os.Args) > 1
	if !fragment {
		fmt.Fprint(os.Stdout, `<!doctype html><html><head><link rel="stylesheet" href="/assets/ely-api-data.css"><script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-data-entry.js"></script></head><body><button id="replace" hx-get="/fragment" hx-target="#virtual-a" hx-swap="outerHTML">Replace</button>`)
	}
	ids := []string{"virtual-a"}
	if !fragment {
		ids = append(ids, "virtual-b", "virtual-disabled", "virtual-empty", "virtual-error", "virtual-nested")
	}
	for _, id := range ids {
		if id == "virtual-nested" {
			fmt.Fprint(os.Stdout, `<section id="nested-parent" data-ely-family="data" data-ely-component="nested-host">`)
		}
		rows := []map[string]any{}
		if id != "virtual-empty" {
			for i := 0; i < 1000; i++ {
				rows = append(rows, map[string]any{"Key": fmt.Sprintf("key-%d", i), "Cells": []string{fmt.Sprintf("Event %d", i), "<unsafe> long cell text which must not change the row height and should remain escaped"}})
			}
		}
		if len(rows) > 400 {
			rows[400]["Cells"] = []string{}
		}
		props := map[string]any{"TableSource": true, "VirtualTotal": 100000, "Label": "Caller events", "Empty": "No caller events.", "Rows": rows, "Columns": []map[string]any{{"Label": "Event"}, {"Label": "Detail"}}, "Disabled": id == "virtual-disabled"}
		if id == "virtual-error" {
			props["Error"] = "Could not load caller rows."
		}
		if err := ui.RenderComponent(t, os.Stdout, ui.Component{Chapter: "tables", Name: "VirtualTable", ID: id, Props: props}); err != nil {
			panic(err)
		}
		if id == "virtual-nested" {
			fmt.Fprint(os.Stdout, `</section>`)
		}
	}
	if !fragment {
		fmt.Fprint(os.Stdout, `</body></html>`)
	}
}
