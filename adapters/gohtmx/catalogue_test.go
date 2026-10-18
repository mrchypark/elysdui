package gohtmx_test

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
	gallery "github.com/mrchypark/elysdui/internal/gallery"
	"github.com/mrchypark/elysdui/internal/sduicatalogue"
	"io"
	"os"
	"sort"
	"strings"
	"testing"
)

func TestCatalogueDefinitionsRegister(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	contracts, err := sdui.CatalogueContracts()
	if err != nil {
		t.Fatal(err)
	}
	r := sdui.NewRegistry(tpl, sdui.WithURLPolicy(func(string, string) bool { return true }))
	for _, c := range contracts {
		if err := r.Register(c.Definition); err != nil {
			t.Errorf("%s: %v", c.Name, err)
		}
	}
}
func TestCatalogueGeneratedFilesCurrent(t *testing.T) {
	manifest, fixtures, err := sduicatalogue.Encode()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct {
		name string
		data []byte
	}{{"catalogue_manifest.json.gz", manifest}, {"testdata/catalogue_fixtures.json.gz", fixtures}} {
		current, err := os.ReadFile(item.name)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(current, item.data) {
			t.Errorf("%s is stale; run go generate ./sdui", item.name)
		}
	}
}
func catalogueFixtures(t *testing.T) []sduicatalogue.TestFixture {
	t.Helper()
	raw, err := os.ReadFile("testdata/catalogue_fixtures.json.gz")
	if err != nil {
		t.Fatal(err)
	}
	compressed, err := gzip.NewReader(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	raw, err = io.ReadAll(io.LimitReader(compressed, 32<<20))
	compressed.Close()
	if err != nil {
		t.Fatal(err)
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	var fixtures []sduicatalogue.TestFixture
	if err := d.Decode(&fixtures); err != nil {
		t.Fatal(err)
	}
	return fixtures
}
func TestCatalogueEveryQualifiedNameRendersCallerData(t *testing.T) {
	r, err := sdui.CatalogueRegistry(sdui.WithURLPolicy(func(string, string) bool { return true }))
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for i, f := range catalogueFixtures(t) {
		seen[f.Name] = true
		t.Run(fmt.Sprintf("%s/%d", f.Name, i), func(t *testing.T) {
			screen := sdui.Screen{Version: sdui.Version, ID: "catalogue-screen", Root: sdui.Node{ID: "caller-instance", Type: f.Name, Props: f.Props}}
			raw, err := json.Marshal(screen)
			if err != nil {
				t.Fatal(err)
			}
			decoded, err := sdui.Decode(bytes.NewReader(raw))
			if err != nil {
				t.Fatal(err)
			}
			plan, err := sdui.Compile(decoded, r)
			if err != nil {
				t.Fatal(err)
			}
			var output bytes.Buffer
			if err := plan.Render(&output, sdui.RenderContext{Endpoint: "/sdui", CSRF: "catalogue-test"}); err != nil {
				t.Fatal(err)
			}
			text := output.String()
			if strings.Contains(text, "ZgotmplZ") {
				t.Fatal("unsafe template sentinel")
			}
			if len(strings.TrimSpace(text)) == 0 {
				t.Fatal("empty output")
			}
			if !strings.HasPrefix(f.Name, "basic/") && !strings.Contains(text, `data-ely-component="`+f.Name+`"`) {
				t.Fatalf("wrong component identity %s", f.Name)
			}
		})
	}
	info, err := sdui.CatalogueInfo()
	if err != nil {
		t.Fatal(err)
	}
	if info.Primaries != 624 || info.QualifiedNames != 1313 || info.Chapters != 44 || info.BasicTemplates != 48 || info.SourceFixtures != 639 || info.PreviewFixtures != 742 {
		t.Fatalf("inventory drift: %+v", info)
	}
	if len(seen) != 1361 {
		t.Fatalf("fixture names=%d want1361", len(seen))
	}
}

func renderCatalogue(name string, props map[string]any, r *sdui.Registry) (string, error) {
	p, err := sdui.Compile(sdui.Screen{Version: sdui.Version, ID: "catalogue-probe", Root: sdui.Node{ID: "instance", Type: name, Props: props}}, r)
	if err != nil {
		return "", err
	}
	var b bytes.Buffer
	err = p.Render(&b, sdui.RenderContext{Endpoint: "/sdui", CSRF: "probe"})
	return b.String(), err
}
func cloneProps(props map[string]any) map[string]any {
	b, _ := json.Marshal(props)
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	var out map[string]any
	_ = d.Decode(&out)
	return out
}

type dataProbe struct {
	path  []any
	value any
}

func collectProbes(p sdui.Property, v any, path []any, out *[]dataProbe) {
	if len(*out) > 90 {
		return
	}
	if len(p.OneOf) > 0 {
		for _, alt := range p.OneOf {
			collectProbes(alt, v, path, out)
		}
		return
	}
	switch p.Type {
	case sdui.String:
		if p.Format == "" || p.Format == "text" {
			if _, ok := v.(string); ok {
				*out = append(*out, dataProbe{path, "SDUI_CALLER_DATA_PROBE"})
			}
		}
	case sdui.Boolean:
		if value, ok := v.(bool); ok {
			*out = append(*out, dataProbe{path, !value})
		}
	case sdui.Integer:
		if value, ok := v.(json.Number); ok {
			if n, err := value.Int64(); err == nil {
				*out = append(*out, dataProbe{path, json.Number(fmt.Sprint(n + 1))})
			}
		}
	case sdui.Number:
		if value, ok := v.(json.Number); ok {
			if n, err := value.Float64(); err == nil {
				*out = append(*out, dataProbe{path, json.Number(fmt.Sprint(n + .25))})
			}
		}
	case sdui.Object:
		if values, ok := v.(map[string]any); ok {
			keys := make([]string, 0, len(values))
			for key := range values {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			for _, key := range keys {
				child, ok := p.Properties[key]
				if !ok && p.AdditionalProperties != nil {
					child = *p.AdditionalProperties
					ok = true
				}
				if ok {
					collectProbes(child, values[key], append(append([]any{}, path...), key), out)
				}
			}
		}
	case sdui.Array:
		if values, ok := v.([]any); ok && p.Items != nil {
			for i := 0; i < min(len(values), 3); i++ {
				collectProbes(*p.Items, values[i], append(append([]any{}, path...), i), out)
			}
		}
	}
}
func mutateProbe(props map[string]any, probe dataProbe) map[string]any {
	out := cloneProps(props)
	var at any = out
	for _, part := range probe.path[:len(probe.path)-1] {
		switch key := part.(type) {
		case string:
			at = at.(map[string]any)[key]
		case int:
			at = at.([]any)[key]
		}
	}
	switch key := probe.path[len(probe.path)-1].(type) {
	case string:
		at.(map[string]any)[key] = probe.value
	case int:
		at.([]any)[key] = probe.value
	}
	return out
}

// A correct identity wrapper is insufficient: every registered name must also
// demonstrate that changing caller data changes the actual component output.
func TestCatalogueEveryNameConsumesCallerData(t *testing.T) {
	r, err := sdui.CatalogueRegistry(sdui.WithURLPolicy(func(string, string) bool { return true }))
	if err != nil {
		t.Fatal(err)
	}
	contracts, err := sdui.CatalogueContracts()
	if err != nil {
		t.Fatal(err)
	}
	byName := map[string]sdui.CatalogueContract{}
	for _, c := range contracts {
		byName[c.Name] = c
	}
	seen := map[string]bool{}
	for _, f := range catalogueFixtures(t) {
		if seen[f.Name] {
			continue
		}
		seen[f.Name] = true
		t.Run(f.Name, func(t *testing.T) {
			baseline, err := renderCatalogue(f.Name, f.Props, r)
			if err != nil {
				t.Fatal(err)
			}
			probes := []dataProbe{}
			collectProbes(sdui.Property{Type: sdui.Object, Properties: byName[f.Name].Properties}, f.Props, nil, &probes)
			for _, probe := range probes {
				if len(probe.path) == 1 && probe.path[0] == "disabled" && !strings.HasPrefix(f.Name, "basic/") {
					continue
				}
				changed, err := renderCatalogue(f.Name, mutateProbe(f.Props, probe), r)
				if err == nil && changed != baseline {
					return
				}
			}
			// Some raw fixtures intentionally use fallback content. Probe reviewed but
			// absent optional text props before declaring the component unresponsive.
			for key, p := range byName[f.Name].Properties {
				if _, exists := f.Props[key]; !exists && p.Type == sdui.String && p.Format == "text" {
					props := cloneProps(f.Props)
					props[key] = "SDUI_CALLER_DATA_PROBE"
					changed, err := renderCatalogue(f.Name, props, r)
					if err == nil && changed != baseline {
						return
					}
				}
			}
			t.Fatal("no caller-data change reached the component; identity-only registration is not coverage")
		})
	}
}

func TestCatalogueFixtureSourcesAndNoDefaults(t *testing.T) {
	sources := map[string]bool{}
	for _, f := range catalogueFixtures(t) {
		sources[f.Source] = true
		for _, source := range f.Sources {
			sources[source] = true
		}
	}
	for _, f := range gallery.SDUIFixtures() {
		if !sources[f.Source] {
			t.Errorf("source missing from generated evidence: %s", f.Source)
		}
	}
	contracts, err := sdui.CatalogueContracts()
	if err != nil {
		t.Fatal(err)
	}
	var check func(sdui.Property)
	check = func(p sdui.Property) {
		if p.Default != nil {
			t.Error("production catalogue must not contain fixture defaults")
		}
		for _, child := range p.Properties {
			check(child)
		}
		if p.Items != nil {
			check(*p.Items)
		}
		if p.AdditionalProperties != nil {
			check(*p.AdditionalProperties)
		}
		for _, child := range p.OneOf {
			check(child)
		}
	}
	for _, c := range contracts {
		for _, p := range c.Properties {
			check(p)
		}
	}
	r, err := sdui.DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Definitions()) != 10 {
		t.Fatal("default core surface changed")
	}
	if err := sdui.RegisterCatalogue(r); err != nil {
		t.Fatal(err)
	}
	before := len(r.Definitions())
	if err := sdui.RegisterCatalogue(r); err == nil || len(r.Definitions()) != before {
		t.Fatal("duplicate catalogue registration was not atomic")
	}
	contracts[0].Properties = map[string]sdui.Property{}
	again, _ := sdui.CatalogueContracts()
	if len(again[0].Properties) == 0 {
		t.Fatal("contract copies share mutable data")
	}
}

func TestCatalogueSemanticBoundaries(t *testing.T) {
	r, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	rejected := []struct {
		name  string
		props map[string]any
	}{
		{"typography/ExternalLink", map[string]any{"href": "javascript:alert(1)", "label": "unsafe"}},
		{"typography/ExternalLink", map[string]any{"href": "https://unapproved.example/", "label": "external"}},
		{"basic/breadcrumb", map[string]any{"items": []any{map[string]any{"label": "bad", "href": "//unapproved.example/"}}}},
		{"basic/input", map[string]any{"name": "_sdui.action"}},
		{"basic/button", map[string]any{"formAction": "https://unapproved.example/"}},
		{"misc/WebView", map[string]any{"html": "<script>alert(1)</script>"}},
		{"misc/WebView", map[string]any{"html": "<img src=\"https://unapproved.example/image.png\">"}},
		{"documents/MarkdownRenderer", map[string]any{"value": "![image](https://unapproved.example/image.png)"}},
		{"motion/Lottie Player", map[string]any{"animation": `{"layers":[],"assets":[{"p":"https://unapproved.example/image.png"}]}`}},
		{"motion/Lottie Player", map[string]any{"animationURL": "/unvalidated-animation.json"}},
		{"canvas/ColorPanel", map[string]any{"canvasScene": map[string]any{"style": map[string]any{"color": "url(https://unapproved.example/image.png)"}}}},
		{"basic/table", map[string]any{"rows": []any{map[string]any{"cells": []any{"valid"}, "unknown": "not in contract"}}}},
	}
	for _, c := range rejected {
		if _, err := renderCatalogue(c.name, c.props, r); err == nil {
			t.Errorf("accepted unsafe %s: %+v", c.name, c.props)
		}
	}
	output, err := renderCatalogue("misc/WebView", map[string]any{"html": "<p>Safe caller preview</p>"}, r)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output, `sandbox=""`) || !strings.Contains(output, "Safe caller preview") {
		t.Fatal("safe sandbox lost fixed isolation")
	}
	trusted, err := sdui.CatalogueRegistry(sdui.WithURLPolicy(func(_ string, raw string) bool { return strings.HasPrefix(raw, "https://approved.example/") }))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := renderCatalogue("typography/ExternalLink", map[string]any{"href": "https://approved.example/guide", "label": "Approved"}, trusted); err != nil {
		t.Fatal(err)
	}
	if _, err := renderCatalogue("typography/ExternalLink", map[string]any{"href": "javascript:alert(1)", "label": "Unsafe"}, trusted); err == nil {
		t.Fatal("host policy bypassed dangerous URL scheme")
	}
	contracts, _ := sdui.CatalogueContracts()
	byName := map[string]sdui.CatalogueContract{}
	for _, c := range contracts {
		byName[c.Name] = c
	}
	if byName["forms/TextArea"].Properties["rows"].Type != sdui.Integer || byName["tables/DataTable"].Properties["rows"].Type != sdui.Array {
		t.Fatal("component-specific Rows shapes collapsed")
	}
	if byName["forms/ExpressionInput"].Properties["variables"].AdditionalProperties == nil {
		t.Fatal("typed business-key dictionary missing")
	}
}

func TestCatalogueExpansionStopsAtRenderBudget(t *testing.T) {
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	items := make([]any, 1000)
	for i := range items {
		items[i] = map[string]any{"key": "k", "value": "v"}
	}
	screen := sdui.Screen{Version: sdui.Version, ID: "bounded-screen", Root: sdui.Node{ID: "many-controls", Type: "forms/KeyValueInput", Props: map[string]any{"items": items, "placeholder": strings.Repeat("x", sdui.MaxStringBytes)}}}
	plan, err := sdui.Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := plan.Render(&output, sdui.RenderContext{}); err == nil || !strings.Contains(err.Error(), "output limit") {
		t.Fatalf("expected early intermediate limit: %v", err)
	}
	if output.Len() != 0 {
		t.Fatal("failed expanded render emitted partial HTML")
	}
}
