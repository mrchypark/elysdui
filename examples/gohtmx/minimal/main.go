// A read-only consumer example. Run with go run ./examples/minimal.
package main

import (
	"bytes"
	"log"
	"net/http"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

const page = `{{define "page"}}<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>elysdui greeting</title><link rel="stylesheet" href="/assets/app.css">
{{template "ui-component-assets"}}<script src="/assets/htmx.min.js" defer></script>
</head><body><main><h1>elysdui greeting</h1>
<form action="/" method="get" hx-get="/" hx-target="#greeting" hx-swap="outerHTML">
<label for="name">Name</label>{{template "input" (dict "ID" "name" "Name" "name" "Value" .)}}
{{template "button" (dict "Type" "submit" "Label" "Greet")}}</form>
{{template "greeting" .}}</main></body></html>{{end}}
{{define "greeting"}}<section id="greeting" aria-live="polite">Hello, {{.}}!</section>{{end}}`

func newHandler() (http.Handler, error) {
	templates, err := ui.NewTemplates()
	if err != nil {
		return nil, err
	}
	if _, err = templates.Parse(page); err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	if err = ui.BindAssets(mux); err != nil {
		return nil, err
	}
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		if name == "" {
			name = "world"
		}
		templateName := "page"
		if r.Header.Get("HX-Request") == "true" {
			templateName = "greeting"
		}
		var output bytes.Buffer
		if err := templates.ExecuteTemplate(&output, templateName, name); err != nil {
			http.Error(w, "render failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Vary", "HX-Request")
		_, _ = w.Write(output.Bytes())
	})
	return mux, nil
}

func main() {
	handler, err := newHandler()
	if err != nil {
		log.Fatal(err)
	}
	log.Print("Open http://127.0.0.1:8095")
	log.Fatal(http.ListenAndServe("127.0.0.1:8095", handler))
}
