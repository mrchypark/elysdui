package sduicatalogue

import (
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"testing"
)

// Group values are strings even when gallery samples omit them. Truthiness in
// templates must not accidentally turn an optional selection into a boolean.
func TestSegmentedGroupValueStringWithoutFixtureHint(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	d, err := ui.ResolveComponent("buttons", "SegmentedControl")
	if err != nil {
		t.Fatal(err)
	}
	a := analyze(tpl, d.Template, map[string]any{"ID": "selection", "Kind": d.Name, "Chapter": "buttons", "Variant": "SegmentedControl", "ComponentName": "SegmentedControl"})
	props, _, err := schemaFor(Property{Type: "object", Properties: map[string]Property{}}, a, false)
	if err != nil {
		t.Fatal(err)
	}
	groups := props["groups"]
	if groups.Items == nil {
		t.Fatal("missing group schema")
	}
	if got := groups.Items.Properties["value"].Type; got != "string" {
		t.Fatalf("group value inferred as %q, want string", got)
	}
	if got := props["value"].Type; got != "string" {
		t.Fatalf("root value inferred as %q, want string", got)
	}
}
