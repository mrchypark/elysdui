package sdui

import (
	"crypto/sha256"
	"fmt"
)

type resolveBudget struct {
	nodes  int
	values *valueBudget
	ids    map[string]bool
}

func (budget *resolveBudget) valueBudget() *valueBudget {
	if budget.values == nil {
		budget.values = newValueBudget()
	}
	return budget.values
}

func applyParameters(node *compiledNode, scope resolveScope, budget *resolveBudget) (resolveScope, error) {
	params := make(map[string]any, len(node.use.params)+len(node.use.bindings))
	for _, key := range sortedKeys(node.use.params) {
		value, err := copyNormalizedValue(node.use.params[key], budget.valueBudget(), 1)
		if err != nil {
			return scope, fmt.Errorf("sdui: use %s parameter %s: %w", node.id, key, err)
		}
		params[key] = value
	}
	for _, key := range sortedKeys(node.use.bindings) {
		ref := node.use.bindings[key]
		value, present, err := ref.lookup(scope)
		if err != nil {
			return scope, fmt.Errorf("sdui: use %s: %w", node.id, err)
		}
		if !present {
			return scope, fmt.Errorf("sdui: use %s parameter binding %q is missing", node.id, ref.path)
		}
		normalized, err := normalizeWithBudget(node.use.properties[key], value, budget.valueBudget())
		if err != nil {
			return scope, fmt.Errorf("sdui: use %s parameter %s: %w", node.id, key, err)
		}
		params[key] = normalized
	}
	scope.params = params
	scope.vars = nil
	return scope, nil
}

// forEachNodeInstance is shared by the HTML and native-neutral projections.
// Stable identities and pre-allocation expansion limits must be identical.
func forEachNodeInstance(node *compiledNode, scope resolveScope, budget *resolveBudget, visit func(resolveScope) error) error {
	if node.repeat == nil {
		return visit(scope)
	}
	value, present, err := node.repeat.items.lookup(scope)
	if err != nil {
		return fmt.Errorf("sdui: node %s repeat: %w", node.id, err)
	}
	if !present {
		return fmt.Errorf("sdui: node %s repeat binding %q is missing", node.id, node.repeat.items.path)
	}
	// Check before copying supported typed slices, to bound allocations too.
	count, ok := arrayLength(value)
	if !ok {
		return fmt.Errorf("sdui: node %s repeat requires an array", node.id)
	}
	if count > MaxNodes || count > MaxNodes-budget.nodes {
		return fmt.Errorf("sdui: expanded node count exceeds %d", MaxNodes)
	}
	items, _ := dataArray(value)
	seen := map[string]bool{}
	for _, item := range items {
		value, present, err := walkData(item, node.repeat.key, node.repeat.keyPath)
		if err != nil {
			return fmt.Errorf("sdui: node %s repeat key: %w", node.id, err)
		}
		if !present {
			return fmt.Errorf("sdui: node %s repeat key %q is missing", node.id, node.repeat.keyPath)
		}
		key, err := repeatKey(value)
		if err != nil {
			return fmt.Errorf("sdui: node %s: %w", node.id, err)
		}
		if seen[key] {
			return fmt.Errorf("sdui: node %s has duplicate repeat key", node.id)
		}
		seen[key] = true
		vars := make(map[string]any, len(scope.vars)+1)
		for key, value := range scope.vars {
			vars[key] = value
		}
		vars[node.repeat.as] = item
		inner := scope
		inner.vars = vars
		inner.identity = fmt.Sprintf("%x", sha256.Sum256([]byte(scope.identity+"\x00"+node.id+"\x00"+key)))
		if err := visit(inner); err != nil {
			return err
		}
	}
	return nil
}

func arrayLength(value any) (int, bool) {
	switch values := value.(type) {
	case []any:
		return len(values), true
	case []map[string]any:
		return len(values), true
	case []string:
		return len(values), true
	default:
		return 0, false
	}
}

func dynamicControlID(id, identity string) string {
	if identity == "" {
		return id
	}
	return fmt.Sprintf("sdui-internal-%x", sha256.Sum256([]byte(id+"\x00"+identity)))
}
