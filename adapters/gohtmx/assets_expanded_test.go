package gohtmx

import (
	"bytes"
	"strings"
	"testing"
)

func TestMapAssetsCollectedThroughHiddenReusableSlot(t *testing.T) {
	r := schemaRegistry(t)
	if err := r.Register(Definition{Name: "map-helper", Template: "map-view", Assets: []string{"map"}, Properties: map[string]Property{}}); err != nil {
		t.Fatal(err)
	}
	if err := r.Register(Definition{Name: "slot-card", Template: "card", Slots: map[string]SlotDefinition{"content": {Target: "Content", MaxNodes: 8}}}); err != nil {
		t.Fatal(err)
	}
	screen := Screen{Version: Version, ID: "screen", Templates: map[string]TemplateDefinition{"map-fragment": {Root: Node{ID: "map", Type: "map-helper", When: &Condition{Op: "eq", Path: "/show", Value: true}}}}, Root: Node{ID: "card", Type: "slot-card", Slots: map[string][]Node{"content": {{ID: "map-use", Use: "map-fragment"}}}}}
	plan, err := Compile(screen, r)
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := plan.RenderAssets(&output); err != nil {
		t.Fatal(err)
	}
	for _, asset := range []string{"/assets/ely-map.css", "/assets/ely-map.js"} {
		if strings.Count(output.String(), asset) != 1 {
			t.Fatalf("asset %s missing/duplicate: %s", asset, output.String())
		}
	}
	var body bytes.Buffer
	if err := plan.Render(&body, RenderContext{Data: map[string]any{"show": false}}); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(body.String(), "data-map") {
		t.Fatal("false branch rendered")
	}
}
