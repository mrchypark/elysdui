package sdui

import (
	"encoding/json"
	"fmt"
	"html/template"
	"reflect"
	"strings"
	"sync"
	"testing"
)

func checkedProperty(t *testing.T, p Property) Property {
	t.Helper()
	q, err := validateProperty(p)
	if err != nil {
		t.Fatal(err)
	}
	return q
}

func TestRecursivePropertiesNormalizeAndCopy(t *testing.T) {
	p := checkedProperty(t, Property{Type: Array, Items: &Property{Type: Object, Properties: map[string]Property{
		"id":     {Type: String, Format: "identifier", Required: true},
		"kind":   {Type: String, Format: "data-token"},
		"body":   {Type: String, Format: "text"},
		"name":   {Type: String, Format: "text"},
		"style":  {Type: String, Format: "text"},
		"labels": {Type: Array, Items: &Property{Type: String}},
		"values": {Type: Object, AdditionalProperties: &Property{Type: Integer}},
	}}})
	input := []map[string]any{{"id": "record_1", "kind": "note", "body": "<script>alert(1)</script>", "name": "Display name / not a field", "style": "display data", "labels": []string{"alpha"}, "values": map[string]int{"a": 3}}}
	normalized, err := normalize(p, input)
	if err != nil {
		t.Fatal(err)
	}
	row := normalized.([]any)[0].(map[string]any)
	if row["id"] != "record_1" || row["kind"] != "note" || row["body"] != "<script>alert(1)</script>" || row["name"] != "Display name / not a field" {
		t.Fatalf("lost nested data: %#v", row)
	}
	input[0]["id"] = "changed"
	input[0]["labels"].([]string)[0] = "changed"
	input[0]["values"].(map[string]int)["a"] = 99
	if row["id"] != "record_1" || row["labels"].([]any)[0] != "alpha" || row["values"].(map[string]any)["a"] != 3 {
		t.Fatal("normalization retained mutable input")
	}
	for _, input := range []any{[]map[string]any{{"id": "valid", "extra": true}}, []map[string]any{{"id": "valid", "labels": []int{1}}}, []map[string]any{{"kind": "note"}}, []map[string]any{{"id": template.HTML("bad")}}} {
		if _, err := normalize(p, input); err == nil {
			t.Fatalf("accepted invalid nested input %#v", input)
		}
	}
}

func TestJSONContainersRejectExecutableValues(t *testing.T) {
	dict := checkedProperty(t, Property{Type: Object, AdditionalProperties: &Property{Type: String}})
	got, err := normalize(dict, map[string]string{"word": "okay"})
	if err != nil || got.(map[string]any)["word"] != "okay" {
		t.Fatalf("concrete dictionary: %#v %v", got, err)
	}
	for _, value := range []any{map[string]any{"a": template.HTML("<b>x</b>")}, map[string]any{"a": template.JS("alert(1)")}, map[string]any{"a": func() string { return "x" }}, map[string]any{"a": &struct{}{}}, map[string]any{"__proto__": "x"}, map[string]any{"constructor": "x"}, map[int]string{1: "x"}} {
		if _, err := normalize(dict, value); err == nil {
			t.Fatalf("accepted %#v", value)
		}
	}
}

func TestRecursiveLimits(t *testing.T) {
	cases := []struct {
		name string
		p    Property
		v    any
	}{
		{"string", Property{Type: String}, strings.Repeat("x", MaxStringBytes+1)},
		{"array", Property{Type: Array, Items: &Property{Type: Boolean}}, make([]bool, MaxArrayItems+1)},
		{"object", Property{Type: Object, AdditionalProperties: &Property{Type: Boolean}}, func() map[string]bool {
			m := map[string]bool{}
			for i := 0; i < MaxObjectProperties+1; i++ {
				m[fmt.Sprintf("key%d", i)] = true
			}
			return m
		}()},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := normalize(tt.p, tt.v); err == nil {
				t.Fatal("limit accepted")
			}
		})
	}
	for _, p := range []Property{{Type: String, MaxLength: HardMaxStringBytes + 1}, {Type: Array, Items: &Property{Type: String}, MaxItems: HardMaxArrayItems + 1}, {Type: Object, MaxProperties: HardMaxObjectProperties + 1}, {Type: String, MaxLength: -1}} {
		if _, err := validateProperty(p); err == nil {
			t.Fatalf("accepted excessive limit %#v", p)
		}
	}
	p := checkedProperty(t, Property{Type: String, MaxLength: HardMaxStringBytes})
	if _, err := normalize(p, strings.Repeat("x", HardMaxStringBytes)); err != nil {
		t.Fatal(err)
	}
	node := Property{Type: String}
	var value any = "leaf"
	for i := 0; i < MaxValueDepth; i++ {
		child := node
		node = Property{Type: Array, Items: &child}
		value = []any{value}
	}
	if _, err := validateProperty(node); err == nil {
		t.Fatal("schema depth accepted")
	}
	if _, err := normalize(node, value); err == nil {
		t.Fatal("data depth accepted")
	}
	cyclic := Property{Type: Object, Properties: map[string]Property{}}
	cyclic.Properties["child"] = cyclic
	if _, err := validateProperty(cyclic); err == nil {
		t.Fatal("cyclic schema accepted")
	}
	budget := newValueBudget()
	for i := 0; i < MaxValues; i++ {
		if _, err := normalizeWithBudget(Property{Type: Boolean}, true, budget); err != nil {
			t.Fatalf("early value limit: %d %v", i, err)
		}
	}
	if _, err := normalizeWithBudget(Property{Type: Boolean}, true, budget); err == nil {
		t.Fatal("total values accepted")
	}
	budget = newValueBudget()
	for i := 0; i < 7; i++ {
		if _, err := normalizeWithBudget(p, strings.Repeat("x", HardMaxStringBytes), budget); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := normalizeWithBudget(p, strings.Repeat("x", HardMaxStringBytes), budget); err == nil {
		t.Fatal("total bytes accepted")
	}
}

func TestFiniteUnionContracts(t *testing.T) {
	p := checkedProperty(t, Property{OneOf: []Property{{Type: String}, {Type: Integer}}, Nullable: true})
	for _, value := range []any{"alpha", json.Number("9007199254740993"), nil} {
		if _, err := normalize(p, value); err != nil {
			t.Fatal(err)
		}
	}
	for _, value := range []any{true, []string{"x"}, 1.25} {
		if _, err := normalize(p, value); err == nil {
			t.Fatalf("accepted %#v", value)
		}
	}
	for _, p := range []Property{
		{OneOf: []Property{{Type: String}}},
		{Type: String, OneOf: []Property{{Type: String}, {Type: Integer}}},
		{OneOf: []Property{{Type: Number}, {Type: Integer}}},
		{OneOf: []Property{{Type: String}, {Type: String}}},
		{OneOf: []Property{{Type: String, Nullable: true}, {Type: Integer}}},
		{OneOf: []Property{{Type: Object, Properties: map[string]Property{"a": {Type: String}}}, {Type: Object, Properties: map[string]Property{"b": {Type: String}}}}},
	} {
		if _, err := validateProperty(p); err == nil {
			t.Fatalf("accepted ambiguous union %#v", p)
		}
	}
	objects := checkedProperty(t, Property{OneOf: []Property{
		{Type: Object, Properties: map[string]Property{"kind": {Type: String, Format: "data-token", Required: true, Enum: []string{"text"}}, "value": {Type: String}}},
		{Type: Object, Properties: map[string]Property{"kind": {Type: String, Format: "data-token", Required: true, Enum: []string{"count"}}, "value": {Type: Integer}}},
	}})
	if _, err := normalize(objects, map[string]any{"kind": "count", "value": 4}); err != nil {
		t.Fatal(err)
	}
	if _, err := normalize(objects, map[string]any{"kind": "count", "value": "wrong"}); err == nil {
		t.Fatal("wrong variant accepted")
	}
}

func TestSemanticURLPolicies(t *testing.T) {
	for _, format := range []string{"url", "image-url", "media-url"} {
		p := checkedProperty(t, Property{Type: String, Format: format})
		for _, value := range []string{"", "/images/photo.png", "/search?q=one#result", "#section", "/space%20here"} {
			if _, err := normalize(p, value); err != nil {
				t.Errorf("%s %q: %v", format, value, err)
			}
		}
		for _, value := range []string{"https://example.com/photo", "javascript:alert(1)", "data:image/svg+xml,bad", "data:image/png;base64,AAAA", "//example.com", "/\\evil", "/%5cevil", "/%2fexample.com", "https://user:pass@example.com", "/bad%0aheader", "/bad\tvalue", "relative/path"} {
			if _, err := normalize(p, value); err == nil {
				t.Errorf("%s accepted %q", format, value)
			}
		}
	}
	calls := 0
	p, err := validatePropertyPolicy(Property{Type: String, Format: "image-url"}, func(format, raw string) bool {
		calls++
		return format == "image-url" && strings.HasPrefix(raw, "https://images.example/")
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := normalize(p, "https://images.example/p.png"); err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{"https://evil.example/p.png", "javascript:alert(1)", "data:image/png;base64,AAAA"} {
		if _, err := normalize(p, raw); err == nil {
			t.Fatalf("authorized unsafe URL %q", raw)
		}
	}
	if calls != 2 {
		t.Fatalf("unsafe schemes reached host policy: %d", calls)
	}
}

func TestPropertyPolicyCannotBypassReservedSelectors(t *testing.T) {
	for _, name := range []string{"id", "ID", "kind", "Kind", "Attrs", "class", "Template", "chapter", "component", "componentName", "family", "onclick", "hxGet", "formAction", "srcdoc"} {
		for _, format := range []string{"text", "url", "identifier", "action", "data-token", "sandbox-html"} {
			if propertyAllowed(name, Property{Type: String, Format: format}) {
				t.Errorf("%s bypassed %s", format, name)
			}
		}
	}
	for _, name := range []string{"id", "kind", "body", "style"} {
		if !propertyAllowedAt(name, Property{Type: String, Format: "text"}, false) {
			t.Errorf("safe nested %s rejected", name)
		}
	}
	if propertyAllowed("style", Property{Type: String, Format: "text"}) {
		t.Fatal("root CSS text bypass")
	}
	if !propertyAllowed("style", Property{Type: String, Format: "data-token"}) {
		t.Fatal("style design token rejected")
	}
	if _, err := normalize(Property{Type: String, Format: "data-token"}, "color:red;position:fixed"); err == nil {
		t.Fatal("CSS accepted as token")
	}
	if _, err := validateProperty(Property{Type: String, Format: "sandbox-html"}); err == nil {
		t.Fatal("sandbox capability bypass")
	}
	if _, err := normalize(Property{Type: String, Format: "sandbox-html"}, "<script>x</script>"); err == nil {
		t.Fatal("direct sandbox capability bypass")
	}
}

func TestDeepRegistryDefinitionsSnapshotAndConcurrency(t *testing.T) {

	min := 0.0
	rows := Property{Type: Array, Items: &Property{Type: Object, Properties: map[string]Property{"label": {Type: String, Enum: []string{"hello", "world"}}, "count": {Type: Integer, Min: &min}}}, Default: []map[string]any{{"label": "hello", "count": 1}}}
	r := NewRegistry()
	d := Definition{Name: "custom/Rows and cards", Properties: map[string]Property{"rows": rows}, Slots: map[string]SlotDefinition{"footer": {AllowedTypes: []string{"text"}}}}
	if err := r.Register(d); err != nil {
		t.Fatal(err)
	}
	min = 100
	rows.Items.Properties["label"] = Property{Type: Boolean}
	rows.Default.([]map[string]any)[0]["label"] = "mutated"
	d.Slots["footer"].AllowedTypes[0] = "mutated"
	snapshot := r.Definitions()
	copyRows := snapshot[0].Properties["rows"]
	if *copyRows.Items.Properties["count"].Min != 0 || copyRows.Default.([]any)[0].(map[string]any)["label"] != "hello" || snapshot[0].Slots["footer"].AllowedTypes[0] != "text" {
		t.Fatal("caller mutated registry")
	}
	copyRows.Default.([]any)[0].(map[string]any)["label"] = "world"
	copyRows.Items.Properties["label"].Enum[0] = "bad"
	snapshot[0].Slots["footer"].AllowedTypes[0] = "bad"
	again := r.Definitions()[0]
	if again.Properties["rows"].Default.([]any)[0].(map[string]any)["label"] != "hello" || again.Properties["rows"].Items.Properties["label"].Enum[0] != "hello" || again.Slots["footer"].AllowedTypes[0] != "text" {
		t.Fatal("Definitions snapshot mutated registry")
	}
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := r.Register(Definition{Name: fmt.Sprintf("concurrent-%d", i), Properties: map[string]Property{"text": {Type: String}}}); err != nil {
				t.Error(err)
			}
			for j := 0; j < 10; j++ {
				defs := r.Definitions()
				defs[0].Name = "changed"
			}
		}(i)
	}
	wg.Wait()
	if len(r.Definitions()) != 21 {
		t.Fatal("lost concurrent definitions")
	}
}

func TestPropertyJSONRoundTrip(t *testing.T) {
	raw := `{"type":"array","maxItems":10,"items":{"type":"object","properties":{"id":{"type":"string","format":"identifier"}},"maxProperties":8}}`
	var p Property
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		t.Fatal(err)
	}
	p = checkedProperty(t, p)
	encoded, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var a, b any
	json.Unmarshal([]byte(raw), &a)
	json.Unmarshal(encoded, &b)
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("wire metadata changed: %s", encoded)
	}
}

func TestReviewedStructuredDataAndNestedSelectors(t *testing.T) {
	for _, name := range []string{"data", "Data", "DataPoints", "dataset"} {
		if !propertyAllowed(name, Property{Type: Array, Items: &Property{Type: Number}}) {
			t.Errorf("structured %s rejected", name)
		}
	}
	for _, name := range []string{"target", "chapter", "component", "componentName", "family"} {
		if propertyAllowed(name, Property{Type: String, Format: "text"}) {
			t.Errorf("root %s allowed", name)
		}
		if !propertyAllowedAt(name, Property{Type: String, Format: "text"}, false) {
			t.Errorf("nested data %s rejected", name)
		}
	}
}
