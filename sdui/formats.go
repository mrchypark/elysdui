package sdui

import "fmt"

// NestedPropertyPolicy optionally accepts or rejects an explicitly declared
// nested field. Return handled=false to use the default policy. It applies only
// inside a formatted, recursively closed object and cannot authorize dangerous
// prototype keys. It never applies to root properties or dictionary keys.
// Callbacks are trusted host code, must be concurrency safe and must not mutate
// input or capture mutable policy state.
type NestedPropertyPolicy func(name string, property Property) (allowed, handled bool)

// FormatRule is a trusted host extension for a string or closed-object format.
// String inputs and outputs retain the ordinary UTF-8, size and shared-budget
// checks. Rules cannot replace built-in formats. Object extensions authorize
// only a nested-name policy; the core still recursively normalizes all values.
type FormatRule struct {
	// Pattern is an optional JSON Schema editor hint; validation uses the callback.
	Pattern               string
	Type                  ValueType
	NormalizeString       func(string, URLPolicy) (string, error)
	NestedPropertyAllowed NestedPropertyPolicy
}

// WithFormats replaces the complete host-format policy for future registrations.
// The map is copied immediately; registered contracts retain immutable snapshots.
// Previously registered definitions do not gain or lose capabilities.
func WithFormats(rules map[string]FormatRule) RegistryOption {
	snapshot := make(map[string]FormatRule, len(rules))
	for name, rule := range rules {
		snapshot[name] = rule
	}
	return func(r *Registry) { r.formats = snapshot }
}

func validateHostFormat(p Property, rule FormatRule) error {
	// Reject attempts to override a built-in, even when the override is unused.
	switch p.Format {
	case "", "field-name", "text", "url", "image-url", "media-url", "action", "identifier", "data-token", "numeric-token":
		return fmt.Errorf("cannot override built-in format %q", p.Format)
	}
	if p.Type != rule.Type {
		return fmt.Errorf("host format %q requires %s", p.Format, rule.Type)
	}
	switch rule.Type {
	case String:
		if rule.NormalizeString == nil || rule.NestedPropertyAllowed != nil {
			return fmt.Errorf("string host format requires only a string normalizer")
		}
	case Object:
		if rule.NormalizeString != nil || rule.NestedPropertyAllowed == nil || p.AdditionalProperties != nil {
			return fmt.Errorf("object host format requires a closed-object nested-property policy")
		}
	default:
		return fmt.Errorf("host format requires string or object type")
	}
	return nil
}

// ValidateURL applies the core's scheme, encoding and local-path safety rules
// before consulting an optional trusted external-origin policy.
func ValidateURL(format, raw string, policy URLPolicy) error {
	return validatePropertyURL(format, raw, policy)
}
