package sdui

import "fmt"

// ResolvedNode is an independent, data-only projection of a compiled plan.
// Properties retain semantic wire names at every depth. It contains no markup, renderer selectors, or live
// references into the plan. Mutating a result cannot affect subsequent calls.
type ResolvedNode struct {
	ID        string
	ControlID string
	Type      string
	Props     map[string]any
	Children  []ResolvedNode
	Slots     map[string][]ResolvedNode
	Events    []Event
}

// Resolve evaluates composition, bindings, conditions and keyed repetition.
// All validation finishes before any result is returned. Hosts must not mutate
// ctx.Data during the call. Every call owns its node/value/identity budget.
func (p *Plan) Resolve(ctx ResolveContext) ([]ResolvedNode, error) {
	if p == nil || p.root == nil {
		return nil, fmt.Errorf("sdui: resolution requires a compiled plan")
	}
	return p.resolveNode(p.root, resolveScope{data: ctx.Data}, &resolveBudget{})
}

// ResolveRegion reconstructs lexical parameters before resolving a region.
func (p *Plan) ResolveRegion(id string, ctx ResolveContext) ([]ResolvedNode, error) {
	if p == nil || p.root == nil {
		return nil, fmt.Errorf("sdui: resolution requires a compiled plan")
	}
	node, ok := p.regions[id]
	if !ok {
		return nil, fmt.Errorf("sdui: unknown region %q", id)
	}
	scope := resolveScope{data: ctx.Data}
	budget := &resolveBudget{}
	for _, use := range node.enclosingUses {
		var err error
		scope, err = applyParameters(use, scope, budget)
		if err != nil {
			return nil, err
		}
	}
	return p.resolveNode(node, scope, budget)
}

func (p *Plan) resolveNode(node *compiledNode, scope resolveScope, budget *resolveBudget) ([]ResolvedNode, error) {
	var result []ResolvedNode
	err := forEachNodeInstance(node, scope, budget, func(instance resolveScope) error {
		nodes, err := p.resolveInstance(node, instance, budget)
		result = append(result, nodes...)
		return err
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (p *Plan) resolveInstance(node *compiledNode, scope resolveScope, budget *resolveBudget) ([]ResolvedNode, error) {
	budget.nodes++
	if budget.nodes > MaxNodes {
		return nil, fmt.Errorf("sdui: expanded node count exceeds %d", MaxNodes)
	}
	show, err := node.when.evaluate(scope)
	if err != nil {
		return nil, fmt.Errorf("sdui: node %s condition: %w", node.id, err)
	}
	if !show {
		return nil, nil
	}
	if node.use != nil {
		inner, err := applyParameters(node, scope, budget)
		if err != nil {
			return nil, err
		}
		return p.resolveNode(node.use.root, inner, budget)
	}
	id := dynamicID(node.id, scope.identity)
	controlID := dynamicControlID(node.controlID, scope.identity)
	if budget.ids == nil {
		budget.ids = map[string]bool{p.id: true}
	}
	if budget.ids[id] || budget.ids[controlID] {
		return nil, fmt.Errorf("sdui: duplicate rendered ID %q", id)
	}
	budget.ids[id] = true
	budget.ids[controlID] = true
	resolved := ResolvedNode{ID: id, ControlID: controlID, Type: node.definition.Name, Props: map[string]any{}, Slots: map[string][]ResolvedNode{}, Events: cloneEvents(node.events)}
	for _, key := range sortedKeys(node.props) {
		value, err := copyNormalizedValue(node.props[key], budget.valueBudget(), 1)
		if err != nil {
			return nil, fmt.Errorf("sdui: node %s property %s: %w", node.id, key, err)
		}
		resolved.Props[key] = value
	}
	for _, key := range sortedKeys(node.bindings) {
		ref := node.bindings[key]
		value, present, err := ref.lookup(scope)
		if err != nil {
			return nil, fmt.Errorf("sdui: node %s: %w", node.id, err)
		}
		if !present {
			return nil, fmt.Errorf("sdui: node %s binding %q is missing", node.id, ref.path)
		}
		normalized, err := normalizeWithBudget(node.definition.Properties[key], value, budget.valueBudget())
		if err != nil {
			return nil, fmt.Errorf("sdui: node %s binding %s: %w", node.id, key, err)
		}
		resolved.Props[key] = normalized
	}
	for _, name := range sortedKeys(node.slots) {
		before := budget.nodes
		for _, child := range node.slots[name] {
			children, err := p.resolveNode(child, scope, budget)
			if err != nil {
				return nil, err
			}
			resolved.Slots[name] = append(resolved.Slots[name], children...)
		}
		slot := node.definition.Slots[name]
		if slot.MaxNodes > 0 && budget.nodes-before > slot.MaxNodes {
			return nil, fmt.Errorf("sdui: node %s slot %s exceeds expanded node limit", node.id, name)
		}
	}
	for _, child := range node.children {
		children, err := p.resolveNode(child, scope, budget)
		if err != nil {
			return nil, err
		}
		resolved.Children = append(resolved.Children, children...)
	}
	return []ResolvedNode{resolved}, nil
}

func cloneEvents(events []Event) []Event {
	out := append([]Event(nil), events...)
	for i := range out {
		if out[i].Payload != nil {
			m := map[string]PayloadBinding{}
			for k, v := range out[i].Payload {
				m[k] = v
			}
			out[i].Payload = m
		}
	}
	return out
}

// Definitions returns independent copies of every contract reachable from the
// screen, including hidden branches and unused reusable trees validated by Compile.
func (p *Plan) Definitions() []Definition {
	if p == nil {
		return nil
	}
	result := make([]Definition, 0, len(p.definitions))
	for _, name := range sortedKeys(p.definitions) {
		result = append(result, cloneDefinition(p.definitions[name]))
	}
	return result
}
