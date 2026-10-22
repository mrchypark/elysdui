package sduicatalogue

import (
	"fmt"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"html/template"
	"strconv"
	"testing"
)

func TestGeneratedStepperAndStateFixtureValues(t *testing.T) {
	manifest, fixtures, err := Build()
	if err != nil {
		t.Fatal(err)
	}
	if manifest.QualifiedNames != 1313 {
		t.Fatalf("qualified inventory = %d, want 1313", manifest.QualifiedNames)
	}
	steppers, dirty, formError := 0, false, false
	for _, fixture := range fixtures {
		switch fixture.Name {
		case "forms/Stepper":
			steppers++
			value := fmt.Sprint(fixture.Props["value"])
			if _, err := strconv.ParseFloat(value, 64); err != nil {
				t.Errorf("generated Stepper %s has invalid numeric value %q", fixture.Source, value)
			}
		case "forms/DirtyIndicator":
			dirty = dirty || fixture.Props["dirty"] == true
		case "forms/FormError":
			formError = formError || fixture.Props["error"] == "Example: email could not be saved."
		}
	}
	if steppers == 0 || !dirty || !formError {
		t.Fatalf("missing generated target fixtures: Stepper=%d dirty=%t error=%t", steppers, dirty, formError)
	}
}

func TestASTSelectsRendererBranchesAndMapsHelperFields(t *testing.T) {
	tpl, err := template.New("test").Funcs(ui.Funcs()).Parse(`{{define "component"}}{{if eq .Kind "One"}}{{template "helper" (dict "Heading" .Title "Rows" .Rows)}}{{else}}{{.Unrelated}}{{end}}{{if .Optional}}{{.Optional}}{{else}}{{.Fallback}}{{end}}{{end}}{{define "helper"}}<h2>{{or .Heading "Fallback title"}}</h2>{{range $i,$row := .Rows}}{{$row.Label}}{{range $row.Cells}}{{.}}{{end}}{{end}}{{end}}`)
	if err != nil {
		t.Fatal(err)
	}
	a := analyze(tpl, "component", map[string]any{"Kind": "One", "ID": "host-id"})
	for _, path := range []string{"Title", "Rows", "Rows.*.Label", "Rows.*.Cells", "Rows.*.Cells.*", "Optional", "Fallback"} {
		if a.refs[path] == nil {
			t.Errorf("missed caller path %s", path)
		}
	}
	for _, path := range []string{"Kind", "Heading", "Unrelated"} {
		if a.refs[path] != nil {
			t.Errorf("exposed non-caller path %s", path)
		}
	}
}
func TestRecursiveInferenceUnionsAndWireTargets(t *testing.T) {
	value, err := canonicalValue(map[string]any{"Rows": []any{map[string]any{"ID": "one", "Value": 1, "Selected": true}, map[string]any{"ID": "two", "Value": "unknown"}}, "URL": "/local"})
	if err != nil {
		t.Fatal(err)
	}
	full := infer(value)
	a := &analysis{refs: map[string]*access{"Rows": {hints: map[string]bool{"array": true}}, "Rows.*": {whole: true}, "URL": {whole: true}}, fixed: map[string]any{}}
	props, _, err := schemaFor(full, a, false)
	if err != nil {
		t.Fatal(err)
	}
	row := props["rows"].Items
	if row.Properties["id"].Target != "ID" || props["url"].Target != "URL" {
		t.Fatal("nested acronym targets lost")
	}
	if row.Properties["selected"].Required {
		t.Fatal("fixture presence must not imply required")
	}
	if len(row.Properties["value"].OneOf) != 2 {
		t.Fatal("heterogeneous scalar values lost")
	}
	projected, _, err := project(Property{Type: "object", Properties: props}, value, "")
	if err != nil {
		t.Fatal(err)
	}
	if projected.(map[string]any)["rows"].([]any)[0].(map[string]any)["id"] != "one" {
		t.Fatal("recursive fixture projection lost ID")
	}
	for input, want := range map[string]string{"URL": "url", "ID": "id", "AriaLabel": "ariaLabel", "AvatarURL": "avatarURL", "GeoJSON": "geoJSON"} {
		if got := wireKey(input); got != want {
			t.Errorf("wireKey(%s)=%s want%s", input, got, want)
		}
	}
}
