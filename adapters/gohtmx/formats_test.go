package gohtmx

import (
	"github.com/mrchypark/elysdui/sdui"
	"strings"
	"testing"
)

func validateAdapterFormatPolicy(p sdui.Property, policy URLPolicy, sandbox bool) (sdui.Property, error) {
	r := sdui.NewRegistry(sdui.WithURLPolicy(policy), sdui.WithFormats(formatsForDefinition(Definition{SandboxHTML: sandbox, Chapter: "devtools", Component: "JsonViewer"})))
	err := r.Register(sdui.Definition{Name: "format-test", Properties: map[string]sdui.Property{"value": p}})
	if err != nil {
		return sdui.Property{}, err
	}
	d, _ := r.Definition("format-test")
	return d.Properties["value"], nil
}
func checkedFormatProperty(t *testing.T, p sdui.Property) sdui.Property {
	t.Helper()
	q, err := validateAdapterFormatPolicy(p, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	return q
}
func normalizeFormat(p sdui.Property, value any) (any, error) { return p.Normalize(value) }
func TestSandboxDocumentSafety(t *testing.T) {
	p, err := validateAdapterFormatPolicy(sdui.Property{Type: String, Format: "sandbox-html"}, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	for _, input := range []string{`<h1>Hello</h1><p>Safe &amp; sound</p>`, `<!doctype html><html><head><title>Preview</title></head><body><a href="/help">Help</a><img src="/preview.png" alt="preview"></body></html>`} {
		got, err := normalizeFormat(p, input)
		if err != nil {
			t.Fatal(err)
		}
		if _, ok := got.(string); !ok {
			t.Fatalf("HTML became a trusted value: %T", got)
		}
	}
	for _, input := range []string{
		`<img src="https://evil.example/tracker">`,
		`<script>alert(1)</script>`,
		`<svg><image href="https://evil.example/x"/></svg>`,
		`<img src="/x" onerror="alert(1)">`,
		`<meta http-equiv="refresh" content="0;url=https://evil.example">`,
		`<style>body{background:url(https://evil.example/x)}</style>`,
		`<div style="background:url(https://evil.example/x)">x</div>`,
		`<link rel="stylesheet" href="/x.css">`,
		`<iframe src="/embed"></iframe>`,
		`<object data="/embed"></object>`,
		`<a href="javascript:alert(1)">bad</a>`,
		`<img srcset="/safe.png 1x, https://evil.example/x 2x">`,
		`<form action="/submit"><input></form>`,
		`<img src="data:image/svg+xml,bad">`,
	} {
		if _, err := normalizeFormat(p, input); err == nil {
			t.Errorf("unsafe document accepted: %s", input)
		}
	}
	policy := func(format, raw string) bool {
		return format == "image-url" && strings.HasPrefix(raw, "https://images.example/")
	}
	p, err = validateAdapterFormatPolicy(sdui.Property{Type: String, Format: "sandbox-html"}, policy, true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := normalizeFormat(p, `<img src="https://images.example/photo.png">`); err != nil {
		t.Fatal(err)
	}
	if _, err := normalizeFormat(p, `<a href="https://images.example/path">link</a>`); err == nil {
		t.Fatal("image permission authorized link URL")
	}
}

func TestColorAndInertDesignFormats(t *testing.T) {
	p := checkedFormatProperty(t, sdui.Property{Type: String, Format: "color"})
	for _, v := range []string{"red", "transparent", "currentColor", "#abc", "#abcf", "#123456", "#12345678", "rgb(12 23 34 / 0.5)", "hsl(180, 50%, 20%)"} {
		if _, err := normalizeFormat(p, v); err != nil {
			t.Errorf("safe color %q: %v", v, err)
		}
	}
	for _, v := range []string{"url(https://evil.example/x)", "var(--external)", "red; background:url(/x)", "expression(alert(1))", "r\\65 d", "@import '/x'", "#12345", "rgba(1, 2, 3, x)"} {
		if _, err := normalizeFormat(p, v); err == nil {
			t.Errorf("unsafe color accepted: %q", v)
		}
	}
}

func TestMarkdownResourcePolicy(t *testing.T) {
	p := checkedFormatProperty(t, sdui.Property{Type: String, Format: "markdown-source"})
	for _, source := range []string{"# Caller heading\n\n**bold**", "[local](/docs#section)", "![preview](/images/one.png)", "<script>alert(1)</script>", "<img src=\"https://evil.example/image\">"} {
		if _, err := normalizeFormat(p, source); err != nil {
			t.Errorf("safe markdown rejected: %q: %v", source, err)
		}
	}
	for _, source := range []string{
		"![tracker](https://evil.example/image.png)",
		"[external](https://evil.example/)",
		"<https://evil.example/>",
		"https://evil.example/",
		"![reference][tracking]\n\n[tracking]: https://evil.example/image.png",
		"![encoded](https&#58;//evil.example/image.png)",
		"![protocol-relative](//evil.example/image.png)",
		"![relative](images/local.png)",
	} {
		if _, err := normalizeFormat(p, source); err == nil {
			t.Errorf("external markdown resource accepted: %q", source)
		}
	}
	p, err := validateAdapterFormatPolicy(sdui.Property{Type: String, Format: "markdown-source"}, func(format, raw string) bool {
		return format == "image-url" && strings.HasPrefix(raw, "https://images.example/")
	}, false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := normalizeFormat(p, "![allowed](https://images.example/a.png)"); err != nil {
		t.Fatal(err)
	}
	if _, err := normalizeFormat(p, "[link](https://images.example/a.png)"); err == nil {
		t.Fatal("image policy authorized markdown link")
	}
}

func TestInlineLottieResourcePolicy(t *testing.T) {
	p := checkedFormatProperty(t, sdui.Property{Type: String, Format: "lottie-json"})
	for _, source := range []string{`{"v":"5.7.4","fr":30,"ip":0,"op":2,"w":8,"h":8,"layers":[]}`, `{"layers":[{"ty":4,"shapes":[]}],"assets":[]}`} {
		if _, err := normalizeFormat(p, source); err != nil {
			t.Errorf("vector data rejected: %v", err)
		}
	}
	for _, source := range []string{
		`{"layers":[],"assets":[{"u":"https://evil.example/","p":"image.png"}]}`,
		`{"layers":[],"fonts":{"list":[{"fPath":"https://evil.example/font.woff"}]}}`,
		`{"layers":[{"ty":4,"x":"fetch('https://evil.example/')"}]}`,
		`{"layers":[{"ty":4,"ks":{"p":"data:image/svg+xml,malicious"}}]}`,
		`{"layers":[{"ty":2}]}`,
		`{"layers":[{"ty":5}]}`,
		`{"layers":[{"ty":0,"refId":"external"}]}`,
		`{"layers":[{"ty":1,"sc":"url(https://evil.example/image)"}]}`,
		`{"layers":[],"audio":{}}`,
		`{"layers":[],"layers":[]}`,
		`{"layers":[],"value":1e9999}`,
		`{"layers":[]} trailing`,
	} {
		if _, err := normalizeFormat(p, source); err == nil {
			t.Errorf("resource/executable Lottie data accepted: %s", source)
		}
	}
}

func TestCSSCustomPropertyName(t *testing.T) {
	p := checkedFormatProperty(t, sdui.Property{Type: String, Format: "css-token"})
	for _, v := range []string{"", "--bg", "--surface", "--foreground-muted", "--color1"} {
		if _, err := normalizeFormat(p, v); err != nil {
			t.Fatal(err)
		}
	}
	for _, v := range []string{"color", "--Color", "--x; background:url(/track)", "--x:url(/track)", "--x\\31", "--"} {
		if _, err := normalizeFormat(p, v); err == nil {
			t.Fatalf("unsafe CSS property accepted: %q", v)
		}
	}
}

func TestInertDataFormatScope(t *testing.T) {
	p := sdui.Property{Type: Object, Format: "inert-data", Properties: map[string]sdui.Property{
		"url": {Type: String, Format: "text"}, "on": {Type: String, Format: "text"}, "template": {Type: Object, Properties: map[string]sdui.Property{"name": {Type: String, Format: "text"}}},
	}}
	if _, err := p.Normalize(map[string]any{}); err == nil {
		t.Fatal("raw property acquired host format")
	}
	q, err := validateAdapterFormatPolicy(p, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	result, err := q.Normalize(map[string]any{"url": "wss://example.test/{{baseURL}}", "on": "u.id = o.user_id", "template": map[string]string{"name": "data, not a renderer"}})
	if err != nil || result.(map[string]any)["url"] != "wss://example.test/{{baseURL}}" {
		t.Fatalf("inert data changed: %#v %v", result, err)
	}
	for _, name := range []string{"Attrs", "onclick", "Style", "HTML", "__proto__", "constructor", "prototype"} {
		bad := p
		bad.Properties = map[string]sdui.Property{name: {Type: String, Format: "text"}}
		if _, err := validateAdapterFormatPolicy(bad, nil, false); err == nil {
			t.Errorf("inert-data bypassed %s", name)
		}
	}
	bad := p
	bad.AdditionalProperties = &sdui.Property{Type: String}
	if _, err := validateAdapterFormatPolicy(bad, nil, false); err == nil {
		t.Fatal("open inert dictionary accepted")
	}
	bad = p
	bad.Properties = map[string]sdui.Property{"record": {Type: Object, AdditionalProperties: &sdui.Property{Type: String}}}
	if _, err := validateAdapterFormatPolicy(bad, nil, false); err == nil {
		t.Fatal("nested open inert dictionary accepted")
	}
}

func TestRendererFormatCapabilitiesDoNotLeakAcrossDefinitions(t *testing.T) {
	r, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	html := Property{Type: String, Target: "HTML", Format: "sandbox-html"}
	if err := r.Register(Definition{Name: "sandbox-first", Chapter: "misc", Component: "WebView", SandboxHTML: true, Properties: map[string]Property{"html": html}}); err != nil {
		t.Fatal(err)
	}
	if err := r.Register(Definition{Name: "sandbox-leaked", Chapter: "misc", Component: "WebView", Properties: map[string]Property{"html": html}}); err == nil {
		t.Fatal("preceding definition leaked sandbox capability")
	}
	data := Property{Type: Object, Target: "Devtools", Format: "inert-data", Properties: map[string]Property{"url": {Type: String, Format: "text"}}}
	if err := r.Register(Definition{Name: "inert-first", Chapter: "devtools", Component: "JsonViewer", Properties: map[string]Property{"data": data}}); err != nil {
		t.Fatal(err)
	}
	if err := r.Register(Definition{Name: "inert-leaked", Chapter: "canvas", Component: "ColorPanel", Properties: map[string]Property{"data": data}}); err == nil {
		t.Fatal("preceding definition leaked inert capability")
	}
}
