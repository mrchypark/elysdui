package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestComponentAPIBoundaries(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	props := map[string]any{"Value": "<script>caller</script>", "Label": "Caller", "ID": "forged"}
	var output bytes.Buffer
	if err := RenderComponent(tpl, &output, Component{Chapter: "forms", Name: "Input", ID: "caller-instance", Props: props}); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(output.String(), "<script>caller") || !strings.Contains(output.String(), "&lt;script&gt;caller") || !strings.Contains(output.String(), `id="caller-instance"`) {
		t.Fatal(output.String())
	}
	if props["ID"] != "forged" || props["Kind"] != nil {
		t.Fatal("Renderer mutated caller data")
	}
	for _, id := range []string{"", "1bad", "bad space", strings.Repeat("x", 129)} {
		if RenderComponent(tpl, &bytes.Buffer{}, Component{Chapter: "forms", Name: "Input", ID: id}) == nil {
			t.Fatalf("accepted ID %q", id)
		}
	}
	if _, err := ResolveComponent("forms", "Missing"); err == nil {
		t.Fatal("accepted unknown name")
	}
	if _, err := ResolveComponent("", "DocumentViewer"); err == nil {
		t.Fatal("ambiguous name accepted")
	}
	alias, err := ResolveComponent("", "forms/DateTimePicker")
	if err != nil || alias.Name != "DatePicker" {
		t.Fatalf("alias = %+v %v", alias, err)
	}
	defs, err := ComponentDefinitions()
	if err != nil || len(defs) != 624 {
		t.Fatalf("definitions = %d %v", len(defs), err)
	}
	defs[0].Name = "changed"
	defs[0].Aliases[0] = "changed"
	next, _ := ComponentDefinitions()
	if next[0].Name == "changed" || next[0].Aliases[0] == "changed" {
		t.Fatal("definitions leaked mutable registry state")
	}
}
