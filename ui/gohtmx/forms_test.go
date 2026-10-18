package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestSharedInputKeepsZeroValue(t *testing.T) {
	templates, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := templates.ExecuteTemplate(&output, "input", map[string]any{"Type": "hidden", "Name": "revision", "Value": 0}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), `value="0"`) {
		t.Fatalf("zero revision lost: %s", output.String())
	}
}

func formAttr(n *html.Node, key string) (string, bool) {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val, true
		}
	}
	return "", false
}

func formNodes(root *html.Node, tag string) []*html.Node {
	var nodes []*html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == tag {
			nodes = append(nodes, n)
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return nodes
}

func formText(n *html.Node) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			b.WriteString(n.Data)
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(n)
	return b.String()
}

func renderSharedForm(t *testing.T, name string, pairs ...any) *html.Node {
	t.Helper()
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	dict := Funcs()["dict"].(func(...any) (map[string]any, error))
	args, err := dict(pairs...)
	if err != nil {
		t.Fatal(err)
	}
	var b bytes.Buffer
	if err := tpl.ExecuteTemplate(&b, name, args); err != nil {
		t.Fatal(err)
	}
	doc, err := html.Parse(&b)
	if err != nil {
		t.Fatal(err)
	}
	if len(formNodes(doc, "script")) != 0 {
		t.Fatal("untrusted content became executable markup")
	}
	return doc
}

func requireFormAttr(t *testing.T, n *html.Node, key, want string) {
	t.Helper()
	got, ok := formAttr(n, key)
	if !ok || got != want {
		t.Errorf("%s %s = %q (present %v), want %q", n.Data, key, got, ok, want)
	}
}

func TestSharedSelectStateAttributesAndEscaping(t *testing.T) {
	hostile := `"><script>alert(1)</script>&`
	options := []map[string]any{{"Value": "other", "Label": "다른 선택"}, {"Value": hostile, "Label": hostile}}
	doc := renderSharedForm(t, "select", "ID", "reference", "Name", "reference_titles", "Value", hostile,
		"Placeholder", "논문 선택", "Options", options, "Disabled", true, "Required", true,
		"AriaLabel", "참고 논문", "AriaDescribedby", "reference-hint",
		"Attrs", map[string]string{"data-reference-picker": "true"})
	selects := formNodes(doc, "select")
	if len(selects) != 1 {
		t.Fatalf("select count = %d", len(selects))
	}
	n := selects[0]
	for key, want := range map[string]string{"data-slot": "select", "id": "reference", "name": "reference_titles", "aria-label": "참고 논문", "aria-describedby": "reference-hint", "data-reference-picker": "true"} {
		requireFormAttr(t, n, key, want)
	}
	for _, key := range []string{"disabled", "required"} {
		if _, ok := formAttr(n, key); !ok {
			t.Errorf("select missing %s", key)
		}
	}
	selected := 0
	placeholder := false
	for _, option := range formNodes(n, "option") {
		value, _ := formAttr(option, "value")
		_, checked := formAttr(option, "selected")
		if checked {
			selected++
			if value != hostile || formText(option) != hostile {
				t.Errorf("wrong selected option: %q %q", value, formText(option))
			}
		}
		if value == "" && formText(option) == "논문 선택" {
			placeholder = true
		}
	}
	if selected != 1 || !placeholder {
		t.Errorf("selected count=%d placeholder=%v", selected, placeholder)
	}
}

func TestSharedRadioGroupHasNativeLabelsAndCheckedState(t *testing.T) {
	hostile := `<script>분야 & 관심</script>`
	doc := renderSharedForm(t, "radio-group", "Name", "purpose", "Value", "prospective", "AriaLabel", "사용 목적", "Required", true,
		"Options", []map[string]any{{"Value": "current", "Label": hostile}, {"Value": "prospective", "Label": "진학 탐색"}, {"Value": "both", "Label": "둘 다"}})
	groups := 0
	for _, tag := range []string{"div", "fieldset"} {
		for _, n := range formNodes(doc, tag) {
			if slot, _ := formAttr(n, "data-slot"); slot == "radio-group" {
				groups++
				requireFormAttr(t, n, "aria-label", "사용 목적")
			}
		}
	}
	if groups != 1 {
		t.Errorf("radio group count = %d, want 1", groups)
	}
	inputs := formNodes(doc, "input")
	if len(inputs) != 3 {
		t.Fatalf("radio count = %d, want 3", len(inputs))
	}
	for _, n := range inputs {
		requireFormAttr(t, n, "data-slot", "radio")
		requireFormAttr(t, n, "type", "radio")
		requireFormAttr(t, n, "name", "purpose")
		value, _ := formAttr(n, "value")
		_, checked := formAttr(n, "checked")
		if checked != (value == "prospective") {
			t.Errorf("value=%q checked=%v", value, checked)
		}
		if _, ok := formAttr(n, "required"); !ok {
			t.Error("radio missing native required")
		}
		label := n.Parent
		for label != nil && label.Data != "label" {
			label = label.Parent
		}
		if label == nil {
			t.Error("radio is not nested in a native label")
		} else {
			requireFormAttr(t, label, "data-slot", "radio-item")
			if value == "current" && !strings.Contains(formText(label), hostile) {
				t.Error("radio label did not retain escaped text")
			}
		}
	}
}

func TestSharedFieldLabelAndDatalistEscapeText(t *testing.T) {
	hostile := `"><script>자료</script>&`
	for _, required := range []bool{false, true} {
		doc := renderSharedForm(t, "field-label", "Label", hostile, "Required", required)
		if !strings.Contains(formText(doc), hostile) {
			t.Fatal("field label text not preserved")
		}
		labels := formNodes(doc, "span")
		if len(labels) != 1 {
			t.Fatalf("field-label count = %d, want 1", len(labels))
		}
		requireFormAttr(t, labels[0], "data-slot", "field-label")
		markers := formNodes(labels[0], "small")
		want := "Optional"
		if required {
			want = "Required"
		}
		if len(markers) != 1 || formText(markers[0]) != want {
			t.Errorf("field-label required=%v marker must be %q", required, want)
		}
	}
	doc := renderSharedForm(t, "datalist", "ID", "interest-options", "Options", []string{"영재교육", hostile})
	lists := formNodes(doc, "datalist")
	if len(lists) != 1 {
		t.Fatalf("datalist count = %d", len(lists))
	}
	requireFormAttr(t, lists[0], "id", "interest-options")
	options := formNodes(lists[0], "option")
	if len(options) != 2 {
		t.Fatalf("datalist option count = %d", len(options))
	}
	requireFormAttr(t, options[1], "value", hostile)
}

func TestSharedButtonLinkRetainsVariantsAndSanitizesURL(t *testing.T) {
	for _, href := range []string{"/onboarding?q=profile&from=map", "javascript:alert(1)"} {
		doc := renderSharedForm(t, "button", "Href", href, "Label", `<script>돌아가기</script>`, "Variant", "outline", "Size", "sm",
			"Attrs", map[string]string{"data-navigation": "profile"})
		links := formNodes(doc, "a")
		if len(links) != 1 || len(formNodes(doc, "button")) != 0 {
			t.Fatalf("Href must render one anchor, got %d", len(links))
		}
		n := links[0]
		for key, want := range map[string]string{"data-slot": "button", "data-variant": "outline", "data-size": "sm", "data-navigation": "profile"} {
			requireFormAttr(t, n, key, want)
		}
		if formText(n) != `<script>돌아가기</script>` {
			t.Error("button label text not preserved")
		}
		if strings.HasPrefix(href, "javascript:") {
			requireFormAttr(t, n, "href", "#ZgotmplZ")
		} else {
			requireFormAttr(t, n, "href", href)
		}
	}
}

func TestSharedExtraAttributesRemainEscapedAndRejectInvalidNames(t *testing.T) {
	hostile := `" onclick="alert(1)`
	for _, name := range []string{"input", "textarea", "button", "select"} {
		doc := renderSharedForm(t, name, "Label", "Save", "Value", "", "Attrs", map[string]string{"data-action": hostile, "hx-target": "#workspace"})
		nodes := formNodes(doc, name)
		if len(nodes) != 1 {
			t.Fatalf("%s count = %d", name, len(nodes))
		}
		requireFormAttr(t, nodes[0], "data-action", hostile)
		requireFormAttr(t, nodes[0], "hx-target", "#workspace")
		if _, exists := formAttr(nodes[0], "onclick"); exists {
			t.Fatalf("%s attribute value became executable", name)
		}
	}
	for _, bad := range []string{"onclick", `data-x" onclick="alert(1)`, "data-x="} {
		tpl, err := NewTemplates()
		if err != nil {
			t.Fatal(err)
		}
		var out bytes.Buffer
		if err := tpl.ExecuteTemplate(&out, "input", map[string]any{"Attrs": map[string]string{bad: "x"}}); err == nil {
			t.Fatalf("accepted invalid attribute name %q", bad)
		}
	}
}
