// A caller-owned chart fixture and standalone integration example.
package main

import (
	"bytes"
	"flag"
	"fmt"
	ui "github.com/mrchypark/ely-htmx"
	"log"
	"net/http"
)

func handler() (http.Handler, error) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	if err = ui.BindAssets(mux); err != nil {
		return nil, err
	}
	sduiHandler, err := chartSDUI()
	if err != nil {
		return nil, err
	}
	mux.Handle("/sdui", sduiHandler)
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		var out bytes.Buffer
		out.WriteString(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project charts caller example</title><link rel="stylesheet" href="/assets/app.css">`)
		if err := tpl.ExecuteTemplate(&out, "ui-component-assets", nil); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if err := tpl.ExecuteTemplate(&out, "ui-advanced-family-assets", "communication"); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		out.WriteString(`<main style="max-width:900px;margin:auto"><h1>Caller-owned project charts</h1>`)
		for _, id := range []string{"schedule-a", "schedule-b"} {
			props := map[string]any{"Title": "Caller <schedule>", "Today": "2026-10-15", "Items": []map[string]any{{"Value": "alpha", "Label": "First <task>", "Start": "2026-10-12", "End": "2026-10-14", "Progress": 50.0}, {"Value": "beta", "Label": "Second task", "Start": "2026-10-15", "End": "2026-10-17", "Progress": 25.0, "After": []int{0}}, {"Value": "gamma", "Label": "One day", "Start": "2026-10-18", "End": "2026-10-18", "Progress": 0.0, "After": []int{1, 99}}}}
			if err := ui.RenderComponent(tpl, &out, ui.Component{Chapter: "project", Name: "GanttChart", ID: id, Props: props}); err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
		}
		for _, id := range []string{"burn-a", "burn-b"} {
			if err := ui.RenderComponent(tpl, &out, ui.Component{Chapter: "project", Name: "Burndown Chart", ID: id, Props: map[string]any{"Title": "Caller sprint", "Start": "2026-10-12", "End": "2026-10-18", "Today": "2026-10-15", "Scope": 40.0, "Remaining": []float64{40, 45, 30, 20}}}); err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
		}
		out.WriteString(`</main></html>`)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, out.String())
	})
	return mux, nil
}
func main() {
	addr := flag.String("addr", "127.0.0.1:8098", "listen address")
	flag.Parse()
	h, err := handler()
	if err != nil {
		log.Fatal(err)
	}
	log.Fatal(http.ListenAndServe(*addr, h))
}
