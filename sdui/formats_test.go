package sdui

import (
	"strings"
	"testing"
)

func TestHostFormatSnapshotAndBounds(t *testing.T) {
	rules := map[string]FormatRule{"host-uppercase": {Type: String, NormalizeString: func(value string, _ URLPolicy) (string, error) { return strings.ToUpper(value), nil }}}
	option := WithFormats(rules)
	delete(rules, "host-uppercase")
	r := NewRegistry(option)
	if err := r.Register(Definition{Name: "host", Properties: map[string]Property{"value": {Type: String, Format: "host-uppercase", MaxLength: 8}}}); err != nil {
		t.Fatal(err)
	}
	d, _ := r.Definition("host")
	p := d.Properties["value"]
	if got, err := p.Normalize("hello"); err != nil || got != "HELLO" {
		t.Fatalf("normalization: %#v %v", got, err)
	}
	clone := r.Clone(WithFormats(nil))
	if err := clone.Register(Definition{Name: "without", Properties: map[string]Property{"value": {Type: String, Format: "host-uppercase"}}}); err == nil {
		t.Fatal("format policy leaked to next definition")
	}
	d, _ = clone.Definition("host")
	if got, err := d.Properties["value"].Normalize("hello"); err != nil || got != "HELLO" {
		t.Fatal("snapshot lost original policy")
	}
	for _, output := range []string{strings.Repeat("x", 9), string([]byte{0xff})} {
		r := NewRegistry(WithFormats(map[string]FormatRule{"host-test": {Type: String, NormalizeString: func(string, URLPolicy) (string, error) { return output, nil }}}))
		if err := r.Register(Definition{Name: "host", Properties: map[string]Property{"value": {Type: String, Format: "host-test", MaxLength: 8}}}); err != nil {
			t.Fatal(err)
		}
		d, _ := r.Definition("host")
		if _, err := d.Properties["value"].Normalize("x"); err == nil {
			t.Fatal("host output bypassed core bounds")
		}
	}
}

func TestHostFormatsCannotOverrideBuiltins(t *testing.T) {
	for _, kind := range []ValueType{String, Object} {
		rule := FormatRule{Type: kind}
		if kind == String {
			rule.NormalizeString = func(v string, _ URLPolicy) (string, error) { return v, nil }
		} else {
			rule.NestedPropertyAllowed = func(string, Property) (bool, bool) { return true, true }
		}
		r := NewRegistry(WithFormats(map[string]FormatRule{"url": rule}))
		if err := r.Register(Definition{Name: "override", Properties: map[string]Property{"value": {Type: kind, Format: "url"}}}); err == nil {
			t.Fatal("overrode built-in URL checks")
		}
	}
}

func TestHostNestedPoliciesRemainClosedAndBounded(t *testing.T) {
	rules := map[string]FormatRule{"host-record": {Type: Object, NestedPropertyAllowed: func(string, Property) (bool, bool) { return true, true }}}
	register := func(p Property) error {
		return NewRegistry(WithFormats(rules)).Register(Definition{Name: "record", Properties: map[string]Property{"record": p}})
	}
	for _, name := range []string{"__proto__", "constructor", "prototype"} {
		if err := register(Property{Type: Object, Format: "host-record", Properties: map[string]Property{name: {Type: String}}}); err == nil {
			t.Fatalf("prototype field %s allowed", name)
		}
	}
	if err := register(Property{Type: Object, Format: "host-record", Properties: map[string]Property{"nested": {Type: Object, AdditionalProperties: &Property{Type: String}}}}); err == nil {
		t.Fatal("host policy opened dictionary")
	}
	if err := NewRegistry(WithFormats(rules)).Register(Definition{Name: "record", Properties: map[string]Property{"template": {Type: Object, Format: "host-record"}}}); err == nil {
		t.Fatal("host nested policy escaped root boundary")
	}
}

func TestHostPolicyStaysWithValidatedPropertyOnly(t *testing.T) {
	rules := map[string]FormatRule{"host-record": {Type: Object, NestedPropertyAllowed: func(name string, _ Property) (bool, bool) {
		if name == "template" {
			return true, true
		}
		return false, false
	}}}
	r := NewRegistry(WithFormats(rules))
	p := Property{Type: Object, Format: "host-record", Properties: map[string]Property{"child": {Type: Object, Properties: map[string]Property{"template": {Type: String}}}}}
	if err := r.Register(Definition{Name: "original", Properties: map[string]Property{"value": p}}); err != nil {
		t.Fatal(err)
	}
	d, _ := r.Definition("original")
	child := d.Properties["value"].Properties["child"]
	if _, err := child.Normalize(map[string]any{"template": "ordinary host data"}); err != nil {
		t.Fatalf("nested snapshot lost policy: %v", err)
	}
	if err := NewRegistry().Register(Definition{Name: "unprivileged", Properties: map[string]Property{"value": child}}); err == nil {
		t.Fatal("re-registration smuggled policy across registry boundary")
	}
}

func TestHostFormatOutputRetainsEnumContract(t *testing.T) {
	for _, output := range []string{"changed", ""} {
		r := NewRegistry(WithFormats(map[string]FormatRule{"host-enum": {Type: String, NormalizeString: func(string, URLPolicy) (string, error) { return output, nil }}}))
		if err := r.Register(Definition{Name: "enum", Properties: map[string]Property{"value": {Type: String, Format: "host-enum", Enum: []string{"original"}}}}); err == nil {
			t.Fatal("normalizer moved value outside enum")
		}
	}
	r := NewRegistry(WithFormats(map[string]FormatRule{"host-empty": {Type: String, NormalizeString: func(string, URLPolicy) (string, error) { return "", nil }}}))
	if err := r.Register(Definition{Name: "empty", Properties: map[string]Property{"value": {Type: String, Format: "host-empty", Enum: []string{""}, Default: ""}}}); err != nil {
		t.Fatalf("valid empty enum rejected: %v", err)
	}
}
