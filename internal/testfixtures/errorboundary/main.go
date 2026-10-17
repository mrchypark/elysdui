// Command errorboundary prints real renderer fixtures for the browser regression.
package main

import (
	"bytes"
	"encoding/json"
	ui "github.com/mrchypark/ely-htmx"
	"os"
)

func main() {
	tpl, err := ui.NewTemplates()
	if err != nil {
		panic(err)
	}
	cases := map[string]map[string]any{
		"demo":     {"Error": "initial demo", "Detail": "initial chain", "DemoError": "changed demo", "DemoDetail": "changed chain", "Action": "retry-demo"},
		"first":    {"Error": "service <failed>", "Action": "retry-owned"},
		"second":   {"Error": "second failure", "Action": "retry-second"},
		"healthy":  {"Content": "Recovered caller content", "Action": "retry-owned"},
		"readonly": {"Error": "read only failure"},
		"disabled": {"Error": "disabled failure", "Action": "retry-disabled", "Disabled": true},
	}
	out := map[string]string{}
	for name, props := range cases {
		var b bytes.Buffer
		id := name
		if name == "healthy" {
			id = "first"
		}
		if err := ui.RenderComponent(tpl, &b, ui.Component{Chapter: "feedback", Name: "ErrorBoundary", ID: id, Props: props}); err != nil {
			panic(err)
		}
		out[name] = b.String()
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		panic(err)
	}
}
