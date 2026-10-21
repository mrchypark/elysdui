package ui

import (
	"bytes"
	"html/template"
	"testing"
)

// renderSharedAttrsError renders the shared input template with the given
// extra attributes and returns the execution error, if any.
func renderSharedAttrsError(t *testing.T, attrs map[string]string) error {
	t.Helper()
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	return tpl.ExecuteTemplate(&out, "input", map[string]any{"Attrs": attrs})
}

func TestUISecurityRejectsExecutableAttributeNames(t *testing.T) {
	for _, name := range []string{"hx-on", "data-hx-on", "data-hx-on:click", "onclick", `data-x" onclick="alert(1)`} {
		if err := renderSharedAttrsError(t, map[string]string{name: "x"}); err == nil {
			t.Errorf("accepted executable attribute name %q", name)
		}
	}
}

func TestUISecurityRejectsExecutableAttributeValues(t *testing.T) {
	attributes := []string{
		"hx-get", "hx-post", "hx-put", "hx-patch", "hx-delete",
		"hx-query", "hx-action", "hx-confirm", "hx-vals", "hx-headers",
	}
	values := []string{
		"js:alert(1)",
		"javascript:alert(1)",
		" js:alert(1)",
		"JAVASCRIPT:alert(1)",
		"JavaScript:alert(1)",
		"java\tscript:alert(1)",
	}
	for _, attribute := range attributes {
		for _, name := range []string{attribute, "data-" + attribute} {
			for _, value := range values {
				if err := renderSharedAttrsError(t, map[string]string{name: value}); err == nil {
					t.Errorf("accepted executable value %q for %q", value, name)
				}
			}
		}
	}
}

func TestUISecurityRejectsHtmxRequestConfig(t *testing.T) {
	for _, name := range []string{"hx-config", "data-hx-config"} {
		for _, value := range []string{
			`{"action":"js:alert(1)"}`,
			`{"action":"javascript:alert(1)"}`,
			`action: 'js:alert(1)'`,
			`{"timeout":1000}`,
			``,
		} {
			if err := renderSharedAttrsError(t, map[string]string{"hx-get": "/safe", name: value}); err == nil {
				t.Errorf("accepted request config %q for %q", value, name)
			}
		}
	}
}

func TestUISecurityRejectsHtmxTriggerFilterExpressions(t *testing.T) {
	for _, name := range []string{"hx-trigger", "data-hx-trigger"} {
		for _, value := range []string{"click[window.location]", "keyup[alert(1)]"} {
			if err := renderSharedAttrsError(t, map[string]string{name: value}); err == nil {
				t.Errorf("accepted filter expression %q for %q", value, name)
			}
		}
		if err := renderSharedAttrsError(t, map[string]string{name: "click"}); err != nil {
			t.Errorf("rejected plain trigger for %q: %v", name, err)
		}
	}
}

func TestUISecurityKeepsLegitimateHtmxAttributes(t *testing.T) {
	attrs := map[string]string{
		"hx-post":      "/save",
		"hx-get":       "/fragment",
		"hx-target":    "#workspace",
		"hx-swap":      "outerHTML",
		"hx-confirm":   "Are you sure?",
		"hx-indicator": "#spinner",
		"data-hx-get":  "/fragment",
		"data-state":   "ready",
		"aria-label":   "Save document",
	}
	for _, name := range []string{"input", "button"} {
		doc := renderSharedForm(t, name, "Label", "Save", "Value", "", "Attrs", attrs)
		nodes := formNodes(doc, name)
		if len(nodes) != 1 {
			t.Fatalf("%s count = %d", name, len(nodes))
		}
		for key, want := range attrs {
			requireFormAttr(t, nodes[0], key, want)
		}
	}
}

func TestUISecurityKeepsAttributeValuesEscaped(t *testing.T) {
	hostile := `" onclick="alert(1)`
	doc := renderSharedForm(t, "input", "Label", "Save", "Value", "",
		"Attrs", map[string]string{"data-action": hostile, "hx-target": hostile})
	nodes := formNodes(doc, "input")
	if len(nodes) != 1 {
		t.Fatalf("input count = %d", len(nodes))
	}
	requireFormAttr(t, nodes[0], "data-action", hostile)
	requireFormAttr(t, nodes[0], "hx-target", hostile)
	if _, exists := formAttr(nodes[0], "onclick"); exists {
		t.Fatal("attribute value became executable")
	}
}

func TestUISecurityFlattensTrustedMarkupAttributeValues(t *testing.T) {
	doc := renderSharedForm(t, "input", "Label", "Save", "Value", "",
		"Attrs", map[string]any{"data-action": template.HTML(`" onclick="alert(1)`)})
	nodes := formNodes(doc, "input")
	if len(nodes) != 1 {
		t.Fatalf("input count = %d", len(nodes))
	}
	requireFormAttr(t, nodes[0], "data-action", `" onclick="alert(1)`)
	if _, exists := formAttr(nodes[0], "onclick"); exists {
		t.Fatal("trusted markup value became an executable attribute")
	}
}
