package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

// renderControlMarkup renders a shared control template and returns the raw
// markup. Some contracts (noscript fallbacks) are inert to the HTML parser,
// so they are only observable in the rendered source.
func renderControlMarkup(t *testing.T, name string, props map[string]any) string {
	t.Helper()
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := tpl.ExecuteTemplate(&output, name, props); err != nil {
		t.Fatalf("render %s: %v", name, err)
	}
	return output.String()
}

// controlElements returns the descendants of node that carry the given
// attribute, in document order.
func controlElements(node *html.Node, tag, key string) []*html.Node {
	var nodes []*html.Node
	var walk func(*html.Node)
	walk = func(current *html.Node) {
		if current.Type == html.ElementNode && current.Data == tag {
			if _, ok := formAttr(current, key); ok {
				nodes = append(nodes, current)
			}
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return nodes
}

func controlDescendants(node *html.Node, tag string) []*html.Node {
	var nodes []*html.Node
	var walk func(*html.Node)
	walk = func(current *html.Node) {
		if current.Type == html.ElementNode && current.Data == tag {
			nodes = append(nodes, current)
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return nodes
}

// controlKeyValueRows returns the key/value rows rendered inside the live
// host. The add-row template holds a prototype row that is not a real row.
func controlKeyValueRows(doc *html.Node) []*html.Node {
	hosts := controlElements(doc, "div", "data-ui-key-values")
	if len(hosts) != 1 {
		return nil
	}
	return controlElements(hosts[0], "div", "data-ui-key-value")
}

func TestControlsDefectClearableInputReadonlyDisablesClear(t *testing.T) {
	doc := renderElyControl(t, "clearable-input", map[string]any{
		"ID": "clearable", "Name": "query", "Label": "Query", "Readonly": true,
	})
	buttons := controlElements(doc, "button", "data-ui-action")
	if len(buttons) != 1 {
		t.Fatalf("clear button count = %d, want 1", len(buttons))
	}
	if _, ok := formAttr(buttons[0], "disabled"); !ok {
		t.Error("clear button must be disabled while the field is readonly")
	}
	inputs := formNodes(doc, "input")
	if len(inputs) != 1 {
		t.Fatalf("input count = %d, want 1", len(inputs))
	}
	if _, ok := formAttr(inputs[0], "readonly"); !ok {
		t.Error("clearable input lost its readonly state")
	}

	doc = renderElyControl(t, "clearable-input", map[string]any{
		"ID": "clearable", "Name": "query", "Label": "Query",
	})
	buttons = controlElements(doc, "button", "data-ui-action")
	if len(buttons) != 1 {
		t.Fatalf("clear button count = %d, want 1", len(buttons))
	}
	if _, ok := formAttr(buttons[0], "disabled"); ok {
		t.Error("clear button must stay enabled for an editable field")
	}
}

func TestControlsDefectKeyValueInputRowStateAndAccessibleNames(t *testing.T) {
	items := []map[string]any{
		{"Key": "MAX_LOG", "Value": "1000"},
		{"Key": "READ_ONLY", "Value": "true", "Disabled": true},
		{"Key": "", "Value": "plain"},
	}
	doc := renderElyControl(t, "key-value-input", map[string]any{
		"ID": "pairs", "Name": "env", "Items": items,
	})
	rows := controlKeyValueRows(doc)
	if len(rows) != len(items) {
		t.Fatalf("row count = %d, want %d", len(rows), len(items))
	}
	for index, row := range rows {
		inputs := controlDescendants(row, "input")
		if len(inputs) != 2 {
			t.Fatalf("row %d input count = %d, want 2", index, len(inputs))
		}
		buttons := controlDescendants(row, "button")
		if len(buttons) != 1 {
			t.Fatalf("row %d button count = %d, want 1", index, len(buttons))
		}
		wantDisabled := index == 1
		for _, input := range inputs {
			_, disabled := formAttr(input, "disabled")
			if disabled != wantDisabled {
				t.Errorf("row %d input disabled = %v, want %v", index, disabled, wantDisabled)
			}
		}
		_, disabled := formAttr(buttons[0], "disabled")
		if disabled != wantDisabled {
			t.Errorf("row %d remove button disabled = %v, want %v", index, disabled, wantDisabled)
		}
	}

	wantLabels := []string{"Remove MAX_LOG pair", "Remove READ_ONLY pair", "Remove pair"}
	for index, row := range rows {
		buttons := controlDescendants(row, "button")
		requireFormAttr(t, buttons[0], "aria-label", wantLabels[index])
	}
	labels := map[string]bool{}
	for _, row := range rows {
		buttons := controlDescendants(row, "button")
		label, _ := formAttr(buttons[0], "aria-label")
		labels[label] = true
	}
	if len(labels) < 2 {
		t.Errorf("remove buttons share one accessible name: %v", labels)
	}

	doc = renderElyControl(t, "key-value-input", map[string]any{
		"ID": "pairs", "Name": "env", "Items": items, "Disabled": true,
	})
	for index, row := range controlKeyValueRows(doc) {
		for _, input := range controlDescendants(row, "input") {
			if _, ok := formAttr(input, "disabled"); !ok {
				t.Errorf("row %d input must stay disabled when the group is disabled", index)
			}
		}
		for _, button := range controlDescendants(row, "button") {
			if _, ok := formAttr(button, "disabled"); !ok {
				t.Errorf("row %d remove button must stay disabled when the group is disabled", index)
			}
		}
	}
}

func TestControlsDefectPinInputGroupHasAccessibleName(t *testing.T) {
	doc := renderElyControl(t, "pin-input", map[string]any{
		"ID": "code", "Name": "code", "Label": "Security code", "Items": []int{1, 2, 3, 4},
	})
	groups := controlElements(doc, "div", "class")
	var slots *html.Node
	for _, group := range groups {
		if class, _ := formAttr(group, "class"); class == "ely-pin-slots" {
			slots = group
		}
	}
	if slots == nil {
		t.Fatal("pin slot group is missing")
	}
	requireFormAttr(t, slots, "role", "group")
	requireFormAttr(t, slots, "aria-label", "Security code")

	labels := formNodes(doc, "label")
	if len(labels) != 1 {
		t.Fatalf("label count = %d, want 1", len(labels))
	}
	requireFormAttr(t, labels[0], "for", "code-pin-0")
	if _, ok := formAttr(labels[0], "for"); !ok {
		t.Error("pin label must target the first visible slot")
	}
	slotInputs := controlElements(doc, "input", "data-ui-pin-slot")
	if len(slotInputs) != 4 {
		t.Fatalf("slot count = %d, want 4", len(slotInputs))
	}
	requireFormAttr(t, slotInputs[0], "id", "code-pin-0")

	doc = renderElyControl(t, "pin-input", map[string]any{
		"ID": "code", "Name": "code", "Label": "Security code", "Items": []int{},
	})
	labels = formNodes(doc, "label")
	if len(labels) != 1 {
		t.Fatalf("label count = %d, want 1", len(labels))
	}
	if _, ok := formAttr(labels[0], "for"); ok {
		t.Error("pin label must not reference a slot when no slot is rendered")
	}

	doc = renderElyControl(t, "pin-input", map[string]any{
		"ID": "code", "Name": "code", "Items": []int{1, 2},
	})
	groups = controlElements(doc, "div", "class")
	for _, group := range groups {
		if class, _ := formAttr(group, "class"); class == "ely-pin-slots" {
			slots = group
		}
	}
	if slots == nil {
		t.Fatal("pin slot group is missing")
	}
	label, ok := formAttr(slots, "aria-label")
	if !ok || label == "" {
		t.Error("pin slot group needs a non-empty accessible name")
	}
}

func TestControlsDefectComboboxHasAccessibleNames(t *testing.T) {
	markup := renderControlMarkup(t, "combobox", map[string]any{
		"ID": "choice", "Name": "choice", "Label": "City",
		"Options": []map[string]any{{"Value": "ams", "Label": "Amsterdam"}},
	})
	if !strings.Contains(markup, `role="listbox" aria-label="City"`) {
		t.Error("combobox listbox needs an accessible name")
	}
	noscript := markup[strings.Index(markup, "<noscript>"):strings.Index(markup, "</noscript>")]
	if !strings.Contains(noscript, "<select") || !strings.Contains(noscript, `aria-label="City"`) {
		t.Errorf("combobox noscript fallback needs an accessible name: %s", noscript)
	}

	markup = renderControlMarkup(t, "combobox", map[string]any{
		"ID": "choice", "Name": "choice",
		"Options": []map[string]any{{"Value": "ams", "Label": "Amsterdam"}},
	})
	if !strings.Contains(markup, `role="listbox" aria-label="Options"`) {
		t.Error("combobox listbox needs a fallback accessible name")
	}
	noscript = markup[strings.Index(markup, "<noscript>"):strings.Index(markup, "</noscript>")]
	if !strings.Contains(noscript, `aria-label="Options"`) {
		t.Errorf("combobox noscript fallback needs a fallback accessible name: %s", noscript)
	}
}

func TestControlsDefectRadioOptionDisabledIsPerOption(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	props := map[string]any{
		"Name": "plan", "Value": "pro",
		"Options": []map[string]any{
			{"Value": "pro", "Label": "Pro"},
			{"Value": "enterprise", "Label": "Enterprise", "Disabled": true},
		},
	}
	if err := RenderComponent(tpl, &output, Component{Chapter: "forms", Name: "Radio", ID: "defect-radio", Props: props}); err != nil {
		t.Fatal(err)
	}
	doc, err := html.Parse(&output)
	if err != nil {
		t.Fatal(err)
	}
	states := map[string]bool{}
	for _, input := range formNodes(doc, "input") {
		if inputType, _ := formAttr(input, "type"); inputType != "radio" {
			continue
		}
		value, _ := formAttr(input, "value")
		_, disabled := formAttr(input, "disabled")
		states[value] = disabled
	}
	if len(states) != 2 {
		t.Fatalf("radio option count = %d, want 2", len(states))
	}
	if !states["enterprise"] {
		t.Error("a disabled radio option must render a disabled input")
	}
	if states["pro"] {
		t.Error("an enabled radio option must not render a disabled input")
	}
}

func TestControlsDefectRuntimeGuardsUnavailableControls(t *testing.T) {
	data, err := Files.ReadFile("assets/ely-controls.js")
	if err != nil {
		t.Fatal(err)
	}
	source := string(data)
	for _, want := range []string{
		`if (input && !input.readOnly && !input.disabled)`,
		`const row = event.target.closest('[data-ui-key-value]'); if (row && !`,
		`.some((control) => control.disabled)) row.remove();`,
	} {
		if !strings.Contains(source, want) {
			t.Errorf("controls runtime lacks guard %q", want)
		}
	}
	if strings.Contains(source, `input.value = ''; input.dispatchEvent`) && !strings.Contains(source, `!input.readOnly`) {
		t.Error("clear handler must not clear a readonly input")
	}
}
