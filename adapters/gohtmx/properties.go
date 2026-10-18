package gohtmx

import (
	"fmt"
	"github.com/mrchypark/elysdui/sdui"
	"reflect"
	"strings"
)

// Property binds a semantic data property to a reviewed template destination.
type Property struct {
	Type                 ValueType           `json:"type,omitempty"`
	Target               string              `json:"target,omitempty"`
	Required             bool                `json:"required,omitempty"`
	Default              any                 `json:"default,omitempty"`
	Enum                 []string            `json:"enum,omitempty"`
	Min                  *float64            `json:"min,omitempty"`
	Max                  *float64            `json:"max,omitempty"`
	Items                *Property           `json:"items,omitempty"`
	Properties           map[string]Property `json:"properties,omitempty"`
	AdditionalProperties *Property           `json:"additionalProperties,omitempty"`
	OneOf                []Property          `json:"oneOf,omitempty"`
	Nullable             bool                `json:"nullable,omitempty"`
	Format               string              `json:"format,omitempty"`
	MaxLength            int                 `json:"maxLength,omitempty"`
	MaxItems             int                 `json:"maxItems,omitempty"`
	MaxProperties        int                 `json:"maxProperties,omitempty"`
	semanticProperty     sdui.Property
}

type SlotDefinition struct {
	Target       string   `json:"target,omitempty"`
	Required     bool     `json:"required,omitempty"`
	AllowedTypes []string `json:"allowedTypes,omitempty"`
	MaxNodes     int      `json:"maxNodes,omitempty"`
}

// semanticProperty strips every renderer destination. Alternate target-keyed
// contracts are validated separately, never stored in the semantic plan.
func semanticProperty(p Property, targets bool, depth int) (sdui.Property, error) {
	if depth > MaxValueDepth {
		return sdui.Property{}, fmt.Errorf("sdui: property schema exceeds complexity limit")
	}
	q := sdui.Property{Type: p.Type, Required: p.Required, Default: p.Default, Enum: p.Enum, Min: p.Min, Max: p.Max, Nullable: p.Nullable, Format: p.Format, MaxLength: p.MaxLength, MaxItems: p.MaxItems, MaxProperties: p.MaxProperties}
	if p.Type == String && p.Target == "Name" && p.Format == "" {
		q.Format = "field-name"
	}
	if targets {
		q.Default = nil
	}
	if p.Items != nil {
		if p.Items.Target != "" {
			return q, fmt.Errorf("sdui: array items cannot declare targets")
		}
		child, err := semanticProperty(*p.Items, targets, depth+1)
		if err != nil {
			return q, err
		}
		q.Items = &child
	}
	if p.AdditionalProperties != nil {
		if p.AdditionalProperties.Target != "" {
			return q, fmt.Errorf("sdui: dictionary values cannot declare targets")
		}
		child, err := semanticProperty(*p.AdditionalProperties, targets, depth+1)
		if err != nil {
			return q, err
		}
		q.AdditionalProperties = &child
	}
	if p.Properties != nil {
		q.Properties = map[string]sdui.Property{}
		for key, child := range p.Properties {
			if child.Target == "" {
				child.Target = key
			}
			name := key
			if targets && child.Target != "" {
				name = child.Target
			}
			if _, exists := q.Properties[name]; exists {
				return q, fmt.Errorf("sdui: duplicate target property %q", name)
			}
			converted, err := semanticProperty(child, targets, depth+1)
			if err != nil {
				return q, err
			}
			q.Properties[name] = converted
		}
	}
	for _, child := range p.OneOf {
		if child.Target != "" {
			return q, fmt.Errorf("sdui: union alternatives cannot declare targets")
		}
		converted, err := semanticProperty(child, targets, depth+1)
		if err != nil {
			return q, err
		}
		q.OneOf = append(q.OneOf, converted)
	}
	return q, nil
}

func rendererProperty(p Property, q sdui.Property, key string) Property {
	if p.Target == "" {
		p.Target = key
	}
	p.semanticProperty = q
	p.Default = q.Default
	p.Enum = q.Enum
	p.Min = q.Min
	p.Max = q.Max
	if q.Items != nil {
		child := rendererProperty(*p.Items, *q.Items, "")
		p.Items = &child
	}
	if q.AdditionalProperties != nil {
		child := rendererProperty(*p.AdditionalProperties, *q.AdditionalProperties, "")
		p.AdditionalProperties = &child
	}
	if q.Properties != nil {
		props := map[string]Property{}
		for key, child := range q.Properties {
			props[key] = rendererProperty(p.Properties[key], child, key)
		}
		p.Properties = props
	}
	if q.OneOf != nil {
		alternatives := make([]Property, len(q.OneOf))
		for i, child := range q.OneOf {
			alternatives[i] = rendererProperty(p.OneOf[i], child, "")
		}
		p.OneOf = alternatives
	}
	return p
}

func semanticDefinition(d Definition, targets bool) (sdui.Definition, error) {
	component, _ := resolveComponent(d)
	q := sdui.Definition{Name: d.Name, Container: d.Container, Events: d.Events, ContainsForm: d.ContainsForm, Properties: map[string]sdui.Property{}, Slots: map[string]sdui.SlotDefinition{}}
	for key, p := range d.Properties {
		target := p.Target
		if target == "" {
			target = key
		}
		if err := validateInertFormatScope(p, component && target == "Devtools" && p.Format == "inert-data", 1); err != nil {
			return q, err
		}
		name := key
		if targets {
			name = target
		}
		if _, exists := q.Properties[name]; exists {
			return q, fmt.Errorf("sdui: duplicate target property %q", name)
		}
		p.Target = target
		converted, err := semanticProperty(p, targets, 1)
		if err != nil {
			return q, err
		}
		q.Properties[name] = converted
	}
	for key, slot := range d.Slots {
		name := key
		if targets && slot.Target != "" {
			name = slot.Target
		}
		if targets && forbiddenSlotTarget(name) {
			return q, fmt.Errorf("sdui: invalid slot target %q", name)
		}
		if _, exists := q.Slots[name]; exists {
			return q, fmt.Errorf("sdui: duplicate slot target %q", name)
		}
		q.Slots[name] = sdui.SlotDefinition{Required: slot.Required, AllowedTypes: slot.AllowedTypes, MaxNodes: slot.MaxNodes}
	}
	return q, nil
}

func forbiddenSlotTarget(name string) bool {
	key := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(name, "_", ""), "-", ""))
	switch key {
	case "attrs", "class", "classname", "innerhtml", "outerhtml", "srcdoc", "template", "form", "formtarget", "formaction", "constructor", "prototype", "proto", "id", "kind", "target", "chapter", "component", "componentname", "family":
		return true
	}
	return strings.HasPrefix(key, "on") || strings.HasPrefix(key, "hx")
}

// remapValue is the only data-name translation boundary. The semantic resolver
// has already validated values. Dictionary keys cannot shadow declared targets.
type mappingBudget struct{ values, bytes int }

func (b *mappingBudget) add(bytes int) error {
	b.bytes += bytes
	if b.bytes > MaxNormalizationBytes || b.values > MaxValues {
		return fmt.Errorf("sdui: mapped data exceeds normalization budget")
	}
	return nil
}
func remapValue(p Property, value any) (any, error) {
	return remapValueBounded(p, value, &mappingBudget{})
}
func remapValueBounded(p Property, value any, budget *mappingBudget) (any, error) {
	if value == nil {
		return nil, nil
	}
	if len(p.OneOf) > 0 {
		for _, alternative := range p.OneOf {
			if _, err := alternative.semanticProperty.Normalize(value); err == nil {
				return remapValueBounded(alternative, value, budget)
			}
		}
		return nil, fmt.Errorf("sdui: no matching renderer property alternative")
	}
	budget.values++
	if err := budget.add(8); err != nil {
		return nil, err
	}
	switch p.Type {
	case Array:
		values, ok := value.([]any)
		if !ok {
			return nil, fmt.Errorf("sdui: expected normalized array")
		}
		result := make([]any, len(values))
		for i, v := range values {
			mapped, err := remapValueBounded(*p.Items, v, budget)
			if err != nil {
				return nil, err
			}
			result[i] = mapped
		}
		return result, nil
	case Object:
		values, ok := value.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("sdui: expected normalized object")
		}
		result := make(map[string]any, len(values))
		for key, v := range values {
			child, declared := p.Properties[key]
			target := key
			if declared {
				target = child.Target
			} else {
				for wire, property := range p.Properties {
					if key == property.Target && key != wire {
						return nil, fmt.Errorf("sdui: dictionary key %q conflicts with declared target", key)
					}
				}
				if p.AdditionalProperties == nil {
					return nil, fmt.Errorf("sdui: unknown property %q", key)
				}
				child = *p.AdditionalProperties
			}
			if _, exists := result[target]; exists {
				return nil, fmt.Errorf("sdui: conflicting target property %q", target)
			}
			mapped, err := remapValueBounded(child, v, budget)
			if err != nil {
				return nil, err
			}
			if err := budget.add(len(target)); err != nil {
				return nil, err
			}
			result[target] = mapped
		}
		return result, nil
	default:
		if text, ok := value.(string); ok {
			if err := budget.add(len(text)); err != nil {
				return nil, err
			}
		}
		return value, nil
	}
}

// checkTargetKeys catches dictionary alias attempts in static schema data even
// on hidden branches. Type/format validation remains the core compiler's job.
func checkTargetKeys(p Property, value any, depth int) error {
	if depth > MaxValueDepth {
		return fmt.Errorf("sdui: value exceeds depth limit")
	}
	if value == nil {
		return nil
	}
	v := reflect.ValueOf(value)
	if len(p.OneOf) > 0 {
		for _, alternative := range p.OneOf {
			if _, err := alternative.semanticProperty.Normalize(value); err == nil {
				return checkTargetKeys(alternative, value, depth+1)
			}
		}
		return nil
	}
	if p.Type == Object && v.Kind() == reflect.Map && v.Type().Key().Kind() == reflect.String {
		if v.Len() > sdui.HardMaxObjectProperties {
			return fmt.Errorf("sdui: object exceeds property limit")
		}
		for _, keyValue := range v.MapKeys() {
			key := keyValue.String()
			child, declared := p.Properties[key]
			if !declared {
				for wire, property := range p.Properties {
					if key == property.Target && key != wire {
						return fmt.Errorf("sdui: dictionary key %q conflicts with declared target", key)
					}
				}
				if p.AdditionalProperties == nil {
					continue
				}
				child = *p.AdditionalProperties
			}
			if err := checkTargetKeys(child, v.MapIndex(keyValue).Interface(), depth+1); err != nil {
				return err
			}
		}
	}
	if p.Type == Array && (v.Kind() == reflect.Slice || v.Kind() == reflect.Array) && p.Items != nil {
		if v.Len() > sdui.HardMaxArrayItems {
			return fmt.Errorf("sdui: array exceeds property limit")
		}
		for i := 0; i < v.Len(); i++ {
			if err := checkTargetKeys(*p.Items, v.Index(i).Interface(), depth+1); err != nil {
				return err
			}
		}
	}
	return nil
}

// A definition-level format registry must not broaden the reviewed sink: only
// the explicitly formatted Devtools root and its closed descendants inherit it.
func validateInertFormatScope(p Property, allowed bool, depth int) error {
	if depth > MaxValueDepth {
		return fmt.Errorf("sdui: property schema exceeds complexity limit")
	}
	if p.Format == "inert-data" && !allowed {
		return fmt.Errorf("sdui: inert-data requires reviewed Devtools target")
	}
	if p.Items != nil {
		if err := validateInertFormatScope(*p.Items, allowed, depth+1); err != nil {
			return err
		}
	}
	if p.AdditionalProperties != nil {
		if err := validateInertFormatScope(*p.AdditionalProperties, allowed, depth+1); err != nil {
			return err
		}
	}
	for _, child := range p.Properties {
		if err := validateInertFormatScope(child, allowed, depth+1); err != nil {
			return err
		}
	}
	for _, child := range p.OneOf {
		if err := validateInertFormatScope(child, allowed, depth+1); err != nil {
			return err
		}
	}
	return nil
}
