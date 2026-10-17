package sduicatalogue

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"unicode"
)

// canonicalValue erases Go-only slice/map types while retaining exact numbers.
func canonicalValue(value any) (any, error) {
	b, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	var out any
	err = d.Decode(&out)
	return out, err
}
func infer(v any) Property {
	p := Property{}
	switch x := v.(type) {
	case nil:
		p.Nullable = true
	case string:
		p.Type = "string"
		if len(x) > 16384 {
			p.MaxLength = 262144
		}
	case bool:
		p.Type = "boolean"
	case json.Number:
		p.Type = "integer"
		if _, err := x.Int64(); err != nil {
			p.Type = "number"
		}
	case map[string]any:
		p.Type = "object"
		p.Properties = map[string]Property{}
		for k, v := range x {
			p.Properties[k] = infer(v)
		}
		if len(x) > 128 {
			p.MaxProperties = 1024
		}
	case []any:
		p.Type = "array"
		for _, v := range x {
			item := infer(v)
			if p.Items == nil {
				p.Items = &item
			} else {
				m := merge(*p.Items, item)
				p.Items = &m
			}
		}
		if len(x) > 1000 {
			p.MaxItems = 4096
		}
	}
	return p
}
func merge(a, b Property) Property {
	if a.Type == "" && len(a.OneOf) == 0 {
		b.Nullable = b.Nullable || a.Nullable
		return b
	}
	if b.Type == "" && len(b.OneOf) == 0 {
		a.Nullable = a.Nullable || b.Nullable
		return a
	}
	if (a.Type == "number" && b.Type == "integer") || (a.Type == "integer" && b.Type == "number") {
		a.Type = "number"
		a.Nullable = a.Nullable || b.Nullable
		return a
	}
	if a.Type != b.Type || len(a.OneOf) > 0 || len(b.OneOf) > 0 {
		variants := []Property{}
		appendOne := func(p Property) {
			if len(p.OneOf) > 0 {
				variants = append(variants, p.OneOf...)
			} else {
				p.Nullable = false
				variants = append(variants, p)
			}
		}
		appendOne(a)
		appendOne(b)
		out := Property{Nullable: a.Nullable || b.Nullable}
		for _, p := range variants {
			found := false
			for i, old := range out.OneOf {
				if old.Type == p.Type || (old.Type == "number" && p.Type == "integer") || (old.Type == "integer" && p.Type == "number") {
					out.OneOf[i] = merge(old, p)
					found = true
					break
				}
			}
			if !found {
				out.OneOf = append(out.OneOf, p)
			}
		}
		sort.Slice(out.OneOf, func(i, j int) bool { return out.OneOf[i].Type < out.OneOf[j].Type })
		if len(out.OneOf) == 1 {
			p := out.OneOf[0]
			p.Nullable = out.Nullable
			return p
		}
		return out
	}
	a.Nullable = a.Nullable || b.Nullable
	a.MaxLength = max(a.MaxLength, b.MaxLength)
	a.MaxItems = max(a.MaxItems, b.MaxItems)
	a.MaxProperties = max(a.MaxProperties, b.MaxProperties)
	if a.Type == "object" {
		if a.Properties == nil {
			a.Properties = map[string]Property{}
		}
		for k, p := range b.Properties {
			a.Properties[k] = merge(a.Properties[k], p)
		}
	}
	if a.Type == "array" && b.Items != nil {
		if a.Items == nil {
			v := *b.Items
			a.Items = &v
		} else {
			v := merge(*a.Items, *b.Items)
			a.Items = &v
		}
	}
	return a
}
func hintType(r *access) string {
	for _, k := range []string{"array", "object", "integer", "number", "string", "boolean"} {
		if r.hints[k] {
			return k
		}
	}
	return "string"
}
func ensure(p Property, parts []string, hint string) Property {
	if len(parts) == 0 {
		if p.Type == "" && len(p.OneOf) == 0 {
			p.Type = hint
		}
		return p
	}
	if len(p.OneOf) > 0 {
		for i, v := range p.OneOf {
			if (parts[0] == "*" && (v.Type == "array" || v.Type == "object")) || (parts[0] != "*" && v.Type == "object") {
				p.OneOf[i] = ensure(v, parts, hint)
			}
		}
		return p
	}
	if parts[0] == "*" {
		if p.Type == "object" {
			var item Property
			for _, v := range p.Properties {
				item = merge(item, v)
			}
			if p.AdditionalProperties != nil {
				item = merge(item, *p.AdditionalProperties)
			}
			item = ensure(item, parts[1:], hint)
			p.AdditionalProperties = &item
			p.Properties = nil
			return p
		}
		if p.Type == "" {
			p.Type = "array"
		}
		if p.Type != "array" {
			return p
		}
		item := Property{}
		if p.Items != nil {
			item = *p.Items
		}
		item = ensure(item, parts[1:], hint)
		p.Items = &item
		return p
	}
	if p.Type == "" {
		p.Type = "object"
	}
	if p.Type != "object" {
		return p
	}
	if p.Properties == nil {
		p.Properties = map[string]Property{}
	}
	p.Properties[parts[0]] = ensure(p.Properties[parts[0]], parts[1:], hint)
	return p
}
func wireKey(key string) string {
	r := []rune(key)
	if len(r) == 0 {
		return key
	}
	end := 0
	for end < len(r) && unicode.IsUpper(r[end]) {
		end++
	}
	if end > 1 && end < len(r) && unicode.IsLower(r[end]) {
		end--
	}
	if end == 0 {
		end = 1
	}
	for i := 0; i < end; i++ {
		r[i] = unicode.ToLower(r[i])
	}
	return string(r)
}
func joinPath(base, key string) string {
	if base == "" {
		return key
	}
	return base + "." + key
}
func used(a *analysis, path string) bool {
	for p, r := range a.refs {
		if p == path || strings.HasPrefix(p, path+".") || (r.whole && strings.HasPrefix(path, p+".")) {
			return true
		}
	}
	return false
}
func banned(key string, root bool) string {
	low := strings.ToLower(key)
	switch low {
	case "attrs", "class", "classname", "innerhtml", "outerhtml", "script", "javascript", "form", "formaction", "formtarget", "formenctype", "formmethod", "formnovalidate":
		return "arbitrary attributes, CSS, or executable content are not an SDUI capability"
	}
	if root {
		switch low {
		case "id", "kind", "chapter", "component", "componentname", "family", "template", "variant":
			return "renderer identity is host-owned"
		}
		if strings.HasPrefix(low, "on") || strings.HasPrefix(low, "hx") {
			return "event/HTMX attributes are host-owned"
		}
	}
	return ""
}
func schemaFor(full Property, a *analysis, allowHTML bool) (map[string]Property, []Exclusion, error) {
	for _, path := range a.paths() {
		full = ensure(full, strings.Split(path, "."), hintType(a.refs[path]))
	}
	// Chart work values are continuous even when the story uses whole points.
	if a.fixed["Chapter"] == "project" && a.fixed["Kind"] == "Burndown Chart" {
		for _, key := range []string{"Scope", "Max"} {
			p := full.Properties[key]
			p.Type = "number"
			full.Properties[key] = p
		}
		p := full.Properties["Remaining"]
		p.Type = "array"
		p.Items = &Property{Type: "number"}
		full.Properties["Remaining"] = p
	}
	excluded := []Exclusion{}
	var walk func(Property, string, bool) (Property, error)
	walk = func(p Property, path string, root bool) (Property, error) {
		if len(p.OneOf) > 0 {
			for i, v := range p.OneOf {
				v, err := walk(v, path, root)
				if err != nil {
					return p, err
				}
				p.OneOf[i] = v
			}
			return p, nil
		}
		if p.Type == "" {
			p.Type = "string"
		}
		if p.Type == "object" {
			if path == "Devtools" && a.fixed["Chapter"] == "devtools" {
				p.Format = "inert-data"
			}
			if path == "CanvasScene.style" {
				p.Format = "data-token"
			}
			out := map[string]Property{}
			keys := sortedKeys(p.Properties)
			for _, key := range keys {
				next := joinPath(path, key)
				if next == "AnimationURL" && a.fixed["Variant"] == "Lottie Player" {
					excluded = append(excluded, Exclusion{next, "fetched animations require host-side resource validation; inline vector-only animation is supported"})
					continue
				}
				if next == "Target" && a.fixed["Chapter"] == "overlays" {
					excluded = append(excluded, Exclusion{next, "arbitrary DOM selectors require a host-owned scoped target"})
					continue
				}
				if !used(a, next) {
					continue
				}
				if reason := banned(key, root); reason != "" && !(key == "Variant" && a.fixed["Kind"] == nil) {
					excluded = append(excluded, Exclusion{next, reason})
					continue
				}
				if key == "HTML" && !allowHTML {
					excluded = append(excluded, Exclusion{next, "raw HTML is unsupported outside the fixed sandboxed iframe renderers"})
					continue
				}
				child, err := walk(p.Properties[key], next, false)
				if err != nil {
					return p, err
				}
				child.Target = key
				wire := wireKey(key)
				if _, exists := out[wire]; exists {
					return p, fmt.Errorf("wire property collision at %s", next)
				}
				out[wire] = child
			}
			p.Properties = out
			if p.AdditionalProperties != nil {
				child, err := walk(*p.AdditionalProperties, joinPath(path, "*"), false)
				if err != nil {
					return p, err
				}
				p.AdditionalProperties = &child
			}
			return p, nil
		}
		if p.Type == "array" {
			item := Property{Type: "string"}
			if p.Items != nil {
				item = *p.Items
			}
			item, err := walk(item, joinPath(path, "*"), false)
			if err != nil {
				return p, err
			}
			p.Items = &item
			return p, nil
		}
		if p.Type == "string" {
			p.Format = "text"
			if r := a.refs[path]; r != nil {
				for _, format := range []string{"markdown-source", "sandbox-html", "image-url", "media-url", "url", "action", "identifier", "color", "data-token"} {
					if r.formats[format] {
						p.Format = format
						break
					}
				}
			}
			last := path[strings.LastIndex(path, ".")+1:]
			if (last == "URL" || last == "Href" || last == "Src" || strings.HasSuffix(last, "URL")) && p.Format == "text" {
				p.Format = "url"
			}
			if last == "Action" {
				p.Format = "action"
			}
			if last == "Style" {
				p.Format = "data-token"
			}
			low := strings.ToLower(last)
			if strings.HasPrefix(path, "Devtools.") && low == "url" {
				p.Format = "text"
			}
			if path == "Activities.*.Action" && a.fixed["Chapter"] == "collab" {
				p.Format = "text"
			}
			if strings.HasSuffix(low, "color") || low == "foreground" || low == "background" || low == "darkforeground" || low == "darkbackground" || low == "bordercolor" {
				p.Format = "color"
			}
			if strings.HasPrefix(path, "CanvasScene.style.") {
				if low == "start" || low == "end" {
					p.Format = "color"
				}
				if low == "family" {
					p.Format = "font-family"
				}
				if low == "dash" {
					p.Enum = []string{"solid", "dashed", "dotted", "double", "none"}
					p.Format = "data-token"
				}
				if low == "align" {
					p.Enum = []string{"left", "center", "right", "justify", "start", "end"}
					p.Format = "data-token"
				}
			}
			if path == "Target" && a.fixed["Chapter"] == "charts" {
				p.Format = "numeric-token"
			}
			if (a.fixed["Chapter"] == "theme" || a.fixed["Chapter"] == "tooling") && (low == "token" || low == "backgroundtoken" || low == "foregroundtoken") {
				p.Format = "css-token"
			}
			if path == "Animation" && a.fixed["Variant"] == "Lottie Player" {
				p.Format = "lottie-json"
			}
			if last == "HTML" && allowHTML {
				p.Format = "sandbox-html"
			}
		}
		return p, nil
	}
	out, err := walk(full, "", true)
	return out.Properties, excluded, err
}
func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
func project(p Property, v any, path string) (any, []Exclusion, error) {
	if v == nil {
		return nil, nil, nil
	}
	if len(p.OneOf) > 0 {
		typ := infer(v).Type
		for _, alt := range p.OneOf {
			if alt.Type == typ || (alt.Type == "number" && typ == "integer") {
				return project(alt, v, path)
			}
		}
		return nil, nil, fmt.Errorf("%s: no variant for %T", path, v)
	}
	switch p.Type {
	case "object":
		m, ok := v.(map[string]any)
		if !ok {
			return v, nil, nil
		}
		out := map[string]any{}
		excluded := []Exclusion{}
		targets := map[string]string{}
		for wire, c := range p.Properties {
			targets[c.Target] = wire
		}
		for _, key := range sortedKeys(m) {
			wire, known := targets[key]
			child := p.Properties[wire]
			if !known {
				if p.AdditionalProperties != nil {
					wire = key
					child = *p.AdditionalProperties
				} else {
					excluded = append(excluded, Exclusion{joinPath(path, key), "not consumed by this renderer or intentionally unsupported"})
					continue
				}
			}
			value, ex, err := project(child, m[key], joinPath(path, key))
			if err != nil {
				return nil, nil, err
			}
			out[wire] = value
			excluded = append(excluded, ex...)
		}
		return out, excluded, nil
	case "array":
		arr, ok := v.([]any)
		if !ok {
			return v, nil, nil
		}
		out := make([]any, len(arr))
		excluded := []Exclusion{}
		for i, v := range arr {
			value, ex, err := project(*p.Items, v, fmt.Sprintf("%s[%d]", path, i))
			if err != nil {
				return nil, nil, err
			}
			out[i] = value
			excluded = append(excluded, ex...)
		}
		return out, excluded, nil
	}
	return v, nil, nil
}
