package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"reflect"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"golang.org/x/net/html"
)

func renderMode(t *testing.T, args ...string) []byte {
	t.Helper()
	var out bytes.Buffer
	if err := run(&out, args); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

func parse(t *testing.T, markup []byte) *html.Node {
	t.Helper()
	doc, err := html.Parse(bytes.NewReader(markup))
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func attr(n *html.Node, name string) (string, bool) {
	for _, a := range n.Attr {
		if a.Key == name {
			return a.Val, true
		}
	}
	return "", false
}

func nodes(n *html.Node, match func(*html.Node) bool) []*html.Node {
	var result []*html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && match(n) {
			result = append(result, n)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return result
}

func byID(t *testing.T, n *html.Node, id string) *html.Node {
	t.Helper()
	found := nodes(n, func(n *html.Node) bool { value, _ := attr(n, "id"); return value == id })
	if len(found) != 1 {
		t.Fatalf("ID %q: got %d elements, want 1", id, len(found))
	}
	return found[0]
}

func copyControls(n *html.Node) []*html.Node {
	return nodes(n, func(n *html.Node) bool { _, ok := attr(n, "data-interaction-copy"); return ok })
}

func textContent(n *html.Node) string {
	var out strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			out.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return out.String()
}

func assertAttr(t *testing.T, n *html.Node, name, want string) {
	t.Helper()
	if got, present := attr(n, name); !present || got != want {
		t.Fatalf("%s %s = %q (present=%v), want %q", n.Data, name, got, present, want)
	}
}

func TestMinimalInputsDoNotSupplyMissingDefaults(t *testing.T) {
	components := standaloneComponents()
	if len(components) != 6 {
		t.Fatalf("got %d standalone specimens", len(components))
	}
	for _, c := range components {
		if c.Chapter != "buttons" || c.Name != "CopyButton" {
			t.Fatalf("fixture includes another component: %+v", c)
		}
	}
	for i, id := range []string{"copy-a", "copy-b", "copy-empty"} {
		value := literalValue
		if id == "copy-empty" {
			value = ""
		}
		if components[i].ID != id || !reflect.DeepEqual(components[i].Props, map[string]any{"Value": value}) {
			t.Fatalf("%s must remain a Value-only input: %+v", id, components[i])
		}
	}
	if !reflect.DeepEqual(components[3].Props, map[string]any{"Value": literalValue, "Disabled": true}) {
		t.Fatalf("disabled specimen has extra fixture defaults: %+v", components[3])
	}
	if !reflect.DeepEqual(components[4].Props, map[string]any{"Items": []map[string]any{
		{"Value": "first"}, {"Value": "second"}, {"Value": "third", "Disabled": true},
	}}) {
		t.Fatalf("item specimens have extra fixture defaults: %+v", components[4])
	}
	// Each call returns fresh data, so a browser harness cannot accidentally
	// contaminate later replacement responses by modifying shared fixture props.
	components[0].Props["Label"] = "must not leak"
	if _, exists := standaloneComponents()[0].Props["Label"]; exists {
		t.Fatal("fixture props unexpectedly shared")
	}
}

func TestDocumentUsesUnmodifiedProductionMarkupAndAssets(t *testing.T) {
	markup := renderMode(t)
	if !bytes.Equal(markup, renderMode(t, "document")) {
		t.Fatal("default invocation differs from document mode")
	}
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, component := range standaloneComponents() {
		var expected bytes.Buffer
		if err := ui.RenderComponent(tpl, &expected, component); err != nil {
			t.Fatal(err)
		}
		if bytes.Count(markup, expected.Bytes()) != 1 {
			t.Fatalf("%s markup was rewritten, omitted or duplicated", component.ID)
		}
	}
	doc := parse(t, markup)
	ids := map[string]bool{}
	for _, n := range nodes(doc, func(n *html.Node) bool { _, ok := attr(n, "id"); return ok }) {
		id, _ := attr(n, "id")
		if ids[id] {
			t.Fatalf("duplicate document ID %q", id)
		}
		ids[id] = true
	}
	var stylesheets, scripts []string
	icons := 0
	for _, n := range nodes(doc, func(n *html.Node) bool { return n.Data == "link" || n.Data == "script" }) {
		if n.Data == "link" {
			if rel, _ := attr(n, "rel"); rel == "icon" {
				assertAttr(t, n, "href", "data:,")
				icons++
				continue
			}
			assertAttr(t, n, "rel", "stylesheet")
			href, _ := attr(n, "href")
			stylesheets = append(stylesheets, href)
		} else {
			src, present := attr(n, "src")
			if !present || strings.TrimSpace(textContent(n)) != "" {
				t.Fatal("fixture must not inject inline behavior")
			}
			if strings.Contains(src, "interaction-entry") {
				assertAttr(t, n, "type", "module")
			}
			scripts = append(scripts, src)
		}
	}
	if icons != 1 {
		t.Fatalf("got %d inline favicons, want exactly one", icons)
	}
	if !reflect.DeepEqual(stylesheets, []string{"/assets/app.css", "/assets/ely-api.css", "/assets/ely-api-interaction.css"}) ||
		!reflect.DeepEqual(scripts, []string{"/copybutton-observer.js", "/assets/htmx.min.js", "/assets/ely-api-interaction-entry.js"}) {
		t.Fatalf("unexpected production assets: CSS=%v scripts=%v", stylesheets, scripts)
	}
	styleNodes := nodes(doc, func(n *html.Node) bool { return n.Data == "style" })
	if len(styleNodes) != 1 {
		t.Fatal("fixture must have one ordinary layout stylesheet")
	}
	allowedSelectors := map[string]bool{"body": true, "main": true, "section": true, "h1": true, "h2": true}
	for _, rule := range strings.Split(textContent(styleNodes[0]), "}") {
		if rule == "" {
			continue
		}
		selector, _, ok := strings.Cut(rule, "{")
		if !ok || !allowedSelectors[strings.TrimSpace(selector)] {
			t.Fatalf("fixture CSS may not restyle production controls: %q", rule)
		}
	}
	for _, n := range nodes(doc, func(*html.Node) bool { return true }) {
		for _, a := range n.Attr {
			if strings.HasPrefix(a.Key, "on") {
				t.Fatalf("fixture must not supply an event handler: %s", a.Key)
			}
		}
	}
}

func TestExactValueEscapingAndNativeSemantics(t *testing.T) {
	markup := renderMode(t)
	doc := parse(t, markup)
	if !bytes.Contains(markup, []byte("&lt;text&gt; &amp; &#34;quoted&#34;\n한글 📋")) {
		t.Fatal("production escaped payload missing")
	}
	if len(nodes(doc, func(n *html.Node) bool { return n.Data == "text" })) != 0 {
		t.Fatal("caller value became markup")
	}
	for _, id := range []string{"copy-a", "copy-b", "copy-empty", "copy-disabled", "copy-override"} {
		root := byID(t, doc, id)
		controls := copyControls(root)
		if len(controls) != 1 || controls[0] != byID(t, root, id+"-control") {
			t.Fatalf("%s must have a unique control identity", id)
		}
		want := literalValue
		if id == "copy-empty" {
			want = ""
		}
		// A missing value attribute is the native button's empty value too.
		if got, _ := attr(controls[0], "value"); got != want {
			t.Fatalf("%s value = %q, want exact %q", id, got, want)
		}
		_, disabled := attr(controls[0], "disabled")
		if disabled != (id == "copy-disabled") {
			t.Fatalf("%s disabled = %v", id, disabled)
		}
	}
	for _, button := range copyControls(doc) {
		if button.Data != "button" {
			t.Fatalf("copy control is %s, want native button", button.Data)
		}
		assertAttr(t, button, "type", "button")
		if _, ok := attr(button, "aria-pressed"); ok {
			t.Fatal("ordinary copy controls must not acquire toggle semantics")
		}
	}
	form := byID(t, doc, "copy-form")
	buttons := nodes(form, func(n *html.Node) bool { return n.Data == "button" })
	if len(buttons) != 3 {
		t.Fatalf("copy form has %d buttons, want before/copy/after", len(buttons))
	}
	for i, id := range []string{"before-copy", "copy-a-control", "after-copy"} {
		assertAttr(t, buttons[i], "id", id)
		assertAttr(t, buttons[i], "type", "button")
	}
}

func TestItemsAndBoundedExplicitOverride(t *testing.T) {
	doc := parse(t, renderMode(t))
	items := copyControls(byID(t, doc, "copy-items"))
	if len(items) != 3 {
		t.Fatalf("got %d item controls, want 3", len(items))
	}
	for i, value := range []string{"first", "second", "third"} {
		assertAttr(t, items[i], "value", value)
		_, disabled := attr(items[i], "disabled")
		if disabled != (i == 2) {
			t.Fatalf("item %q disabled=%v", value, disabled)
		}
	}
	button := byID(t, doc, "copy-override-control")
	for key, value := range map[string]string{
		"aria-label": overrideAriaLabel, "data-size": "sm", "data-variant": "outline", "data-ely-action": "custom-copy",
	} {
		assertAttr(t, button, key, value)
	}
	if textContent(button) != overrideLabel {
		t.Fatalf("override label = %q, want %q", textContent(button), overrideLabel)
	}
}

func TestAdapterUsesActualSDUIAndSameSharedRenderer(t *testing.T) {
	markup := renderMode(t)
	doc := parse(t, markup)
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"copy-adapter", "copy-adapter-disabled"} {
		disabled := id == "copy-adapter-disabled"
		screen := byID(t, doc, id+"-screen")
		assertAttr(t, screen, "data-sdui-screen", id+"-screen")
		node := byID(t, screen, id)
		assertAttr(t, node, "data-sdui-node", "buttons/CopyButton")
		roots := nodes(node, func(n *html.Node) bool { v, _ := attr(n, "data-ely-family"); return v == "interaction" })
		if len(roots) != 1 {
			t.Fatalf("%s must own exactly one shared interaction component", id)
		}
		rootID, _ := attr(roots[0], "id")
		if rootID == "" || rootID == id {
			t.Fatal("adapter must retain its separate semantic and control identities")
		}
		props := map[string]any{"Value": literalValue, "Label": adapterLabel, "Disabled": disabled}
		var standalone bytes.Buffer
		if err := ui.RenderComponent(tpl, &standalone, ui.Component{Chapter: "buttons", Name: "CopyButton", ID: rootID, Props: props}); err != nil {
			t.Fatal(err)
		}
		if bytes.Count(markup, standalone.Bytes()) != 1 {
			t.Fatalf("%s adapter output differs from shared component rendering", id)
		}
		controls := copyControls(node)
		if len(controls) != 1 {
			t.Fatalf("%s got %d controls", id, len(controls))
		}
		assertAttr(t, controls[0], "value", literalValue)
		if textContent(controls[0]) != adapterLabel {
			t.Fatal("adapter did not preserve caller label")
		}
		_, gotDisabled := attr(controls[0], "disabled")
		if gotDisabled != disabled {
			t.Fatalf("%s did not preserve caller disabled flag", id)
		}
		if got := adapterScreen(id, disabled).Root.Props; !reflect.DeepEqual(got, map[string]any{
			"value": literalValue, "label": adapterLabel, "disabled": disabled,
		}) {
			t.Fatalf("adapter fixture added presentation defaults or widened input: %v", got)
		}
	}
}

func TestProductionReplacementFragmentsAndTargets(t *testing.T) {
	full := renderMode(t)
	root := renderMode(t, "root")
	control := renderMode(t, "control")
	inner := renderMode(t, "inner")
	for mode, fragment := range map[string][]byte{"root": root, "control": control, "inner": inner} {
		if bytes.Contains(fragment, []byte("<script")) || bytes.Contains(fragment, []byte("<style")) || bytes.Contains(fragment, []byte("<!doctype")) {
			t.Fatalf("%s fragment includes document assets", mode)
		}
		if bytes.Count(full, fragment) != 1 {
			t.Fatalf("%s fragment is not an unchanged production subtree", mode)
		}
	}
	rootDoc := parse(t, root)
	if len(copyControls(rootDoc)) != 1 {
		t.Fatal("root fragment must contain only one copy control")
	}
	rootNode := byID(t, rootDoc, "copy-a")
	var serializedChildren bytes.Buffer
	for c := rootNode.FirstChild; c != nil; c = c.NextSibling {
		if err := html.Render(&serializedChildren, c); err != nil {
			t.Fatal(err)
		}
	}
	innerDoc := parse(t, append(append([]byte(`<div id="test-inner">`), inner...), []byte(`</div>`)...))
	var actualChildren bytes.Buffer
	for c := byID(t, innerDoc, "test-inner").FirstChild; c != nil; c = c.NextSibling {
		if err := html.Render(&actualChildren, c); err != nil {
			t.Fatal(err)
		}
	}
	if !bytes.Equal(serializedChildren.Bytes(), actualChildren.Bytes()) {
		t.Fatal("inner fragment does not reproduce the production root contents")
	}
	controlDoc := parse(t, control)
	if len(copyControls(controlDoc)) != 1 || len(nodes(controlDoc, func(n *html.Node) bool { return n.Data == "output" })) != 0 {
		t.Fatal("control fragment must be exactly the native control, without root/status")
	}
	byID(t, controlDoc, "copy-a-control")
	fullDoc := parse(t, full)
	for _, mode := range []string{"root", "control", "inner"} {
		button := byID(t, fullDoc, "replace-"+mode)
		assertAttr(t, button, "hx-get", "/fragment/"+mode)
		target, swap := "#copy-a", "outerHTML"
		if mode == "control" {
			target = "#copy-a-control"
		} else if mode == "inner" {
			swap = "innerHTML"
		}
		assertAttr(t, button, "hx-target", target)
		assertAttr(t, button, "hx-swap", swap)
	}
}

func TestFragmentExtractionPreservesQuotedAndNestedMarkup(t *testing.T) {
	markup := []byte(`<aside>outside</aside><div id="root" title="quoted > &amp; <"><div><button id="control" value="&lt;text&gt; &amp; &#34;quoted&#34;">literal &lt;/button&gt;</button></div><output></output></div><footer>end</footer>`)
	for _, tc := range []struct {
		id    string
		inner bool
		want  string
	}{
		{"root", false, `<div id="root" title="quoted > &amp; <"><div><button id="control" value="&lt;text&gt; &amp; &#34;quoted&#34;">literal &lt;/button&gt;</button></div><output></output></div>`},
		{"root", true, `<div><button id="control" value="&lt;text&gt; &amp; &#34;quoted&#34;">literal &lt;/button&gt;</button></div><output></output>`},
		{"control", false, `<button id="control" value="&lt;text&gt; &amp; &#34;quoted&#34;">literal &lt;/button&gt;</button>`},
	} {
		got, err := elementBytes(markup, tc.id, tc.inner)
		if err != nil || string(got) != tc.want {
			t.Fatalf("%s inner=%v got=%q err=%v, want=%q", tc.id, tc.inner, got, err, tc.want)
		}
	}
	for _, markup := range []string{`<div id="other"></div>`, `<div id="missing">unclosed`} {
		if _, err := elementBytes([]byte(markup), "missing", false); err == nil {
			t.Fatal("missing or incomplete production element must return an error")
		}
	}
}

func TestManifestAndInvalidModes(t *testing.T) {
	var manifest map[string]json.RawMessage
	if err := json.Unmarshal(renderMode(t, "manifest"), &manifest); err != nil {
		t.Fatal(err)
	}
	var value string
	if err := json.Unmarshal(manifest["literalValue"], &value); err != nil || value != literalValue {
		t.Fatalf("manifest changed exact payload: %q, %v", value, err)
	}
	for _, key := range []string{"suite", "component", "standalone", "adapter", "fragments", "assets", "observer", "rootSelectors", "form", "tabBefore", "tabAfter"} {
		if len(manifest[key]) == 0 {
			t.Fatalf("manifest omits %q", key)
		}
	}
	for _, args := range [][]string{{"unknown"}, {"root", "ignored"}} {
		var out bytes.Buffer
		if err := run(&out, args); err == nil || out.Len() != 0 {
			t.Fatalf("invalid arguments %v must fail without output", args)
		}
	}
	for _, mode := range []string{"document", "root", "control", "inner", "manifest"} {
		if err := run(errorWriter{}, []string{mode}); !errors.Is(err, io.ErrClosedPipe) {
			t.Fatalf("%s did not propagate write failure: %v", mode, err)
		}
	}
}

type errorWriter struct{}

func (errorWriter) Write([]byte) (int, error) { return 0, io.ErrClosedPipe }
