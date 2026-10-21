package ui

import (
	"bytes"
	"html/template"
	"net/http"
	"strings"
	"testing"
	"testing/fstest"
)

func TestAPIHardeningBindAssetsRejectsNilArguments(t *testing.T) {
	cases := []struct {
		name    string
		call    func() error
		wantMsg string
	}{
		{name: "BindAssets nil mux", call: func() error { return BindAssets(nil) }, wantMsg: "mux"},
		{name: "BindAssetsWithOptions nil mux", call: func() error { return BindAssetsWithOptions(nil, nil) }, wantMsg: "mux"},
		{name: "BindAssetFS nil mux", call: func() error { return BindAssetFS(nil, fstest.MapFS{}, nil) }, wantMsg: "mux"},
		{name: "BindAssetFS nil filesystem", call: func() error { return BindAssetFS(http.NewServeMux(), nil, nil) }, wantMsg: "filesystem"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("panicked: %v", r)
				}
			}()
			err := tc.call()
			if err == nil {
				t.Fatal("nil argument accepted")
			}
			if !strings.Contains(err.Error(), tc.wantMsg) {
				t.Fatalf("error %q does not mention %q", err, tc.wantMsg)
			}
		})
	}
}

func TestAPIHardeningRenderComponentRejectsNilArguments(t *testing.T) {
	component := Component{Chapter: "forms", Name: "KeyValueInput", ID: "nilcheck"}
	tpl := renderableTemplate(t, component)

	cases := []struct {
		name    string
		call    func() error
		wantMsg string
	}{
		{name: "nil template", call: func() error { return RenderComponent(nil, &bytes.Buffer{}, component) }, wantMsg: "template"},
		{name: "nil writer", call: func() error { return RenderComponent(tpl, nil, component) }, wantMsg: "writer"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("panicked: %v", r)
				}
			}()
			err := tc.call()
			if err == nil {
				t.Fatal("nil argument accepted")
			}
			if !strings.Contains(err.Error(), tc.wantMsg) {
				t.Fatalf("error %q does not mention %q", err, tc.wantMsg)
			}
		})
	}
}

func TestAPIHardeningRenderComponentLimitedRejectsNilArguments(t *testing.T) {
	component := Component{Chapter: "forms", Name: "KeyValueInput", ID: "nilcheck"}
	tpl := renderableTemplate(t, component)

	cases := []struct {
		name    string
		call    func() error
		wantMsg string
	}{
		{name: "nil template", call: func() error { return RenderComponentLimited(nil, &bytes.Buffer{}, component, 1024) }, wantMsg: "template"},
		{name: "nil writer", call: func() error { return RenderComponentLimited(tpl, nil, component, 1024) }, wantMsg: "writer"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("panicked: %v", r)
				}
			}()
			err := tc.call()
			if err == nil {
				t.Fatal("nil argument accepted")
			}
			if !strings.Contains(err.Error(), tc.wantMsg) {
				t.Fatalf("error %q does not mention %q", err, tc.wantMsg)
			}
		})
	}
}

// renderableTemplate returns a template set that can render component, so a
// nil argument is the only reason the render can fail.
func renderableTemplate(t *testing.T, component Component) *template.Template {
	t.Helper()
	definition, err := ResolveComponent(component.Chapter, component.Name)
	if err != nil {
		t.Fatal(err)
	}
	return template.Must(template.New(definition.Template).Parse(`body{{define "ely-api-wrapper"}}wrapper{{.Body}}{{end}}`))
}

func TestAPIHardeningResolveComponentDoesNotLeakAliases(t *testing.T) {
	definitions, err := ComponentDefinitions()
	if err != nil {
		t.Skipf("catalogue unavailable: %v", err)
	}
	var target ComponentDefinition
	found := false
	for _, definition := range definitions {
		if len(definition.Aliases) == 0 {
			continue
		}
		if _, err := ResolveComponent(definition.Chapter, definition.Name); err != nil {
			continue
		}
		target = definition
		found = true
		break
	}
	if !found {
		t.Skip("no component with aliases in the catalogue")
	}

	first, err := ResolveComponent(target.Chapter, target.Name)
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Aliases) == 0 {
		t.Fatal("resolved component lost its aliases")
	}
	original := first.Aliases[0]
	first.Aliases[0] = "mutated-by-caller"

	second, err := ResolveComponent(target.Chapter, target.Name)
	if err != nil {
		t.Fatal(err)
	}
	if second.Aliases[0] != original {
		t.Fatalf("cached alias was mutated: got %q, want %q", second.Aliases[0], original)
	}

	// The unique-name lookup path must clone as well.
	unique, err := ResolveComponent("", target.Name)
	if err != nil {
		t.Skipf("component %q is not uniquely named: %v", target.Name, err)
	}
	if len(unique.Aliases) == 0 {
		t.Fatal("uniquely resolved component lost its aliases")
	}
	uniqueOriginal := unique.Aliases[0]
	unique.Aliases[0] = "mutated-by-caller"
	again, err := ResolveComponent("", target.Name)
	if err != nil {
		t.Fatal(err)
	}
	if again.Aliases[0] != uniqueOriginal {
		t.Fatalf("cached alias was mutated through the unique-name lookup: got %q, want %q", again.Aliases[0], uniqueOriginal)
	}
}
