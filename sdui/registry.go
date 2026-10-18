package sdui

import (
	"fmt"
	"sort"
	"strings"
	"sync"
)

// ValueType describes ordinary, recursively typed JSON data. Integer preserves
// exact platform integers; Number normalizes to a finite float64.
type ValueType string

const (
	String  ValueType = "string"
	Boolean ValueType = "boolean"
	Integer ValueType = "integer"
	Number  ValueType = "number"
	Object  ValueType = "object"
	Array   ValueType = "array"
)

// Property describes ordinary semantic data. Objects are closed
// unless AdditionalProperties declares the dictionary value type. OneOf uses
// exactly-one-match semantics and cannot also specify Type. Defaults are copied.
type Property struct {
	Type                  ValueType           `json:"type,omitempty"`
	Required              bool                `json:"required,omitempty"`
	Default               any                 `json:"default,omitempty"`
	Enum                  []string            `json:"enum,omitempty"`
	Min                   *float64            `json:"min,omitempty"`
	Max                   *float64            `json:"max,omitempty"`
	Items                 *Property           `json:"items,omitempty"`
	Properties            map[string]Property `json:"properties,omitempty"`
	AdditionalProperties  *Property           `json:"additionalProperties,omitempty"`
	OneOf                 []Property          `json:"oneOf,omitempty"`
	Nullable              bool                `json:"nullable,omitempty"`
	Format                string              `json:"format,omitempty"`
	MaxLength             int                 `json:"maxLength,omitempty"`
	MaxItems              int                 `json:"maxItems,omitempty"`
	MaxProperties         int                 `json:"maxProperties,omitempty"`
	urlPolicy             URLPolicy
	formats               map[string]FormatRule
	formatRule            *FormatRule
	nestedPropertyAllowed NestedPropertyPolicy
}

// URLPolicy can authorize an external HTTP(S) URL after the runtime's URL
// safety checks. It must be safe to call concurrently and must not mutate data.
// The format distinguishes links, images and media resources. Local absolute
// paths and fragments do not need authorization; other schemes never reach it.
type URLPolicy func(format, rawURL string) bool

type RegistryOption func(*Registry)

// WithURLPolicy explicitly permits host-reviewed external origins. Without it,
// URLs must be local absolute paths, fragments, or empty optional values.
func WithURLPolicy(policy URLPolicy) RegistryOption {
	return func(r *Registry) { r.urlPolicy = policy }
}

// SlotDefinition grants a named child-tree slot. It cannot be filled with
// schema strings or arbitrary renderer content.
type SlotDefinition struct {
	Required     bool     `json:"required,omitempty"`
	AllowedTypes []string `json:"allowedTypes,omitempty"`
	MaxNodes     int      `json:"maxNodes,omitempty"`
}

type Slot = SlotDefinition

// ContainerKind is a fixed semantic structural primitive.
type ContainerKind string

const (
	Stack  ContainerKind = "stack"
	Region ContainerKind = "region"
	Form   ContainerKind = "form"
)

// Definition describes a trusted semantic component contract. A leaf has no
// Container; structural primitives declare their composition behavior. Renderer
// selection is deliberately absent and belongs to a renderer adapter.
type Definition struct {
	Name         string                    `json:"name"`
	Container    ContainerKind             `json:"container,omitempty"`
	Properties   map[string]Property       `json:"properties,omitempty"`
	Events       []string                  `json:"events,omitempty"`
	ContainsForm bool                      `json:"containsForm,omitempty"`
	Slots        map[string]SlotDefinition `json:"slots,omitempty"`
}

// Registry is an explicit opt-in surface, independent of the whole catalogue.
// Register may be called concurrently; compiled plans retain a snapshot.
type Registry struct {
	mu          sync.RWMutex
	definitions map[string]Definition
	urlPolicy   URLPolicy
	formats     map[string]FormatRule
}

func NewRegistry(options ...RegistryOption) *Registry {
	r := &Registry{definitions: map[string]Definition{}}
	for _, option := range options {
		if option != nil {
			option(r)
		}
	}
	return r
}

func reservedProperty(name string) bool {
	key := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(name, "_", ""), "-", ""))
	switch key {
	case "id", "attrs", "class", "classname", "style", "html", "innerhtml", "outerhtml", "body", "script", "javascript", "url", "href", "src", "srcset", "srcdoc", "poster", "background", "cite", "codebase", "longdesc", "manifest", "ping", "xlinkhref", "action", "formaction", "form", "formtarget", "target", "template", "chapter", "component", "componentname", "kind", "family":
		return true
	}
	return strings.HasPrefix(key, "on") || strings.HasPrefix(key, "hx")
}

// Definitions returns sorted, independent copies for editors and tooling.
// Mutating a returned property, default, or slot never changes the registry.
func (r *Registry) Definitions() []Definition {
	if r == nil {
		return nil
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]Definition, 0, len(r.definitions))
	for _, definition := range r.definitions {
		result = append(result, cloneDefinition(definition))
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
	return result
}

func validDefinitionName(name string) bool {
	if name == "" || len(name) > 192 || strings.TrimSpace(name) != name {
		return false
	}
	if !((name[0] >= 'A' && name[0] <= 'Z') || (name[0] >= 'a' && name[0] <= 'z')) {
		return false
	}
	for _, r := range name {
		if !((r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || strings.ContainsRune(" _-./()+&,:", r)) {
			return false
		}
	}
	return true
}

// Register validates a trusted definition and deeply copies its defaults and
// property metadata. Duplicate names and dangerous passthrough props fail.
func (r *Registry) Register(d Definition) error {
	if r == nil {
		return fmt.Errorf("sdui: registry is required")
	}
	if !validDefinitionName(d.Name) {
		return fmt.Errorf("sdui: invalid definition name %q", d.Name)
	}
	if d.Container != "" && d.Container != Stack && d.Container != Region && d.Container != Form {
		return fmt.Errorf("sdui: unknown container %q", d.Container)
	}
	properties := make(map[string]Property, len(d.Properties))

	if len(d.Properties) > MaxObjectProperties {
		return fmt.Errorf("sdui: too many declared properties")
	}
	for key, p := range d.Properties {
		if !propertyAllowed(key, p) {
			return fmt.Errorf("sdui: reserved or invalid property %q", key)
		}
		validated, err := validatePropertyContext(p, r.urlPolicy, r.formats)
		if err != nil {
			return fmt.Errorf("sdui: property %s: %w", key, err)
		}
		properties[key] = validated
	}
	slots := make(map[string]SlotDefinition, len(d.Slots))
	for key, slot := range d.Slots {
		if !propertyName.MatchString(key) {
			return fmt.Errorf("sdui: invalid slot %q", key)
		}
		if _, exists := d.Properties[key]; exists {
			return fmt.Errorf("sdui: slot conflicts with property %q", key)
		}
		if slot.MaxNodes < 0 || slot.MaxNodes > MaxNodes {
			return fmt.Errorf("sdui: invalid slot node limit")
		}
		for _, name := range slot.AllowedTypes {
			if !validDefinitionName(name) {
				return fmt.Errorf("sdui: invalid slot type %q", name)
			}
		}
		slot.AllowedTypes = append([]string(nil), slot.AllowedTypes...)
		slots[key] = slot
	}
	d.Slots = slots
	d.Properties = properties
	d.Events = append([]string(nil), d.Events...)
	for _, event := range d.Events {
		if event != "click" && event != "change" && event != "submit" && event != "ely:action" && event != "ely:change" {
			return fmt.Errorf("sdui: unsupported event %q", event)
		}
		if event == "submit" && d.Container != Form && !d.ContainsForm {
			return fmt.Errorf("sdui: submit requires form container")
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.definitions[d.Name]; exists {
		return fmt.Errorf("sdui: duplicate definition %q", d.Name)
	}
	r.definitions[d.Name] = d
	return nil
}

// DefaultRegistry is a small safe surface, not an implicit catalogue import.
func DefaultRegistry() (*Registry, error) {
	r := NewRegistry()
	str := func(required bool) Property { return Property{Type: String, Required: required} }
	fieldName := func() Property { return Property{Type: String, Required: true, Format: "field-name"} }
	boolean := func() Property { return Property{Type: Boolean, Default: false} }
	enum := func(def string, values ...string) Property { return Property{Type: String, Default: def, Enum: values} }
	// Selection options preserve their lower-camel semantic wire names.
	selectionOptions := Property{Type: Array, Required: true, MaxItems: 64,
		Items: &Property{Type: Object, Properties: map[string]Property{
			"value": str(true), "label": str(true),
		}}}
	definitions := []Definition{
		{Name: "stack", Container: Stack, Properties: map[string]Property{"gap": enum("md", "none", "xs", "sm", "md", "lg"), "direction": enum("column", "column", "row"), "align": enum("stretch", "start", "center", "end", "stretch")}},
		{Name: "region", Container: Region, Properties: map[string]Property{"label": str(false)}},
		{Name: "form", Container: Form, Events: []string{"submit"}, Properties: map[string]Property{"label": str(false)}},
		{Name: "text", Properties: map[string]Property{"text": str(true)}},
		{Name: "notice", Properties: map[string]Property{"text": str(true), "title": str(false), "urgent": boolean()}},
		{Name: "input", Events: []string{"change"}, Properties: map[string]Property{"name": fieldName(), "value": str(false), "label": str(true), "placeholder": str(false), "type": enum("text", "text", "email", "search", "tel", "number", "password", "date", "file", "hidden"), "required": boolean(), "disabled": boolean(), "readonly": boolean(), "multiple": boolean()}},
		{Name: "button", Events: []string{"click"}, Properties: map[string]Property{"label": str(true), "type": enum("button", "button", "submit", "reset"), "variant": enum("default", "default", "primary", "secondary", "outline", "ghost", "destructive"), "size": enum("default", "default", "xs", "sm", "lg"), "name": {Type: String, Format: "field-name"}, "value": str(false), "disabled": boolean()}},
		{Name: "checkbox", Events: []string{"change"}, Properties: map[string]Property{"name": fieldName(), "label": str(true), "value": str(false), "checked": boolean(), "disabled": boolean()}},
		{Name: "select", Events: []string{"change"}, Properties: map[string]Property{"name": fieldName(), "label": str(true), "value": str(false), "disabled": boolean(), "options": selectionOptions}},
		{Name: "switch", Events: []string{"change", "ely:change"}, Properties: map[string]Property{"label": str(true), "name": fieldName(), "value": str(false), "checked": boolean(), "disabled": boolean()}},
	}
	for _, definition := range definitions {
		if err := r.Register(definition); err != nil {
			return nil, err
		}
	}
	return r, nil
}

// Definition returns an independent copy of a registered semantic contract.
func (r *Registry) Definition(name string) (Definition, bool) {
	if r == nil {
		return Definition{}, false
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	d, ok := r.definitions[name]
	if !ok {
		return Definition{}, false
	}
	return cloneDefinition(d), true
}

// Clone snapshots a registry for transactional extension. Options apply to new
// definitions; already validated contracts retain their original policies.
func (r *Registry) Clone(options ...RegistryOption) *Registry {
	clone := NewRegistry()
	if r != nil {
		r.mu.RLock()
		clone.urlPolicy = r.urlPolicy
		clone.formats = r.formats
		for name, d := range r.definitions {
			clone.definitions[name] = d
		}
		r.mu.RUnlock()
	}
	for _, option := range options {
		if option != nil {
			option(clone)
		}
	}
	return clone
}
