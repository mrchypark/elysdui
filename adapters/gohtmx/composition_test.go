package gohtmx

import (
	"bytes"
	"fmt"
	core "github.com/mrchypark/elysdui/sdui"
	"html/template"
	"io"
	"regexp"
	"sort"
	"strings"
	"sync"
	"testing"
)

func compileComposition(t *testing.T, screen Screen) *Plan {
	t.Helper()
	plan, err := Compile(screen, schemaRegistry(t))
	if err != nil {
		t.Fatal(err)
	}
	return plan
}
func renderComposition(t *testing.T, plan *Plan, data map[string]any) string {
	t.Helper()
	var output bytes.Buffer
	if err := plan.Render(&output, RenderContext{Data: data, Revision: "revision-1"}); err != nil {
		t.Fatal(err)
	}
	checkUniqueDOMIDs(t, output.String())
	return output.String()
}
func compositionScreen(node Node) Screen {
	return Screen{Version: Version, ID: "screen", Root: Node{ID: "root", Type: "region", Children: []Node{node}}}
}

func TestJSONPointerBindings(t *testing.T) {
	screen := compositionScreen(Node{ID: "message", Type: "text", Bindings: map[string]string{"text": "/@data/items/0/a~1b/~0value"}})
	data := map[string]any{"items": []any{map[string]any{"a/b": map[string]any{"~value": "<safe>"}}}}
	if got := renderComposition(t, compileComposition(t, screen), data); !strings.Contains(got, "&lt;safe&gt;") || !strings.Contains(got, `data-sdui-revision="revision-1"`) {
		t.Fatal(got)
	}

}

func reusableScreen() Screen {
	screen := compositionScreen(Node{ID: "first", Use: "card", Params: map[string]any{"label": "First"}})
	screen.Root.Children = append(screen.Root.Children, Node{ID: "second", Use: "card", ParamBindings: map[string]string{"label": "/message"}})
	screen.Templates = map[string]TemplateDefinition{"card": {Params: map[string]core.Property{"label": {Type: String, Required: true}}, Root: Node{ID: "cardRoot", Type: "stack", Children: []Node{{ID: "text", Type: "text", Bindings: map[string]string{"text": "/@params/label"}}, {ID: "target", Type: "region", Children: []Node{{ID: "button", Type: "button", Props: map[string]any{"label": "Save"}, Event: &Event{On: "click", Action: "save", Target: "target"}}}}}}}}
	return screen
}

func TestReusableTemplatesParamsIDsAndPartialRegions(t *testing.T) {
	screen := reusableScreen()
	plan := compileComposition(t, screen)
	if !plan.HasRegion("first--target") || !plan.HasRegion("second--target") {
		t.Fatalf("missing expanded regions: %v", plan.Definitions())
	}
	rendered := renderComposition(t, plan, map[string]any{"message": "Second"})
	for _, want := range []string{"First", "Second", `id="first"`, `id="first--text"`, `data-sdui-target="first--target"`, `data-sdui-target="second--target"`} {
		if !strings.Contains(rendered, want) {
			t.Errorf("missing %q", want)
		}
	}
	if err := plan.ValidateActions(map[string][]string{"save": {"first--target", "second--target"}}); err != nil {
		t.Fatal(err)
	}
	// A region rooted in a template needs the caller's bound lexical parameters.
	screen.Templates["card"] = TemplateDefinition{Params: map[string]core.Property{"label": {Type: String, Required: true}}, Root: Node{ID: "cardRoot", Type: "region", Children: []Node{{ID: "text", Type: "text", Bindings: map[string]string{"text": "/@params/label"}}}}}
	plan = compileComposition(t, screen)
	var output bytes.Buffer
	if err := plan.RenderRegion(&output, "second", RenderContext{Data: map[string]any{"message": "Partial"}}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), `<section id="second"`) || !strings.Contains(output.String(), "Partial") {
		t.Fatal(output.String())
	}
	// Compilation snapshots both literals and conditions.
	screen.Root.Children[0].Params["label"] = "changed"
	if strings.Contains(renderComposition(t, plan, map[string]any{"message": "Second"}), "changed") {
		t.Fatal("source mutation changed plan")
	}
}

func TestNestedTemplateScopesAndTargets(t *testing.T) {
	screen := compositionScreen(Node{ID: "outer", Use: "outer", Params: map[string]any{"label": "Nested"}})
	screen.Templates = map[string]TemplateDefinition{
		"outer": {Params: map[string]core.Property{"label": {Type: String, Required: true}}, Root: Node{ID: "root", Type: "region", Children: []Node{{ID: "inner", Use: "inner", ParamBindings: map[string]string{"text": "/@params/label"}}}}},
		"inner": {Params: map[string]core.Property{"text": {Type: String, Required: true}}, Root: Node{ID: "innerRoot", Type: "button", Bindings: map[string]string{"label": "/@params/text"}, Event: &Event{On: "click", Action: "save", Target: "root"}}},
	}
	// Local root in the outer template shadows the global root for its nested use.
	plan := compileComposition(t, screen)
	got := renderComposition(t, plan, nil)
	if !strings.Contains(got, "Nested") || !strings.Contains(got, `data-sdui-target="outer"`) {
		t.Fatal(got)
	}
	var partial bytes.Buffer
	if err := plan.RenderRegion(&partial, "outer", RenderContext{}); err != nil {
		t.Fatal(err)
	}
}

func TestTemplateValidation(t *testing.T) {
	cases := map[string]func(*Screen){
		"unknown template":           func(s *Screen) { s.Root.Children[0].Use = "missing" },
		"missing parameter":          func(s *Screen) { s.Root.Children[0].Params = nil },
		"unknown parameter":          func(s *Screen) { s.Root.Children[0].Params["extra"] = "x" },
		"wrong parameter type":       func(s *Screen) { s.Root.Children[0].Params["label"] = true },
		"duplicate parameter source": func(s *Screen) { s.Root.Children[0].ParamBindings = map[string]string{"label": "/value"} },
		"mixed use and type":         func(s *Screen) { s.Root.Children[0].Type = "text" },
		"mixed use and props":        func(s *Screen) { s.Root.Children[0].Props = map[string]any{"text": "x"} },
		"unknown parameter binding": func(s *Screen) {
			d := s.Templates["card"]
			d.Root.Children[0].Bindings["text"] = "/@params/unknown"
			s.Templates["card"] = d
		},
		"self cycle": func(s *Screen) { s.Templates["loop"] = TemplateDefinition{Root: Node{ID: "loop", Use: "loop"}} },
		"indirect cycle": func(s *Screen) {
			s.Templates["a"] = TemplateDefinition{Root: Node{ID: "a", Use: "b"}}
			s.Templates["b"] = TemplateDefinition{Root: Node{ID: "b", Use: "a"}}
		},
		"unused unknown reference": func(s *Screen) { s.Templates["unused"] = TemplateDefinition{Root: Node{ID: "unused", Use: "missing"}} },
		"unused invalid type":      func(s *Screen) { s.Templates["unused"] = TemplateDefinition{Root: Node{ID: "unused", Type: "missing"}} },
		"parameter renderer target": func(s *Screen) {
			d := s.Templates["card"]
			d.Params["label"] = core.Property{Type: String, Format: "sandbox-html"}
			s.Templates["card"] = d
		},
		"duplicate local ID": func(s *Screen) { d := s.Templates["card"]; d.Root.Children[1].ID = "text"; s.Templates["card"] = d },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			s := reusableScreen()
			mutate(&s)
			if _, err := Compile(s, schemaRegistry(t)); err == nil {
				t.Fatal("invalid composition accepted")
			}
		})
	}
	// Decode checks nested property/condition/repeat fields as strictly as nodes.
	for _, input := range []string{
		`{"version":"1","id":"s","templates":{"x":{"params":{"p":{"type":"string","unknown":true}},"root":{"id":"n","type":"text"}}},"root":{"id":"r","type":"stack"}}`,
		`{"root":{"when":{"op":"exists","path":"/x","eval":"true"}}}`,
		`{"root":{"repeat":{"items":"/x","as":"x","key":"/id","index":true}}}`,
	} {
		if _, err := Decode(strings.NewReader(input)); err == nil {
			t.Fatal("unknown nested JSON field accepted")
		}
	}
}

func TestConditionsTypedHiddenValidationAndMissingData(t *testing.T) {
	condition := &Condition{Op: "all", Conditions: []Condition{{Op: "exists", Path: "/visible"}, {Op: "eq", Path: "/visible", Value: true}, {Op: "not", Conditions: []Condition{{Op: "eq", Path: "/state", Value: "hidden"}}}}}
	screen := compositionScreen(Node{ID: "text", Type: "text", When: condition, Bindings: map[string]string{"text": "/message"}})
	plan := compileComposition(t, screen)
	if got := renderComposition(t, plan, nil); strings.Contains(got, `id="text"`) {
		t.Fatal("hidden node rendered")
	}
	if got := renderComposition(t, plan, map[string]any{"visible": true, "state": "shown", "message": "Visible"}); !strings.Contains(got, "Visible") {
		t.Fatal(got)
	}
	var output bytes.Buffer
	if err := plan.Render(&output, RenderContext{Data: map[string]any{"visible": "true"}}); err == nil || output.Len() != 0 {
		t.Fatal("wrong condition type accepted or output escaped")
	}
	screen.Root.Children[0].Props = map[string]any{"unknown": "x"}
	if _, err := Compile(screen, schemaRegistry(t)); err == nil {
		t.Fatal("hidden branch skipped compile validation")
	}

}

func repeatedScreen() Screen {
	return compositionScreen(Node{ID: "row", Type: "stack", Repeat: &Repeat{Items: "/items", As: "item", Key: "/id"}, Children: []Node{{ID: "label", Type: "text", Bindings: map[string]string{"text": "/@vars/item/label"}}, {ID: "button", Type: "button", Props: map[string]any{"label": "Save"}, Event: &Event{On: "click", Action: "save", Target: "root"}}}})
}
func repeatIDs(markup string) []string {
	matches := regexp.MustCompile(` id="([^"]+)"`).FindAllStringSubmatch(markup, -1)
	ids := make([]string, 0, len(matches))
	for _, match := range matches {
		ids = append(ids, match[1])
	}
	sort.Strings(ids)
	return ids
}

func TestRepeatStableIDsTypedKeysAndTargets(t *testing.T) {
	plan := compileComposition(t, repeatedScreen())
	a := map[string]any{"id": "a", "label": "Alpha"}
	b := map[string]any{"id": "b", "label": "Beta"}
	first := renderComposition(t, plan, map[string]any{"items": []any{a, b}})
	second := renderComposition(t, plan, map[string]any{"items": []any{b, a}})
	if fmt.Sprint(repeatIDs(first)) != fmt.Sprint(repeatIDs(second)) {
		t.Fatal("repeat IDs changed on reorder")
	}
	if strings.Index(first, "Alpha") > strings.Index(first, "Beta") || strings.Index(second, "Beta") > strings.Index(second, "Alpha") {
		t.Fatal("repeat order ignored")
	}
	if strings.Count(first, `data-sdui-target="root"`) != 2 {
		t.Fatal("repeat rewrote stable target")
	}
	renderComposition(t, plan, map[string]any{"items": []any{map[string]any{"id": "1", "label": "String"}, map[string]any{"id": 1, "label": "Number"}}})
	if got := renderComposition(t, plan, map[string]any{"items": []any{}}); strings.Contains(got, "sdui-repeat-") {
		t.Fatal(got)
	}
	for name, items := range map[string]any{"missing": nil, "wrong array": "x", "missing key": []any{map[string]any{"label": "x"}}, "duplicate": []any{a, a}, "object key": []any{map[string]any{"id": map[string]any{}, "label": "x"}}, "float key": []any{map[string]any{"id": 1.5, "label": "x"}}, "HTML key": []any{map[string]any{"id": template.HTML("x"), "label": "x"}}} {
		t.Run(name, func(t *testing.T) {
			var output bytes.Buffer
			if err := plan.Render(&output, RenderContext{Data: map[string]any{"items": items}}); err == nil || output.Len() != 0 {
				t.Fatal("invalid repeat accepted or output escaped")
			}
		})
	}
}

func TestRepeatedTemplatesAndNestedRepeats(t *testing.T) {
	screen := compositionScreen(Node{ID: "row", Use: "row", Repeat: &Repeat{Items: "/items", As: "item", Key: "/id"}, ParamBindings: map[string]string{"label": "/@vars/item/label"}})
	screen.Templates = map[string]TemplateDefinition{"row": {Params: map[string]core.Property{"label": {Type: String, Required: true}}, Root: Node{ID: "text", Type: "text", Bindings: map[string]string{"text": "/@params/label"}}}}
	plan := compileComposition(t, screen)
	if got := renderComposition(t, plan, map[string]any{"items": []any{map[string]any{"id": 1, "label": "One"}, map[string]any{"id": 2, "label": "Two"}}}); !strings.Contains(got, "One") || !strings.Contains(got, "Two") {
		t.Fatal(got)
	}
	nested := repeatedScreen()
	nested.Root.Children[0].Children = []Node{{ID: "child", Type: "text", Repeat: &Repeat{Items: "/@vars/item/children", As: "child", Key: ""}, Bindings: map[string]string{"text": "/@vars/child"}}}
	plan = compileComposition(t, nested)
	renderComposition(t, plan, map[string]any{"items": []any{map[string]any{"id": "a", "children": []any{"One", "Two"}}, map[string]any{"id": "b", "children": []any{"One", "Two"}}}})
}

func TestStableRegionAndFormInvariants(t *testing.T) {
	for name, node := range map[string]Node{
		"conditional region":   {ID: "unstable", Type: "region", When: &Condition{Op: "exists", Path: "/show"}},
		"repeated region":      {ID: "unstable", Type: "region", Repeat: &Repeat{Items: "/items", As: "item", Key: "/id"}},
		"conditional ancestor": {ID: "parent", Type: "stack", When: &Condition{Op: "exists", Path: "/show"}, Children: []Node{{ID: "unstable", Type: "region"}}},
		"repeated ancestor":    {ID: "parent", Type: "stack", Repeat: &Repeat{Items: "/items", As: "item", Key: "/id"}, Children: []Node{{ID: "unstable", Type: "region"}}},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Compile(compositionScreen(node), schemaRegistry(t)); err == nil {
				t.Fatal("unstable region accepted")
			}
		})
	}
	r := schemaRegistry(t)
	if err := r.Register(Definition{Name: "contains-form", Template: "sdui-text", ContainsForm: true}); err != nil {
		t.Fatal(err)
	}
	s := compositionScreen(Node{ID: "form", Type: "form", Children: []Node{{ID: "widget", Type: "contains-form"}}})
	if _, err := Compile(s, r); err == nil {
		t.Fatal("catalogue form nested in structural form")
	}
}

func TestSlotsSafetyAndLimits(t *testing.T) {
	r := schemaRegistry(t)
	if _, err := r.templates.New("slot-card").Parse(`<article>{{.Content}}</article>`); err != nil {
		t.Fatal(err)
	}
	if err := r.Register(Definition{Name: "slot-card", Template: "slot-card", Family: "foundation", Slots: map[string]SlotDefinition{"content": {Target: "Content", Required: true, AllowedTypes: []string{"text"}, MaxNodes: 3}}}); err != nil {
		t.Fatal(err)
	}
	screen := compositionScreen(Node{ID: "card", Type: "slot-card", Slots: map[string][]Node{"content": {{ID: "text", Type: "text", Props: map[string]any{"text": "<script>unsafe</script>"}}}}})
	plan, err := Compile(screen, r)
	if err != nil {
		t.Fatal(err)
	}
	got := renderComposition(t, plan, nil)
	if !strings.Contains(got, "<article><div") || strings.Contains(got, "<script>") {
		t.Fatal(got)
	}
	for name, mutate := range map[string]func(*Screen){
		"unknown slot":         func(s *Screen) { s.Root.Children[0].Slots["unknown"] = s.Root.Children[0].Slots["content"] },
		"required slot":        func(s *Screen) { s.Root.Children[0].Slots = nil },
		"unsupported type":     func(s *Screen) { s.Root.Children[0].Slots["content"] = []Node{{ID: "stack", Type: "stack"}} },
		"raw content property": func(s *Screen) { s.Root.Children[0].Props = map[string]any{"Content": "<b>raw</b>"} },
	} {
		t.Run(name, func(t *testing.T) {
			copy := screen
			copy.Root.Children = append([]Node(nil), screen.Root.Children...)
			copy.Root.Children[0].Slots = map[string][]Node{"content": screen.Root.Children[0].Slots["content"]}
			mutate(&copy)
			if _, err := Compile(copy, r); err == nil {
				t.Fatal("invalid slot accepted")
			}
		})
	}
	repeated := screen
	repeated.Root.Children[0].Slots["content"] = []Node{{ID: "text", Type: "text", Repeat: &Repeat{Items: "/items", As: "item", Key: ""}, Bindings: map[string]string{"text": "/@vars/item"}}}
	plan, err = Compile(repeated, r)
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := plan.Render(&output, RenderContext{Data: map[string]any{"items": []any{"a", "b", "c", "d"}}}); err == nil || output.Len() != 0 {
		t.Fatal("runtime slot limit ignored")
	}
}

func TestCompositionExpandedBudgetsAndConcurrency(t *testing.T) {
	plan := compileComposition(t, repeatedScreen())
	items := make([]any, 400)
	for i := range items {
		items[i] = map[string]any{"id": i, "label": "x"}
	}
	var output bytes.Buffer
	if err := plan.Render(&output, RenderContext{Data: map[string]any{"items": items}}); err == nil || output.Len() != 0 {
		t.Fatal("expanded node budget ignored")
	}
	screen := compositionScreen(Node{ID: "start", Use: "leaf"})
	screen.Templates = map[string]TemplateDefinition{"leaf": {Root: Node{ID: "leaf", Type: "text", Props: map[string]any{"text": "x"}}}}
	for i := 0; i < 10; i++ {
		previous := "leaf"
		if i > 0 {
			previous = fmt.Sprintf("level%d", i-1)
		}
		screen.Templates[fmt.Sprintf("level%d", i)] = TemplateDefinition{Root: Node{ID: "r", Type: "stack", Children: []Node{{ID: "a", Use: previous}, {ID: "b", Use: previous}}}}
	}
	screen.Root.Children[0].Use = "level9"
	if _, err := Compile(screen, schemaRegistry(t)); err == nil {
		t.Fatal("template expansion budget ignored")
	}
	plan = compileComposition(t, repeatedScreen())
	var wait sync.WaitGroup
	for i := 0; i < 12; i++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			for j := 0; j < 4; j++ {
				data := map[string]any{"items": []any{map[string]any{"id": index, "label": fmt.Sprint(index)}}}
				if err := plan.Render(io.Discard, RenderContext{Data: data}); err != nil {
					t.Error(err)
				}
			}
		}(i)
	}
	wait.Wait()
}

func TestTemplateStructuredParametersDefaultsAndScopeIsolation(t *testing.T) {
	screen := compositionScreen(Node{ID: "use", Use: "card"})
	screen.Templates = map[string]TemplateDefinition{"card": {Params: map[string]core.Property{"person": {Type: Object, Default: map[string]any{"name": "Default"}, Properties: map[string]core.Property{"name": {Type: String, Required: true}}}}, Root: Node{ID: "root", Type: "text", Bindings: map[string]string{"text": "/@params/person/name"}}}}
	plan := compileComposition(t, screen)
	if got := renderComposition(t, plan, nil); !strings.Contains(got, "Default") {
		t.Fatal(got)
	}
	definition := screen.Templates["card"]
	definition.Params["person"].Default.(map[string]any)["name"] = "Mutated"
	if got := renderComposition(t, plan, nil); strings.Contains(got, "Mutated") {
		t.Fatal("parameter defaults were not snapshotted")
	}
	// Template-local repeat variables may use the same name as the caller's.
	screen.Root.Children[0].Repeat = &Repeat{Items: "/items", As: "item", Key: "/id"}
	definition.Root = Node{ID: "text", Type: "text", Repeat: &Repeat{Items: "/labels", As: "item", Key: ""}, Bindings: map[string]string{"text": "/@vars/item"}}
	screen.Templates["card"] = definition
	plan = compileComposition(t, screen)
	renderComposition(t, plan, map[string]any{"items": []any{map[string]any{"id": 1}}, "labels": []string{"A", "B"}})
	// Reusable definitions receive ambient data and explicit params, not free vars.
	definition.Root = Node{ID: "text", Type: "text", Bindings: map[string]string{"text": "/@vars/item/name"}}
	screen.Templates["card"] = definition
	if _, err := Compile(screen, schemaRegistry(t)); err == nil {
		t.Fatal("template captured an undeclared caller variable")
	}
}

func TestHiddenBranchesStillValidateActionsAndFamilies(t *testing.T) {
	r := schemaRegistry(t)
	if err := r.Register(Definition{Name: "hidden-workspace", Template: "sdui-text", Family: "workspace", Properties: map[string]Property{"text": {Type: String, Target: "Text", Required: true}}, Events: []string{"click"}}); err != nil {
		t.Fatal(err)
	}
	screen := compositionScreen(Node{ID: "hidden", Type: "hidden-workspace", When: &Condition{Op: "exists", Path: "/show"}, Bindings: map[string]string{"text": "/missing"}, Event: &Event{On: "click", Action: "save", Target: "root"}})
	plan, err := Compile(screen, r)
	if err != nil {
		t.Fatal(err)
	}
	if err := plan.ValidateActions(nil); err == nil {
		t.Fatal("hidden action escaped authorization validation")
	}
	if got := fmt.Sprint(plan.Families()); got != "[workspace]" {
		t.Fatalf("family closure %s", got)
	}
	var assets bytes.Buffer
	if err := plan.RenderAssets(&assets); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(assets.String(), "ely-api-workspace.css") || !strings.Contains(assets.String(), "ely-api-forms.css") {
		t.Fatal(assets.String())
	}
	renderComposition(t, plan, nil)
}

func TestCompositionCompileNormalizationAndConditionBudgets(t *testing.T) {
	screen := Screen{Version: Version, ID: "screen", Root: Node{ID: "root", Type: "stack"}}
	for i := 0; i < 200; i++ {
		screen.Root.Children = append(screen.Root.Children, Node{ID: fmt.Sprintf("text%d", i), Type: "text", Props: map[string]any{"text": strings.Repeat("x", MaxStringBytes)}})
	}
	if _, err := Compile(screen, schemaRegistry(t)); err == nil {
		t.Fatal("aggregate compile normalization budget ignored")
	}
	screen = compositionScreen(Node{ID: "text", Type: "text", Props: map[string]any{"text": "Value"}, When: &Condition{Op: "eq", Path: "/show", Value: true}})
	plan := compileComposition(t, screen)
	screen.Root.Children[0].When.Value = false
	if got := renderComposition(t, plan, map[string]any{"show": true}); !strings.Contains(got, "Value") {
		t.Fatal("source condition mutation changed plan")
	}
}
