package ui

import (
	"bytes"
	"fmt"
	"html/template"
	"io"
	"regexp"
	"strings"
	"sync"
)

// Component is an instance of a catalogue component. Props contain caller data.
// Chapter disambiguates names such as DocumentViewer used in multiple chapters.
type Component struct {
	Chapter string
	Name    string
	ID      string
	Props   map[string]any
}

type ComponentDefinition struct {
	Chapter, Name, Family, Template string
	Aliases                         []string
}

var componentID = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_-]{0,127}$`)

var componentFamilies = map[string]string{
	"primitives": "foundation", "typography": "foundation", "layout": "foundation",
	"buttons": "interaction", "navigation": "interaction", "menus": "interaction", "overlays": "interaction", "feedback": "interaction", "motion": "interaction", "interaction": "interaction",
	"data": "data", "lists": "data", "tables": "data", "charts": "data", "finance": "data", "dashboard": "data",
	"editor": "workspace", "terminal": "workspace", "git": "workspace", "debug": "workspace", "documents": "workspace", "collab": "workspace", "files": "workspace", "canvas": "workspace", "devtools": "workspace",
	"chat": "communication", "agent": "communication", "messaging": "communication", "mail": "communication", "calendar": "communication", "project": "communication",
	"generative": "native", "media": "native", "misc": "native", "tooling": "native", "shell": "native", "theme": "native", "i18n": "native", "rendering": "native",
	"forms": "forms", "settings": "forms", "account": "forms", "onboarding": "forms", "maps": "forms",
}

type componentRegistry struct {
	definitions []ComponentDefinition
	qualified   map[string]ComponentDefinition
	names       map[string][]ComponentDefinition
	err         error
}

var registry = sync.OnceValue(func() componentRegistry {
	chapters, err := Catalogue()
	r := componentRegistry{qualified: map[string]ComponentDefinition{}, names: map[string][]ComponentDefinition{}, err: err}
	for _, chapter := range chapters {
		family := componentFamilies[chapter.Slug]
		if family == "" {
			r.err = fmt.Errorf("component chapter %q has no API family", chapter.Slug)
			return r
		}
		for _, story := range chapter.Stories {
			d := ComponentDefinition{Chapter: chapter.Slug, Name: story.Name, Family: family, Template: "ely-api-" + chapter.Slug, Aliases: append([]string(nil), story.Components...)}
			r.definitions = append(r.definitions, d)
			seen := map[string]bool{}
			for _, name := range append(append([]string(nil), d.Aliases...), d.Name) {
				if seen[name] {
					continue
				}
				seen[name] = true
				key := d.Chapter + "/" + name
				// Repeated aliases inside a chapter identify related presentations.
				// The primary story name always selects its own presentation.
				if _, exists := r.qualified[key]; !exists || name == d.Name {
					r.qualified[key] = d
				}
			}
		}
	}
	for key, definition := range r.qualified {
		name := strings.SplitN(key, "/", 2)[1]
		r.names[name] = append(r.names[name], definition)
	}
	return r
})

// ComponentDefinitions returns a copy of all primary API definitions.
func ComponentDefinitions() ([]ComponentDefinition, error) {
	r := registry()
	definitions := append([]ComponentDefinition(nil), r.definitions...)
	for i := range definitions {
		definitions[i].Aliases = append([]string(nil), definitions[i].Aliases...)
	}
	return definitions, r.err
}

func ResolveComponent(chapter, name string) (ComponentDefinition, error) {
	r := registry()
	if r.err != nil {
		return ComponentDefinition{}, r.err
	}
	if chapter == "" && strings.Contains(name, "/") {
		parts := strings.SplitN(name, "/", 2)
		chapter, name = parts[0], parts[1]
	}
	if chapter != "" {
		if d, ok := r.qualified[chapter+"/"+name]; ok {
			return d, nil
		}
		return ComponentDefinition{}, fmt.Errorf("unknown component %q", chapter+"/"+name)
	}
	if matches := r.names[name]; len(matches) == 1 {
		return matches[0], nil
	} else if len(matches) > 1 {
		return ComponentDefinition{}, fmt.Errorf("component %q requires Chapter", name)
	}
	return ComponentDefinition{}, fmt.Errorf("unknown component %q", name)
}

// RenderComponent renders caller data through a shared, catalogue-resolved API.
// Use a template set from NewTemplates, including application overrides if needed.
func RenderComponent(tpl *template.Template, w io.Writer, component Component) error {
	return renderComponent(tpl, w, component, 0)
}

// RenderComponentLimited caps both the renderer's intermediate body and its
// final wrapper output. It stops template execution at the limit rather than
// allocating an expanded body first. Use a caller buffer for atomic output.
func RenderComponentLimited(tpl *template.Template, w io.Writer, component Component, maxBytes int) error {
	if maxBytes <= 0 {
		return fmt.Errorf("component render limit must be positive")
	}
	return renderComponent(tpl, w, component, maxBytes)
}

type componentLimitWriter struct {
	writer    io.Writer
	remaining int
}

func (w *componentLimitWriter) Write(data []byte) (int, error) {
	if len(data) > w.remaining {
		return 0, fmt.Errorf("component rendering exceeds output limit")
	}
	n, err := w.writer.Write(data)
	w.remaining -= n
	return n, err
}

func renderComponent(tpl *template.Template, w io.Writer, component Component, maxBytes int) error {
	if !componentID.MatchString(component.ID) {
		return fmt.Errorf("component ID must start with a letter and contain at most 128 letters, numbers, underscores or hyphens")
	}
	d, err := ResolveComponent(component.Chapter, component.Name)
	if err != nil {
		return err
	}
	props := make(map[string]any, len(component.Props)+6)
	for key, value := range component.Props {
		props[key] = value
	}
	name := component.Name
	if component.Chapter == "" && strings.Contains(name, "/") {
		name = strings.SplitN(name, "/", 2)[1]
	}
	props["ID"], props["Chapter"], props["Kind"], props["Variant"], props["ComponentName"] = component.ID, d.Chapter, d.Name, name, name
	var body bytes.Buffer
	var bodyWriter io.Writer = &body
	if maxBytes > 0 {
		bodyWriter = &componentLimitWriter{writer: &body, remaining: maxBytes}
		w = &componentLimitWriter{writer: w, remaining: maxBytes}
	}
	if err := tpl.ExecuteTemplate(bodyWriter, d.Template, props); err != nil {
		return fmt.Errorf("render %s/%s: %w", d.Chapter, name, err)
	}
	if strings.TrimSpace(body.String()) == "" {
		return fmt.Errorf("component %s/%s has no renderer", d.Chapter, name)
	}
	return tpl.ExecuteTemplate(w, "ely-api-wrapper", map[string]any{"ID": component.ID, "Chapter": d.Chapter, "Name": name, "Kind": d.Name, "Family": d.Family, "Disabled": props["Disabled"], "Body": template.HTML(body.String())})
}

func componentFrom(value any) (Component, error) {
	if component, ok := value.(Component); ok {
		return component, nil
	}
	props, ok := value.(map[string]any)
	if !ok {
		return Component{}, fmt.Errorf("component expects ui.Component or dict")
	}
	c := Component{}
	c.Chapter, _ = props["Chapter"].(string)
	c.Name, _ = props["Name"].(string)
	c.ID, _ = props["ID"].(string)
	if data := props["Props"]; data != nil {
		c.Props, ok = data.(map[string]any)
		if !ok {
			return Component{}, fmt.Errorf("component Props must be a dict")
		}
	}
	return c, nil
}
