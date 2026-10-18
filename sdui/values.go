package sdui

import (
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"net/url"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	MaxValueDepth           = 16
	MaxValues               = 32768
	MaxNormalizationBytes   = 2 << 20
	MaxArrayItems           = 1000
	MaxObjectProperties     = 128
	HardMaxStringBytes      = 256 << 10
	HardMaxArrayItems       = 4096
	HardMaxObjectProperties = 1024
)

var numericToken = regexp.MustCompile(`^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`)

var dataToken = regexp.MustCompile(`^([A-Za-z0-9_][A-Za-z0-9_. -]{0,127}|#[A-Fa-f0-9]{3,8})$`)

// A normalization budget is shared across properties by the compiler/renderer.
// Union probes use independent copies, so rejected candidates do not consume it.
type valueBudget struct{ values, bytes int }

func newValueBudget() *valueBudget { return &valueBudget{} }
func (b *valueBudget) consume(bytes int) error {
	b.values++
	if err := b.addBytes(bytes); err != nil {
		return err
	}
	if b.values > MaxValues {
		return fmt.Errorf("value count exceeds %d", MaxValues)
	}
	return nil
}
func (b *valueBudget) addBytes(bytes int) error {
	b.bytes += bytes
	if b.bytes > MaxNormalizationBytes {
		return fmt.Errorf("normalized data exceeds %d bytes", MaxNormalizationBytes)
	}
	return nil
}

func canonicalProperty(name string) string {
	return strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(name, "_", ""), "-", ""))
}

func hardReservedProperty(name string, root bool) bool {
	key := canonicalProperty(name)
	switch key {
	case "attrs", "class", "classname", "innerhtml", "outerhtml", "srcdoc", "template", "form", "formtarget", "formaction", "constructor", "prototype", "proto":
		return true
	case "id", "kind", "target", "chapter", "component", "componentname", "family":
		return root
	}
	return strings.HasPrefix(key, "on") || strings.HasPrefix(key, "hx")
}

// propertyAllowed checks the root boundary; nested objects use the same hard
// restrictions except that explicitly typed record IDs and kinds are data.
func propertyAllowed(name string, p Property) bool { return propertyAllowedAt(name, p, true) }
func propertyAllowedAt(name string, p Property, root bool) bool {
	if !propertyName.MatchString(name) {
		return false
	}
	key := canonicalProperty(name)
	if !root && p.nestedPropertyAllowed != nil && !dangerousDictionaryKey(name) {
		if allowed, handled := p.nestedPropertyAllowed(name, p); handled {
			return allowed
		}
	}
	if !root && key == "on" && p.Type == Boolean && p.Format == "data-token" {
		return true
	}
	if root && key == "target" && ((p.Type == Integer || p.Type == Number) && p.Format == "data-token" || p.Type == String && p.Format == "numeric-token") {
		return true
	}
	if hardReservedProperty(name, root) {
		return false
	}
	if !reservedProperty(name) {
		return true
	}
	if len(p.OneOf) > 0 {
		for _, alternative := range p.OneOf {
			if !propertyAllowedAt(name, alternative, root) {
				return false
			}
		}
		return true
	}
	switch key {
	case "background":
		if p.Type == String && p.Format == "color" {
			return true
		}
		if !root && p.Type == String && (p.Format == "text" || p.Format == "data-token") {
			return true
		}
		return p.Type == String && (p.Format == "url" || p.Format == "image-url" || p.Format == "media-url")
	case "url", "href", "src", "poster", "cite", "codebase", "longdesc", "manifest", "ping", "xlinkhref":
		return p.Type == String && (p.Format == "url" || p.Format == "image-url" || p.Format == "media-url")
	case "srcset":
		return false
	case "html":
		return p.Type == String && p.Format == "sandbox-html"
	case "action":
		return p.Type == String && (p.Format == "action" || !root && p.Format == "text")
	case "style":
		if p.Type == Object && p.Format == "data-token" && p.AdditionalProperties == nil {
			return true
		}
		return p.Type == String && (p.Format == "data-token" || (!root && p.Format == "text"))
	case "id", "kind", "target", "chapter", "component", "componentname", "family":
		if !root && key == "family" && p.Type == String && p.Format == "font-family" {
			return true
		}
		return !root && ((p.Format == "data-token" && (p.Type == Integer || p.Type == Number || p.Type == Boolean)) || (p.Type == String && (p.Format == "text" || p.Format == "identifier" || p.Format == "data-token" || p.Format == "action")) || (key == "id" && p.Type == Integer && p.Format == "identifier"))
	case "body", "script", "javascript":
		return p.Type == String && p.Format == "text"
	}
	return false
}

// validateProperty validates a host-defined contract and takes a deep snapshot.
// Screen parameter contracts do not grant external URLs or sandbox capabilities.
func validateProperty(p Property) (Property, error) { return validatePropertyPolicy(p, nil) }
func validatePropertyPolicy(p Property, policy URLPolicy) (Property, error) {
	return validatePropertyContext(p, policy, nil)
}
func validatePropertyContext(p Property, policy URLPolicy, formats map[string]FormatRule) (Property, error) {
	count := 0
	return validatePropertyAt(p, policy, formats, nil, 1, &count)
}
func validatePropertyAt(p Property, policy URLPolicy, formats map[string]FormatRule, nested NestedPropertyPolicy, depth int, count *int) (Property, error) {
	*count++
	if depth > MaxValueDepth || *count > MaxValues {
		return Property{}, fmt.Errorf("property schema exceeds complexity limit")
	}
	p.urlPolicy, p.formats = policy, formats
	p.formatRule = nil
	if rule, ok := formats[p.Format]; ok {
		if err := validateHostFormat(p, rule); err != nil {
			return Property{}, err
		}
		p.formatRule = &rule
		if rule.NestedPropertyAllowed != nil {
			nested = rule.NestedPropertyAllowed
		}
	}
	p.nestedPropertyAllowed = nested
	if nested != nil && p.AdditionalProperties != nil {
		return Property{}, fmt.Errorf("host nested-property policy requires recursively closed objects")
	}
	if p.MaxLength < 0 || p.MaxLength > HardMaxStringBytes || p.MaxItems < 0 || p.MaxItems > HardMaxArrayItems || p.MaxProperties < 0 || p.MaxProperties > HardMaxObjectProperties {
		return Property{}, fmt.Errorf("property limit exceeds supported bounds")
	}
	if len(p.OneOf) > 0 {
		if p.Type != "" || p.Items != nil || p.Properties != nil || p.AdditionalProperties != nil || p.Format != "" || len(p.Enum) > 0 || p.Min != nil || p.Max != nil || p.MaxLength != 0 || p.MaxItems != 0 || p.MaxProperties != 0 {
			return Property{}, fmt.Errorf("oneOf cannot also declare a type or type constraints")
		}
		if len(p.OneOf) < 2 || len(p.OneOf) > 8 {
			return Property{}, fmt.Errorf("oneOf requires 2 to 8 alternatives")
		}
		alternatives := make([]Property, len(p.OneOf))
		for i, alternative := range p.OneOf {
			if alternative.Required || alternative.Default != nil || alternative.Nullable || len(alternative.OneOf) > 0 {
				return Property{}, fmt.Errorf("oneOf alternatives cannot declare defaults, required, nullable or nested unions")
			}
			q, err := validatePropertyAt(alternative, policy, formats, nested, depth+1, count)
			if err != nil {
				return Property{}, fmt.Errorf("oneOf[%d]: %w", i, err)
			}
			for _, other := range alternatives[:i] {
				if (q.Type == Number && other.Type == Integer) || (q.Type == Integer && other.Type == Number) {
					return Property{}, fmt.Errorf("oneOf integer and number alternatives overlap")
				}
				if q.Type == other.Type && q.Type != Object && q.Type != String {
					return Property{}, fmt.Errorf("oneOf has overlapping %s alternatives", q.Type)
				}
				if q.Type == String && other.Type == String && !disjointEnums(q.Enum, other.Enum) {
					return Property{}, fmt.Errorf("oneOf string alternatives require disjoint enums")
				}
				if q.Type == Object && other.Type == Object && !distinctObjects(q, other) {
					return Property{}, fmt.Errorf("oneOf object alternatives require a distinct required field or enum discriminator")
				}
			}
			alternatives[i] = q
		}
		p.OneOf = alternatives
	} else {
		switch p.Type {
		case String, Boolean, Integer, Number, Object, Array:
		default:
			return Property{}, fmt.Errorf("unknown property type %q", p.Type)
		}
		if len(p.Enum) > 0 && p.Type != String {
			return Property{}, fmt.Errorf("enum requires string type")
		}
		if p.MaxLength != 0 && p.Type != String {
			return Property{}, fmt.Errorf("maxLength requires string type")
		}
		if p.MaxItems != 0 && p.Type != Array {
			return Property{}, fmt.Errorf("maxItems requires array type")
		}
		if p.MaxProperties != 0 && p.Type != Object {
			return Property{}, fmt.Errorf("maxProperties requires object type")
		}
		if (p.Min != nil || p.Max != nil) && p.Type != Integer && p.Type != Number {
			return Property{}, fmt.Errorf("bounds require numeric type")
		}
		if p.Type != Object && (p.Properties != nil || p.AdditionalProperties != nil) {
			return Property{}, fmt.Errorf("object fields require object type")
		}
		if p.Type != Array && p.Items != nil {
			return Property{}, fmt.Errorf("items requires array type")
		}
		if p.Type == Array && p.Items == nil {
			return Property{}, fmt.Errorf("array requires typed items")
		}
		if err := validateFormat(p); err != nil {
			return Property{}, err
		}
		p.Enum = append([]string(nil), p.Enum...)
		seenEnums := map[string]bool{}
		for _, token := range p.Enum {
			if seenEnums[token] {
				return Property{}, fmt.Errorf("duplicate enum token")
			}
			seenEnums[token] = true
			if _, err := normalizeString(p, token); err != nil {
				return Property{}, fmt.Errorf("invalid enum token: %w", err)
			}
		}
		if p.Min != nil {
			v := *p.Min
			if math.IsNaN(v) || math.IsInf(v, 0) {
				return Property{}, fmt.Errorf("invalid minimum")
			}
			p.Min = &v
		}
		if p.Max != nil {
			v := *p.Max
			if math.IsNaN(v) || math.IsInf(v, 0) {
				return Property{}, fmt.Errorf("invalid maximum")
			}
			p.Max = &v
		}
		if p.Min != nil && p.Max != nil && *p.Min > *p.Max {
			return Property{}, fmt.Errorf("reversed property bounds")
		}
		if p.Items != nil {
			q, err := validatePropertyAt(*p.Items, policy, formats, nested, depth+1, count)
			if err != nil {
				return Property{}, fmt.Errorf("items: %w", err)
			}
			if q.Required || q.Default != nil {
				return Property{}, fmt.Errorf("array items cannot declare required or defaults")
			}
			p.Items = &q
		}
		if p.AdditionalProperties != nil {
			q, err := validatePropertyAt(*p.AdditionalProperties, policy, formats, nested, depth+1, count)
			if err != nil {
				return Property{}, fmt.Errorf("additionalProperties: %w", err)
			}
			if q.Required || q.Default != nil {
				return Property{}, fmt.Errorf("dictionary values cannot declare required or defaults")
			}
			p.AdditionalProperties = &q
		}
		if p.Properties != nil {
			limit := p.MaxProperties
			if limit == 0 {
				limit = MaxObjectProperties
			}
			if len(p.Properties) > limit {
				return Property{}, fmt.Errorf("too many declared object properties")
			}
			properties := make(map[string]Property, len(p.Properties))
			for key, child := range p.Properties {
				child.nestedPropertyAllowed = nested
				if !propertyAllowedAt(key, child, false) {
					return Property{}, fmt.Errorf("reserved or invalid nested property %q", key)
				}
				q, err := validatePropertyAt(child, policy, formats, nested, depth+1, count)
				if err != nil {
					return Property{}, fmt.Errorf("property %s: %w", key, err)
				}
				properties[key] = q
			}
			p.Properties = properties
		}
	}
	if p.Default != nil {
		value, err := normalize(p, p.Default)
		if err != nil {
			return Property{}, fmt.Errorf("default: %w", err)
		}
		p.Default = value
	}
	return p, nil
}

func disjointEnums(a, b []string) bool {
	if len(a) == 0 || len(b) == 0 {
		return false
	}
	for _, x := range a {
		for _, y := range b {
			if x == y {
				return false
			}
		}
	}
	return true
}
func distinctObjects(a, b Property) bool {
	// A required field rejected by the other closed shape proves disjointness.
	for key, p := range a.Properties {
		q, exists := b.Properties[key]
		if p.Required && !exists && b.AdditionalProperties == nil {
			return true
		}
		if p.Required && q.Required && p.Type == String && q.Type == String && disjointEnums(p.Enum, q.Enum) {
			return true
		}
	}
	for key, q := range b.Properties {
		if q.Required {
			if _, exists := a.Properties[key]; !exists && a.AdditionalProperties == nil {
				return true
			}
		}
	}
	return false
}

func validateFormat(p Property) error {
	if p.Format == "" {
		return nil
	}
	if p.formatRule != nil {
		return nil
	}
	if p.Format == "identifier" && p.Type == Integer {
		return nil
	}
	if p.Format == "data-token" {
		if p.Type == Integer || p.Type == Number || p.Type == Boolean {
			return nil
		}
		if p.Type == Object && p.AdditionalProperties == nil {
			return nil
		}
	}
	if p.Type != String {
		return fmt.Errorf("format %q requires a string", p.Format)
	}
	switch p.Format {
	case "field-name", "text", "url", "image-url", "media-url", "action", "identifier", "data-token", "numeric-token":
		return nil
	default:
		return fmt.Errorf("unknown semantic format %q", p.Format)
	}
}

func normalize(p Property, value any) (any, error) {
	return normalizeWithBudget(p, value, newValueBudget())
}
func normalizeWithBudget(p Property, value any, budget *valueBudget) (any, error) {
	if budget == nil {
		budget = newValueBudget()
	}
	return normalizeValue(p, value, budget, 1)
}
func normalizeValue(p Property, value any, budget *valueBudget, depth int) (any, error) {
	if depth > MaxValueDepth {
		return nil, fmt.Errorf("value nesting exceeds %d", MaxValueDepth)
	}
	if value == nil {
		if !p.Nullable {
			return nil, fmt.Errorf("null is not allowed")
		}
		if err := budget.consume(4); err != nil {
			return nil, err
		}
		return nil, nil
	}
	if len(p.OneOf) > 0 {
		var result any
		var selected valueBudget
		matches := 0
		var firstErr error
		for _, candidate := range p.OneOf {
			attempt := *budget
			normalized, err := normalizeValue(candidate, value, &attempt, depth)
			if err != nil {
				if firstErr == nil {
					firstErr = err
				}
				continue
			}
			matches++
			result = normalized
			selected = attempt
		}
		if matches != 1 {
			if matches == 0 {
				return nil, fmt.Errorf("no oneOf alternative matches: %w", firstErr)
			}
			return nil, fmt.Errorf("value matches multiple oneOf alternatives")
		}
		*budget = selected
		return result, nil
	}
	if err := budget.consume(8); err != nil {
		return nil, err
	}
	switch p.Type {
	case String:
		s, ok := value.(string)
		if !ok {
			return nil, fmt.Errorf("expected string")
		}
		if err := budget.addBytes(len(s)); err != nil {
			return nil, err
		}
		normalized, err := normalizeString(p, s)
		if err != nil {
			return nil, err
		}
		if len(normalized) > len(s) {
			if err := budget.addBytes(len(normalized) - len(s)); err != nil {
				return nil, err
			}
		}
		return normalized, nil
	case Boolean:
		v, ok := value.(bool)
		if !ok {
			return nil, fmt.Errorf("expected boolean")
		}
		return v, nil
	case Integer:
		integer, err := exactInteger(value)
		if err != nil {
			return nil, err
		}
		exact := new(big.Rat).SetInt64(int64(integer))
		if p.Min != nil && exact.Cmp(new(big.Rat).SetFloat64(*p.Min)) < 0 {
			return nil, fmt.Errorf("value is below minimum")
		}
		if p.Max != nil && exact.Cmp(new(big.Rat).SetFloat64(*p.Max)) > 0 {
			return nil, fmt.Errorf("value exceeds maximum")
		}
		return integer, nil
	case Number:
		var number float64
		switch v := value.(type) {
		case json.Number:
			if len(v) > 128 || !jsonNumeric.MatchString(string(v)) {
				return nil, fmt.Errorf("invalid JSON number")
			}
			f, err := v.Float64()
			if err != nil {
				return nil, fmt.Errorf("invalid number")
			}
			number = f
		case float64:
			number = v
		case float32:
			number = float64(v)
		default:
			integer, err := exactInteger(value)
			if err != nil {
				return nil, fmt.Errorf("expected number")
			}
			number = float64(integer)
		}
		if math.IsNaN(number) || math.IsInf(number, 0) {
			return nil, fmt.Errorf("number must be finite")
		}
		if p.Min != nil && number < *p.Min {
			return nil, fmt.Errorf("value is below minimum")
		}
		if p.Max != nil && number > *p.Max {
			return nil, fmt.Errorf("value exceeds maximum")
		}
		return number, nil
	case Array:
		v := reflect.ValueOf(value)
		if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
			return nil, fmt.Errorf("expected array")
		}
		if v.Kind() == reflect.Slice && v.IsNil() {
			if p.Nullable {
				return nil, nil
			}
			return nil, fmt.Errorf("null is not allowed")
		}
		limit := p.MaxItems
		if limit == 0 {
			limit = MaxArrayItems
		}
		if limit < 0 || limit > HardMaxArrayItems || v.Len() > limit {
			return nil, fmt.Errorf("array exceeds item limit")
		}
		if p.Items == nil {
			return nil, fmt.Errorf("array requires typed items")
		}
		result := make([]any, v.Len())
		for i := 0; i < v.Len(); i++ {
			item, err := normalizeValue(*p.Items, v.Index(i).Interface(), budget, depth+1)
			if err != nil {
				return nil, fmt.Errorf("[%d]: %w", i, err)
			}
			result[i] = item
		}
		return result, nil
	case Object:
		v := reflect.ValueOf(value)
		if v.Kind() != reflect.Map || v.Type().Key() != reflect.TypeOf("") {
			return nil, fmt.Errorf("expected string-keyed object")
		}
		if v.IsNil() {
			if p.Nullable {
				return nil, nil
			}
			return nil, fmt.Errorf("null is not allowed")
		}
		limit := p.MaxProperties
		if limit == 0 {
			limit = MaxObjectProperties
		}
		if limit < 0 || limit > HardMaxObjectProperties || v.Len() > limit {
			return nil, fmt.Errorf("object exceeds property limit")
		}
		result := make(map[string]any, v.Len())
		seen := map[string]bool{}
		keys := v.MapKeys()
		sort.Slice(keys, func(i, j int) bool { return keys[i].String() < keys[j].String() })
		for _, keyValue := range keys {
			key := keyValue.String()
			if len(key) == 0 || len(key) > 128 || !utf8.ValidString(key) || strings.IndexFunc(key, unicode.IsControl) >= 0 || dangerousDictionaryKey(key) {
				return nil, fmt.Errorf("invalid object key %q", key)
			}
			child, declared := p.Properties[key]
			if !declared {
				if p.AdditionalProperties == nil {
					return nil, fmt.Errorf("unknown property %q", key)
				}
				child = *p.AdditionalProperties
			}
			target := key
			if err := budget.addBytes(len(target)); err != nil {
				return nil, err
			}
			if _, exists := result[target]; exists {
				return nil, fmt.Errorf("conflicting target property %q", target)
			}
			normalized, err := normalizeValue(child, v.MapIndex(keyValue).Interface(), budget, depth+1)
			if err != nil {
				return nil, fmt.Errorf(".%s: %w", key, err)
			}
			result[target] = normalized
			seen[key] = true
		}
		for key, child := range p.Properties {
			if seen[key] {
				continue
			}
			target := key
			if child.Default != nil {
				if err := budget.addBytes(len(target)); err != nil {
					return nil, err
				}
				if _, exists := result[target]; exists {
					return nil, fmt.Errorf("conflicting target property %q", target)
				}
				copied, err := copyNormalizedValue(child.Default, budget, depth+1)
				if err != nil {
					return nil, fmt.Errorf(".%s: %w", key, err)
				}
				result[target] = copied
			} else if child.Required {
				return nil, fmt.Errorf("missing required property %q", key)
			}
		}
		if len(result) > limit {
			return nil, fmt.Errorf("object defaults exceed property limit")
		}
		return result, nil
	default:
		return nil, fmt.Errorf("unknown property type")
	}
}

func dangerousDictionaryKey(key string) bool {
	key = strings.ToLower(key)
	return key == "__proto__" || key == "constructor" || key == "prototype"
}

func normalizeString(p Property, text string) (string, error) {
	limit := p.MaxLength
	if limit == 0 {
		limit = MaxStringBytes
	}
	if limit < 0 || limit > HardMaxStringBytes || len(text) > limit {
		return "", fmt.Errorf("string exceeds limit")
	}
	if !utf8.ValidString(text) {
		return "", fmt.Errorf("string is not valid UTF-8")
	}
	if len(p.Enum) > 0 {
		found := false
		for _, token := range p.Enum {
			if token == text {
				found = true
				break
			}
		}
		if !found {
			return "", fmt.Errorf("unsupported token %q", text)
		}
	}
	if p.formatRule != nil && p.formatRule.NormalizeString != nil {
		result, err := p.formatRule.NormalizeString(text, p.urlPolicy)
		if err != nil {
			return "", err
		}
		if len(result) > limit || !utf8.ValidString(result) {
			return "", fmt.Errorf("host format output exceeds string bounds")
		}
		if len(p.Enum) > 0 {
			found := false
			for _, token := range p.Enum {
				if result == token {
					found = true
					break
				}
			}
			if !found {
				return "", fmt.Errorf("host format output is not an enum token")
			}
		}
		return result, nil
	}
	switch p.Format {
	case "", "text", "field-name":
	case "url", "image-url", "media-url":
		if err := validatePropertyURL(p.Format, text, p.urlPolicy); err != nil {
			return "", err
		}
	case "action", "identifier":
		if !registryKey.MatchString(text) {
			return "", fmt.Errorf("invalid %s", p.Format)
		}
	case "numeric-token":
		if len(text) > 128 || !numericToken.MatchString(text) {
			return "", fmt.Errorf("invalid numeric token")
		}
	case "data-token":
		if !dataToken.MatchString(text) {
			return "", fmt.Errorf("invalid data token")
		}
	default:
		return "", fmt.Errorf("unknown semantic format %q", p.Format)
	}
	if p.Format == "field-name" && !registryKey.MatchString(text) {
		return "", fmt.Errorf("field name must start with a letter and use at most 128 letters, digits, dots, underscores or hyphens; leading underscores are reserved")
	}
	return text, nil
}

func validatePropertyURL(format, raw string, policy URLPolicy) error {
	if raw == "" {
		return nil
	}
	unsafe := func(s string) bool {
		return strings.Contains(s, "\\") || strings.IndexFunc(s, func(r rune) bool { return unicode.IsControl(r) || unicode.IsSpace(r) }) >= 0
	}
	if unsafe(raw) {
		return fmt.Errorf("URL contains whitespace, controls or backslashes")
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.User != nil || parsed.Opaque != "" {
		return fmt.Errorf("invalid URL")
	}
	decoded, err := url.PathUnescape(raw)
	if err != nil || strings.Contains(decoded, "\\") || strings.IndexFunc(decoded, unicode.IsControl) >= 0 {
		return fmt.Errorf("URL contains invalid escaped characters")
	}
	if strings.HasPrefix(raw, "#") && parsed.Scheme == "" && parsed.Host == "" {
		return nil
	}
	if strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//") && parsed.Scheme == "" && parsed.Host == "" && !strings.HasPrefix(parsed.Path, "//") {
		return nil
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("URL must be a local absolute path, fragment or authorized HTTP(S) URL")
	}
	if parsed.Host == "" || parsed.Hostname() == "" {
		return fmt.Errorf("URL requires a host")
	}
	if policy == nil || !policy(format, raw) {
		return fmt.Errorf("external URL origin is not authorized")
	}
	return nil
}

func cloneDefinition(d Definition) Definition {
	d.Properties = cloneProperties(d.Properties)
	d.Events = append([]string(nil), d.Events...)
	if d.Slots != nil {
		slots := make(map[string]SlotDefinition, len(d.Slots))
		for key, value := range d.Slots {
			value.AllowedTypes = append([]string(nil), value.AllowedTypes...)
			slots[key] = value
		}
		d.Slots = slots
	}
	return d
}
func cloneProperties(properties map[string]Property) map[string]Property {
	if properties == nil {
		return nil
	}
	result := make(map[string]Property, len(properties))
	for key, p := range properties {
		result[key] = cloneProperty(p)
	}
	return result
}
func cloneProperty(p Property) Property {
	p.Enum = append([]string(nil), p.Enum...)
	if p.Min != nil {
		v := *p.Min
		p.Min = &v
	}
	if p.Max != nil {
		v := *p.Max
		p.Max = &v
	}
	p.Properties = cloneProperties(p.Properties)
	if p.Items != nil {
		child := cloneProperty(*p.Items)
		p.Items = &child
	}
	if p.AdditionalProperties != nil {
		child := cloneProperty(*p.AdditionalProperties)
		p.AdditionalProperties = &child
	}
	if p.OneOf != nil {
		alternatives := make([]Property, len(p.OneOf))
		for i, child := range p.OneOf {
			alternatives[i] = cloneProperty(child)
		}
		p.OneOf = alternatives
	}
	if p.Default != nil {
		p.Default, _ = copyNormalizedValue(p.Default, newValueBudget(), 1)
	}
	return p
}

// copyNormalizedValue copies only already-normalized ordinary data. It also
// charges defaults to the caller's budget instead of bypassing render limits.
func copyNormalizedValue(value any, budget *valueBudget, depth int) (any, error) {
	if depth > MaxValueDepth {
		return nil, fmt.Errorf("value nesting exceeds %d", MaxValueDepth)
	}
	if err := budget.consume(8); err != nil {
		return nil, err
	}
	switch v := value.(type) {
	case nil, bool, int, float64:
		return v, nil
	case string:
		budget.bytes += len(v)
		if budget.bytes > MaxNormalizationBytes {
			return nil, fmt.Errorf("normalized data exceeds limit")
		}
		return v, nil
	case []any:
		result := make([]any, len(v))
		for i, item := range v {
			child, err := copyNormalizedValue(item, budget, depth+1)
			if err != nil {
				return nil, err
			}
			result[i] = child
		}
		return result, nil
	case map[string]any:
		result := make(map[string]any, len(v))
		for key, item := range v {
			budget.bytes += len(key)
			child, err := copyNormalizedValue(item, budget, depth+1)
			if err != nil {
				return nil, err
			}
			result[key] = child
		}
		return result, nil
	default:
		return nil, fmt.Errorf("value is not normalized JSON data")
	}
}

func exactInteger(value any) (int, error) {
	var text string
	switch v := value.(type) {
	case int:
		return v, nil
	case int8:
		return int(v), nil
	case int16:
		return int(v), nil
	case int32:
		return int(v), nil
	case int64:
		text = strconv.FormatInt(v, 10)
	case uint:
		text = strconv.FormatUint(uint64(v), 10)
	case uint8:
		return int(v), nil
	case uint16:
		return int(v), nil
	case uint32:
		text = strconv.FormatUint(uint64(v), 10)
	case uint64:
		text = strconv.FormatUint(v, 10)
	case json.Number:
		if len(v) > 128 || !jsonNumeric.MatchString(string(v)) {
			return 0, fmt.Errorf("invalid JSON number")
		}
		text = string(v)
	case float32:
		return exactInteger(float64(v))
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) || math.Trunc(v) != v || math.Abs(v) > 9007199254740991 {
			return 0, fmt.Errorf("expected exact integer")
		}
		text = strconv.FormatFloat(v, 'f', 0, 64)
	default:
		return 0, fmt.Errorf("expected integer")
	}
	if n, err := strconv.Atoi(text); err == nil {
		return n, nil
	}
	// Rat preserves decimals exactly; cap exponent and length before allocation.
	if len(text) > 128 {
		return 0, fmt.Errorf("integer exceeds limit")
	}
	if index := strings.IndexAny(text, "eE"); index >= 0 {
		exp, err := strconv.Atoi(text[index+1:])
		if err != nil || exp < -308 || exp > 308 {
			return 0, fmt.Errorf("integer exponent exceeds limit")
		}
	}
	rational, ok := new(big.Rat).SetString(text)
	if !ok || !rational.IsInt() || !rational.Num().IsInt64() {
		return 0, fmt.Errorf("expected exact integer")
	}
	number := rational.Num().Int64()
	result := int(number)
	if int64(result) != number {
		return 0, fmt.Errorf("integer exceeds platform limit")
	}
	return result, nil
}

// Normalize validates and copies a value under this property's semantic
// contract. Properties returned by a Registry retain that host's format and URL
// policies; arbitrary properties never acquire those capabilities implicitly.
func (p Property) Normalize(value any) (any, error) {
	count := 0
	validated, err := validatePropertyAt(p, p.urlPolicy, p.formats, p.nestedPropertyAllowed, 1, &count)
	if err != nil {
		return nil, err
	}
	return normalize(validated, value)
}
