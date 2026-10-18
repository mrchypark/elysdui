package sduicatalogue

import (
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"html/template"
	"testing"
)

func TestMenuPresenceHelperPreservesArrayInference(t *testing.T) {
	tpl, err := template.New("test").Funcs(ui.Funcs()).Parse(`{{define "menu"}}{{range .Items}}{{$submenu := menuHasItems .Items}}{{if not $submenu}}{{.Action}}{{else}}{{range .Items}}{{.Label}}{{end}}{{end}}{{end}}{{end}}`)
	if err != nil {
		t.Fatal(err)
	}
	a := analyze(tpl, "menu", map[string]any{})
	props, _, err := schemaFor(Property{Type: "object", Properties: map[string]Property{}}, a, false)
	if err != nil {
		t.Fatal(err)
	}
	children := props["items"].Items.Properties["items"]
	if children.Type != "array" || len(children.OneOf) != 0 || children.Items == nil || children.Items.Type != "object" {
		t.Fatalf("presence must retain typed child arrays without union widening: %+v", children)
	}
	if got := children.Items.Properties["label"].Type; got != "string" {
		t.Fatalf("child label inferred %q", got)
	}
}
