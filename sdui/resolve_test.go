package sdui

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"
)

func TestSemanticPlanNeedsNoRenderer(t *testing.T) {
	registry := NewRegistry()
	definitions := []Definition{
		{Name: "region", Container: Region},
		{Name: "card", Properties: map[string]Property{"title": {Type: String, Required: true}}, Slots: map[string]SlotDefinition{"content": {Required: true, AllowedTypes: []string{"label"}, MaxNodes: 2}}},
		{Name: "label", Properties: map[string]Property{"text": {Type: String, Required: true}}, Events: []string{"click"}},
	}
	for _, d := range definitions {
		if err := registry.Register(d); err != nil {
			t.Fatal(err)
		}
	}
	label := Node{ID: "label", Type: "label", Bindings: map[string]string{"text": "/message"}, Event: &Event{On: "click", Action: "save", Target: "region", Payload: map[string]PayloadBinding{"value": {Type: String, Path: "/value"}}}}
	cardNode := Node{ID: "card", Type: "card", Props: map[string]any{"title": "<ordinary text>"}, Slots: map[string][]Node{"content": {label}}}
	screen := Screen{Version: Version, ID: "screen", Root: Node{ID: "region", Type: "region", Children: []Node{cardNode}}}

	plan, err := Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	ctx := ResolveContext{Data: map[string]any{"message": "<script>ordinary data</script>"}}
	nodes, err := plan.Resolve(ctx)
	if err != nil {
		t.Fatal(err)
	}
	card := nodes[0].Children[0]
	if card.Type != "card" || card.Props["title"] != "<ordinary text>" || card.Slots["content"][0].Props["text"] != ctx.Data["message"] {
		t.Fatalf("semantic data changed: %#v", nodes)
	}
	if card.ID == card.ControlID || card.ControlID == "" {
		t.Fatal("control identity missing")
	}
	// Every surface returned by the plan is detached, including nested event maps.
	card.Props["title"] = "mutated"
	card.Slots["content"][0].Events[0].Payload["value"] = PayloadBinding{Type: Integer, Path: "/wrong"}
	defs := plan.Definitions()
	defs[0].Properties["title"] = Property{Type: Boolean}
	events := plan.Events()
	events[0].Payload["value"] = PayloadBinding{Type: Integer, Path: "/wrong"}
	again, err := plan.Resolve(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if again[0].Children[0].Props["title"] != "<ordinary text>" || again[0].Children[0].Slots["content"][0].Events[0].Payload["value"].Type != String {
		t.Fatal("projection mutation changed plan")
	}
	region, err := plan.ResolveRegion("region", ctx)
	if err != nil || !reflect.DeepEqual(region, again) {
		t.Fatalf("region differs: %v", err)
	}
	if _, err := plan.Resolve(ResolveContext{}); err == nil {
		t.Fatal("missing binding accepted")
	}
	if _, err := plan.ResolveRegion("absent", ctx); err == nil {
		t.Fatal("absent region accepted")
	}
	if err := plan.ValidateActions(map[string][]string{"save": {"region"}}); err != nil {
		t.Fatal(err)
	}
}

func TestSemanticResolutionStableReuseAndConcurrentSnapshots(t *testing.T) {
	registry, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	screen := Screen{Version: Version, ID: "screen", Templates: map[string]TemplateDefinition{
		"row": {Params: map[string]Property{"label": {Type: String, Required: true}}, Root: Node{ID: "item", Type: "text", Bindings: map[string]string{"text": "/@params/label"}}},
	}, Root: Node{ID: "region", Type: "region", Children: []Node{{ID: "row", Use: "row", Repeat: &Repeat{Items: "/items", As: "item", Key: "/id"}, ParamBindings: map[string]string{"label": "/@vars/item/label"}}}}}
	plan, err := Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	data := map[string]any{"items": []any{map[string]any{"id": "a", "label": "A"}, map[string]any{"id": "b", "label": "B"}}}
	nodes, err := plan.Resolve(ResolveContext{Data: data})
	if err != nil {
		t.Fatal(err)
	}
	ids := map[any]string{}
	for _, child := range nodes[0].Children {
		ids[child.Props["text"]] = child.ID
	}
	reverse := map[string]any{"items": []any{data["items"].([]any)[1], data["items"].([]any)[0]}}
	nodes, err = plan.Resolve(ResolveContext{Data: reverse})
	if err != nil {
		t.Fatal(err)
	}
	for _, child := range nodes[0].Children {
		if child.ID != ids[child.Props["text"]] {
			t.Fatal("key identity changed after reorder")
		}
	}
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 8; j++ {
				nodes, err := plan.Resolve(ResolveContext{Data: data})
				if err != nil {
					t.Error(err)
					return
				}
				nodes[0].Children[0].Props["text"] = "mutated"
			}
		}()
	}
	wg.Wait()
}

func TestNativeCoreWithoutHTMLTemplates(t *testing.T) {
	registry, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	screen := Screen{Version: Version, ID: "profile", Root: Node{ID: "profile-region", Type: "region", Children: []Node{{ID: "choice", Type: "select", Props: map[string]any{"name": "choice", "label": "Choice", "value": "a", "options": []any{map[string]any{"value": "a", "label": "Alpha"}}}}}}}
	plan, err := Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	result, err := plan.ResolveNative("profile-region", ResolveContext{}, NativeCapabilities())
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(encoded), `"options":[{"label":"Alpha","value":"a"}]`) {
		t.Fatalf("native wire changed: %s", encoded)
	}
	if _, err := plan.ResolveNative("profile-region", ResolveContext{}, []string{"region"}); err == nil {
		t.Fatal("missing capability accepted")
	}
}

func TestRegistryCloneIndependentExtension(t *testing.T) {
	registry := NewRegistry()
	if err := registry.Register(Definition{Name: "first", Properties: map[string]Property{"text": {Type: String, Default: "original"}}}); err != nil {
		t.Fatal(err)
	}
	clone := registry.Clone()
	if err := clone.Register(Definition{Name: "second"}); err != nil {
		t.Fatal(err)
	}
	if _, ok := registry.Definition("second"); ok {
		t.Fatal("clone extension mutated source")
	}
	d, ok := clone.Definition("first")
	if !ok {
		t.Fatal("missing copied definition")
	}
	d.Properties["text"] = Property{Type: Boolean}
	d, _ = registry.Definition("first")
	if d.Properties["text"].Default != "original" {
		t.Fatal("lookup mutation escaped snapshot")
	}
}

// Architectural regression: the semantic package cannot acquire HTML template
// execution or any UI/renderer dependency. Tests may import markup types solely
// to verify that normalization rejects executable host values.
func TestSemanticPackageHasNoRendererImports(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(token.NewFileSet(), name, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(file, func(node ast.Node) bool {
			imp, ok := node.(*ast.ImportSpec)
			if !ok {
				return true
			}
			path := strings.Trim(imp.Path.Value, `"`)
			if path == "html/template" || strings.Contains(path, "/ui/") || strings.Contains(path, "/adapters/") || strings.HasSuffix(path, "/ely-htmx") || strings.HasSuffix(path, "/elysdui") {
				t.Error(fmt.Sprintf("%s imports renderer dependency %s", name, path))
			}
			return true
		})
	}
	for _, name := range []string{"Template", "Chapter", "Component", "Family", "Assets", "SandboxHTML", "InertData"} {
		if _, ok := reflect.TypeFor[Definition]().FieldByName(name); ok {
			t.Errorf("semantic Definition contains renderer selector %s", name)
		}
	}
}

func TestSemanticPropertiesHaveNoRendererTargets(t *testing.T) {
	for _, typ := range []reflect.Type{reflect.TypeFor[Property](), reflect.TypeFor[SlotDefinition]()} {
		if _, ok := typ.FieldByName("Target"); ok {
			t.Fatalf("%s contains renderer Target", typ)
		}
	}
}
