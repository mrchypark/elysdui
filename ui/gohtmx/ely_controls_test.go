package ui

import (
	"bytes"
	"html/template"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func renderElyControl(t *testing.T, name string, props map[string]any) *html.Node {
	t.Helper()
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := tpl.ExecuteTemplate(&output, name, props); err != nil {
		t.Fatalf("render %s: %v", name, err)
	}
	doc, err := html.Parse(&output)
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func TestElyControlsRenderRequiredNamesAndUniqueIDs(t *testing.T) {
	options := []map[string]any{{"Value": "one", "Label": "One", "Content": "First"}, {"Value": "two", "Label": "Two", "Content": "Second"}}
	items := []map[string]any{{"Key": "alpha", "Value": "beta", "Label": "One", "Content": "First"}, {"Key": "gamma", "Value": "delta", "Label": "Two", "Content": "Second"}}
	for _, name := range []string{"clearable-input", "password-input", "pin-input", "tag-input", "key-value-input", "file-dropzone", "date-picker", "color-picker", "hotkey-input", "signature-pad", "combobox", "multi-select", "selectable-list", "dialog", "tabs"} {
		props := map[string]any{
			"ID": "control-" + name, "Name": "field_" + strings.ReplaceAll(name, "-", "_"), "Value": "one", "Label": "Field", "Placeholder": "Enter value",
			"Options": options, "Items": items, "Disabled": true, "Required": true, "Attrs": map[string]string{"data-test": name}, "Content": "Panel",
		}
		doc := renderElyControl(t, name, props)
		roots := 0
		ids := map[string]bool{}
		for _, node := range formNodes(doc, "div") {
			if component, _ := formAttr(node, "data-ui-component"); component == name {
				roots++
				requireFormAttr(t, node, "id", "control-"+name)
				requireFormAttr(t, node, "data-test", name)
			}
		}
		if name == "dialog" {
			for _, node := range formNodes(doc, "dialog") {
				if component, _ := formAttr(node, "data-ui-component"); component == name {
					roots++
					requireFormAttr(t, node, "id", "control-"+name)
				}
			}
		}
		if roots != 1 {
			t.Fatalf("%s root count = %d", name, roots)
		}
		var walk func(*html.Node)
		walk = func(node *html.Node) {
			if id, ok := formAttr(node, "id"); ok {
				if ids[id] {
					t.Errorf("%s repeats id %q", name, id)
				}
				ids[id] = true
			}
			for child := node.FirstChild; child != nil; child = child.NextSibling {
				walk(child)
			}
		}
		walk(doc)
		if name != "dialog" && name != "tabs" {
			foundName := false
			controls := append(formNodes(doc, "input"), formNodes(doc, "textarea")...)
			controls = append(controls, formNodes(doc, "select")...)
			for _, input := range controls {
				if got, _ := formAttr(input, "name"); strings.HasPrefix(got, props["Name"].(string)) {
					foundName = true
					if _, ok := formAttr(input, "disabled"); !ok {
						t.Errorf("%s named input is not disabled", name)
					}
				}
			}
			if !foundName {
				t.Errorf("%s did not render name %q", name, props["Name"])
			}
		}
	}
}

func TestElyDialogAndTabsEscapeStringsButAllowTrustedContent(t *testing.T) {
	hostile := `<img src=x onerror=alert(1)>`
	for _, name := range []string{"dialog", "tabs"} {
		props := map[string]any{"ID": "safe-" + name, "Value": "one", "Content": hostile, "Items": []map[string]any{{"Value": "one", "Label": "One", "Content": hostile}}}
		doc := renderElyControl(t, name, props)
		if len(formNodes(doc, "img")) != 0 || !strings.Contains(formText(doc), hostile) {
			t.Errorf("%s did not escape string content", name)
		}
	}
	doc := renderElyControl(t, "dialog", map[string]any{"ID": "trusted-dialog", "Content": template.HTML(`<strong>Trusted</strong>`)})
	if len(formNodes(doc, "strong")) != 1 || !strings.Contains(formText(doc), "Trusted") {
		t.Fatal("trusted Go-rendered content was not retained")
	}
	doc = renderElyControl(t, "dialog", map[string]any{"ID": "named-dialog", "Label": "Dialog name"})
	requireFormAttr(t, formNodes(doc, "dialog")[0], "aria-label", "Dialog name")
}

func TestTagRequiredStateIsExplicit(t *testing.T) {
	for _, required := range []bool{false, true} {
		doc := renderElyControl(t, "tag-input", map[string]any{"ID": "tags", "Required": required})
		var root *html.Node
		for _, node := range formNodes(doc, "div") {
			if name, _ := formAttr(node, "data-ui-component"); name == "tag-input" {
				root = node
			}
		}
		_, marked := formAttr(root, "data-ui-required")
		if marked != required {
			t.Fatalf("tag required marker=%v, wanted %v", marked, required)
		}
	}
}

func TestSignatureHasNativeTextFallbackAndSeparateDrawingValue(t *testing.T) {
	doc := renderElyControl(t, "signature-pad", map[string]any{"ID": "signature", "Name": "signature", "Value": "Typed signature", "Required": true})
	input := formNodes(doc, "input")[0]
	requireFormAttr(t, input, "type", "hidden")
	requireFormAttr(t, input, "name", "signature")
	if _, ok := formAttr(input, "disabled"); !ok {
		t.Fatal("drawing value must not duplicate the native fallback before JS initializes")
	}
	fallback := formNodes(doc, "textarea")[0]
	requireFormAttr(t, fallback, "name", "signature")
	if _, ok := formAttr(fallback, "required"); !ok || formText(fallback) != "Typed signature" {
		t.Fatal("native text fallback lost its required state or initial value")
	}
}

func TestElyControlsEscapeRootAttributesAndRequireVisibleControls(t *testing.T) {
	hostile := `"><script>alert(1)</script>&`
	doc := renderElyControl(t, "clearable-input", map[string]any{
		"ID": "safe-clear", "Name": "safe_name", "Label": hostile, "Required": true, "Disabled": true,
		"Attrs": map[string]string{"data-note": hostile},
	})
	root := formNodes(doc, "div")[0]
	requireFormAttr(t, root, "data-note", hostile)
	input := formNodes(doc, "input")[0]
	if _, ok := formAttr(input, "required"); !ok {
		t.Fatal("clearable input is missing native required")
	}
	if _, ok := formAttr(input, "disabled"); !ok {
		t.Fatal("clearable input is missing disabled")
	}
	if len(formNodes(doc, "script")) != 0 || !strings.Contains(formText(doc), hostile) {
		t.Fatal("root attributes or labels became executable markup")
	}

	doc = renderElyControl(t, "combobox", map[string]any{
		"ID": "required-combo", "Name": "choice", "Required": true,
		"Options": []map[string]any{{"Value": "one", "Label": "One"}},
	})
	var visible, hidden *html.Node
	for _, input := range formNodes(doc, "input") {
		if inputType, _ := formAttr(input, "type"); inputType == "hidden" {
			hidden = input
		} else {
			visible = input
		}
	}
	if visible == nil || hidden == nil {
		t.Fatal("combobox did not render visible and submitted controls")
	}
	if _, ok := formAttr(visible, "required"); !ok {
		t.Fatal("combobox visible input is missing required")
	}
	if _, ok := formAttr(hidden, "required"); ok {
		t.Fatal("combobox hidden input must not carry required")
	}
}

func TestCompositeOptionDisabledAndPasswordConstraints(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	options := []map[string]any{{"Value": "locked", "Label": "Locked", "Disabled": true}}
	for _, name := range []string{"combobox", "multi-select"} {
		var output bytes.Buffer
		if err := tpl.ExecuteTemplate(&output, name, map[string]any{"ID": "bounded-choice", "Name": "choice", "Options": options}); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(output.String(), `aria-disabled="true"`) && !strings.Contains(output.String(), " disabled") {
			t.Fatalf("%s enabled disabled caller option", name)
		}
	}
	var output bytes.Buffer
	if err := tpl.ExecuteTemplate(&output, "password-input", map[string]any{"ID": "bounded-password", "MinLength": 12, "Autocomplete": "new-password", "Readonly": true}); err != nil {
		t.Fatal(err)
	}
	for _, attribute := range []string{`minlength="12"`, `autocomplete="new-password"`, `readonly`} {
		if !strings.Contains(output.String(), attribute) {
			t.Errorf("lost %s", attribute)
		}
	}
}
