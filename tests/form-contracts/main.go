// Command form-contracts renders the browser regression fixture using production templates.
package main

import (
	ui "github.com/mrchypark/ely-htmx"
	"html/template"
	"os"
)

func main() {
	t, err := ui.NewTemplates()
	if err != nil {
		panic(err)
	}
	t = template.Must(t.Parse(`{{define "fixture"}}<!doctype html><html><head><script src="/assets/htmx.min.js"></script><script src="/assets/ely-controls.js" defer></script></head><body>
<form id="form" hx-post="/submit" hx-target="#result">
{{template "input" (dict "ID" "required" "Name" "required" "Required" true)}}
{{template "input" (dict "ID" "readonly" "Name" "readonly" "Value" "fixed" "Readonly" true)}}
{{template "input" (dict "ID" "disabled" "Name" "disabled" "Value" "omit" "Disabled" true)}}
{{template "select" (dict "ID" "select" "Name" "choice" "Value" "b" "Options" .Options)}}
{{template "select" (dict "ID" "multiple" "Name" "multi" "Multiple" true "Options" .Options)}}
{{template "checkbox" (dict "ID" "checkbox" "Name" "check" "Value" "yes" "Checked" true "Readonly" true)}}
{{template "switch" (dict "ID" "switch" "Name" "switch" "Value" "on" "Readonly" true)}}
{{template "checkbox" (dict "ID" "enabled-checkbox")}}
{{template "switch" (dict "ID" "enabled-switch")}}
{{template "checkbox" (dict "ID" "mixed" "Name" "mixed" "Indeterminate" true)}}
{{template "button" (dict "ID" "submit" "Label" "Submit" "Type" "submit" "Name" "intent" "Value" "save")}}
{{template "button" (dict "ID" "reset" "Label" "Reset" "Type" "reset")}}
{{template "button" (dict "ID" "blocked" "Label" "Unavailable" "Type" "submit" "AriaDisabled" true)}}
</form>
{{template "button" (dict "ID" "link" "Label" "Link" "Href" "/destination" "Disabled" true)}}
{{template "button" (dict "ID" "aria-link" "Label" "Unavailable link" "Href" "/destination" "AriaDisabled" true "Attrs" (dict "hx-post" "/submit" "hx-target" "#result"))}}
{{template "button" (dict "ID" "replace" "Label" "Replace" "Attrs" (dict "hx-get" "/fragment" "hx-target" "#fragment" "hx-swap" "outerHTML"))}}
<div id="fragment"></div><div id="result"></div>
</body></html>{{end}}
{{define "fragment"}}<div id="fragment">{{template "checkbox" (dict "ID" "swapped" "Indeterminate" true)}}</div>{{end}}`))
	name := "fixture"
	if len(os.Args) > 1 {
		name = os.Args[1]
	}
	if err := t.ExecuteTemplate(os.Stdout, name, map[string]any{"Options": []ui.Option{{Value: "a", Label: "Alpha", Selected: true}, {Value: "b", Label: "Beta", Selected: true}, {Value: "c", Label: "Unavailable", Disabled: true}}}); err != nil {
		panic(err)
	}
}
