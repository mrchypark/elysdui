package sdui

import (
	"fmt"
	"strings"
)

// ResolveContext contains ordinary host data. The host must not mutate it during resolution.
type ResolveContext struct{ Data map[string]any }

type compiledNode struct {
	id, controlID string
	definition    Definition
	props         map[string]any
	bindings      map[string]bindingRef
	children      []*compiledNode
	slots         map[string][]*compiledNode
	events        []Event
	when          *compiledCondition
	repeat        *compiledRepeat
	use           *compiledUse
	// enclosingUses reconstructs lexical parameter scopes for direct region renders.
	enclosingUses []*compiledNode
}
type compiledUse struct {
	properties map[string]Property
	params     map[string]any
	bindings   map[string]bindingRef
	root       *compiledNode
}

// Plan is a validated, immutable semantic snapshot. It is safe to resolve
// concurrently when the host does not mutate ResolveContext.Data.
type Plan struct {
	definitions map[string]Definition
	id, loader  string
	root        *compiledNode
	regions     map[string]*compiledNode
	events      []Event
}

func (p *Plan) ScreenID() string         { return p.id }
func (p *Plan) Loader() string           { return p.loader }
func (p *Plan) HasRegion(id string) bool { _, ok := p.regions[id]; return ok }
func (p *Plan) Events() []Event {
	out := append([]Event(nil), p.events...)
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

// ValidateActions checks every schema event against the host allowlist. Each
// action maps to the exact region IDs it may replace. HTTP handlers must call
// this before serving a plan; compilation alone cannot know host capabilities.
func (p *Plan) ValidateActions(allowed map[string][]string) error {
	for _, event := range p.events {
		targets, ok := allowed[event.Action]
		if !ok {
			return fmt.Errorf("sdui: action %q is not registered", event.Action)
		}
		found := false
		for _, target := range targets {
			if target == event.Target {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("sdui: action %q cannot replace region %q", event.Action, event.Target)
		}
	}
	return nil
}

func validNodeID(id string) bool {
	return schemaID.MatchString(id) && !strings.HasPrefix(id, "sdui-internal-")
}
