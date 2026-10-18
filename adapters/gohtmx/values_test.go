package gohtmx

import (
	"html/template"
	"testing"
)

func TestDefinitionAssetAllowlistAndSnapshot(t *testing.T) {
	tpl := template.Must(template.New("leaf").Parse(`text`))
	for _, assets := range [][]string{{"https://evil.example/script.js"}, {"map", "map"}, {"javascript"}} {
		if err := NewRegistry(tpl).Register(Definition{Name: "custom", Template: "leaf", Assets: assets}); err == nil {
			t.Fatalf("accepted asset %v", assets)
		}
	}
	assets := []string{"map"}
	r := NewRegistry(tpl)
	if err := r.Register(Definition{Name: "custom", Template: "leaf", Assets: assets}); err != nil {
		t.Fatal(err)
	}
	assets[0] = "changed"
	snapshot := r.Definitions()
	if snapshot[0].Assets[0] != "map" {
		t.Fatal("input assets not copied")
	}
	snapshot[0].Assets[0] = "changed"
	if r.Definitions()[0].Assets[0] != "map" {
		t.Fatal("snapshot assets not copied")
	}
}
func TestReviewedRendererCapabilities(t *testing.T) {
	r, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	data := Property{Type: Object, Target: "Devtools", Format: "inert-data", Properties: map[string]Property{"url": {Type: String, Format: "text"}, "template": {Type: Object, Properties: map[string]Property{"name": {Type: String, Format: "text"}}}}}
	if err := r.Register(Definition{Name: "reviewed-devtools", Chapter: "devtools", Component: "JsonViewer", Properties: map[string]Property{"data": data}}); err != nil {
		t.Fatal(err)
	}
	data.Target = "Other"
	if err := r.Register(Definition{Name: "unreviewed-devtools-target", Chapter: "devtools", Component: "JsonViewer", Properties: map[string]Property{"data": data}}); err == nil {
		t.Fatal("inert-data escaped reviewed target")
	}
	data.Target = "Devtools"
	if err := r.Register(Definition{Name: "unreviewed-canvas", Chapter: "canvas", Component: "ColorPanel", Properties: map[string]Property{"data": data}}); err == nil {
		t.Fatal("inert-data escaped reviewed renderer")
	}
	htmlProperty := Property{Type: String, Target: "HTML", Format: "sandbox-html"}
	if err := r.Register(Definition{Name: "reviewed-sandbox", Chapter: "misc", Component: "WebView", SandboxHTML: true, Properties: map[string]Property{"html": htmlProperty}}); err != nil {
		t.Fatal(err)
	}
	if err := r.Register(Definition{Name: "unreviewed-sandbox", Template: "sdui-text", SandboxHTML: true, Properties: map[string]Property{"html": htmlProperty}}); err == nil {
		t.Fatal("sandbox capability escaped renderer")
	}
}
