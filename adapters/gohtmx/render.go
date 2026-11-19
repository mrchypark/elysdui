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
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
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

var assetTemplates = template.Must(template.New("sdui-assets").Parse(
	`{{define "stylesheet"}}<link rel="stylesheet" href="{{.}}">{{end}}` +
		`{{define "script"}}<script src="{{.}}" defer></script>{{end}}` +
		`{{define "module"}}<script type="module" src="{{.}}"></script>{{end}}`,
))

// AssetBundle holds deduplicated, host-served asset URLs separated by role so
// custom layout shells can inspect, merge, or subtract already-loaded assets.
type AssetBundle struct {
	Stylesheets []string
	Scripts     []string
	Modules     []string
}

// BaseUIAssets returns the standalone UI baseline assets (/assets/app.css and
// the ui-component-assets stylesheet/script set).
func BaseUIAssets() AssetBundle {
	return AssetBundle{
		Stylesheets: []string{"/assets/app.css", "/assets/ely-controls.css", "/assets/ely-patterns.css"},
		Scripts:     []string{"/assets/ely-controls.js", "/assets/ely-patterns.js"},
	}
}

// BridgeAssets returns the SDUI browser bridge assets (/assets/sdui.css and /assets/sdui.js).
func BridgeAssets() AssetBundle {
	return AssetBundle{
		Stylesheets: []string{"/assets/sdui.css"},
		Scripts:     []string{"/assets/sdui.js"},
	}
}

// FamilyAssets returns the shared advanced-component stylesheet, family-specific
// stylesheets, and module entrypoints required by the named component families.
func FamilyAssets(families ...string) (AssetBundle, error) {
	if len(families) == 0 {
		return AssetBundle{}, nil
	}
	seenFamilies := make(map[string]bool, len(families))
	ordered := make([]string, 0, len(families))
	for _, family := range families {
		if !knownFamilies[family] {
			return AssetBundle{}, fmt.Errorf("sdui: unknown asset family %q", family)
		}
		if seenFamilies[family] {
			continue
		}
		seenFamilies[family] = true
		ordered = append(ordered, family)
	}
	sort.Strings(ordered)
	seenSheets := map[string]bool{}
	var sheets []string
	for _, family := range ordered {
		for _, sheet := range ui.FamilyStylesheets(family) {
			if !seenSheets[sheet] {
				seenSheets[sheet] = true
				sheets = append(sheets, sheet)
			}
		}
	}
	sort.Strings(sheets)
	stylesheets := make([]string, 0, 1+len(sheets))
	stylesheets = append(stylesheets, "/assets/ely-api.css")
	for _, sheet := range sheets {
		stylesheets = append(stylesheets, "/assets/"+sheet)
	}
	modules := make([]string, 0, len(ordered))
	for _, family := range ordered {
		modules = append(modules, "/assets/ely-api-"+family+"-entry.js")
	}
	return AssetBundle{Stylesheets: stylesheets, Modules: modules}, nil
}

// MergeAssets combines bundles in order, preserving first-seen URL order and
// removing duplicates within each asset category.
func MergeAssets(bundles ...AssetBundle) AssetBundle {
	var stylesheets, scripts, modules []string
	for _, bundle := range bundles {
		stylesheets = append(stylesheets, bundle.Stylesheets...)
		scripts = append(scripts, bundle.Scripts...)
		modules = append(modules, bundle.Modules...)
	}
	return AssetBundle{
		Stylesheets: dedupeStrings(stylesheets, nil),
		Scripts:     dedupeStrings(scripts, nil),
		Modules:     dedupeStrings(modules, nil),
	}
}

// Empty reports whether the bundle contains any asset URLs.
func (b AssetBundle) Empty() bool {
	return len(b.Stylesheets) == 0 && len(b.Scripts) == 0 && len(b.Modules) == 0
}

// URLs returns all unique asset URLs across stylesheets, scripts, and modules.
func (b AssetBundle) URLs() []string {
	seen := make(map[string]bool, len(b.Stylesheets)+len(b.Scripts)+len(b.Modules))
	var out []string
	for _, list := range [][]string{b.Stylesheets, b.Scripts, b.Modules} {
		for _, raw := range list {
			if seen[raw] {
				continue
			}
			seen[raw] = true
			out = append(out, raw)
		}
	}
	return out
}

// Exclude returns a deduplicated copy of the bundle without any of the given URLs.
func (b AssetBundle) Exclude(urls ...string) AssetBundle {
	var drop map[string]bool
	if len(urls) > 0 {
		drop = make(map[string]bool, len(urls))
		for _, raw := range urls {
			drop[raw] = true
		}
	}
	return AssetBundle{
		Stylesheets: dedupeStrings(b.Stylesheets, drop),
		Scripts:     dedupeStrings(b.Scripts, drop),
		Modules:     dedupeStrings(b.Modules, drop),
	}
}

// Without returns a deduplicated copy of the bundle without any asset URLs present in other.
func (b AssetBundle) Without(other AssetBundle) AssetBundle {
	return b.Exclude(other.URLs()...)
}

// Render validates every URL as a local /assets/ path and atomically emits
// <link> and <script> tags to w. Stylesheets are emitted first, followed by
// classic component scripts, family module entrypoints, and finally /assets/sdui.js
// (when present) so deferred bridge setup runs after component modules.
func (b AssetBundle) Render(w io.Writer) error {
	if w == nil {
		return fmt.Errorf("sdui: rendering assets requires a writer")
	}
	var output boundedBuffer
	seen := make(map[string]bool, len(b.Stylesheets)+len(b.Scripts)+len(b.Modules))
	emitURL := func(kind, raw string) error {
		if seen[raw] {
			return nil
		}
		seen[raw] = true
		return assetTemplates.ExecuteTemplate(&output, kind, raw)
	}
	for _, raw := range b.Stylesheets {
		if err := validateAssetURL(raw); err != nil {
			return err
		}
		if err := emitURL("stylesheet", raw); err != nil {
			return err
		}
	}
	hasSDUIScript := false
	for _, raw := range b.Scripts {
		if err := validateAssetURL(raw); err != nil {
			return err
		}
		if raw == "/assets/sdui.js" {
			hasSDUIScript = true
			continue
		}
		if err := emitURL("script", raw); err != nil {
			return err
		}
	}
	for _, raw := range b.Modules {
		if err := validateAssetURL(raw); err != nil {
			return err
		}
		if err := emitURL("module", raw); err != nil {
			return err
		}
	}
	if hasSDUIScript {
		if err := emitURL("script", "/assets/sdui.js"); err != nil {
			return err
		}
	}
	if output.Len() == 0 {
		return nil
	}
	_, err := w.Write(output.Bytes())
	return err
}

// HTML returns the rendered asset tags as trusted template.HTML for embedding in
// a host Go template <head>.
func (b AssetBundle) HTML() (template.HTML, error) {
	var output bytes.Buffer
	if err := b.Render(&output); err != nil {
		return "", err
	}
	return template.HTML(output.String()), nil
}

func dedupeStrings(items []string, drop map[string]bool) []string {
	if len(items) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(items))
	var out []string
	for _, item := range items {
		if drop[item] || seen[item] {
			continue
		}
		seen[item] = true
		out = append(out, item)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func validateAssetURL(raw string) error {
	if !strings.HasPrefix(raw, "/assets/") || len(raw) == len("/assets/") {
		return fmt.Errorf("sdui: asset URL must be a non-empty /assets/ path")
	}
	if strings.Contains(raw, "//") || strings.ContainsAny(raw, "\\?#\"'<>") || strings.IndexFunc(raw, func(r rune) bool { return unicode.IsControl(r) || unicode.IsSpace(r) }) >= 0 {
		return fmt.Errorf("sdui: invalid asset URL %q", raw)
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host != "" || parsed.Scheme != "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Path != raw {
		return fmt.Errorf("sdui: invalid asset URL %q", raw)
	}
	for _, seg := range strings.Split(strings.TrimPrefix(parsed.Path, "/assets/"), "/") {
		if seg == "" || seg == "." || seg == ".." {
			return fmt.Errorf("sdui: invalid asset URL path segment in %q", raw)
		}
	}
	return nil
}

// Assets returns the structured, deduplicated asset bundle required by this plan.
// Custom layout hosts can subtract already-loaded shell assets via Without or
// Exclude before rendering the remaining delta tags into <head>.
func (p *Plan) Assets() (AssetBundle, error) {
	if p == nil || p.core == nil || p.templates == nil {
		return AssetBundle{}, fmt.Errorf("sdui: rendering requires a compiled plan")
	}
	stylesheets := []string{"/assets/app.css", "/assets/sdui.css", "/assets/ely-controls.css", "/assets/ely-patterns.css"}
	scripts := []string{"/assets/ely-controls.js", "/assets/ely-patterns.js"}
	for _, asset := range p.assets {
		if asset == "map" {
			stylesheets = append(stylesheets, "/assets/ely-map.css")
			scripts = append(scripts, "/assets/ely-map.js")
		}
	}
	scripts = append(scripts, "/assets/sdui.js")
	familyAssets, err := FamilyAssets(p.families...)
	if err != nil {
		return AssetBundle{}, err
	}
	return MergeAssets(
		AssetBundle{Stylesheets: stylesheets, Scripts: scripts},
		familyAssets,
	), nil
}

// RenderAssets emits the fixed basic assets, the union of registered leaf
// family assets and their CSS dependencies, and the event bridge. Schemas can
// never select an asset URL. Optional Lottie code is loaded by its component
// only when mounted, including after region swaps. Call once per page.
func (p *Plan) RenderAssets(w io.Writer) error {
	assets, err := p.Assets()
	if err != nil {
		return err
	}
	return assets.Render(w)
}

type eventMetadata struct {
	JSON   string
	Single *Event
}

func eventJSON(events []Event) (*eventMetadata, error) {
	if len(events) == 0 {
		return nil, nil
	}
	data, err := json.Marshal(events)
	if err != nil {
		return nil, err
	}
	metadata := &eventMetadata{JSON: string(data)}
	if len(events) == 1 {
		metadata.Single = &events[0]
	}
	return metadata, nil
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
