package sdui

import (
	"fmt"
)

// JSONSchema exports a Draft 2020-12 editor schema from the same registered
// contracts used by Compile. It is an authoring aid, not an authorization or
// runtime-data validator: Compile and resolution remain authoritative for scoped
// references, cycles, ID uniqueness, host URL policies and aggregate budgets.
func JSONSchema(registry *Registry) (map[string]any, error) {
	if registry == nil {
		return nil, fmt.Errorf("sdui: JSON Schema requires a registry")
	}
	definitions := registry.Definitions()
	formats := []string{"text", "field-name", "url", "image-url", "media-url", "action", "identifier", "data-token", "numeric-token", "empty-array"}
	registry.mu.RLock()
	for _, name := range sortedKeys(registry.formats) {
		formats = append(formats, name)
	}
	registry.mu.RUnlock()
	defs := schemaGrammar(formats)
	choices := []any{schemaRef("use")}
	for index, definition := range definitions {
		name := fmt.Sprintf("component%d", index)
		defs[name] = componentSchema(definition)
		choices = append(choices, schemaRef(name))
	}
	defs["node"] = map[string]any{"oneOf": choices}
	schema := closedSchema(map[string]any{
		"version": map[string]any{"const": Version}, "id": schemaRef("id"), "loader": schemaRef("registryKey"),
		"templates": map[string]any{"type": "object", "maxProperties": 128, "propertyNames": schemaRef("registryKey"), "additionalProperties": schemaRef("template")},
		"root":      schemaRef("node"),
	}, "version", "id", "root")
	schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
	schema["title"] = "Ely SDUI version " + Version
	schema["description"] = "Editor assistance for this host registry. Compile and Resolve remain authoritative; host capabilities, references, IDs, URL policies, byte/depth/expanded-node limits and request data require runtime validation."
	schema["$defs"] = defs
	schema["x-ely-limits"] = map[string]any{"schemaBytes": MaxSchemaBytes, "nodes": MaxNodes, "depth": MaxDepth, "normalizedValues": MaxValues, "normalizedBytes": MaxNormalizationBytes}
	return schema, nil
}

// JSONSchema is the method form of the package-level export helper.
func (r *Registry) JSONSchema() (map[string]any, error) { return JSONSchema(r) }

func schemaRef(name string) map[string]any { return map[string]any{"$ref": "#/$defs/" + name} }
func closedSchema(properties map[string]any, required ...string) map[string]any {
	schema := map[string]any{"type": "object", "properties": properties, "additionalProperties": false}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}
func nodeArraySchema(limit int) map[string]any {
	if limit == 0 {
		limit = MaxNodes
	}
	return map[string]any{"type": "array", "items": schemaRef("node"), "maxItems": limit}
}

func schemaGrammar(formats []string) map[string]any {
	defs := map[string]any{}
	defs["id"] = map[string]any{"type": "string", "pattern": schemaID.String(), "not": map[string]any{"pattern": "^sdui-internal-"}}
	defs["registryKey"] = map[string]any{"type": "string", "pattern": registryKey.String()}
	defs["propertyName"] = map[string]any{"type": "string", "pattern": propertyName.String()}
	defs["pointer"] = map[string]any{"type": "string", "maxLength": 512, "pattern": `^(/([^~]|~[01])*)*$`, "description": "RFC 6901 pointer; array indices and reserved keys are validated by Compile/Render."}
	defs["binding"] = map[string]any{"type": "string", "minLength": 1, "maxLength": 512, "anyOf": []any{map[string]any{"pattern": bindingPath.String()}, map[string]any{"pattern": `^/([^~]|~[01])*$`}}, "description": "Legacy dotted path or RFC 6901 pointer. Explicit domains are /@data, /@params and /@vars/name."}
	defs["scalar"] = map[string]any{"type": []string{"string", "number", "boolean", "null"}, "maxLength": MaxStringBytes}
	defs["condition"] = map[string]any{"oneOf": []any{
		closedSchema(map[string]any{"op": map[string]any{"enum": []string{"eq", "ne"}}, "path": schemaRef("binding"), "value": schemaRef("scalar")}, "op", "path"),
		closedSchema(map[string]any{"op": map[string]any{"const": "exists"}, "path": schemaRef("binding")}, "op", "path"),
		closedSchema(map[string]any{"op": map[string]any{"enum": []string{"all", "any"}}, "conditions": map[string]any{"type": "array", "items": schemaRef("condition"), "minItems": 1, "maxItems": 32}}, "op", "conditions"),
		closedSchema(map[string]any{"op": map[string]any{"const": "not"}, "conditions": map[string]any{"type": "array", "items": schemaRef("condition"), "minItems": 1, "maxItems": 1}}, "op", "conditions"),
	}}
	defs["repeat"] = closedSchema(map[string]any{"items": schemaRef("binding"), "as": schemaRef("propertyName"), "key": schemaRef("pointer")}, "items", "as")
	defs["payloadBinding"] = closedSchema(map[string]any{"path": map[string]any{"allOf": []any{schemaRef("pointer"), map[string]any{"minLength": 1}}}, "type": map[string]any{"enum": []string{"string", "boolean", "integer", "number", "object", "array"}}}, "path", "type")
	event := closedSchema(map[string]any{
		"on": map[string]any{"enum": []string{"click", "change", "submit", "ely:action", "ely:change"}}, "action": schemaRef("registryKey"), "target": schemaRef("id"),
		"sourceAction": map[string]any{"type": "string", "maxLength": 128, "pattern": `^[^\u0000\r\n]*$`},
		"payload":      map[string]any{"type": "object", "propertyNames": schemaRef("propertyName"), "maxProperties": 32, "additionalProperties": schemaRef("payloadBinding")},
	}, "on", "action", "target")
	event["allOf"] = []any{map[string]any{"if": map[string]any{"required": []string{"sourceAction"}, "properties": map[string]any{"sourceAction": map[string]any{"minLength": 1}}}, "then": map[string]any{"properties": map[string]any{"on": map[string]any{"const": "ely:action"}}}}}
	defs["event"] = event
	defs["parameter"] = parameterContractSchema(formats)
	defs["template"] = closedSchema(map[string]any{"params": map[string]any{"type": "object", "maxProperties": 64, "propertyNames": schemaRef("propertyName"), "additionalProperties": schemaRef("parameter")}, "root": schemaRef("node")}, "root")
	use := closedSchema(map[string]any{
		"id": schemaRef("id"), "type": map[string]any{"const": ""}, "use": schemaRef("registryKey"), "params": map[string]any{"type": "object", "maxProperties": 64, "propertyNames": schemaRef("propertyName")},
		"paramBindings": map[string]any{"type": "object", "maxProperties": 64, "propertyNames": schemaRef("propertyName"), "additionalProperties": schemaRef("binding")},
		"when":          schemaRef("condition"), "repeat": schemaRef("repeat"),
	}, "id", "use")
	use["description"] = "Local template use. Declared parameter names/types, conflicts, required values, cycles and expansion are checked by Compile."
	defs["use"] = use
	return defs
}

func parameterContractSchema(formats []string) map[string]any {
	properties := map[string]any{
		"type":     map[string]any{"enum": []string{"string", "boolean", "integer", "number", "object", "array"}},
		"required": map[string]any{"type": "boolean"}, "default": map[string]any{},
		"enum": map[string]any{"type": "array", "items": map[string]any{"type": "string", "maxLength": HardMaxStringBytes}, "uniqueItems": true},
		"min":  map[string]any{"type": "number"}, "max": map[string]any{"type": "number"},
		"items": schemaRef("parameter"), "properties": map[string]any{"type": "object", "propertyNames": schemaRef("propertyName"), "maxProperties": HardMaxObjectProperties, "additionalProperties": schemaRef("parameter")},
		"additionalProperties": schemaRef("parameter"), "oneOf": map[string]any{"type": "array", "items": schemaRef("parameter"), "minItems": 2, "maxItems": 8},
		"nullable":      map[string]any{"type": "boolean"},
		"format":        map[string]any{"enum": formats},
		"maxLength":     map[string]any{"type": "integer", "minimum": 0, "maximum": HardMaxStringBytes},
		"maxItems":      map[string]any{"type": "integer", "minimum": 0, "maximum": HardMaxArrayItems},
		"maxProperties": map[string]any{"type": "integer", "minimum": 0, "maximum": HardMaxObjectProperties},
	}
	schema := closedSchema(properties)
	schema["oneOf"] = []any{map[string]any{"required": []string{"type"}, "not": map[string]any{"required": []string{"oneOf"}}}, map[string]any{"required": []string{"oneOf"}, "not": map[string]any{"required": []string{"type"}}}}
	schema["description"] = "Bounded typed parameter contract. Renderer targets cannot be supplied. Formats require explicit host policy; Compile validates type-specific constraints and defaults."
	return schema
}

func componentSchema(definition Definition) map[string]any {
	literals, bindings := map[string]any{}, map[string]any{}
	allOf := []any{map[string]any{"not": map[string]any{"required": []string{"event", "events"}}}}
	for _, key := range sortedKeys(definition.Properties) {
		property := definition.Properties[key]
		literals[key] = propertySchema(property)
		bindings[key] = schemaRef("binding")
		literal := map[string]any{"required": []string{"props"}, "properties": map[string]any{"props": map[string]any{"required": []string{key}}}}
		bound := map[string]any{"required": []string{"bindings"}, "properties": map[string]any{"bindings": map[string]any{"required": []string{key}}}}
		allOf = append(allOf, map[string]any{"not": map[string]any{"allOf": []any{literal, bound}}})
		if property.Required && property.Default == nil {
			allOf = append(allOf, map[string]any{"anyOf": []any{literal, bound}})
		}
	}
	properties := map[string]any{
		"id": schemaRef("id"), "type": map[string]any{"const": definition.Name},
		"props": closedSchema(literals), "bindings": closedSchema(bindings),
		"when": schemaRef("condition"), "repeat": schemaRef("repeat"),
	}
	properties["props"].(map[string]any)["maxProperties"] = 64
	properties["bindings"].(map[string]any)["maxProperties"] = 64
	if definition.Container != "" {
		properties["children"] = nodeArraySchema(MaxNodes)
	}
	if len(definition.Events) > 0 {
		event := map[string]any{"allOf": []any{schemaRef("event"), map[string]any{"properties": map[string]any{"on": map[string]any{"enum": append([]string(nil), definition.Events...)}}}}}
		properties["event"] = event
		properties["events"] = map[string]any{"type": "array", "items": event, "maxItems": 16}
	}
	if len(definition.Slots) > 0 {
		slots := map[string]any{}
		required := []string{}
		for _, name := range sortedKeys(definition.Slots) {
			slot := definition.Slots[name]
			childSchema := nodeArraySchema(slot.MaxNodes)
			if slot.Required {
				childSchema["minItems"] = 1
				required = append(required, name)
			}
			if len(slot.AllowedTypes) > 0 {
				typeChoice := map[string]any{"anyOf": []any{
					map[string]any{"required": []string{"use"}},
					map[string]any{"required": []string{"type"}, "properties": map[string]any{"type": map[string]any{"enum": append([]string(nil), slot.AllowedTypes...)}}},
				}}
				childSchema["items"] = map[string]any{"allOf": []any{schemaRef("node"), typeChoice}}
			}
			slots[name] = childSchema
		}
		properties["slots"] = closedSchema(slots, required...)
		if len(required) > 0 {
			allOf = append(allOf, map[string]any{"required": []string{"slots"}})
		}
	}
	if definition.Container == Region {
		delete(properties, "when")
		delete(properties, "repeat")
	}
	schema := closedSchema(properties, "id", "type")
	schema["title"] = definition.Name
	schema["allOf"] = allOf
	if definition.ContainsForm || definition.Container == Form {
		schema["x-ely-contains-form"] = true
	}
	return schema
}

func propertySchema(property Property) map[string]any {
	schema := map[string]any{}
	if len(property.OneOf) > 0 {
		alternatives := []any{}
		for _, alternative := range property.OneOf {
			alternatives = append(alternatives, propertySchema(alternative))
		}
		schema["oneOf"] = alternatives
	} else {
		schema["type"] = string(property.Type)
		if property.Nullable {
			schema["type"] = []string{string(property.Type), "null"}
		}
		switch property.Type {
		case String:
			limit := property.MaxLength
			if limit == 0 {
				limit = MaxStringBytes
			}
			schema["maxLength"] = limit
			schema["x-ely-maxBytes"] = limit
			if len(property.Enum) > 0 {
				tokens := make([]any, 0, len(property.Enum)+1)
				for _, token := range property.Enum {
					tokens = append(tokens, token)
				}
				if property.Nullable {
					tokens = append(tokens, nil)
				}
				schema["enum"] = tokens
			}
			switch property.Format {
			case "action", "identifier":
				schema["pattern"] = registryKey.String()
			case "data-token":
				schema["pattern"] = dataToken.String()
			case "numeric-token":
				schema["pattern"] = numericToken.String()
			}
			if property.formatRule != nil && property.formatRule.Pattern != "" {
				schema["pattern"] = property.formatRule.Pattern
			}
			if property.Format == "field-name" {
				schema["pattern"] = registryKey.String()
			}
		case Integer, Number:
			if property.Min != nil {
				schema["minimum"] = *property.Min
			}
			if property.Max != nil {
				schema["maximum"] = *property.Max
			}
		case Array:
			limit := property.MaxItems
			if limit == 0 {
				limit = MaxArrayItems
			}
			if property.Format == "empty-array" {
				limit = 0
			}
			schema["maxItems"] = limit
			if property.Items != nil {
				schema["items"] = propertySchema(*property.Items)
			}
		case Object:
			limit := property.MaxProperties
			if limit == 0 {
				limit = MaxObjectProperties
			}
			schema["maxProperties"] = limit
			fields := map[string]any{}
			required := []string{}
			for _, key := range sortedKeys(property.Properties) {
				child := property.Properties[key]
				fields[key] = propertySchema(child)
				if child.Required && child.Default == nil {
					required = append(required, key)
				}
			}
			schema["properties"] = fields
			schema["additionalProperties"] = false
			if len(required) > 0 {
				schema["required"] = required
			}
			if property.AdditionalProperties != nil {
				schema["additionalProperties"] = propertySchema(*property.AdditionalProperties)
			}
		}
	}
	if property.Nullable && len(property.OneOf) > 0 {
		schema = map[string]any{"anyOf": []any{schema, map[string]any{"type": "null"}}}
	}
	if property.Default != nil {
		if value, ok := wireDefault(property, property.Default); ok {
			schema["default"] = value
		}
	}
	if property.Format != "" {
		schema["x-ely-format"] = property.Format
	}
	return schema
}

// Defaults held by the registry already use trusted target keys. Export them
// back in wire names, so editor suggestions can be pasted into props safely.
func wireDefault(property Property, value any) (any, bool) {
	if value == nil {
		return nil, true
	}
	if len(property.OneOf) > 0 {
		return nil, false
	}
	switch property.Type {
	case Object:
		values, ok := value.(map[string]any)
		if !ok {
			return nil, false
		}
		result := map[string]any{}
		used := map[string]bool{}
		for key, child := range property.Properties {
			target := key
			if v, exists := values[target]; exists {
				converted, ok := wireDefault(child, v)
				if !ok {
					return nil, false
				}
				result[key] = converted
				used[target] = true
			}
		}
		for key, v := range values {
			if !used[key] {
				if property.AdditionalProperties == nil {
					return nil, false
				}
				converted, ok := wireDefault(*property.AdditionalProperties, v)
				if !ok {
					return nil, false
				}
				result[key] = converted
			}
		}
		return result, true
	case Array:
		values, ok := value.([]any)
		if !ok || property.Items == nil {
			return nil, false
		}
		result := make([]any, len(values))
		for i, v := range values {
			converted, ok := wireDefault(*property.Items, v)
			if !ok {
				return nil, false
			}
			result[i] = converted
		}
		return result, true
	default:
		return value, true
	}
}
