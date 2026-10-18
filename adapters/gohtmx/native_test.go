package gohtmx

import (
	"bytes"
	"encoding/json"
	"errors"
	core "github.com/mrchypark/elysdui/sdui"
	"reflect"
	"strings"
	"testing"
)

func nativePlan(t *testing.T, children ...Node) *Plan {
	t.Helper()
	registry, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	plan, err := Compile(Screen{Version: Version, ID: "profile", Root: Node{ID: "profile-region", Type: "region", Children: children}}, registry)
	if err != nil {
		t.Fatal(err)
	}
	return plan
}

func TestResolveNativeUsesValidatedComposition(t *testing.T) {
	registry, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	screen := Screen{Version: Version, ID: "profile", Templates: map[string]TemplateDefinition{
		"row": {Params: map[string]core.Property{"caption": {Type: String, Required: true}}, Root: Node{ID: "caption", Type: "text", Bindings: map[string]string{"text": "/@params/caption"}}},
	}, Root: Node{ID: "profile-region", Type: "region", Children: []Node{
		{ID: "greeting", Type: "text", Bindings: map[string]string{"text": "name"}},
		{ID: "conditional", Type: "notice", Props: map[string]any{"text": "Visible"}, When: &Condition{Op: "eq", Path: "show", Value: true}},
		{ID: "repeated", Use: "row", ParamBindings: map[string]string{"caption": "/@vars/item/name"}, Repeat: &Repeat{Items: "items", As: "item", Key: "/id"}},
	}}}
	plan, err := Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	data := map[string]any{"name": "<script>literal</script>", "show": false, "items": []any{map[string]any{"id": "a", "name": "Alpha"}, map[string]any{"id": "b", "name": "Beta"}}}
	tree, err := plan.ResolveNative("profile-region", RenderContext{Data: data}, NativeCapabilities())
	if err != nil {
		t.Fatal(err)
	}
	if len(tree.Children) != 3 || tree.Children[0].Props["text"] != "<script>literal</script>" {
		t.Fatalf("wrong resolved children: %#v", tree.Children)
	}
	if tree.Children[1].Props["text"] != "Alpha" || tree.Children[2].Props["text"] != "Beta" {
		t.Fatal("template/repeat not resolved")
	}
	var html bytes.Buffer
	if err := plan.RenderRegion(&html, "profile-region", RenderContext{Data: data}); err != nil {
		t.Fatal(err)
	}
	for _, node := range tree.Children {
		if !strings.Contains(html.String(), `id="`+node.ID+`"`) {
			t.Errorf("HTML/native identity mismatch: %s", node.ID)
		}
	}
	if strings.Contains(html.String(), "<script>literal</script>") {
		t.Fatal("web escape regression")
	}
	data["items"] = []any{map[string]any{"id": "b", "name": "Beta"}, map[string]any{"id": "a", "name": "Alpha"}}
	reordered, err := plan.ResolveNative("profile-region", RenderContext{Data: data}, NativeCapabilities())
	if err != nil {
		t.Fatal(err)
	}
	if reordered.Children[1].ID != tree.Children[2].ID || reordered.Children[2].ID != tree.Children[1].ID {
		t.Fatal("native repeat identities are index-based")
	}
	encoded, err := json.Marshal(tree)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "bindings") || strings.Contains(string(encoded), "/@vars") || strings.Contains(string(encoded), "template") {
		t.Fatal("authoring expressions leaked into native output")
	}
	tree.Children[0].Props["text"] = "mutated client copy"
	again, err := plan.ResolveNative("profile-region", RenderContext{Data: data}, NativeCapabilities())
	if err != nil {
		t.Fatal(err)
	}
	if again.Children[0].Props["text"] != "<script>literal</script>" {
		t.Fatal("returned map aliases compiled state")
	}
}

func TestResolveNativeActionAndProperties(t *testing.T) {
	plan := nativePlan(t, Node{ID: "form", Type: "form", Event: &Event{On: "submit", Action: "save-profile", Target: "profile-region"}, Children: []Node{
		{ID: "display-name", Type: "input", Props: map[string]any{"name": "displayName", "label": "Display name"}, Bindings: map[string]string{"value": "name"}},
		{ID: "save", Type: "button", Props: map[string]any{"type": "submit", "label": "Save"}},
	}})
	tree, err := plan.ResolveNative("profile-region", RenderContext{Data: map[string]any{"name": "Ada"}}, NativeCapabilities())
	if err != nil {
		t.Fatal(err)
	}
	form := tree.Children[0]
	if !reflect.DeepEqual(form.Events, []Event{{On: "submit", Action: "save-profile", Target: "profile-region"}}) {
		t.Fatalf("wrong actions: %#v", form.Events)
	}
	input := form.Children[0]
	if input.Props["label"] != "Display name" || input.Props["value"] != "Ada" || input.Props["type"] != "text" {
		t.Fatal("wire props missing defaults/bindings")
	}
	if _, ok := input.Props["AriaLabel"]; ok {
		t.Fatal("HTML template target leaked")
	}
	if _, err := plan.ResolveNative("profile-region", RenderContext{Data: map[string]any{"name": "Ada"}}, []string{"region", "form", "button"}); !errors.Is(err, ErrUnsupportedNative) {
		t.Fatalf("missing capability accepted: %v", err)
	}
}

func TestResolveNativeFailsClosed(t *testing.T) {
	cases := []struct {
		name string
		node Node
	}{
		{"file", Node{ID: "field", Type: "input", Props: map[string]any{"name": "attachment", "label": "Attachment", "type": "file"}}},
		{"password", Node{ID: "field", Type: "input", Props: map[string]any{"name": "password", "label": "Password", "type": "password"}}},
		{"default-button", Node{ID: "default-button", Type: "button", Props: map[string]any{"label": "Default"}}},
		{"non-submit-button", Node{ID: "non-submit-button", Type: "button", Props: map[string]any{"label": "Button", "type": "button"}}},
		{"reset", Node{ID: "reset", Type: "button", Props: map[string]any{"label": "Reset", "type": "reset"}}},
		{"submitter", Node{ID: "save", Type: "button", Props: map[string]any{"label": "Save", "name": "intent", "value": "save"}}},
		{"change-event", Node{ID: "field", Type: "input", Props: map[string]any{"name": "name", "label": "Name"}, Event: &Event{On: "change", Action: "save", Target: "profile-region"}}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			plan := nativePlan(t, test.node)
			_, err := plan.ResolveNative("profile-region", RenderContext{}, append(NativeCapabilities(), "switch"))
			if !errors.Is(err, ErrUnsupportedNative) {
				t.Fatalf("unsupported node accepted: %v", err)
			}
		})
	}
	plan := nativePlan(t, Node{ID: "name", Type: "text", Bindings: map[string]string{"text": "missing"}})
	if _, err := plan.ResolveNative("profile-region", RenderContext{}, NativeCapabilities()); err == nil {
		t.Fatal("missing binding accepted")
	}
	if _, err := plan.ResolveNative("missing", RenderContext{}, NativeCapabilities()); err == nil {
		t.Fatal("unknown region accepted")
	}
	var nilPlan *Plan
	if _, err := nilPlan.ResolveNative("x", RenderContext{}, NativeCapabilities()); err == nil {
		t.Fatal("nil plan accepted")
	}
}

func TestResolveNativeBoundsAndDuplicateKeys(t *testing.T) {
	plan := nativePlan(t, Node{ID: "row", Type: "text", Bindings: map[string]string{"text": "/@vars/item/name"}, Repeat: &Repeat{Items: "items", As: "item", Key: "/id"}})
	for _, items := range [][]any{
		{map[string]any{"id": "same", "name": "A"}, map[string]any{"id": "same", "name": "B"}},
		make([]any, MaxNodes+1),
	} {
		if _, err := plan.ResolveNative("profile-region", RenderContext{Data: map[string]any{"items": items}}, NativeCapabilities()); err == nil {
			t.Fatal("bad repeat accepted")
		}
	}
	children := make([]Node, 80)
	for i := range children {
		children[i] = Node{ID: "node" + string(rune('A'+i)), Type: "text", Props: map[string]any{"text": strings.Repeat("x", MaxStringBytes)}}
	}
	// Use valid ASCII IDs for the output-byte boundary fixture.
	for i := range children {
		children[i].ID = "node-" + strings.Repeat("a", i+1)
	}
	big := nativePlan(t, children...)
	if _, err := big.ResolveNative("profile-region", RenderContext{}, NativeCapabilities()); err == nil {
		t.Fatal("oversized native output accepted")
	}
}

func TestDecodeNativeActionStrict(t *testing.T) {
	valid := `{"protocolVersion":"1","screenID":"profile","screenRevision":"v1","sessionID":"session","requestID":"request","dataVersion":0,"nodeID":"form","event":"submit","action":"save","target":"region","fields":{"displayName":"Ada"},"editRevisions":{"displayName":1},"capabilities":["text"]}`
	request, err := DecodeNativeAction(strings.NewReader(valid))
	if err != nil || request.Fields["displayName"] != "Ada" {
		t.Fatalf("valid action failed: %v", err)
	}
	invalid := []string{
		valid + ` {}`, `[]`, `null`, strings.Replace(valid, `"protocolVersion":"1"`, `"protocolVersion":"1","ProtocolVersion":"2"`, 1),
		strings.Replace(valid, `"dataVersion":0`, `"dataVersion":9007199254740992`, 1),
		strings.Replace(valid, `"dataVersion":0`, `"dataVersion":-1`, 1),
		strings.Replace(valid, `"fields":`, `"unknown":true,"fields":`, 1),
		strings.Replace(valid, `"displayName":"Ada"`, `"displayName":true`, 1),
		strings.Replace(valid, `"displayName":"Ada"`, `"displayName":"`+strings.Repeat("x", MaxStringBytes+1)+`"`, 1),
		strings.Repeat(" ", MaxNativeActionBytes+1) + valid,
		string([]byte{'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'}),
	}
	for i, value := range invalid {
		if _, err := DecodeNativeAction(strings.NewReader(value)); err == nil {
			t.Errorf("invalid action %d accepted", i)
		}
	}
}

func TestResolveNativeRejectsLookalikeRegistryContracts(t *testing.T) {
	registry, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	// Registry owners are trusted, but a reused type name is not a native adapter.
	replacement := NewRegistry(registry.templates)
	for _, definition := range registry.Definitions() {
		if definition.Name == "text" {
			definition.Properties = map[string]Property{"label": {Type: String, Target: "Text", Required: true}}
		}
		if err := replacement.Register(definition); err != nil {
			t.Fatal(err)
		}
	}
	registry = replacement
	plan, err := Compile(Screen{Version: Version, ID: "profile", Root: Node{ID: "profile-region", Type: "region", Children: []Node{{ID: "label", Type: "text", Props: map[string]any{"label": "Not the core text contract"}}}}}, registry)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := plan.ResolveNative("profile-region", RenderContext{}, NativeCapabilities()); !errors.Is(err, ErrUnsupportedNative) {
		t.Fatalf("custom contract mislabeled native: %v", err)
	}
}

func TestResolveNativeSwitchUsesExplicitCapabilityAndNoChangeAction(t *testing.T) {
	node := Node{ID: "notifications", Type: "switch", Props: map[string]any{"name": "notifications", "label": "Notifications", "checked": true}}
	plan := nativePlan(t, node)
	result, err := plan.ResolveNative("profile-region", RenderContext{}, NativeCapabilities())
	if err != nil {
		t.Fatal(err)
	}
	if result.Children[0].Type != "switch" || result.Children[0].Props["checked"] != true {
		t.Fatalf("unexpected switch: %#v", result)
	}
	if _, err := plan.ResolveNative("profile-region", RenderContext{}, []string{"region"}); !errors.Is(err, ErrUnsupportedNative) {
		t.Fatal("missing switch capability accepted")
	}
	node.Event = &Event{On: "change", Action: "save", Target: "profile-region"}
	plan = nativePlan(t, node)
	if _, err := plan.ResolveNative("profile-region", RenderContext{}, NativeCapabilities()); !errors.Is(err, ErrUnsupportedNative) {
		t.Fatal("unregistered change event accepted")
	}
}
