package gohtmx

import (
	"bytes"
	core "github.com/mrchypark/elysdui/sdui"
	"html/template"
	"strings"
	"testing"
)

func TestRendererTargetMappingCannotLeakIntoSemanticPlan(t *testing.T) {
	tpl := template.Must(template.New("leaf").Parse(`{{.Record.Title}}/{{range .Record.Items}}{{.Label}}{{end}}`))
	r := NewRegistry(tpl)
	d := Definition{Name: "custom", Template: "leaf", Properties: map[string]Property{"record": {Type: Object, Target: "Record", Required: true, Properties: map[string]Property{"title": {Type: String, Target: "Title", Required: true}, "items": {Type: Array, Target: "Items", Items: &Property{Type: Object, Properties: map[string]Property{"label": {Type: String, Target: "Label", Required: true}}}}}}}}
	if err := r.Register(d); err != nil {
		t.Fatal(err)
	}
	screen := Screen{Version: Version, ID: "screen", Root: Node{ID: "leaf", Type: "custom", Props: map[string]any{"record": map[string]any{"title": "<title>", "items": []any{map[string]any{"label": "<label>"}}}}}}
	plan, err := Compile(screen, r)
	if err != nil {
		t.Fatal(err)
	}
	nodes, err := plan.Resolve(ResolveContext{})
	if err != nil {
		t.Fatal(err)
	}
	record := nodes[0].Props["record"].(map[string]any)
	if record["title"] != "<title>" || record["Title"] != nil {
		t.Fatalf("renderer keys leaked: %#v", record)
	}
	if record["items"].([]any)[0].(map[string]any)["label"] != "<label>" {
		t.Fatal("nested property changed")
	}
	var html bytes.Buffer
	if err := plan.Render(&html, RenderContext{}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html.String(), "&lt;title&gt;/&lt;label&gt;") {
		t.Fatal(html.String())
	}
	// Mutating renderer metadata cannot alter a compiled renderer snapshot either.
	r.Definitions()[0].Properties["record"].Properties["title"] = Property{Type: Boolean}
	html.Reset()
	if err := plan.Render(&html, RenderContext{}); err != nil {
		t.Fatal(err)
	}
}

func TestRendererDictionaryTargetCollisionsFailClosed(t *testing.T) {
	tpl := template.Must(template.New("leaf").Parse(`{{.Record.URL}}`))
	r := NewRegistry(tpl)
	if err := r.Register(Definition{Name: "custom", Template: "leaf", Properties: map[string]Property{"record": {Type: Object, Target: "Record", Properties: map[string]Property{"url": {Type: String, Target: "URL", Format: "url"}}, AdditionalProperties: &Property{Type: String}}}}); err != nil {
		t.Fatal(err)
	}
	for _, value := range []map[string]string{{"URL": "javascript:alert(1)"}, {"url": "/safe", "URL": "/other"}} {
		screen := Screen{Version: Version, ID: "screen", Root: Node{ID: "leaf", Type: "custom", Props: map[string]any{"record": value}}}
		if _, err := Compile(screen, r); err == nil {
			t.Fatal("static dictionary alias accepted")
		}
		screen.Root.Props = nil
		screen.Root.Bindings = map[string]string{"record": "/record"}
		plan, err := Compile(screen, r)
		if err != nil {
			t.Fatal(err)
		}
		var output bytes.Buffer
		if err := plan.Render(&output, RenderContext{Data: map[string]any{"record": value}}); err == nil || output.Len() != 0 {
			t.Fatal("bound dictionary alias accepted or partial output written")
		}
	}
}

func TestRendererTargetValidationStaysAtAdapterBoundary(t *testing.T) {
	tpl := template.Must(template.New("leaf").Parse(`text`))
	for _, properties := range []map[string]Property{
		{"first": {Type: String, Target: "Text"}, "second": {Type: String, Target: "Text"}},
		{"safe": {Type: String, Target: "Attrs"}},
		{"record": {Type: Object, Properties: map[string]Property{"safe": {Type: String, Target: "onclick"}}}},
		{"items": {Type: Array, Items: &Property{Type: String, Target: "Name"}}},
	} {
		if err := NewRegistry(tpl).Register(Definition{Name: "custom", Template: "leaf", Properties: properties}); err == nil {
			t.Fatalf("unsafe target mapping accepted: %#v", properties)
		}
	}
	for _, target := range []string{"Attrs", "onclick", "id", "formAction"} {
		if err := NewRegistry(tpl).Register(Definition{Name: "custom", Template: "leaf", Slots: map[string]SlotDefinition{"content": {Target: target}}}); err == nil {
			t.Fatalf("unsafe slot target %q accepted", target)
		}
	}
}

func TestAuthoringParametersUseSafeFormatsOnly(t *testing.T) {
	registry, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, format := range []string{"color", "font-family", "css-token", "markdown-source", "lottie-json", "sandbox-html", "inert-data"} {
		param := core.Property{Type: String, Format: format, Required: true}
		value := any("red")
		switch format {
		case "font-family":
			value = "Inter"
		case "css-token":
			value = "--accent"
		case "markdown-source":
			value = "# heading"
		case "lottie-json":
			value = `{"layers":[]}`
		case "sandbox-html":
			value = "<h1>hello</h1>"
		case "inert-data":
			param.Type = Object
			value = map[string]any{}
		}
		screen := Screen{Version: Version, ID: "screen", Templates: map[string]TemplateDefinition{"card": {Params: map[string]core.Property{"value": param}, Root: Node{ID: "text", Type: "text", Props: map[string]any{"text": "Example"}}}}, Root: Node{ID: "card", Use: "card", Params: map[string]any{"value": value}}}
		_, err := Compile(screen, registry)
		if format == "sandbox-html" || format == "inert-data" {
			if err == nil {
				t.Fatalf("authoring acquired %s capability", format)
			}
		} else if err != nil {
			t.Fatalf("ordinary parameter format %s: %v", format, err)
		}
	}
}

func TestInertFormatCannotEscapeReviewedRootThroughNesting(t *testing.T) {
	registry, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	inert := Property{Type: Object, Format: "inert-data", Properties: map[string]Property{"template": {Type: String, Format: "text"}}}
	for _, target := range []string{"Other", "Devtools"} {
		nested := Property{Type: Object, Target: target, Properties: map[string]Property{"nested": inert}}
		if err := registry.Register(Definition{Name: "nested-inert-" + target, Chapter: "devtools", Component: "JsonViewer", Properties: map[string]Property{"data": nested}}); err == nil {
			t.Fatalf("nested inert-data acquired capability below unformatted %s root", target)
		}
	}
	inert.Target = "Devtools"
	if err := registry.Register(Definition{Name: "valid-inert", Chapter: "devtools", Component: "JsonViewer", Properties: map[string]Property{"data": inert}}); err != nil {
		t.Fatal(err)
	}
}

func TestImplicitNameTargetRetainsFieldNameValidation(t *testing.T) {
	tpl := template.Must(template.New("leaf").Parse(`{{.Name}}`))
	for _, property := range []Property{{Type: String}, {Type: Object, Properties: map[string]Property{"Name": {Type: String}}}} {
		registry := NewRegistry(tpl)
		key := "Name"
		value := any("_csrf")
		if property.Type == Object {
			key = "record"
			value = map[string]any{"Name": "_csrf"}
		}
		if err := registry.Register(Definition{Name: "custom", Template: "leaf", Properties: map[string]Property{key: property}}); err != nil {
			t.Fatal(err)
		}
		if _, err := Compile(Screen{Version: Version, ID: "screen", Root: Node{ID: "leaf", Type: "custom", Props: map[string]any{key: value}}}, registry); err == nil {
			t.Fatal("implicit Name destination accepted reserved field name")
		}
	}
	// The field-name restriction belongs to string contracts, not unrelated
	// array/object contracts or union alternatives that have no Name destination.
	for _, property := range []Property{
		{Type: Array, Target: "Name", Items: &Property{Type: String}},
		{Target: "Name", OneOf: []Property{{Type: String, Enum: []string{"first"}}, {Type: String, Enum: []string{"second"}}}},
	} {
		if err := NewRegistry(tpl).Register(Definition{Name: "custom", Template: "leaf", Properties: map[string]Property{"value": property}}); err != nil {
			t.Fatal(err)
		}
	}
}
