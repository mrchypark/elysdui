package gohtmx

import (
	"github.com/mrchypark/elysdui/sdui"
	"io"
	"regexp"
	"sort"
	"strings"
)

// Authoring types are shared with the renderer-neutral semantic package.
type Screen = sdui.Screen
type Node = sdui.Node
type TemplateDefinition = sdui.TemplateDefinition
type Condition = sdui.Condition
type Repeat = sdui.Repeat
type Event = sdui.Event
type PayloadBinding = sdui.PayloadBinding
type ValueType = sdui.ValueType
type URLPolicy = sdui.URLPolicy
type Slot = SlotDefinition
type ContainerKind = sdui.ContainerKind
type NativeNode = sdui.NativeNode
type NativeEnvelope = sdui.NativeEnvelope
type NativeActionRequest = sdui.NativeActionRequest
type ResolveContext = sdui.ResolveContext

const (
	String                 = sdui.String
	Boolean                = sdui.Boolean
	Integer                = sdui.Integer
	Number                 = sdui.Number
	Object                 = sdui.Object
	Array                  = sdui.Array
	Stack                  = sdui.Stack
	Region                 = sdui.Region
	Form                   = sdui.Form
	Version                = sdui.Version
	MaxSchemaBytes         = sdui.MaxSchemaBytes
	MaxRenderBytes         = 2 << 20
	MaxNodes               = sdui.MaxNodes
	MaxDepth               = sdui.MaxDepth
	MaxStringBytes         = sdui.MaxStringBytes
	MaxValueDepth          = sdui.MaxValueDepth
	MaxValues              = sdui.MaxValues
	MaxNormalizationBytes  = sdui.MaxNormalizationBytes
	MaxArrayItems          = sdui.MaxArrayItems
	MaxObjectProperties    = sdui.MaxObjectProperties
	HardMaxStringBytes     = sdui.HardMaxStringBytes
	MaxConditionNodes      = sdui.MaxConditionNodes
	MaxConditionDepth      = sdui.MaxConditionDepth
	NativeVersion          = sdui.NativeVersion
	MaxNativeResponseBytes = sdui.MaxNativeResponseBytes
	MaxNativeActionBytes   = sdui.MaxNativeActionBytes
	MaxNativeRevision      = sdui.MaxNativeRevision
)

var ErrUnsupportedNative = sdui.ErrUnsupportedNative

func Decode(r io.Reader) (Screen, error)                          { return sdui.Decode(r) }
func DecodeNativeAction(r io.Reader) (NativeActionRequest, error) { return sdui.DecodeNativeAction(r) }
func NativeCapabilities() []string                                { return sdui.NativeCapabilities() }
func JSONSchema(r *Registry) (map[string]any, error) {
	if r == nil {
		return sdui.JSONSchema(nil)
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	schema, err := sdui.JSONSchema(r.core.Clone(sdui.WithFormats(formatsForDefinition(Definition{}))))
	if err != nil {
		return nil, err
	}
	if definitions, ok := schema["$defs"].(map[string]any); ok {
		for _, value := range definitions {
			if node, ok := value.(map[string]any); ok {
				if name, ok := node["title"].(string); ok {
					if family := r.definitions[name].Family; family != "" {
						node["x-ely-family"] = family
					}
				}
			}
		}
	}
	schema["x-ely-limits"].(map[string]any)["renderBytes"] = MaxRenderBytes
	schema["description"] = strings.ReplaceAll(schema["description"].(string), "Compile and Resolve", "Compile and Render")
	return schema, nil
}
func sortedKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

var registryKey = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_.-]{0,127}$`)

// ResolveNative exposes the independent native projection for dual HTML/native
// hosts. Native-only hosts can use sdui.Plan and sdui.ResolveContext directly.
func (p *Plan) ResolveNative(id string, ctx RenderContext, capabilities []string) (NativeNode, error) {
	if p == nil {
		var core *sdui.Plan
		return core.ResolveNative(id, sdui.ResolveContext{Data: ctx.Data}, capabilities)
	}
	return p.core.ResolveNative(id, sdui.ResolveContext{Data: ctx.Data}, capabilities)
}
func (r *Registry) JSONSchema() (map[string]any, error) { return JSONSchema(r) }
