package gohtmx

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestJSONSchemaRegistryContractsAndReferences(t *testing.T) {
	registry := schemaRegistry(t)
	schema, err := registry.JSONSchema()
	if err != nil {
		t.Fatal(err)
	}
	if schema["$schema"] != "https://json-schema.org/draft/2020-12/schema" {
		t.Fatal("missing draft dialect")
	}
	definitions := schema["$defs"].(map[string]any)
	for _, name := range []string{"node", "use", "template", "parameter", "condition", "repeat", "binding", "event", "payloadBinding"} {
		if definitions[name] == nil {
			t.Errorf("missing grammar definition %s", name)
		}
	}
	choices := definitions["node"].(map[string]any)["oneOf"].([]any)
	if len(choices) != len(registry.Definitions())+1 {
		t.Fatal("component count differs from registry")
	}
	for index, definition := range registry.Definitions() {
		component := definitions[fmt.Sprintf("component%d", index)].(map[string]any)
		props := component["properties"].(map[string]any)
		if props["type"].(map[string]any)["const"] != definition.Name {
			t.Fatalf("wrong component identity %s", definition.Name)
		}
		literal := props["props"].(map[string]any)
		if literal["additionalProperties"] != false {
			t.Fatal("open component properties")
		}
		if len(literal["properties"].(map[string]any)) != len(definition.Properties) {
			t.Fatalf("missing props for %s", definition.Name)
		}
		if component["additionalProperties"] != false {
			t.Fatal("open node grammar")
		}
	}
	var walk func(any)
	walk = func(value any) {
		switch v := value.(type) {
		case map[string]any:
			if ref, ok := v["$ref"].(string); ok {
				if !strings.HasPrefix(ref, "#/$defs/") || definitions[strings.TrimPrefix(ref, "#/$defs/")] == nil {
					t.Errorf("invalid local reference %q", ref)
				}
			}
			for _, child := range v {
				walk(child)
			}
		case []any:
			for _, child := range v {
				walk(child)
			}
		}
	}
	walk(schema)
	first, err := json.Marshal(schema)
	if err != nil {
		t.Fatal(err)
	}
	next, err := registry.JSONSchema()
	if err != nil {
		t.Fatal(err)
	}
	second, _ := json.Marshal(next)
	if string(first) != string(second) {
		t.Fatal("export is nondeterministic")
	}
	if _, err := JSONSchema(nil); err == nil {
		t.Fatal("nil registry exported")
	}
}

func TestJSONSchemaRecursivePropsDefaultsAndSlots(t *testing.T) {
	registry := schemaRegistry(t)
	if _, err := registry.templates.New("schema-card-template").Parse(`{{.Record.Title}}{{.Content}}`); err != nil {
		t.Fatal(err)
	}
	minimum, maximum := 1.0, 4.0
	if err := registry.Register(Definition{Name: "schema-card", Template: "schema-card-template", ContainsForm: true, Properties: map[string]Property{
		"record": {Type: Object, Target: "Record", Default: map[string]any{"title": "Default"}, Properties: map[string]Property{"title": {Type: String, Target: "Title", Required: true}, "score": {Type: Number, Min: &minimum, Max: &maximum}}},
		"items":  {Type: Array, Target: "Items", MaxItems: 8, Items: &Property{Type: Object, Properties: map[string]Property{"label": {Type: String, Target: "Label", Required: true}}}},
		"token":  {Type: String, Target: "Token", Enum: []string{"one", "two"}, Nullable: true},
	}, Slots: map[string]SlotDefinition{"content": {Target: "Content", Required: true, AllowedTypes: []string{"text"}, MaxNodes: 4}}}); err != nil {
		t.Fatal(err)
	}
	schema, err := registry.JSONSchema()
	if err != nil {
		t.Fatal(err)
	}
	definitions := schema["$defs"].(map[string]any)
	var component map[string]any
	for _, raw := range definitions {
		candidate, ok := raw.(map[string]any)
		if ok && candidate["title"] == "schema-card" {
			component = candidate
			break
		}
	}
	if component == nil {
		t.Fatal("custom contract missing")
	}
	properties := component["properties"].(map[string]any)["props"].(map[string]any)["properties"].(map[string]any)
	record := properties["record"].(map[string]any)
	defaultRecord := record["default"].(map[string]any)
	if defaultRecord["title"] != "Default" || defaultRecord["Title"] != nil {
		t.Fatalf("default not converted to wire keys: %#v", defaultRecord)
	}
	recordFields := record["properties"].(map[string]any)
	score := recordFields["score"].(map[string]any)
	if score["minimum"] != minimum || score["maximum"] != maximum {
		t.Fatal("number bounds missing")
	}
	items := properties["items"].(map[string]any)
	if items["maxItems"] != 8 {
		t.Fatal("array limit missing")
	}
	token := properties["token"].(map[string]any)
	tokens := token["enum"].([]any)
	if len(tokens) != 3 || tokens[2] != nil {
		t.Fatal("nullable enum excludes null")
	}
	slots := component["properties"].(map[string]any)["slots"].(map[string]any)
	slot := slots["properties"].(map[string]any)["content"].(map[string]any)
	if slot["maxItems"] != 4 || slot["minItems"] != 1 || component["x-ely-contains-form"] != true {
		t.Fatal("slot/form metadata missing")
	}
	defaultRecord["title"] = "Changed"
	next, _ := registry.JSONSchema()
	encoded, _ := json.Marshal(next)
	if strings.Contains(string(encoded), "Changed") {
		t.Fatal("schema mutation changed registry")
	}
}

func TestJSONSchemaEventsAndConditions(t *testing.T) {
	schema, err := schemaRegistry(t).JSONSchema()
	if err != nil {
		t.Fatal(err)
	}
	defs := schema["$defs"].(map[string]any)
	event := defs["event"].(map[string]any)
	props := event["properties"].(map[string]any)
	if props["sourceAction"] == nil || props["payload"] == nil {
		t.Fatal("advanced event grammar omitted")
	}
	payload := defs["payloadBinding"].(map[string]any)
	if payload["additionalProperties"] != false {
		t.Fatal("payload binding is open")
	}
	if len(defs["condition"].(map[string]any)["oneOf"].([]any)) != 4 {
		t.Fatal("predicate operators omitted")
	}
	// Semantic-only restrictions are called out rather than claimed as proved.
	if !strings.Contains(schema["description"].(string), "Compile and Render remain authoritative") {
		t.Fatal("missing authority caveat")
	}
}
