package gohtmx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"net/url"
	"sort"
	"strings"
	"unicode"

	"github.com/mrchypark/elysdui/sdui"
)

// RequestCompressionOptions controls native browser compression of text action
// requests. Nil Codecs preserves the default order (zstd, gzip); an explicit
// empty list disables compression. Browsers skip codecs they cannot encode.
// Byte and percentage thresholds are inclusive; compressed bodies must always
// be strictly smaller. A nil RenderContext.RequestCompression uses 1024 bytes
// with 64 bytes and 5 percent minimum savings. Password forms and explicit form opt-outs
// remain uncompressed regardless of this policy.
type RequestCompressionOptions struct {
	Disabled          bool
	Codecs            []string
	MinBytes          int
	MinSavingsBytes   int
	MinSavingsPercent int
}

// DefaultRequestCompressionOptions returns a fresh default policy. Mutating its
// codec slice does not affect other policies.
func DefaultRequestCompressionOptions() RequestCompressionOptions {
	return RequestCompressionOptions{Codecs: []string{"zstd", "gzip"}, MinBytes: 1024, MinSavingsBytes: 64, MinSavingsPercent: 5}
}

// RenderContext is host-owned request data. Endpoint is a same-origin absolute
// path (no query, fragment or authority); it cannot come from the schema.
// Bound values are ordinary JSON data. Bindings support dotted object paths and
// RFC 6901 pointers, without reflection, expressions or coercion to HTML.
type RenderContext struct {
	Data               map[string]any
	CSRF               string
	Endpoint           string
	Revision           string
	RequestCompression *RequestCompressionOptions
}

// boundedBuffer caps every intermediate fragment, not only the final result.
// Its WriteString override also covers host writes outside html/template.
type boundedBuffer struct{ bytes.Buffer }

func (b *boundedBuffer) Write(data []byte) (int, error) {
	if len(data) > MaxRenderBytes-b.Len() {
		return 0, fmt.Errorf("sdui: rendered output exceeds %d bytes", MaxRenderBytes)
	}
	return b.Buffer.Write(data)
}
func (b *boundedBuffer) WriteString(data string) (int, error) { return b.Write([]byte(data)) }

// Plan couples an immutable semantic plan to its reviewed HTML mappings.
type Plan struct {
	core             *sdui.Plan
	templates        *template.Template
	definitions      map[string]Definition
	families, assets []string
}

func (p *Plan) Families() []string { return append([]string(nil), p.families...) }

var structureTemplates = template.Must(template.New("sdui").Parse(`
{{define "event"}}{{if .}} data-sdui-events="{{.JSON}}"{{if .Single}} data-sdui-on="{{.Single.On}}" data-sdui-action="{{.Single.Action}}" data-sdui-target="{{.Single.Target}}"{{end}}{{end}}{{end}}
{{define "screen"}}<div id="{{.ID}}" data-sdui-screen="{{.ID}}"{{if .Revision}} data-sdui-revision="{{.Revision}}"{{end}}{{if .Endpoint}} data-sdui-endpoint="{{.Endpoint}}"{{end}}{{if .CSRF}} data-sdui-csrf="{{.CSRF}}"{{end}}{{with .RequestCompression}}{{if .Disabled}} data-sdui-request-compression="off"{{end}} data-sdui-request-codecs="{{$.RequestCodecs}}" data-sdui-request-min-bytes="{{.MinBytes}}" data-sdui-request-min-savings-bytes="{{.MinSavingsBytes}}" data-sdui-request-min-savings-percent="{{.MinSavingsPercent}}"{{end}}>{{.Body}}</div>{{end}}
{{define "stack"}}<div id="{{.ID}}" class="sdui-stack" data-sdui-gap="{{.Props.Gap}}" data-sdui-direction="{{.Props.Direction}}" data-sdui-align="{{.Props.Align}}"{{template "event" .Event}}>{{.Body}}</div>{{end}}
{{define "region"}}<section id="{{.ID}}" data-sdui-region="{{.ID}}"{{if .Props.Label}} aria-label="{{.Props.Label}}"{{end}}{{template "event" .Event}}>{{.Body}}</section>{{end}}
{{define "form"}}<form id="{{.ID}}" method="post"{{if .Props.Label}} aria-label="{{.Props.Label}}"{{end}}{{template "event" .Event}}>{{if .CSRF}}<input type="hidden" name="_csrf" value="{{.CSRF}}">{{end}}{{.Body}}</form>{{end}}
{{define "leaf"}}<div id="{{.ID}}" data-sdui-node="{{.Type}}"{{template "event" .Event}}>{{.Body}}</div>{{end}}
`))

// Render renders only screen markup. Call RenderAssets once in the document
// head; partial responses must never execute or duplicate loader scripts.
func (p *Plan) Render(w io.Writer, ctx RenderContext) error {
	if p == nil || p.core == nil || p.templates == nil {
		return fmt.Errorf("sdui: rendering requires a compiled plan")
	}
	if err := validateEndpoint(ctx.Endpoint); err != nil {
		return err
	}
	var body, output boundedBuffer
	nodes, err := p.core.Resolve(sdui.ResolveContext{Data: ctx.Data})
	if err != nil {
		return err
	}
	budget := &mappingBudget{}
	for _, node := range nodes {
		if err := p.renderNode(&body, node, ctx, budget); err != nil {
			return err
		}
	}
	codecs := "zstd,gzip"
	if ctx.RequestCompression != nil && ctx.RequestCompression.Codecs != nil {
		codecs = strings.Join(ctx.RequestCompression.Codecs, ",")
	}
	if err := structureTemplates.ExecuteTemplate(&output, "screen", map[string]any{"ID": p.ScreenID(), "Revision": ctx.Revision, "Endpoint": ctx.Endpoint, "CSRF": ctx.CSRF, "Body": template.HTML(body.String()), "RequestCompression": ctx.RequestCompression, "RequestCodecs": codecs}); err != nil {
		return err
	}
	_, err = w.Write(output.Bytes())
	return err
}

// RenderRegion returns the complete replacement region element. All rendering
// and data validation finish before writing, so failed bindings cannot produce
// a successful partial fragment. Writer errors are returned to the host.
func (p *Plan) RenderRegion(w io.Writer, id string, ctx RenderContext) error {
	if p == nil || p.core == nil || p.templates == nil {
		return fmt.Errorf("sdui: rendering requires a compiled plan")
	}
	nodes, err := p.core.ResolveRegion(id, sdui.ResolveContext{Data: ctx.Data})
	if err != nil {
		return err
	}
	var output boundedBuffer
	budget := &mappingBudget{}
	for _, node := range nodes {
		if err := p.renderNode(&output, node, ctx, budget); err != nil {
			return err
		}
	}
	_, err = w.Write(output.Bytes())
	return err
}

func validateEndpoint(endpoint string) error {
	if endpoint == "" {
		return nil
	}
	if !strings.HasPrefix(endpoint, "/") || strings.Contains(endpoint, "//") || strings.ContainsAny(endpoint, "\\?#") || strings.IndexFunc(endpoint, func(r rune) bool { return unicode.IsControl(r) || unicode.IsSpace(r) }) >= 0 {
		return fmt.Errorf("sdui: endpoint must be a same-origin absolute path")
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Host != "" || parsed.Scheme != "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Path == "" || parsed.Path != endpoint {
		return fmt.Errorf("sdui: invalid endpoint path")
	}
	// Encoded slashes, backslashes and control bytes must not obscure authority
	// or redirect-like paths after a proxy decodes them.
	if strings.Contains(parsed.Path, "//") || strings.Contains(parsed.Path, "\\") || strings.IndexFunc(parsed.Path, unicode.IsControl) >= 0 {
		return fmt.Errorf("sdui: invalid encoded endpoint path")
	}
	return nil
}

// RenderAssets emits the fixed basic assets, the union of registered leaf
// family assets and their CSS dependencies, and the event bridge. Schemas can
// never select an asset URL. Optional Lottie code is loaded by its component
// only when mounted, including after region swaps. Call once per page.
func (p *Plan) RenderAssets(w io.Writer) error {
	if p == nil || p.core == nil || p.templates == nil {
		return fmt.Errorf("sdui: rendering requires a compiled plan")
	}
	var output boundedBuffer
	output.WriteString(`<link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/sdui.css">`)
	if err := p.templates.ExecuteTemplate(&output, "ui-component-assets", nil); err != nil {
		return err
	}
	for _, asset := range p.assets {
		if asset == "map" {
			if err := p.templates.ExecuteTemplate(&output, "ui-map-assets", nil); err != nil {
				return err
			}
		}
	}
	css := map[string]bool{}
	if len(p.families) > 0 {
		css["ely-api.css"] = true
	}
	for _, family := range p.families {
		css["ely-api-"+family+".css"] = true
		switch family {
		case "workspace":
			css["ely-api-forms.css"] = true
		case "communication":
			css["ely-api-calendar-parity.css"] = true
		case "native":
			css["ely-api-native-tooling.css"] = true
		}
	}
	names := make([]string, 0, len(css))
	for name := range css {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		fmt.Fprintf(&output, `<link rel="stylesheet" href="/assets/%s">`, name)
	}
	for _, family := range p.families {
		fmt.Fprintf(&output, `<script type="module" src="/assets/ely-api-%s-entry.js"></script>`, family)
	}
	output.WriteString(`<script src="/assets/sdui.js" defer></script>`)
	_, err := w.Write(output.Bytes())
	return err
}

type eventMetadata struct {
	JSON   string
	Single *Event
}

func eventJSON(events []Event) *eventMetadata {
	if len(events) == 0 {
		return nil
	}
	data, _ := json.Marshal(events)
	metadata := &eventMetadata{JSON: string(data)}
	if len(events) == 1 {
		metadata.Single = &events[0]
	}
	return metadata
}

// SemanticPlan returns the opaque, immutable semantic snapshot. The adapter's
// renderer mapping cannot be replaced through this accessor.
func (p *Plan) SemanticPlan() *sdui.Plan {
	if p == nil {
		return nil
	}
	return p.core
}
func (p *Plan) ScreenID() string               { return p.core.ScreenID() }
func (p *Plan) Loader() string                 { return p.core.Loader() }
func (p *Plan) HasRegion(id string) bool       { return p.core.HasRegion(id) }
func (p *Plan) Events() []Event                { return p.core.Events() }
func (p *Plan) Definitions() []sdui.Definition { return p.core.Definitions() }
func (p *Plan) ValidateActions(allowed map[string][]string) error {
	return p.core.ValidateActions(allowed)
}
func (p *Plan) Resolve(ctx ResolveContext) ([]sdui.ResolvedNode, error) {
	return p.SemanticPlan().Resolve(ctx)
}
func (p *Plan) ResolveRegion(id string, ctx ResolveContext) ([]sdui.ResolvedNode, error) {
	return p.SemanticPlan().ResolveRegion(id, ctx)
}
