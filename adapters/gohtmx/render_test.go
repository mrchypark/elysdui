package gohtmx

import (
	"bytes"
	"errors"
	"html/template"
	"io"
	"strings"
	"sync"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"golang.org/x/net/html"
)

func renderTestPlan(t *testing.T) *Plan {
	t.Helper()
	s := schemaScreen()
	s.Root.Children[0].Children = []Node{
		{ID: "editor", Type: "form", Event: &Event{On: "submit", Action: "save", Target: "result"}, Children: []Node{
			{ID: "name", Type: "input", Props: map[string]any{"name": "name", "label": "Display name"}, Bindings: map[string]string{"value": "profile.name"}},
			{ID: "updates", Type: "switch", Props: map[string]any{"name": "updates", "label": "Updates"}, Bindings: map[string]string{"checked": "profile.updates"}, Event: &Event{On: "ely:change", Action: "save", Target: "result"}},
			{ID: "save", Type: "button", Props: map[string]any{"label": "Save", "type": "submit"}},
		}},
		{ID: "message", Type: "text", Bindings: map[string]string{"text": "message"}},
		{ID: "notice", Type: "notice", Props: map[string]any{"text": "Notice", "urgent": true}},
	}
	p, err := Compile(s, schemaRegistry(t))
	if err != nil {
		t.Fatal(err)
	}
	return p
}
func renderTestContext() RenderContext {
	return RenderContext{Endpoint: "/sdui/action", CSRF: `csrf"<&`, Data: map[string]any{"profile": map[string]any{"name": `<img src=x onerror=alert(1)>`, "updates": true}, "message": `<script>alert("x")</script>`}}
}

func TestRenderBridgesTemplatesAndEscapes(t *testing.T) {
	p := renderTestPlan(t)
	var output bytes.Buffer
	if err := p.Render(&output, renderTestContext()); err != nil {
		t.Fatal(err)
	}
	rendered := output.String()
	for _, want := range []string{`data-sdui-screen="screen"`, `data-sdui-endpoint="/sdui/action"`, `data-sdui-csrf="csrf&#34;&lt;&amp;"`, `name="_csrf"`, `data-sdui-region="result"`, `data-sdui-action="save"`, `data-sdui-target="result"`, `data-sdui-on="submit"`, `data-sdui-on="ely:change"`, `data-slot="input"`, `data-slot="button"`, `data-ely-family="forms"`, `data-ely-component="forms/Switch"`, `role="alert"`, `&lt;script&gt;alert(&#34;x&#34;)&lt;/script&gt;`, `&lt;img src=x onerror=alert(1)&gt;`} {
		if !strings.Contains(rendered, want) {
			t.Errorf("missing %q", want)
		}
	}
	if strings.Contains(rendered, "<script") || strings.Contains(rendered, "<img") || strings.Contains(rendered, "ZgotmplZ") {
		t.Fatalf("unsafe or broken rendering: %s", rendered)
	}
	checkUniqueDOMIDs(t, rendered)
	output.Reset()
	if err := p.RenderRegion(&output, "result", renderTestContext()); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(output.String(), `<section id="result" data-sdui-region="result"`) || strings.Contains(output.String(), "data-sdui-screen") || strings.Contains(output.String(), "<script") {
		t.Fatalf("bad partial response: %s", output.String())
	}
}

func checkUniqueDOMIDs(t *testing.T, markup string) {
	t.Helper()
	doc, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]bool{}
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		for _, a := range node.Attr {
			if a.Key == "id" {
				if ids[a.Val] {
					t.Errorf("duplicate DOM id %s", a.Val)
				}
				ids[a.Val] = true
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)
}

func TestRenderBindingValidationIsAtomic(t *testing.T) {
	p := renderTestPlan(t)
	for name, data := range map[string]map[string]any{
		"missing": {}, "wrong type": {"profile": map[string]any{"name": 1, "updates": true}},
		"no struct reflection": {"profile": struct{ Name string }{"safe"}},
		"trusted HTML":         {"profile": map[string]any{"name": template.HTML("<b>raw</b>"), "updates": true}},
		"wrong boolean":        {"profile": map[string]any{"name": "safe", "updates": "false"}},
	} {
		t.Run(name, func(t *testing.T) {
			var output bytes.Buffer
			if err := p.Render(&output, RenderContext{Data: data}); err == nil {
				t.Fatal("invalid binding accepted")
			}
			if output.Len() != 0 {
				t.Fatal("partial output escaped transaction")
			}
		})
	}
	var output bytes.Buffer
	if err := p.RenderRegion(&output, "missing", renderTestContext()); err == nil || output.Len() != 0 {
		t.Fatal("missing region accepted")
	}
	if err := p.RenderRegion(&output, "result", RenderContext{}); err == nil || output.Len() != 0 {
		t.Fatal("invalid partial binding wrote output")
	}
}

func TestRenderReservedBoundFieldName(t *testing.T) {
	screen := Screen{Version: Version, ID: "screen", Root: Node{ID: "input", Type: "input", Props: map[string]any{"label": "Label"}, Bindings: map[string]string{"name": "name"}}}
	plan, err := Compile(screen, schemaRegistry(t))
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"_csrf", "_action", "_target", "_request", "_private"} {
		var output bytes.Buffer
		if err := plan.Render(&output, RenderContext{Data: map[string]any{"name": name}}); err == nil || output.Len() != 0 {
			t.Fatalf("reserved bound field %q accepted", name)
		}
	}
}

func TestRenderEndpointSafety(t *testing.T) {
	p := renderTestPlan(t)
	for _, endpoint := range []string{"https://evil.example/action", "//evil.example", "/a//b", `/\evil`, "/action?target=x", "/action#x", "/action\n", "/a b", "/a\u00a0b", "/a%20b", "/%2fexample.com", "/%5cexample.com", "/%0a"} {
		ctx := renderTestContext()
		ctx.Endpoint = endpoint
		var output bytes.Buffer
		if err := p.Render(&output, ctx); err == nil || output.Len() != 0 {
			t.Errorf("unsafe endpoint %q accepted", endpoint)
		}
	}
	for _, endpoint := range []string{"", "/action", "/app/actions/save"} {
		ctx := renderTestContext()
		ctx.Endpoint = endpoint
		if err := p.Render(io.Discard, ctx); err != nil {
			t.Errorf("valid endpoint %q: %v", endpoint, err)
		}
	}
}

func TestRenderAssetsFamilyUnion(t *testing.T) {
	r := schemaRegistry(t)
	// An explicitly registered host component adds its documented family
	// dependencies; it need not be rendered in the region currently replaced.
	for _, definition := range []Definition{{Name: "workspace", Chapter: "editor", Component: "CodeEditor"}, {Name: "native", Chapter: "media", Component: "VideoPlayer"}, {Name: "communication", Chapter: "calendar", Component: "CalendarMonthView"}, {Name: "interaction", Chapter: "buttons", Component: "Button"}, {Name: "foundation", Template: "sdui-text", Family: "foundation"}, {Name: "data", Template: "sdui-text", Family: "data"}} {
		if err := r.Register(definition); err != nil {
			t.Fatal(err)
		}
	}
	screen := schemaScreen()
	screen.Root.Children[0].Children = []Node{{ID: "w", Type: "workspace"}, {ID: "n", Type: "native"}, {ID: "c", Type: "communication"}, {ID: "i", Type: "interaction"}, {ID: "f", Type: "foundation"}, {ID: "d", Type: "data"}, {ID: "s", Type: "switch", Props: map[string]any{"name": "updates", "label": "Updates"}}}
	p, err := Compile(screen, r)
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := p.RenderAssets(&output); err != nil {
		t.Fatal(err)
	}
	assets := output.String()
	for _, asset := range []string{"app.css", "sdui.css", "sdui.js", "ely-controls.css", "ely-controls.js", "ely-api.css", "ely-api-forms.css", "ely-api-forms-entry.js", "ely-api-workspace-entry.js", "ely-api-calendar-parity.css", "ely-api-native-tooling.css"} {
		if strings.Count(assets, `/assets/`+asset+`"`) != 1 {
			t.Errorf("asset %s not emitted exactly once", asset)
		}
	}
	doc, parseErr := html.Parse(strings.NewReader(assets))
	if parseErr != nil {
		t.Fatal(parseErr)
	}
	var checkAssetPaths func(*html.Node)
	checkAssetPaths = func(node *html.Node) {
		for _, attr := range node.Attr {
			if attr.Key == "href" || attr.Key == "src" {
				if !strings.HasPrefix(attr.Val, "/assets/") {
					t.Errorf("unexpected asset URL %s", attr.Val)
					continue
				}
				asset, openErr := Files.Open(strings.TrimPrefix(attr.Val, "/"))
				if openErr != nil {
					t.Errorf("missing asset %s: %v", attr.Val, openErr)
				} else {
					asset.Close()
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			checkAssetPaths(child)
		}
	}
	checkAssetPaths(doc)
	if strings.Contains(assets, "lottie-light.min.js") {
		t.Fatal("interaction family eagerly loads optional Lottie dependency")
	}
	if strings.Contains(assets, "ely-api-all.js") {
		t.Fatal("unbounded all-family loader")
	}
	families := p.Families()
	families[0] = "mutated"
	if p.Families()[0] == "mutated" {
		t.Fatal("families snapshot mutable")
	}
}

func TestRenderLongIDsAndPlanSnapshot(t *testing.T) {
	screen := schemaScreen()
	screen.ID = strings.Repeat("a", 128)
	screen.Root.Children[0].Children = []Node{{ID: "x", Type: "switch", Props: map[string]any{"name": "check", "label": "Check"}}, {ID: "x-control", Type: "input", Props: map[string]any{"name": "other", "label": "Other"}}}
	p, err := Compile(screen, schemaRegistry(t))
	if err != nil {
		t.Fatal(err)
	}
	screen.Root.Children[0].Children[0].Props["label"] = "mutated"
	var output bytes.Buffer
	if err := p.Render(&output, RenderContext{}); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(output.String(), "mutated") {
		t.Fatal("plan shares source property map")
	}
	checkUniqueDOMIDs(t, output.String())
}

func TestRenderLimitsWriterErrorsAndConcurrency(t *testing.T) {
	screen := schemaScreen()
	screen.Root.Children = nil
	for i := 0; i < 200; i++ {
		screen.Root.Children = append(screen.Root.Children, Node{ID: fmtNodeID(i), Type: "text", Bindings: map[string]string{"text": "text"}})
	}
	p, err := Compile(screen, schemaRegistry(t))
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := p.Render(&output, RenderContext{Data: map[string]any{"text": strings.Repeat("x", MaxStringBytes)}}); err == nil || output.Len() != 0 {
		t.Fatal("render limit ignored or partial output written")
	}
	p = renderTestPlan(t)
	if err := p.Render(brokenWriter{}, renderTestContext()); !errors.Is(err, io.ErrClosedPipe) {
		t.Fatalf("writer error lost: %v", err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Go(func() {
			if err := p.Render(io.Discard, renderTestContext()); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
}

type brokenWriter struct{}

func (brokenWriter) Write([]byte) (int, error) { return 0, io.ErrClosedPipe }

func TestRenderTemplateErrorIsAtomic(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	tpl = template.Must(tpl.New("broken").Funcs(template.FuncMap{"fail": func() (string, error) { return "", errors.New("test failure") }}).Parse(`prefix{{fail}}`))
	r := NewRegistry(tpl)
	if err := r.Register(Definition{Name: "broken", Template: "broken"}); err != nil {
		t.Fatal(err)
	}
	p, err := Compile(Screen{Version: Version, ID: "screen", Root: Node{ID: "broken", Type: "broken"}}, r)
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := p.Render(&output, RenderContext{}); err == nil || output.Len() != 0 {
		t.Fatal("template error not atomic")
	}
}

func TestRenderingRequiresCompiledPlan(t *testing.T) {
	for _, p := range []*Plan{nil, {}} {
		var out bytes.Buffer
		if err := p.Render(&out, RenderContext{}); err == nil {
			t.Fatal("uncompiled screen rendered")
		}
		if err := p.RenderRegion(&out, "result", RenderContext{}); err == nil {
			t.Fatal("uncompiled region rendered")
		}
		if err := p.RenderAssets(&out); err == nil {
			t.Fatal("uncompiled assets rendered")
		}
		if out.Len() != 0 {
			t.Fatal("uncompiled plan wrote output")
		}
	}
}

func TestRenderRequestCompressionPolicy(t *testing.T) {
	plan := renderTestPlan(t)
	for _, tt := range []struct {
		name   string
		policy *RequestCompressionOptions
		want   []string
	}{
		{"default absent", nil, nil},
		{"explicit", &RequestCompressionOptions{Codecs: []string{"gzip", "zstd"}, MinBytes: 2048, MinSavingsBytes: 80, MinSavingsPercent: 10}, []string{`data-sdui-request-codecs="gzip,zstd"`, `data-sdui-request-min-bytes="2048"`, `data-sdui-request-min-savings-bytes="80"`, `data-sdui-request-min-savings-percent="10"`}},
		{"disabled", &RequestCompressionOptions{Disabled: true}, []string{`data-sdui-request-compression="off"`, `data-sdui-request-codecs="zstd,gzip"`}},
		{"no codecs", &RequestCompressionOptions{Codecs: []string{}}, []string{`data-sdui-request-codecs=""`}},
		{"escaped", &RequestCompressionOptions{Codecs: []string{`"><script>`}}, []string{`data-sdui-request-codecs="&#34;&gt;&lt;script&gt;"`}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			ctx := renderTestContext()
			ctx.RequestCompression = tt.policy
			var output bytes.Buffer
			if err := plan.Render(&output, ctx); err != nil {
				t.Fatal(err)
			}
			for _, want := range tt.want {
				if !strings.Contains(output.String(), want) {
					t.Errorf("missing %s in %s", want, output.String())
				}
			}
			if tt.policy == nil && strings.Contains(output.String(), "data-sdui-request-") {
				t.Fatal("nil policy must leave attributes absent")
			}
		})
	}
}

func TestDefaultRequestCompressionOptionsIndependent(t *testing.T) {
	a := DefaultRequestCompressionOptions()
	a.Codecs[0] = "changed"
	b := DefaultRequestCompressionOptions()
	if b.Disabled || strings.Join(b.Codecs, ",") != "zstd,gzip" || b.MinBytes != 1024 || b.MinSavingsBytes != 64 || b.MinSavingsPercent != 5 {
		t.Fatalf("bad defaults: %+v", b)
	}
}
