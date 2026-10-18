// Command table-contracts renders the shared table contracts without gallery code.
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
		fmt.Fprint(os.Stdout, `<!doctype html><html><head><script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-data-entry.js"></script></head><body><button id="replace" hx-get="/fragment" hx-target="#table-a" hx-swap="outerHTML">Replace</button>`)
	}
	ids := []string{"table-a"}
	if !fragment {
		ids = append(ids, "table-b", "table-disabled", "table-empty")
	}
	for _, id := range ids {
		rows := []map[string]any{}
		if id != "table-empty" {
			for _, i := range []int{10, 2, 9, 1, 8, 3, 7, 4, 6, 5} {
				status := "Live"
				if i%2 == 1 {
					status = "Draft"
				}
				rows = append(rows, map[string]any{"Cells": []string{fmt.Sprint(i), status}})
			}
		}
		props := map[string]any{"Paged": true, "PageSize": 8, "FilterColumn": 2, "Columns": []map[string]any{{"Label": "Name"}, {"Label": "Status"}}, "Rows": rows, "FilterOptions": []map[string]any{{"Value": "Live", "Label": "Live"}, {"Value": "Draft", "Label": "Draft"}}, "Disabled": id == "table-disabled"}
		if err := ui.RenderComponent(t, os.Stdout, ui.Component{Chapter: "tables", Name: "DataTable", ID: id, Props: props}); err != nil {
			panic(err)
		}
	}
	if !fragment {
		fmt.Fprint(os.Stdout, `</body></html>`)
	}
}
