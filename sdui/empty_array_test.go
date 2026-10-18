package sdui

import (
	"reflect"
	"slices"
	"strings"
	"testing"
)

func TestEmptyArraySemanticFormat(t *testing.T) {
	p := checkedProperty(t, Property{Type: Array, Format: "empty-array", Items: &Property{Type: Object}})
	for _, v := range []any{[]any{}, [0]any{}} {
		got, err := normalize(p, v)
		if err != nil {
			t.Fatal(err)
		}
		if reflect.ValueOf(got).Len() != 0 {
			t.Fatalf("expected empty normalized slice: %#v", got)
		}
	}
	for _, v := range []any{nil, ([]any)(nil), false, true, "", map[string]any{}, []any{map[string]any{}}, []any{"row"}, []any{nil}} {
		if _, err := normalize(p, v); err == nil {
			t.Fatalf("empty-array accepted %#v", v)
		}
	}
	for _, typ := range []ValueType{String, Boolean, Integer, Number, Object} {
		if _, err := validateProperty(Property{Type: typ, Format: "empty-array"}); err == nil {
			t.Errorf("format accepted on %s", typ)
		}
	}
	for _, v := range []any{[]any{map[string]any{}}, []any{"row"}} {
		if _, err := validateProperty(Property{Type: Array, Format: "empty-array", Items: &Property{Type: Object}, Default: v}); err == nil {
			t.Fatal("nonempty default accepted")
		}
	}
	if _, err := validateProperty(Property{Type: Array, Format: "empty-array", Items: &Property{Type: Object}, Default: []any{}}); err != nil {
		t.Fatal(err)
	}
	schema := propertySchema(p)
	if schema["type"] != "array" || schema["maxItems"] != 0 || schema["x-ely-format"] != "empty-array" {
		t.Fatalf("editor schema lost empty-only constraint: %#v", schema)
	}
	ordinary := checkedProperty(t, Property{Type: Array, MaxItems: 0, Items: &Property{Type: Object}})
	if _, err := normalize(ordinary, []any{map[string]any{}}); err != nil {
		t.Fatalf("ordinary MaxItems:0 changed: %v", err)
	}
	if propertySchema(ordinary)["maxItems"] != MaxArrayItems {
		t.Fatal("ordinary zero limit no longer exports default")
	}
}

func TestEmptyArrayRegistryValidation(t *testing.T) {
	for _, tt := range []struct {
		name    string
		p       Property
		wantErr bool
	}{
		{"empty", Property{Type: Array, Format: "empty-array", Items: &Property{Type: Object}}, false},
		{"nonempty-default", Property{Type: Array, Format: "empty-array", Items: &Property{Type: Object}, Default: []any{map[string]any{}}}, true},
		{"wrong-type", Property{Type: Object, Format: "empty-array"}, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			r := NewRegistry()
			err := r.Register(Definition{Name: "empty", Properties: map[string]Property{"items": tt.p}})
			if (err != nil) != tt.wantErr {
				t.Fatalf("register error %v, want error %v", err, tt.wantErr)
			}
		})
	}
}

// Empty-array is intrinsic even when host format extensions are configured.
// Require the reservation diagnostic so removing the denylist entry is caught
// independently of the later type and callback-shape checks.
func TestEmptyArrayHostFormatCannotOverrideBuiltin(t *testing.T) {
	for _, kind := range []ValueType{String, Object, Array} {
		t.Run(string(kind), func(t *testing.T) {
			rule := FormatRule{Type: kind}
			p := Property{Type: kind, Format: "empty-array"}
			switch kind {
			case String:
				rule.NormalizeString = func(v string, _ URLPolicy) (string, error) { return v, nil }
			case Object:
				rule.NestedPropertyAllowed = func(string, Property) (bool, bool) { return true, true }
			case Array:
				p.Items = &Property{Type: Object}
			}
			r := NewRegistry(WithFormats(map[string]FormatRule{"empty-array": rule}))
			err := r.Register(Definition{Name: "override", Properties: map[string]Property{"items": p}})
			if err == nil || !strings.Contains(err.Error(), `cannot override built-in format "empty-array"`) {
				t.Fatalf("built-in format reservation lost: %v", err)
			}
		})
	}
}

func TestEmptyArrayEditorParameterFormat(t *testing.T) {
	schema, err := JSONSchema(NewRegistry())
	if err != nil {
		t.Fatal(err)
	}
	formats := schema["$defs"].(map[string]any)["parameter"].(map[string]any)["properties"].(map[string]any)["format"].(map[string]any)["enum"].([]string)
	if !slices.Contains(formats, "empty-array") {
		t.Fatalf("editor parameter formats omit the built-in empty-array contract: %v", formats)
	}
}
