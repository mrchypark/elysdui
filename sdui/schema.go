// Package sdui validates and composes a bounded, data-only screen schema into
// renderer-neutral semantic plans. Renderer adapters own markup and transport.
package sdui

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"
)

const (
	// Version is the only supported wire schema version.
	Version        = "1"
	MaxSchemaBytes = 1 << 20
	MaxNodes       = 1000
	MaxDepth       = 32
	MaxStringBytes = 16384
)

// Screen names a host-owned loader and a bounded tree of registered nodes.
// Loader is a key, never a URL; the host resolves it to trusted Go code.
type Screen struct {
	Version   string                        `json:"version"`
	ID        string                        `json:"id"`
	Loader    string                        `json:"loader,omitempty"`
	Templates map[string]TemplateDefinition `json:"templates,omitempty"`
	Root      Node                          `json:"root"`
}

// TemplateDefinition is a local, typed reusable tree. It cannot name a remote
// document or select a Go template. Parameter values are data, never markup.
type TemplateDefinition struct {
	Params map[string]Property `json:"params,omitempty"`
	Root   Node                `json:"root"`
}

// Condition is a bounded data-only predicate. Operators are eq, ne, exists,
// all, any and not. Missing paths compare false; exists distinguishes absence
// from a present null value. Equality is typed and supports scalar/null values.
type Condition struct {
	Op         string      `json:"op"`
	Path       string      `json:"path,omitempty"`
	Value      any         `json:"value,omitempty"`
	Conditions []Condition `json:"conditions,omitempty"`
}

// Repeat instantiates a node for each item. Key is an RFC 6901 pointer relative
// to an item, and must resolve to a unique string or integer stable identity.
// An empty Key addresses the item itself. Index-derived keys are never inferred.
type Repeat struct {
	Items string `json:"items"`
	As    string `json:"as"`
	Key   string `json:"key"`
}

// Node contains registered properties, bindings and optional composition. A use
// node supplies only ID, Use, Params, ParamBindings, When and Repeat; concrete
// nodes supply Type. Children are allowed only on structural containers; Slots
// are allowed only where their registered definition declares them.
type Node struct {
	ID            string            `json:"id"`
	Type          string            `json:"type"`
	Props         map[string]any    `json:"props,omitempty"`
	Bindings      map[string]string `json:"bindings,omitempty"`
	Children      []Node            `json:"children,omitempty"`
	Event         *Event            `json:"event,omitempty"`
	Events        []Event           `json:"events,omitempty"`
	Use           string            `json:"use,omitempty"`
	Params        map[string]any    `json:"params,omitempty"`
	ParamBindings map[string]string `json:"paramBindings,omitempty"`
	Slots         map[string][]Node `json:"slots,omitempty"`
	When          *Condition        `json:"when,omitempty"`
	Repeat        *Repeat           `json:"repeat,omitempty"`
}

// Event refers only to a host action name and a region in the same screen.
type Event struct {
	On           string                    `json:"on"`
	Action       string                    `json:"action"`
	Target       string                    `json:"target"`
	SourceAction string                    `json:"sourceAction,omitempty"`
	Payload      map[string]PayloadBinding `json:"payload,omitempty"`
}

// PayloadBinding selects an explicit typed value from a browser event's detail.
// Paths are JSON pointers; the server must still validate all submitted values.
type PayloadBinding struct {
	Path string    `json:"path"`
	Type ValueType `json:"type"`
}

var schemaID = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_-]{0,127}$`)
var registryKey = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_.-]{0,127}$`)
var jsonNumeric = regexp.MustCompile(`^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$`)
var propertyName = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{0,63}$`)
var bindingPath = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*){0,15}$`)

// Decode rejects unknown fields, duplicate keys, trailing JSON and oversized
// documents. JSON numbers remain json.Number until the registry validates them.
// Call Compile to validate the decoded screen against a host registry.
func Decode(r io.Reader) (Screen, error) {
	var screen Screen
	data, err := io.ReadAll(io.LimitReader(r, MaxSchemaBytes+1))
	if err != nil {
		return screen, fmt.Errorf("sdui: read schema: %w", err)
	}
	if len(data) > MaxSchemaBytes {
		return screen, fmt.Errorf("sdui: schema exceeds %d bytes", MaxSchemaBytes)
	}
	if trimmed := bytes.TrimSpace(data); len(trimmed) == 0 || trimmed[0] != '{' {
		return screen, fmt.Errorf("sdui: schema must be a JSON object")
	}
	check := json.NewDecoder(bytes.NewReader(data))
	check.UseNumber()
	if err := checkJSONValue(check, 0); err != nil {
		return screen, fmt.Errorf("sdui: invalid JSON: %w", err)
	}
	if _, err := check.Token(); err != io.EOF {
		return screen, fmt.Errorf("sdui: trailing JSON")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	decoder.UseNumber()
	if err := decoder.Decode(&screen); err != nil {
		return Screen{}, fmt.Errorf("sdui: decode schema: %w", err)
	}
	return screen, nil
}

func checkJSONValue(d *json.Decoder, depth int) error {
	// Each tree level adds a node object and its children array. The compile
	// limit is stricter; this protects the JSON walk before a tree exists.
	if depth > MaxDepth*3 {
		return fmt.Errorf("JSON nesting exceeds limit")
	}
	token, err := d.Token()
	if err != nil {
		return err
	}
	delim, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delim {
	case '{':
		seen := map[string]bool{}
		for d.More() {
			token, err := d.Token()
			if err != nil {
				return err
			}
			key, ok := token.(string)
			if !ok {
				return fmt.Errorf("expected object key")
			}
			canonical := strings.ToLower(key)
			if seen[canonical] {
				return fmt.Errorf("duplicate key %q", key)
			}
			seen[canonical] = true
			if err := checkJSONValue(d, depth+1); err != nil {
				return err
			}
		}
	case '[':
		for d.More() {
			if err := checkJSONValue(d, depth+1); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("unexpected delimiter %q", delim)
	}
	_, err = d.Token()
	return err
}
