package sdui

import (
	"fmt"
	"strconv"
	"strings"
)

// bindingRef is compiled once; rendering never evaluates expressions or uses
// reflection, methods, ambient globals, or JavaScript property semantics.
type bindingRef struct {
	path, domain string
	parts        []string
}
type bindingScope struct {
	params map[string]Property
	vars   map[string]bool
}
type resolveScope struct {
	data     map[string]any
	params   map[string]any
	vars     map[string]any
	identity string
}

func parseBinding(path string, scope bindingScope) (bindingRef, error) {
	ref := bindingRef{path: path, domain: "data"}
	if len(path) == 0 || len(path) > 512 {
		return ref, fmt.Errorf("invalid binding path %q", path)
	}
	if strings.HasPrefix(path, "/") {
		parts, err := pointerParts(path)
		if err != nil {
			return ref, err
		}
		ref.parts = parts
		if len(parts) > 0 && strings.HasPrefix(parts[0], "@") {
			switch parts[0] {
			case "@data":
				ref.parts = parts[1:]
			case "@params":
				ref.domain = "params"
				ref.parts = parts[1:]
				if scope.params == nil {
					return ref, fmt.Errorf("parameter binding outside a template: %q", path)
				}
				if len(ref.parts) > 0 {
					if _, ok := scope.params[ref.parts[0]]; !ok {
						return ref, fmt.Errorf("unknown parameter in binding %q", path)
					}
				}
			case "@vars":
				ref.domain = "vars"
				ref.parts = parts[1:]
				if len(ref.parts) == 0 || !scope.vars[ref.parts[0]] {
					return ref, fmt.Errorf("unknown repeat variable in binding %q", path)
				}
			default:
				return ref, fmt.Errorf("unknown binding scope %q", parts[0])
			}
		}
	} else {
		if !bindingPath.MatchString(path) {
			return ref, fmt.Errorf("invalid binding path %q", path)
		}
		ref.parts = strings.Split(path, ".")
	}
	for _, part := range ref.parts {
		if reservedBindingKey(part) {
			return ref, fmt.Errorf("reserved binding path %q", path)
		}
	}
	if _, _, err := parameterProperty(ref, scope); err != nil {
		return ref, err
	}
	return ref, nil
}

func reservedBindingKey(key string) bool {
	return key == "constructor" || key == "prototype" || key == "__proto__"
}
func pointerParts(path string) ([]string, error) {
	if path == "" {
		return nil, nil
	}
	if len(path) > 512 || !strings.HasPrefix(path, "/") {
		return nil, fmt.Errorf("invalid JSON Pointer %q", path)
	}
	raw := strings.Split(path[1:], "/")
	if len(raw) > 32 {
		return nil, fmt.Errorf("JSON Pointer exceeds depth limit")
	}
	parts := make([]string, len(raw))
	for i, part := range raw {
		var b strings.Builder
		for j := 0; j < len(part); j++ {
			if part[j] != '~' {
				b.WriteByte(part[j])
				continue
			}
			j++
			if j >= len(part) || (part[j] != '0' && part[j] != '1') {
				return nil, fmt.Errorf("invalid JSON Pointer escape in %q", path)
			}
			if part[j] == '0' {
				b.WriteByte('~')
			} else {
				b.WriteByte('/')
			}
		}
		parts[i] = b.String()
		if reservedBindingKey(parts[i]) {
			return nil, fmt.Errorf("reserved JSON Pointer key in %q", path)
		}
	}
	return parts, nil
}

func (ref bindingRef) lookup(scope resolveScope) (any, bool, error) {
	var value any = scope.data
	switch ref.domain {
	case "params":
		value = scope.params
	case "vars":
		value = scope.vars
	}
	return walkData(value, ref.parts, ref.path)
}

func walkData(value any, parts []string, path string) (any, bool, error) {
	for _, key := range parts {
		if object, ok := value.(map[string]any); ok {
			var present bool
			value, present = object[key]
			if !present {
				return nil, false, nil
			}
			continue
		}
		length, ok := arrayLength(value)
		if !ok {
			return nil, false, fmt.Errorf("binding %q does not traverse an object or array", path)
		}
		if key == "" || (len(key) > 1 && key[0] == '0') {
			return nil, false, fmt.Errorf("binding %q has invalid array index", path)
		}
		for _, r := range key {
			if r < '0' || r > '9' {
				return nil, false, fmt.Errorf("binding %q has invalid array index", path)
			}
		}
		index, err := strconv.Atoi(key)
		if err != nil {
			return nil, false, fmt.Errorf("binding %q has invalid array index", path)
		}
		if index >= length {
			return nil, false, nil
		}
		switch array := value.(type) {
		case []any:
			value = array[index]
		case []map[string]any:
			value = array[index]
		case []string:
			value = array[index]
		}

	}
	return value, true, nil
}

func dataArray(value any) ([]any, bool) {
	switch a := value.(type) {
	case []any:
		return a, true
	case []map[string]any:
		values := make([]any, len(a))
		for i, v := range a {
			values[i] = v
		}
		return values, true
	case []string:
		values := make([]any, len(a))
		for i, v := range a {
			values[i] = v
		}
		return values, true
	default:
		return nil, false
	}
}

func resolveBinding(data map[string]any, path string) (any, error) {
	ref, err := parseBinding(path, bindingScope{})
	if err != nil {
		return nil, err
	}
	value, present, err := ref.lookup(resolveScope{data: data})
	if err != nil {
		return nil, err
	}
	if !present {
		return nil, fmt.Errorf("binding %q is missing", path)
	}
	return value, nil
}

// parameterProperty uses the declared parameter contract for early diagnostics.
// Dynamic data/repeat variables still validate against their destination at render.
func parameterProperty(ref bindingRef, scope bindingScope) (Property, bool, error) {
	if ref.domain != "params" {
		return Property{}, false, nil
	}
	property := Property{Type: Object, Properties: scope.params}
	for _, part := range ref.parts {
		if len(property.OneOf) > 0 {
			return Property{}, false, nil
		}
		switch property.Type {
		case Object:
			child, ok := property.Properties[part]
			if !ok {
				if property.AdditionalProperties == nil {
					return Property{}, false, fmt.Errorf("unknown parameter field in binding %q", ref.path)
				}
				child = *property.AdditionalProperties
			}
			property = child
		case Array:
			if part == "" || (len(part) > 1 && part[0] == '0') {
				return Property{}, false, fmt.Errorf("invalid parameter array index in binding %q", ref.path)
			}
			if _, err := strconv.Atoi(part); err != nil || strings.HasPrefix(part, "-") || strings.HasPrefix(part, "+") {
				return Property{}, false, fmt.Errorf("invalid parameter array index in binding %q", ref.path)
			}
			if property.Items == nil {
				return Property{}, false, fmt.Errorf("invalid parameter array contract")
			}
			property = *property.Items
		default:
			return Property{}, false, fmt.Errorf("binding %q traverses scalar parameter", ref.path)
		}
	}
	return property, true, nil
}
