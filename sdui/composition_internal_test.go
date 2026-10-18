package sdui

import (
	"encoding/json"
	"testing"
)

func TestBindingParsingAndLookup(t *testing.T) {
	data := map[string]any{"items": []any{map[string]any{"a/b": map[string]any{"~value": "<safe>"}}}}
	for _, path := range []string{"/items/0/a~1b/~0value", "items", "/@data/items", "/"} {
		if _, err := parseBinding(path, bindingScope{}); err != nil {
			t.Fatalf("valid %q: %v", path, err)
		}
	}
	for _, path := range []string{"", "/x~", "/x~2y", "/@globals/x", "/@params/x", "/@vars/item/x", "/constructor/value", "x[0]", "x.constructor", "#/items"} {
		if _, err := parseBinding(path, bindingScope{}); err == nil {
			t.Errorf("invalid path accepted: %q", path)
		}
	}
	for _, path := range []string{"/items/00", "/items/-", "/items/-1", "/items/999999999999999999999999"} {
		if _, err := resolveBinding(data, path); err == nil {
			t.Errorf("invalid array path accepted: %q", path)
		}
	}
	if value, err := resolveBinding(map[string]any{"": "empty key"}, "/"); err != nil || value != "empty key" {
		t.Fatalf("empty pointer key: %v %v", value, err)
	}
	if value, err := resolveBinding(map[string]any{"x": map[string]any{"y": "legacy"}}, "x.y"); err != nil || value != "legacy" {
		t.Fatalf("legacy dot path: %v %v", value, err)
	}
}
func TestConditionParsingAndEvaluation(t *testing.T) {
	for _, c := range []*Condition{{Op: "eval", Path: "/x"}, {Op: "not"}, {Op: "all"}, {Op: "exists", Path: "/x", Value: true}, {Op: "eq", Path: "/x", Value: map[string]any{"x": 1}}, {Op: "eq", Path: "/x", Value: json.Number("1e-999999999999999999")}} {
		if _, err := compileCondition(c, bindingScope{}); err == nil {
			t.Fatalf("invalid condition accepted: %#v", c)
		}
	}
	for _, test := range []struct {
		condition Condition
		data      map[string]any
		want      bool
	}{
		{Condition{Op: "exists", Path: "/value"}, map[string]any{"value": nil}, true},
		{Condition{Op: "eq", Path: "/value", Value: nil}, map[string]any{"value": nil}, true},
		{Condition{Op: "ne", Path: "/missing", Value: 1}, nil, false},
		{Condition{Op: "eq", Path: "/value", Value: json.Number("1.00")}, map[string]any{"value": 1}, true},
		{Condition{Op: "any", Conditions: []Condition{{Op: "exists", Path: "/missing"}, {Op: "exists", Path: "/value"}}}, map[string]any{"value": false}, true},
	} {
		compiled, err := compileCondition(&test.condition, bindingScope{})
		if err != nil {
			t.Fatal(err)
		}
		match, err := compiled.evaluate(resolveScope{data: test.data})
		if err != nil || match != test.want {
			t.Fatalf("condition %#v = %v %v", test.condition, match, err)
		}
	}
}
func TestConditionDepthBudget(t *testing.T) {
	condition := Condition{Op: "exists", Path: "/x"}
	for i := 0; i < MaxConditionDepth; i++ {
		condition = Condition{Op: "not", Conditions: []Condition{condition}}
	}
	if _, err := compileCondition(&condition, bindingScope{}); err == nil {
		t.Fatal("condition nesting budget ignored")
	}

}
func TestTypedParameterReferencesValidateBeforeRendering(t *testing.T) {
	scope := bindingScope{params: map[string]Property{"person": {Type: Object, Properties: map[string]Property{"name": {Type: String}}}, "names": {Type: Array, Items: &Property{Type: String}}}}
	for _, path := range []string{"/@params/person/missing", "/@params/person/name/value", "/@params/names/-1", "/@params/names/+1", "/@params/names/01"} {
		if _, err := parseBinding(path, scope); err == nil {
			t.Errorf("invalid declared reference %q", path)
		}
	}
	if _, err := parseBinding("/@params/names/0", scope); err != nil {
		t.Fatal(err)
	}
	if _, err := compileCondition(&Condition{Op: "eq", Path: "/@params/person/name", Value: true}, scope); err == nil {
		t.Fatal("statically incompatible condition accepted")
	}
}
