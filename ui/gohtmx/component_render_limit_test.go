package ui

import (
	"bytes"
	"html/template"
	"strings"
	"testing"
)

func TestRenderComponentLimitedStopsIntermediateExpansion(t *testing.T) {
	definition, err := ResolveComponent("forms", "KeyValueInput")
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	tpl := template.Must(template.New(definition.Template).Funcs(template.FuncMap{"probe": func() string { calls++; return strings.Repeat("x", 4096) }}).Parse(`{{range .Items}}{{probe}}{{end}}{{define "ely-api-wrapper"}}{{.Body}}{{end}}`))
	var output bytes.Buffer
	component := Component{Chapter: "forms", Name: "KeyValueInput", ID: "bounded", Props: map[string]any{"Items": make([]int, 1000)}}
	if err := RenderComponentLimited(tpl, &output, component, 8192); err == nil || !strings.Contains(err.Error(), "output limit") {
		t.Fatalf("expected bounded failure: %v", err)
	}
	if calls > 3 {
		t.Fatalf("rendered %d items before enforcing limit", calls)
	}
	if output.Len() != 0 {
		t.Fatal("failed intermediate body reached caller")
	}
	for _, limit := range []int{0, -1} {
		if err := RenderComponentLimited(tpl, &output, component, limit); err == nil {
			t.Fatal("invalid limit accepted")
		}
	}
}

func TestRenderComponentLimitedCapsWrapper(t *testing.T) {
	definition, err := ResolveComponent("forms", "KeyValueInput")
	if err != nil {
		t.Fatal(err)
	}
	tpl := template.Must(template.New(definition.Template).Parse(`small{{define "ely-api-wrapper"}}` + strings.Repeat("x", 100) + `{{.Body}}{{end}}`))
	var output bytes.Buffer
	if err := RenderComponentLimited(tpl, &output, Component{Chapter: "forms", Name: "KeyValueInput", ID: "bounded"}, 50); err == nil {
		t.Fatal("wrapper exceeded bound")
	}
	if output.Len() > 50 {
		t.Fatal("too many bytes written")
	}
}
