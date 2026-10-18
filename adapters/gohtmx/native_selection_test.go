package gohtmx

import (
	"bytes"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func selectionNode(options any) Node {
	return Node{ID: "theme", Type: "select", Props: map[string]any{"name": "theme", "label": "Color theme", "value": "dark", "options": options}}
}
func TestNativeSelectionProjectionAndHTML(t *testing.T) {
	options := []any{map[string]any{"value": "dark", "label": "<Dark>"}, map[string]any{"value": "light", "label": "Light"}}
	checkbox := Node{ID: "consent", Type: "checkbox", Props: map[string]any{"name": "consent", "label": "Digest <consent>", "checked": true}}
	plan := nativePlan(t, checkbox, selectionNode(options))
	tree, err := plan.ResolveNative("profile-region", RenderContext{}, NativeCapabilities())
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(tree.Children[1].Props["options"], options) {
		t.Fatalf("nested template keys leaked: %#v", tree.Children[1].Props)
	}
	var html bytes.Buffer
	if err := plan.RenderRegion(&html, "profile-region", RenderContext{}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`type="checkbox"`, `aria-label="Digest &lt;consent&gt;"`, `<option value="dark" selected>&lt;Dark&gt;</option>`} {
		if !strings.Contains(html.String(), want) {
			t.Fatalf("missing %s: %s", want, html.String())
		}
	}
	for _, missing := range []string{"checkbox", "select"} {
		caps := []string{}
		for _, c := range NativeCapabilities() {
			if c != missing {
				caps = append(caps, c)
			}
		}
		if _, err := plan.ResolveNative("profile-region", RenderContext{}, caps); !errors.Is(err, ErrUnsupportedNative) {
			t.Fatalf("missing %s accepted: %v", missing, err)
		}
	}
	// Runtime-bound options receive the same projection and validation as literals.
	bound := selectionNode(nil)
	delete(bound.Props, "options")
	bound.Bindings = map[string]string{"options": "options"}
	projected, err := nativePlan(t, bound).ResolveNative("profile-region", RenderContext{Data: map[string]any{"options": options}}, NativeCapabilities())
	if err != nil || !reflect.DeepEqual(projected.Children[0].Props["options"], options) {
		t.Fatalf("bound options: %#v %v", projected, err)
	}
}
func TestNativeSelectionRejectsUnrepresentableOptions(t *testing.T) {
	for _, options := range []any{[]any{}, []any{map[string]any{"value": "dark", "label": "A"}, map[string]any{"value": "dark", "label": "B"}}, []any{map[string]any{"value": "", "label": "Empty"}}, []any{map[string]any{"value": "dark", "label": ""}}, []any{map[string]any{"value": "light", "label": "Light"}}} {
		if _, err := nativePlan(t, selectionNode(options)).ResolveNative("profile-region", RenderContext{}, NativeCapabilities()); !errors.Is(err, ErrUnsupportedNative) {
			t.Fatalf("invalid options %#v accepted: %v", options, err)
		}
	}
}
func TestSelectionAuthoringContractIsClosedAndTyped(t *testing.T) {
	registry, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	valid := []any{map[string]any{"value": "dark", "label": "Dark"}}
	cases := []Node{}
	for _, options := range []any{nil, "dark", []any{1}, []any{map[string]any{"value": 1, "label": "Dark"}}, []any{map[string]any{"value": "dark"}}, []any{map[string]any{"value": "dark", "label": "Dark", "disabled": true}}, make([]any, 65)} {
		cases = append(cases, selectionNode(options))
	}
	for _, prop := range []string{"multiple", "placeholder", "readonly", "required"} {
		n := selectionNode(valid)
		n.Props[prop] = false
		cases = append(cases, n)
	}
	for _, prop := range []string{"indeterminate", "readonly", "required"} {
		cases = append(cases, Node{ID: "consent", Type: "checkbox", Props: map[string]any{"name": "consent", "label": "Consent", prop: false}})
	}
	for _, node := range cases {
		if _, err := Compile(Screen{Version: Version, ID: "profile", Root: Node{ID: "profile-region", Type: "region", Children: []Node{node}}}, registry); err == nil {
			t.Fatalf("invalid node accepted: %#v", node)
		}
	}
}
