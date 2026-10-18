package sdui

import (
	"crypto/sha256"
	"fmt"
	"sort"
	"strings"
)

type compileState struct {
	depth                     int
	inForm, unstable, reuseID bool
	scope                     bindingScope
	rewrite                   map[string]string
	uses                      []*compiledNode
}
type compiler struct {
	plan        *Plan
	definitions map[string]Definition
	templates   map[string]TemplateDefinition
	seen        map[string]bool
	count       int
	values      *valueBudget
}

// Compile validates every branch before any runtime data is read or resolved.
// Local reusable trees are expanded once; repetitions remain bounded render-time
// directives. Plans contain only immutable snapshots of host and schema values.
func Compile(screen Screen, r *Registry) (*Plan, error) {
	if screen.Version != Version {
		return nil, fmt.Errorf("sdui: unsupported schema version %q", screen.Version)
	}
	if !validNodeID(screen.ID) {
		return nil, fmt.Errorf("sdui: invalid screen ID %q", screen.ID)
	}
	if screen.Loader != "" && !registryKey.MatchString(screen.Loader) {
		return nil, fmt.Errorf("sdui: invalid loader key %q", screen.Loader)
	}
	if r == nil {
		return nil, fmt.Errorf("sdui: registry is required")
	}
	r.mu.RLock()
	definitions := make(map[string]Definition, len(r.definitions))
	for name, d := range r.definitions {
		definitions[name] = d
	}
	formats := r.formats
	r.mu.RUnlock()
	plan := &Plan{id: screen.ID, loader: screen.Loader, regions: map[string]*compiledNode{}, definitions: map[string]Definition{}}
	c := &compiler{plan: plan, definitions: definitions, templates: map[string]TemplateDefinition{}, seen: map[string]bool{screen.ID: true}, values: newValueBudget()}
	if len(screen.Templates) > 128 {
		return nil, fmt.Errorf("sdui: too many reusable templates")
	}
	for _, name := range sortedKeys(screen.Templates) {
		if !registryKey.MatchString(name) {
			return nil, fmt.Errorf("sdui: invalid reusable template name %q", name)
		}
		definition := screen.Templates[name]
		if len(definition.Params) > 64 {
			return nil, fmt.Errorf("sdui: too many parameters in template %s", name)
		}
		params := make(map[string]Property, len(definition.Params))
		for _, key := range sortedKeys(definition.Params) {
			if !propertyName.MatchString(key) || reservedBindingKey(key) {
				return nil, fmt.Errorf("sdui: invalid parameter name %q", key)
			}
			property := definition.Params[key]
			validated, err := validatePropertyContext(property, nil, formats)
			if err != nil {
				return nil, fmt.Errorf("sdui: template %s parameter %s: %w", name, key, err)
			}
			params[key] = validated
		}
		definition.Params = params
		c.templates[name] = definition
	}
	if err := c.validateReferences(); err != nil {
		return nil, err
	}
	root, err := c.node(screen.Root, compileState{depth: 1})
	if err != nil {
		return nil, err
	}
	plan.root = root
	for _, event := range plan.events {
		if !plan.HasRegion(event.Target) {
			return nil, fmt.Errorf("sdui: target %q is not a screen region", event.Target)
		}
	}
	// Validate unused definitions too. Their external event targets are checked in
	// the context of actual uses; unused definitions cannot create target regions.
	for _, name := range sortedKeys(c.templates) {
		definition := c.templates[name]
		checkPlan := &Plan{id: screen.ID, regions: map[string]*compiledNode{}, definitions: plan.definitions}
		check := &compiler{plan: checkPlan, definitions: c.definitions, templates: c.templates, seen: map[string]bool{}, values: newValueBudget()}
		if _, err := check.node(definition.Root, compileState{depth: 1, scope: bindingScope{params: definition.Params}}); err != nil {
			return nil, fmt.Errorf("sdui: template %s: %w", name, err)
		}
	}
	return plan, nil
}

func sortedKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// namespaceID retains readable identities when short and uses a full SHA-256
// suffix otherwise. Generated identities are always valid bounded DOM IDs.
func namespaceID(namespace, local string) string {
	joined := namespace + "--" + local
	if len(joined) <= 128 {
		return joined
	}
	return fmt.Sprintf("sdui-node-%x", sha256.Sum256([]byte(namespace+"\x00"+local)))
}
func dynamicID(id, identity string) string {
	if identity == "" {
		return id
	}
	return fmt.Sprintf("sdui-repeat-%x", sha256.Sum256([]byte(id+"\x00"+identity)))
}

func (c *compiler) node(node Node, state compileState) (*compiledNode, error) {
	c.count++
	if c.count > MaxNodes {
		return nil, fmt.Errorf("sdui: expanded node count exceeds %d", MaxNodes)
	}
	if state.depth > MaxDepth {
		return nil, fmt.Errorf("sdui: tree depth exceeds %d", MaxDepth)
	}
	if !validNodeID(node.ID) {
		return nil, fmt.Errorf("sdui: invalid node ID %q", node.ID)
	}
	id := node.ID
	if mapped, ok := state.rewrite[id]; ok {
		id = mapped
	}
	if !state.reuseID {
		if c.seen[id] {
			return nil, fmt.Errorf("sdui: duplicate ID %q", id)
		}
		c.seen[id] = true
	}
	state.reuseID = false
	result := &compiledNode{id: id, controlID: fmt.Sprintf("sdui-internal-%x", sha256.Sum256([]byte(c.plan.id+"\x00"+id))), props: map[string]any{}, bindings: map[string]bindingRef{}, slots: map[string][]*compiledNode{}, enclosingUses: append([]*compiledNode(nil), state.uses...)}
	if node.Repeat != nil {
		repeat := *node.Repeat
		if !propertyName.MatchString(repeat.As) || reservedBindingKey(repeat.As) || state.scope.vars[repeat.As] {
			return nil, fmt.Errorf("sdui: invalid or shadowed repeat variable %q", repeat.As)
		}
		items, err := parseBinding(repeat.Items, state.scope)
		if err != nil {
			return nil, fmt.Errorf("sdui: node %s repeat: %w", id, err)
		}
		key, err := pointerParts(repeat.Key)
		if err != nil {
			return nil, fmt.Errorf("sdui: node %s repeat key: %w", id, err)
		}
		result.repeat = &compiledRepeat{items: items, as: repeat.As, key: key, keyPath: repeat.Key}
		vars := make(map[string]bool, len(state.scope.vars)+1)
		for key, value := range state.scope.vars {
			vars[key] = value
		}
		vars[repeat.As] = true
		state.scope.vars = vars
		state.unstable = true
	}
	when, err := compileCondition(node.When, state.scope)
	if err != nil {
		return nil, fmt.Errorf("sdui: node %s condition: %w", id, err)
	}
	result.when = when
	if when != nil {
		state.unstable = true
	}
	if node.Use != "" {
		if node.Type != "" || len(node.Props) > 0 || len(node.Bindings) > 0 || len(node.Children) > 0 || len(node.Slots) > 0 || node.Event != nil || len(node.Events) > 0 {
			return nil, fmt.Errorf("sdui: use node %s cannot also define a component", id)
		}
		definition, ok := c.templates[node.Use]
		if !ok {
			return nil, fmt.Errorf("sdui: missing reusable template %q", node.Use)
		}
		if len(node.Params) > 64 || len(node.ParamBindings) > 64 {
			return nil, fmt.Errorf("sdui: too many parameters on %s", id)
		}
		use := &compiledUse{properties: definition.Params, params: map[string]any{}, bindings: map[string]bindingRef{}}
		result.use = use
		for _, key := range sortedKeys(node.Params) {
			property, ok := definition.Params[key]
			if !ok {
				return nil, fmt.Errorf("sdui: use %s has unknown parameter %q", id, key)
			}
			normalized, err := normalizeWithBudget(property, node.Params[key], c.values)
			if err != nil {
				return nil, fmt.Errorf("sdui: use %s parameter %s: %w", id, key, err)
			}
			use.params[key] = normalized
		}
		for _, key := range sortedKeys(node.ParamBindings) {
			if _, ok := definition.Params[key]; !ok {
				return nil, fmt.Errorf("sdui: use %s has unknown parameter %q", id, key)
			}
			if _, ok := node.Params[key]; ok {
				return nil, fmt.Errorf("sdui: use %s parameter %s has both a literal and binding", id, key)
			}
			ref, err := parseBinding(node.ParamBindings[key], state.scope)
			if err != nil {
				return nil, err
			}
			use.bindings[key] = ref
		}
		for _, key := range sortedKeys(definition.Params) {
			property := definition.Params[key]
			_, literal := use.params[key]
			_, bound := use.bindings[key]
			if !literal && !bound {
				if property.Default != nil {
					use.params[key] = property.Default
				} else if property.Required {
					return nil, fmt.Errorf("sdui: use %s requires parameter %s", id, key)
				}
			}
		}
		rewrite, err := templateIDs(definition.Root, id)
		if err != nil {
			return nil, err
		}
		for key, value := range state.rewrite {
			if _, local := rewrite[key]; !local {
				rewrite[key] = value
			}
		}
		inner := state
		inner.depth++
		inner.scope.params = definition.Params
		inner.scope.vars = nil
		inner.rewrite = rewrite
		inner.reuseID = true
		inner.uses = append(append([]*compiledNode(nil), state.uses...), result)
		use.root, err = c.node(definition.Root, inner)
		if err != nil {
			return nil, err
		}
		return result, nil
	}
	if len(node.Params) > 0 || len(node.ParamBindings) > 0 {
		return nil, fmt.Errorf("sdui: parameters require use on node %s", id)
	}
	definition, ok := c.definitions[node.Type]
	if !ok {
		return nil, fmt.Errorf("sdui: node %s has unknown type %q", id, node.Type)
	}
	result.definition = definition
	c.plan.definitions[definition.Name] = definition
	if definition.Container == "" && len(node.Children) > 0 {
		return nil, fmt.Errorf("sdui: leaf %s cannot contain children", id)
	}
	if (definition.Container == Form || definition.ContainsForm) && state.inForm {
		return nil, fmt.Errorf("sdui: nested form %s", id)
	}
	if definition.Container == Region && state.unstable {
		return nil, fmt.Errorf("sdui: region %s cannot be conditional or repeated", id)
	}
	if len(node.Props) > 64 || len(node.Bindings) > 64 {
		return nil, fmt.Errorf("sdui: too many properties on %s", id)
	}
	for _, key := range sortedKeys(node.Props) {
		property, ok := definition.Properties[key]
		if !ok || !propertyAllowed(key, property) {
			return nil, fmt.Errorf("sdui: node %s has unknown or reserved property %q", id, key)
		}
		normalized, err := normalizeWithBudget(property, node.Props[key], c.values)
		if err != nil {
			return nil, fmt.Errorf("sdui: node %s property %s: %w", id, key, err)
		}
		result.props[key] = normalized
	}
	for _, key := range sortedKeys(node.Bindings) {
		property, ok := definition.Properties[key]
		if !ok || !propertyAllowed(key, property) {
			return nil, fmt.Errorf("sdui: node %s has unknown binding property %q", id, key)
		}
		if _, exists := node.Props[key]; exists {
			return nil, fmt.Errorf("sdui: node %s property %s has both a literal and binding", id, key)
		}
		ref, err := parseBinding(node.Bindings[key], state.scope)
		if err != nil {
			return nil, fmt.Errorf("sdui: node %s: %w", id, err)
		}
		result.bindings[key] = ref
	}
	for _, key := range sortedKeys(definition.Properties) {
		property := definition.Properties[key]
		_, literal := result.props[key]
		_, bound := result.bindings[key]
		if !literal && !bound {
			if property.Default != nil {
				result.props[key] = property.Default
			} else if property.Required {
				return nil, fmt.Errorf("sdui: node %s requires property %s", id, key)
			}
		}
	}
	if node.Event != nil && len(node.Events) > 0 {
		return nil, fmt.Errorf("sdui: event and events are mutually exclusive on %s", id)
	}
	events := append([]Event(nil), node.Events...)
	if node.Event != nil {
		events = append(events, *node.Event)
	}
	if len(events) > 16 {
		return nil, fmt.Errorf("sdui: too many event bindings on %s", id)
	}
	for _, candidate := range events {
		event, err := compileEvent(candidate, definition, id, state.rewrite)
		if err != nil {
			return nil, err
		}
		for _, prior := range result.events {
			if prior.On == event.On && (prior.SourceAction == event.SourceAction || prior.SourceAction == "" || event.SourceAction == "") {
				return nil, fmt.Errorf("sdui: ambiguous event bindings on %s", id)
			}
		}
		result.events = append(result.events, event)
		c.plan.events = append(c.plan.events, event)
	}

	if definition.Container == Region {
		c.plan.regions[id] = result
	}
	inner := state
	inner.depth++
	inner.inForm = state.inForm || definition.Container == Form || definition.ContainsForm
	for _, child := range node.Children {
		compiled, err := c.node(child, inner)
		if err != nil {
			return nil, err
		}
		result.children = append(result.children, compiled)
	}
	for _, name := range sortedKeys(node.Slots) {
		slot, ok := definition.Slots[name]
		if !ok {
			return nil, fmt.Errorf("sdui: node %s has unknown slot %q", id, name)
		}
		children := node.Slots[name]
		if slot.MaxNodes > 0 && len(children) > slot.MaxNodes {
			return nil, fmt.Errorf("sdui: node %s slot %s exceeds node limit", id, name)
		}
		before := c.count
		for _, child := range children {
			compiled, err := c.node(child, inner)
			if err != nil {
				return nil, err
			}
			actual := compiled
			for actual.use != nil {
				actual = actual.use.root
			}
			if len(slot.AllowedTypes) > 0 {
				allowed := false
				for _, name := range slot.AllowedTypes {
					if actual.definition.Name == name {
						allowed = true
						break
					}
				}
				if !allowed {
					return nil, fmt.Errorf("sdui: node %s slot %s does not allow type %s", id, name, actual.definition.Name)
				}
			}
			result.slots[name] = append(result.slots[name], compiled)
		}
		if slot.MaxNodes > 0 && c.count-before > slot.MaxNodes {
			return nil, fmt.Errorf("sdui: node %s slot %s exceeds expanded node limit", id, name)
		}
	}
	for name, slot := range definition.Slots {
		if slot.Required && len(node.Slots[name]) == 0 {
			return nil, fmt.Errorf("sdui: node %s requires slot %s", id, name)
		}
	}
	return result, nil
}

func compileEvent(event Event, definition Definition, id string, rewrite map[string]string) (Event, error) {
	found := false
	for _, on := range definition.Events {
		if on == event.On {
			found = true
			break
		}
	}
	if !found {
		return Event{}, fmt.Errorf("sdui: node %s does not support event %q", id, event.On)
	}
	if !registryKey.MatchString(event.Action) || !validNodeID(event.Target) {
		return Event{}, fmt.Errorf("sdui: invalid action or target on %s", id)
	}
	if event.SourceAction != "" && (event.On != "ely:action" || len(event.SourceAction) > 128 || strings.ContainsAny(event.SourceAction, "\x00\r\n")) {
		return Event{}, fmt.Errorf("sdui: invalid sourceAction on %s", id)
	}
	if len(event.Payload) > 32 {
		return Event{}, fmt.Errorf("sdui: too many payload fields")
	}
	payload := make(map[string]PayloadBinding, len(event.Payload))
	for name, binding := range event.Payload {
		if !propertyName.MatchString(name) || strings.HasPrefix(name, "_") || binding.Path == "" || !strings.HasPrefix(binding.Path, "/") || len(binding.Path) > 512 {
			return Event{}, fmt.Errorf("sdui: invalid payload binding %q", name)
		}
		switch binding.Type {
		case String, Boolean, Integer, Number, Object, Array:
		default:
			return Event{}, fmt.Errorf("sdui: invalid payload type")
		}
		for _, token := range strings.Split(binding.Path[1:], "/") {
			for i := 0; i < len(token); i++ {
				if token[i] == '~' {
					if i+1 >= len(token) || (token[i+1] != '0' && token[i+1] != '1') {
						return Event{}, fmt.Errorf("sdui: invalid payload pointer")
					}
					i++
				}
			}
		}
		payload[name] = binding
	}
	event.Payload = payload
	if mapped, ok := rewrite[event.Target]; ok {
		event.Target = mapped
	}
	return event, nil
}

func templateIDs(root Node, namespace string) (map[string]string, error) {
	ids := map[string]string{}
	count := 0
	var walk func(Node, int) error
	walk = func(node Node, depth int) error {
		count++
		if count > MaxNodes || depth > MaxDepth {
			return fmt.Errorf("sdui: template exceeds complexity limit")
		}
		if !validNodeID(node.ID) {
			return fmt.Errorf("sdui: invalid template node ID %q", node.ID)
		}
		if _, ok := ids[node.ID]; ok {
			return fmt.Errorf("sdui: duplicate template node ID %q", node.ID)
		}
		ids[node.ID] = namespaceID(namespace, node.ID)
		for _, child := range node.Children {
			if err := walk(child, depth+1); err != nil {
				return err
			}
		}
		for _, name := range sortedKeys(node.Slots) {
			for _, child := range node.Slots[name] {
				if err := walk(child, depth+1); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := walk(root, 1); err != nil {
		return nil, err
	}
	ids[root.ID] = namespace
	return ids, nil
}

func (c *compiler) validateReferences() error {
	visiting, visited := map[string]bool{}, map[string]bool{}
	total := 0
	var visit func(string) error
	var walk func(Node, int) error
	walk = func(node Node, depth int) error {
		total++
		if total > MaxNodes*2 || depth > MaxDepth {
			return fmt.Errorf("sdui: template source exceeds complexity limit")
		}
		if node.Use != "" {
			if err := visit(node.Use); err != nil {
				return err
			}
		}
		for _, child := range node.Children {
			if err := walk(child, depth+1); err != nil {
				return err
			}
		}
		for _, name := range sortedKeys(node.Slots) {
			for _, child := range node.Slots[name] {
				if err := walk(child, depth+1); err != nil {
					return err
				}
			}
		}
		return nil
	}
	visit = func(name string) error {
		if visiting[name] {
			return fmt.Errorf("sdui: reusable template cycle at %q", name)
		}
		if visited[name] {
			return nil
		}
		definition, ok := c.templates[name]
		if !ok {
			return fmt.Errorf("sdui: missing reusable template %q", name)
		}
		visiting[name] = true
		if err := walk(definition.Root, 1); err != nil {
			return err
		}
		visiting[name] = false
		visited[name] = true
		return nil
	}
	for _, name := range sortedKeys(c.templates) {
		if err := visit(name); err != nil {
			return err
		}
	}
	return nil
}
