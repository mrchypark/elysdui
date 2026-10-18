// Package gohtmx adapts semantic SDUI plans to the standalone Go HTML/HTMX UI.
package gohtmx

import (
	"fmt"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"github.com/mrchypark/elysdui/sdui"
	"html/template"
	"sort"
	"sync"
)

// Definition binds a semantic contract to one reviewed HTML renderer. These
// trusted host selectors can never be supplied by a screen document.
type Definition struct {
	Name         string                    `json:"name"`
	Template     string                    `json:"template,omitempty"`
	Chapter      string                    `json:"chapter,omitempty"`
	Component    string                    `json:"component,omitempty"`
	Family       string                    `json:"family,omitempty"`
	Container    ContainerKind             `json:"container,omitempty"`
	Properties   map[string]Property       `json:"properties,omitempty"`
	Events       []string                  `json:"events,omitempty"`
	Assets       []string                  `json:"assets,omitempty"`
	ContainsForm bool                      `json:"containsForm,omitempty"`
	Slots        map[string]SlotDefinition `json:"slots,omitempty"`
	// SandboxHTML grants the reviewed, fixed sandbox="" iframe srcdoc sink of
	// misc/WebView and misc/IframeEmbed. It never marks input as trusted HTML.
	SandboxHTML bool `json:"sandboxHTML,omitempty"`
}

type Registry struct {
	mu          sync.RWMutex
	templates   *template.Template
	definitions map[string]Definition
	core        *sdui.Registry
	urlPolicy   URLPolicy
}
type RegistryOption func(*Registry)

func WithURLPolicy(policy URLPolicy) RegistryOption {
	return func(r *Registry) { r.urlPolicy = policy }
}
func NewRegistry(tpl *template.Template, options ...RegistryOption) *Registry {
	r := &Registry{templates: tpl, definitions: map[string]Definition{}}
	for _, option := range options {
		if option != nil {
			option(r)
		}
	}
	r.core = sdui.NewRegistry(sdui.WithURLPolicy(r.urlPolicy))
	return r
}

var knownFamilies = map[string]bool{"foundation": true, "interaction": true, "data": true, "workspace": true, "communication": true, "native": true, "forms": true}

func resolveComponent(d Definition) (bool, error) {
	if d.Component == "" {
		return false, nil
	}
	component, err := ui.ResolveComponent(d.Chapter, d.Component)
	return component.Chapter == "devtools", err
}
func withSemantic(d Definition, core sdui.Definition) Definition {
	properties := map[string]Property{}
	for key, p := range core.Properties {
		properties[key] = rendererProperty(d.Properties[key], p, key)
	}
	d.Properties = properties
	d.Events = core.Events
	slots := map[string]SlotDefinition{}
	for key, s := range core.Slots {
		target := d.Slots[key].Target
		if target == "" {
			target = key
		}
		slots[key] = SlotDefinition{Target: target, Required: s.Required, AllowedTypes: s.AllowedTypes, MaxNodes: s.MaxNodes}
	}
	d.Slots = slots
	d.Assets = append([]string(nil), d.Assets...)
	return d
}

// Register validates renderer selection and the entire semantic contract, then
// publishes a copied definition atomically. Existing plans retain their snapshot.
func (r *Registry) Register(d Definition) error {
	if r == nil || r.templates == nil {
		return fmt.Errorf("sdui: registry requires templates")
	}
	kinds := 0
	if d.Template != "" {
		kinds++
	}
	if d.Component != "" {
		kinds++
	}
	if d.Container != "" {
		kinds++
	}
	if kinds != 1 {
		return fmt.Errorf("sdui: definition %q must select exactly one renderer", d.Name)
	}
	if d.Template != "" && r.templates.Lookup(d.Template) == nil {
		return fmt.Errorf("sdui: unknown template %q", d.Template)
	}
	if d.Component != "" {
		component, err := ui.ResolveComponent(d.Chapter, d.Component)
		if err != nil {
			return fmt.Errorf("sdui: %w", err)
		}
		if d.Family != "" && d.Family != component.Family {
			return fmt.Errorf("sdui: component family mismatch")
		}
		d.Family = component.Family
	}
	if d.Family != "" && !knownFamilies[d.Family] {
		return fmt.Errorf("sdui: unknown asset family %q", d.Family)
	}
	if d.SandboxHTML {
		component, err := ui.ResolveComponent(d.Chapter, d.Component)
		if err != nil || component.Chapter != "misc" || (component.Name != "WebView" && component.Name != "IframeEmbed") {
			return fmt.Errorf("sdui: sandbox-html requires a reviewed sandboxed document component")
		}
	}
	seenAssets := map[string]bool{}
	for _, asset := range d.Assets {
		if asset != "map" || seenAssets[asset] {
			return fmt.Errorf("sdui: unsupported or duplicate asset %q", asset)
		}
		seenAssets[asset] = true
	}
	semantic, err := semanticDefinition(d, false)
	if err != nil {
		return err
	}
	targets, err := semanticDefinition(d, true)
	if err != nil {
		return err
	}
	targetRegistry := sdui.NewRegistry(sdui.WithURLPolicy(r.urlPolicy), sdui.WithFormats(formatsForDefinition(d)))
	if err := targetRegistry.Register(targets); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	// Validate defaults and copy all metadata before mutating the live registry.
	stage := r.core.Clone(sdui.WithFormats(formatsForDefinition(d)))
	if err := stage.Register(semantic); err != nil {
		return err
	}
	core, _ := stage.Definition(d.Name)
	rendered := withSemantic(d, core)
	for _, p := range rendered.Properties {
		if p.Default != nil {
			if _, err := remapValue(p, p.Default); err != nil {
				return err
			}
		}
	}
	r.core = stage
	r.definitions[d.Name] = rendered
	return nil
}

func (r *Registry) Definitions() []Definition {
	if r == nil {
		return nil
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]Definition, 0, len(r.definitions))
	for _, core := range r.core.Definitions() {
		result = append(result, withSemantic(r.definitions[core.Name], core))
	}
	return result
}

// Compile validates all semantic branches and snapshots the matching renderers.
func Compile(screen Screen, r *Registry) (*Plan, error) {
	if r == nil || r.templates == nil {
		return nil, fmt.Errorf("sdui: registry requires templates")
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	count := 0
	var check func(Node, int) error
	check = func(node Node, depth int) error {
		count++
		if depth > MaxDepth || count > MaxNodes*3 {
			return fmt.Errorf("sdui: screen source exceeds complexity limit")
		}
		if d, ok := r.definitions[node.Type]; ok {
			for name, value := range node.Props {
				if p, ok := d.Properties[name]; ok {
					if err := checkTargetKeys(p, value, 1); err != nil {
						return err
					}
				}
			}
		}
		for _, child := range node.Children {
			if err := check(child, depth+1); err != nil {
				return err
			}
		}
		for _, children := range node.Slots {
			for _, child := range children {
				if err := check(child, depth+1); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := check(screen.Root, 1); err != nil {
		return nil, err
	}
	for _, definition := range screen.Templates {
		if err := check(definition.Root, 1); err != nil {
			return nil, err
		}
	}
	// Parameter schemas may use ordinary renderer data formats, never the
	// per-component sandbox or inert-document capabilities.
	core, err := sdui.Compile(screen, r.core.Clone(sdui.WithFormats(formatsForDefinition(Definition{}))))
	if err != nil {
		return nil, err
	}
	p := &Plan{core: core, templates: r.templates, definitions: map[string]Definition{}}
	families, assets := map[string]bool{}, map[string]bool{}
	for _, definition := range core.Definitions() {
		d := withSemantic(r.definitions[definition.Name], definition)
		p.definitions[d.Name] = d
		if d.Family != "" {
			families[d.Family] = true
		}
		for _, asset := range d.Assets {
			assets[asset] = true
		}
	}
	for family := range families {
		p.families = append(p.families, family)
	}
	sort.Strings(p.families)
	for asset := range assets {
		p.assets = append(p.assets, asset)
	}
	sort.Strings(p.assets)
	return p, nil
}

// DefaultRegistry is a small safe surface, not an implicit catalogue import.
func DefaultRegistry() (*Registry, error) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		return nil, err
	}
	tpl, err = tpl.Parse(`{{define "sdui-text"}}<p>{{.Text}}</p>{{end}}`)
	if err != nil {
		return nil, err
	}
	r := NewRegistry(tpl)
	str := func(target string, required bool) Property {
		return Property{Type: String, Target: target, Required: required}
	}
	boolean := func(target string) Property { return Property{Type: Boolean, Target: target, Default: false} }
	enum := func(target, def string, values ...string) Property {
		return Property{Type: String, Target: target, Default: def, Enum: values}
	}
	// Options use the same reviewed HTML template targets; native projection
	// restores lower-camel wire names after normalization.
	selectionOptions := Property{Type: Array, Target: "Options", Required: true, MaxItems: 64,
		Items: &Property{Type: Object, Properties: map[string]Property{
			"value": str("Value", true), "label": str("Label", true),
		}}}
	definitions := []Definition{
		{Name: "stack", Container: Stack, Properties: map[string]Property{"gap": enum("Gap", "md", "none", "xs", "sm", "md", "lg"), "direction": enum("Direction", "column", "column", "row"), "align": enum("Align", "stretch", "start", "center", "end", "stretch")}},
		{Name: "region", Container: Region, Properties: map[string]Property{"label": str("Label", false)}},
		{Name: "form", Container: Form, Events: []string{"submit"}, Properties: map[string]Property{"label": str("Label", false)}},
		{Name: "text", Template: "sdui-text", Properties: map[string]Property{"text": str("Text", true)}},
		{Name: "notice", Template: "alert", Properties: map[string]Property{"text": str("Content", true), "title": str("Title", false), "urgent": boolean("Urgent")}},
		{Name: "input", Template: "input", Events: []string{"change"}, Properties: map[string]Property{"name": str("Name", true), "value": str("Value", false), "label": str("AriaLabel", true), "placeholder": str("Placeholder", false), "type": enum("Type", "text", "text", "email", "search", "tel", "number", "password", "date", "file", "hidden"), "required": boolean("Required"), "disabled": boolean("Disabled"), "readonly": boolean("Readonly"), "multiple": boolean("Multiple")}},
		{Name: "button", Template: "button", Events: []string{"click"}, Properties: map[string]Property{"label": str("Label", true), "type": enum("Type", "button", "button", "submit", "reset"), "variant": enum("Variant", "default", "default", "primary", "secondary", "outline", "ghost", "destructive"), "size": enum("Size", "default", "default", "xs", "sm", "lg"), "name": str("Name", false), "value": str("Value", false), "disabled": boolean("Disabled")}},
		{Name: "checkbox", Template: "checkbox", Events: []string{"change"}, Properties: map[string]Property{"name": str("Name", true), "label": str("AriaLabel", true), "value": str("Value", false), "checked": boolean("Checked"), "disabled": boolean("Disabled")}},
		{Name: "select", Template: "select", Events: []string{"change"}, Properties: map[string]Property{"name": str("Name", true), "label": str("AriaLabel", true), "value": str("Value", false), "disabled": boolean("Disabled"), "options": selectionOptions}},
		{Name: "switch", Chapter: "forms", Component: "Switch", Events: []string{"change", "ely:change"}, Properties: map[string]Property{"label": str("Label", true), "name": str("Name", true), "value": str("Value", false), "checked": boolean("Checked"), "disabled": boolean("Disabled")}},
	}
	for _, definition := range definitions {
		if err := r.Register(definition); err != nil {
			return nil, err
		}
	}
	return r, nil
}
