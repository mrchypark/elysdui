package sdui

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"unicode/utf8"
)

// NativeVersion is independent of the authoring schema version. This opt-in
// transport resolves composition on the server and never sends markup or code.
const NativeVersion = "1"
const MaxNativeResponseBytes = 1 << 20
const MaxNativeActionBytes = 64 << 10
const MaxNativeRevision = 1<<53 - 1

// ErrUnsupportedNative means the client must show a native unsupported-screen
// state. It must not silently omit required controls or fall back to a WebView.
var ErrUnsupportedNative = errors.New("sdui: unsupported native screen")

// NativeNode is a resolved semantic node. Props retain their schema names, not
// HTML template destinations. Only NativeCapabilities are supported in v1.
type NativeNode struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"`
	Props    map[string]any `json:"props"`
	Children []NativeNode   `json:"children,omitempty"`
	Events   []Event        `json:"events,omitempty"`
}

// NativeEnvelope replaces an entire region. Fields are authoritative persisted
// values; clients keep unsaved drafts separately. AcknowledgedEdits echoes the
// submitted revisions even for invalid/conflict replies, not proof of a save.
type NativeEnvelope struct {
	ProtocolVersion      string            `json:"protocolVersion"`
	ScreenID             string            `json:"screenID"`
	ScreenRevision       string            `json:"screenRevision"`
	SessionID            string            `json:"sessionID"`
	RequestID            string            `json:"requestID"`
	DataVersion          uint64            `json:"dataVersion"`
	Status               string            `json:"status"`
	CSRFToken            string            `json:"csrfToken"`
	RequiredCapabilities []string          `json:"requiredCapabilities"`
	Region               NativeNode        `json:"region"`
	Fields               map[string]string `json:"fields"`
	AcknowledgedEdits    map[string]uint64 `json:"acknowledgedEdits"`
	Errors               map[string]string `json:"errors"`
	Message              string            `json:"message"`
}

// NativeActionRequest is untrusted input. DecodeNativeAction only validates its
// wire shape/limits; hosts must authenticate, authorize, verify CSRF, exact action
// routing, screen/data revisions and perform durable business idempotency.
type NativeActionRequest struct {
	ProtocolVersion string            `json:"protocolVersion"`
	ScreenID        string            `json:"screenID"`
	ScreenRevision  string            `json:"screenRevision"`
	SessionID       string            `json:"sessionID"`
	RequestID       string            `json:"requestID"`
	DataVersion     uint64            `json:"dataVersion"`
	NodeID          string            `json:"nodeID"`
	Event           string            `json:"event"`
	Action          string            `json:"action"`
	Target          string            `json:"target"`
	Fields          map[string]string `json:"fields"`
	EditRevisions   map[string]uint64 `json:"editRevisions"`
	Capabilities    []string          `json:"capabilities"`
}

// NativeCapabilities returns a fresh copy of the deliberately small native v1
// component set. Native input is ordinary text; the web catalogue is unchanged.
func NativeCapabilities() []string {
	return []string{"region", "form", "stack", "text", "input", "button", "notice", "switch", "checkbox", "select"}
}

// DecodeNativeAction rejects duplicate keys (including casing aliases), unknown
// members, trailing JSON, invalid UTF-8, excessive nesting and oversized bodies.
func DecodeNativeAction(r io.Reader) (NativeActionRequest, error) {
	var request NativeActionRequest
	data, err := io.ReadAll(io.LimitReader(r, MaxNativeActionBytes+1))
	if err != nil {
		return request, err
	}
	if len(data) > MaxNativeActionBytes || !utf8.Valid(data) {
		return request, fmt.Errorf("sdui: invalid native action size or UTF-8")
	}
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return request, fmt.Errorf("sdui: native action must be an object")
	}
	check := json.NewDecoder(bytes.NewReader(data))
	check.UseNumber()
	if err := checkJSONValue(check, 0); err != nil {
		return request, err
	}
	if _, err := check.Token(); err != io.EOF {
		return request, fmt.Errorf("sdui: trailing JSON")
	}
	var members map[string]json.RawMessage
	if err := json.Unmarshal(data, &members); err != nil {
		return request, err
	}
	required := []string{"protocolVersion", "screenID", "screenRevision", "sessionID", "requestID", "dataVersion", "nodeID", "event", "action", "target", "fields", "editRevisions", "capabilities"}
	if len(members) != len(required) {
		return request, fmt.Errorf("sdui: native action has missing or unknown members")
	}
	for _, key := range required {
		value, ok := members[key]
		if !ok || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return request, fmt.Errorf("sdui: native action member %s is required", key)
		}
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(members["fields"], &fields); err != nil {
		return request, err
	}
	for _, value := range fields {
		if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return request, fmt.Errorf("sdui: null native field")
		}
	}
	var revisions map[string]json.RawMessage
	if err := json.Unmarshal(members["editRevisions"], &revisions); err != nil {
		return request, err
	}
	for _, value := range revisions {
		if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return request, fmt.Errorf("sdui: null edit revision")
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return request, err
	}
	if len(request.Fields) > 64 || len(request.EditRevisions) > 64 || len(request.Capabilities) > 64 || request.DataVersion > MaxNativeRevision {
		return NativeActionRequest{}, fmt.Errorf("sdui: native action exceeds limits")
	}
	for key, value := range request.Fields {
		if !propertyName.MatchString(key) || len(value) > MaxStringBytes {
			return NativeActionRequest{}, fmt.Errorf("sdui: invalid native field")
		}
	}
	for key, value := range request.EditRevisions {
		if !propertyName.MatchString(key) || value > MaxNativeRevision {
			return NativeActionRequest{}, fmt.Errorf("sdui: invalid edit revision")
		}
	}
	for _, value := range []string{request.ProtocolVersion, request.ScreenID, request.ScreenRevision, request.SessionID, request.RequestID, request.NodeID, request.Event, request.Action, request.Target} {
		if len(value) > 256 {
			return NativeActionRequest{}, fmt.Errorf("sdui: native identifier exceeds limit")
		}
	}
	for _, value := range request.Capabilities {
		if len(value) > 128 {
			return NativeActionRequest{}, fmt.Errorf("sdui: native capability exceeds limit")
		}
	}
	return request, nil
}

// ResolveNative resolves a whole region using the same compiled bindings,
// conditions, parameters and stable-key repetition as HTML rendering. It does
// not execute HTML templates. ctx.Data must not be concurrently mutated.
// This does not authorize any action; the host must validate action contracts.
func (p *Plan) ResolveNative(regionID string, ctx ResolveContext, capabilities []string) (NativeNode, error) {
	if p == nil || p.root == nil {
		return NativeNode{}, fmt.Errorf("sdui: native resolution requires a compiled plan")
	}
	root, ok := p.regions[regionID]
	if !ok {
		return NativeNode{}, fmt.Errorf("sdui: unknown region %q", regionID)
	}
	if len(capabilities) > 64 {
		return NativeNode{}, fmt.Errorf("%w: too many capabilities", ErrUnsupportedNative)
	}
	supported := map[string]bool{}
	for _, value := range capabilities {
		if len(value) > 128 {
			return NativeNode{}, fmt.Errorf("%w: capability too long", ErrUnsupportedNative)
		}
		supported[value] = true
	}
	scope := resolveScope{data: ctx.Data}
	budget := &resolveBudget{ids: map[string]bool{p.id: true}}
	for _, use := range root.enclosingUses {
		var err error
		scope, err = applyParameters(use, scope, budget)
		if err != nil {
			return NativeNode{}, err
		}
	}
	nodes, err := p.resolveNativeNode(root, scope, budget, supported, 1)
	if err != nil {
		return NativeNode{}, err
	}
	if len(nodes) != 1 || nodes[0].Type != "region" || nodes[0].ID != regionID {
		return NativeNode{}, fmt.Errorf("sdui: native response requires one stable region")
	}
	data, err := json.Marshal(nodes[0])
	if err != nil {
		return NativeNode{}, err
	}
	if len(data) > MaxNativeResponseBytes {
		return NativeNode{}, fmt.Errorf("sdui: native output exceeds limit")
	}
	return nodes[0], nil
}

func (p *Plan) resolveNativeNode(node *compiledNode, scope resolveScope, budget *resolveBudget, supported map[string]bool, depth int) ([]NativeNode, error) {
	if depth > MaxDepth {
		return nil, fmt.Errorf("sdui: native depth exceeds limit")
	}
	result := []NativeNode{}
	err := forEachNodeInstance(node, scope, budget, func(instance resolveScope) error {
		budget.nodes++
		if budget.nodes > MaxNodes {
			return fmt.Errorf("sdui: native node count exceeds limit")
		}
		show, err := node.when.evaluate(instance)
		if err != nil {
			return err
		}
		if !show {
			return nil
		}
		if node.use != nil {
			inner, err := applyParameters(node, instance, budget)
			if err != nil {
				return err
			}
			children, err := p.resolveNativeNode(node.use.root, inner, budget, supported, depth+1)
			result = append(result, children...)
			return err
		}
		if !nativeDefinition(node.definition) || !supported[node.definition.Name] || len(node.slots) > 0 {
			return fmt.Errorf("%w: %s", ErrUnsupportedNative, node.definition.Name)
		}
		id := dynamicID(node.id, instance.identity)
		if budget.ids[id] {
			return fmt.Errorf("sdui: duplicate native ID %q", id)
		}
		budget.ids[id] = true
		props := map[string]any{}
		for _, key := range sortedKeys(node.props) {
			value, err := copyNormalizedValue(node.props[key], budget.valueBudget(), 1)
			if err != nil {
				return err
			}
			props[key] = value
		}
		for _, key := range sortedKeys(node.bindings) {
			ref := node.bindings[key]
			value, present, err := ref.lookup(instance)
			if err != nil {
				return err
			}
			if !present {
				return fmt.Errorf("sdui: native binding %q is missing", ref.path)
			}
			normalized, err := normalizeWithBudget(node.definition.Properties[key], value, budget.valueBudget())
			if err != nil {
				return err
			}
			props[key] = normalized
		}
		if node.definition.Name == "checkbox" || node.definition.Name == "select" {
			if props["label"] == "" {
				return fmt.Errorf("%w: selection control label is empty", ErrUnsupportedNative)
			}
		}
		if node.definition.Name == "select" {
			options, ok := props["options"].([]any)
			if !ok || len(options) == 0 || len(options) > 64 {
				return fmt.Errorf("%w: select requires 1–64 options", ErrUnsupportedNative)
			}
			seen := map[string]bool{}
			wire := make([]any, 0, len(options))
			for _, option := range options {
				item, ok := option.(map[string]any)
				value, valueOK := item["value"].(string)
				label, labelOK := item["label"].(string)
				if !ok || len(item) != 2 || !valueOK || !labelOK || value == "" || label == "" || seen[value] {
					return fmt.Errorf("%w: invalid or duplicate select option", ErrUnsupportedNative)
				}
				seen[value] = true
				wire = append(wire, map[string]any{"value": value, "label": label})
			}
			if value, supplied := props["value"]; supplied && !seen[value.(string)] {
				return fmt.Errorf("%w: select value is not an option", ErrUnsupportedNative)
			}
			props["options"] = wire
		}
		if node.definition.Name == "input" && (props["type"] != "text" || props["multiple"] == true) {
			return fmt.Errorf("%w: input mode", ErrUnsupportedNative)
		}
		if node.definition.Name == "button" && (props["type"] != "submit" || (props["name"] != nil && props["name"] != "")) {
			return fmt.Errorf("%w: button mode", ErrUnsupportedNative)
		}
		events := make([]Event, 0, len(node.events))
		for _, event := range node.events {
			if event.SourceAction != "" || len(event.Payload) > 0 || !(node.definition.Name == "form" && event.On == "submit") {
				return fmt.Errorf("%w: event contract", ErrUnsupportedNative)
			}
			events = append(events, Event{On: event.On, Action: event.Action, Target: event.Target})
		}
		resolved := NativeNode{ID: id, Type: node.definition.Name, Props: props, Events: events}
		for _, child := range node.children {
			children, err := p.resolveNativeNode(child, instance, budget, supported, depth+1)
			if err != nil {
				return err
			}
			resolved.Children = append(resolved.Children, children...)
		}
		result = append(result, resolved)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
func nativeType(name string) bool {
	for _, value := range NativeCapabilities() {
		if name == value {
			return true
		}
	}
	return false
}

// Comparing the registered contract prevents a custom component that merely
// reuses a core name from being mislabeled as a supported native control.
var nativeContracts = sync.OnceValues(func() (map[string][]byte, error) {
	registry, err := DefaultRegistry()
	if err != nil {
		return nil, err
	}
	contracts := map[string][]byte{}
	for _, definition := range registry.Definitions() {
		if nativeType(definition.Name) {
			data, err := json.Marshal(definition)
			if err != nil {
				return nil, err
			}
			contracts[definition.Name] = data
		}
	}
	return contracts, nil
})

func nativeDefinition(definition Definition) bool {
	contracts, err := nativeContracts()
	if err != nil {
		return false
	}
	expected, ok := contracts[definition.Name]
	if !ok {
		return false
	}
	data, err := json.Marshal(definition)
	return err == nil && bytes.Equal(expected, data)
}
