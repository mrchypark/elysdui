package gohtmx_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"

	gohtmx "github.com/mrchypark/elysdui/adapters/gohtmx"
	core "github.com/mrchypark/elysdui/sdui"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func contextRequestScreen(props map[string]any) gohtmx.Screen {
	return gohtmx.Screen{Version: gohtmx.Version, ID: "context-screen", Root: gohtmx.Node{ID: "context-owner", Type: "menus/ContextMenu", Props: props}}
}

func contextRequestAttributes(t *testing.T, markup string) map[string]string {
	t.Helper()
	for _, node := range menuAliasNodes(t, markup) {
		if _, ok := node["data-ely-context-mode"]; ok {
			return node
		}
	}
	t.Fatal("ContextMenu did not render its owned request surface")
	return nil
}

func TestCatalogueContextRequestRenders(t *testing.T) {
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	screen := contextRequestScreen(map[string]any{
		"contextMode":    "manual",
		"contextRequest": map[string]any{"number": "18446744073709551615", "x": 120.5, "y": 0},
	})
	plan, err := gohtmx.Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := plan.Render(&out, gohtmx.RenderContext{}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`data-ely-context-mode="manual"`, `data-ely-context-number="18446744073709551615"`, `data-ely-context-x="120.5"`, `data-ely-context-y="0"`} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("owner request missing %s", want)
		}
	}
}

func TestCatalogueContextRequestPreservesTypedWireAndRendererValues(t *testing.T) {
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, number := range []string{"0", "9007199254740992", "9007199254740993", "18446744073709551615"} {
		for _, coordinate := range []struct {
			name         string
			x, y         any
			wantX, wantY float64
		}{
			{"zero", 0, 0, 0, 0},
			{"fractional", 120.5, 80.125, 120.5, 80.125},
			{"negative", -120.5, -80.125, -120.5, -80.125},
			{"off-edge", 1e9, -1e9, 1e9, -1e9},
			{"max-finite", math.MaxFloat64, -math.MaxFloat64, math.MaxFloat64, -math.MaxFloat64},
			{"json-number", json.Number("1.25e2"), json.Number("-2.5e1"), 125, -25},
			{"float32", float32(2.5), float32(-0.5), 2.5, -0.5},
		} {
			for _, source := range []string{"typed", "decoded", "bound"} {
				t.Run(number+"/"+coordinate.name+"/"+source, func(t *testing.T) {
					props := map[string]any{"contextMode": "manual", "contextRequest": map[string]any{"number": number, "x": coordinate.x, "y": coordinate.y}, "label": "Canvas <safe>", "content": "Owner <content>"}
					screen := contextRequestScreen(props)
					ctx := gohtmx.RenderContext{}
					if source == "decoded" {
						raw, err := json.Marshal(screen)
						if err != nil {
							t.Fatal(err)
						}
						screen, err = gohtmx.Decode(bytes.NewReader(raw))
						if err != nil {
							t.Fatal(err)
						}
					}
					if source == "bound" {
						screen.Root.Props = map[string]any{"label": props["label"], "content": props["content"]}
						screen.Root.Bindings = map[string]string{"contextMode": "/mode", "contextRequest": "/request"}
						ctx.Data = map[string]any{"mode": props["contextMode"], "request": props["contextRequest"]}
					}
					plan, err := gohtmx.Compile(screen, registry)
					if err != nil {
						t.Fatal(err)
					}
					nodes, err := plan.Resolve(gohtmx.ResolveContext{Data: ctx.Data})
					if err != nil {
						t.Fatal(err)
					}
					request, ok := nodes[0].Props["contextRequest"].(map[string]any)
					if !ok || len(request) != 3 || request["number"] != number || request["x"] != coordinate.wantX || request["y"] != coordinate.wantY {
						t.Fatalf("semantic request lost typed values or gained renderer keys: %#v", nodes[0].Props)
					}
					var out bytes.Buffer
					if err := plan.Render(&out, ctx); err != nil {
						t.Fatal(err)
					}
					attrs := contextRequestAttributes(t, out.String())
					if attrs["data-ely-context-mode"] != "manual" || attrs["data-ely-context-number"] != number {
						t.Fatalf("mode/string identity lost in renderer mapping: %v", attrs)
					}
					for axis, want := range map[string]float64{"x": coordinate.wantX, "y": coordinate.wantY} {
						value, exists := attrs["data-ely-context-"+axis]
						got, err := strconv.ParseFloat(value, 64)
						if !exists || err != nil || got != want {
							t.Errorf("%s = %q, want %g", axis, value, want)
						}
					}
					if !strings.Contains(out.String(), "Canvas &lt;safe&gt;") || !strings.Contains(out.String(), "Owner &lt;content&gt;") {
						t.Fatal("caller text was not escaped")
					}
				})
			}
		}
	}
}

func TestCatalogueContextRequestOptionalAndNullableStates(t *testing.T) {
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name         string
		props        map[string]any
		bindings     map[string]string
		data         map[string]any
		mode, number string
	}{
		{name: "omitted", mode: "automatic"},
		{name: "explicit-automatic", props: map[string]any{"contextMode": "automatic"}, mode: "automatic"},
		{name: "manual-no-request", props: map[string]any{"contextMode": "manual"}, mode: "manual"},
		{name: "manual-null", props: map[string]any{"contextMode": "manual", "contextRequest": nil}, mode: "manual"},
		{name: "automatic-null", props: map[string]any{"contextRequest": nil}, mode: "automatic"},
		{name: "bound-null", props: map[string]any{"contextMode": "manual"}, bindings: map[string]string{"contextRequest": "/request"}, data: map[string]any{"request": nil}, mode: "manual"},
		{name: "automatic-valid-inert-seed", props: map[string]any{"contextRequest": map[string]any{"number": "0", "x": 0, "y": 0}}, mode: "automatic", number: "0"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			screen := contextRequestScreen(tc.props)
			screen.Root.Bindings = tc.bindings
			plan, err := gohtmx.Compile(screen, registry)
			if err != nil {
				t.Fatal(err)
			}
			nodes, err := plan.Resolve(gohtmx.ResolveContext{Data: tc.data})
			if err != nil {
				t.Fatal(err)
			}
			if tc.number == "" && nodes[0].Props["contextRequest"] != nil {
				t.Fatal("no request was synthesized")
			}
			var out bytes.Buffer
			if err := plan.Render(&out, gohtmx.RenderContext{Data: tc.data}); err != nil {
				t.Fatal(err)
			}
			attrs := contextRequestAttributes(t, out.String())
			if attrs["data-ely-context-mode"] != tc.mode || attrs["data-ely-context-number"] != tc.number {
				t.Fatalf("unexpected request metadata: %v", attrs)
			}
			if tc.number == "" {
				for _, key := range []string{"data-ely-context-number", "data-ely-context-x", "data-ely-context-y"} {
					if _, exists := attrs[key]; exists {
						t.Errorf("no request rendered %s", key)
					}
				}
			}
		})
	}
	// Explicit bindings suppress omission defaults and must resolve to a value.
	screen := contextRequestScreen(nil)
	screen.Root.Bindings = map[string]string{"contextRequest": "/missing"}
	plan, err := gohtmx.Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := plan.Render(&out, gohtmx.RenderContext{Data: map[string]any{}}); err == nil || out.Len() != 0 {
		t.Fatal("missing bound request was treated as explicit null")
	}
}

func TestCatalogueContextRequestRejectsMalformedLiteralsAndBindings(t *testing.T) {
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name  string
		value any
	}{
		{"empty-object", map[string]any{}}, {"array", []any{}}, {"false", false}, {"string", ""}, {"numeric", 1},
		{"missing-number", map[string]any{"x": 0, "y": 0}}, {"missing-x", map[string]any{"number": "1", "y": 0}}, {"missing-y", map[string]any{"number": "1", "x": 0}},
		{"extra-field", map[string]any{"number": "1", "x": 0, "y": 0, "extra": true}},
		{"pascal-case", map[string]any{"Number": "1", "X": 0, "Y": 0}},
		{"mixed-case", map[string]any{"number": "1", "x": 0, "Y": 0}},
	}
	for i, value := range []any{"", "00", "01", "+1", "-1", " 1", "1 ", "1\n", "1\r", "1\r\n", "1\u2028", "1\u2029", "18446744073709551615\n", "1.0", "1e0", "١", "１", "18446744073709551616", "99999999999999999999", "100000000000000000000", strings.Repeat("1", gohtmx.MaxStringBytes+1), 0, uint64(math.MaxUint64), 1.0, json.Number("1"), nil, true, []any{"1"}, map[string]any{"value": "1"}} {
		cases = append(cases, struct {
			name  string
			value any
		}{fmt.Sprintf("invalid-number-%d", i), map[string]any{"number": value, "x": 0, "y": 0}})
	}
	for _, axis := range []string{"x", "y"} {
		for i, value := range []any{"0", true, nil, []any{0}, map[string]any{"value": 0}, math.NaN(), math.Inf(1), math.Inf(-1), json.Number("NaN"), json.Number("1e999")} {
			request := map[string]any{"number": "1", "x": 0, "y": 0}
			request[axis] = value
			cases = append(cases, struct {
				name  string
				value any
			}{fmt.Sprintf("invalid-%s-%d", axis, i), request})
		}
	}
	for _, tc := range cases {
		for _, mode := range []string{"manual", "automatic"} {
			t.Run(mode+"/"+tc.name, func(t *testing.T) {
				assertContextRequestInvalid(t, registry, map[string]any{"contextMode": mode, "contextRequest": tc.value}, "contextRequest")
			})
		}
	}
	for i, value := range []any{"", "Manual", "disabled", nil, true, 0, []any{}, map[string]any{}} {
		t.Run(fmt.Sprintf("invalid-mode-%d", i), func(t *testing.T) {
			assertContextRequestInvalid(t, registry, map[string]any{"contextMode": value}, "contextMode")
		})
	}
	for _, props := range []map[string]any{{"ContextMode": "manual"}, {"ContextRequest": nil}} {
		if _, err := gohtmx.Compile(contextRequestScreen(props), registry); err == nil {
			t.Fatal("PascalCase root property accepted in SDUI")
		}
	}
}

func assertContextRequestInvalid(t *testing.T, registry *gohtmx.Registry, props map[string]any, boundKey string) {
	t.Helper()
	screen := contextRequestScreen(props)
	if _, err := gohtmx.Compile(screen, registry); err == nil {
		t.Fatal("malformed literal accepted")
	}
	if raw, err := json.Marshal(screen); err == nil {
		decoded, err := gohtmx.Decode(bytes.NewReader(raw))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := gohtmx.Compile(decoded, registry); err == nil {
			t.Fatal("malformed JSON value accepted")
		}
	}
	literal := map[string]any{}
	for key, value := range props {
		if key != boundKey {
			literal[key] = value
		}
	}
	screen.Root.Props = literal
	screen.Root.Bindings = map[string]string{boundKey: "/value"}
	plan, err := gohtmx.Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	data := map[string]any{"value": props[boundKey]}
	if _, err := plan.Resolve(gohtmx.ResolveContext{Data: data}); err == nil {
		t.Fatal("malformed bound value resolved")
	}
	var out bytes.Buffer
	if err := plan.Render(&out, gohtmx.RenderContext{Data: data}); err == nil || out.Len() != 0 {
		t.Fatalf("malformed binding accepted or output was partially written: %v", err)
	}
}

func TestCatalogueContextRequestSchemaAndExactScope(t *testing.T) {
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, d := range registry.Definitions() {
		if d.Name != "menus/ContextMenu" {
			for _, key := range []string{"contextMode", "contextRequest"} {
				if _, ok := d.Properties[key]; ok {
					t.Errorf("%s unexpectedly exposes %s", d.Name, key)
				}
			}
			continue
		}
		found = true
		mode := d.Properties["contextMode"]
		if mode.Type != gohtmx.String || mode.Target != "ContextMode" || mode.Required || mode.Nullable || !reflect.DeepEqual(mode.Enum, []string{"automatic", "manual"}) {
			t.Fatalf("invalid mode schema: %+v", mode)
		}
		request := d.Properties["contextRequest"]
		if request.Type != gohtmx.Object || request.Target != "ContextRequest" || request.Required || !request.Nullable || request.AdditionalProperties != nil || len(request.Properties) != 3 {
			t.Fatalf("invalid nullable closed request: %+v", request)
		}
		for key, target := range map[string]string{"number": "Number", "x": "X", "y": "Y"} {
			p := request.Properties[key]
			if !p.Required || p.Nullable || p.Target != target || len(p.OneOf) != 0 {
				t.Errorf("invalid required request.%s: %+v", key, p)
			}
			if key == "number" {
				if p.Type != gohtmx.String || p.Format != "context-request-number" || p.MaxLength != 20 {
					t.Errorf("invalid identity schema: %+v", p)
				}
			} else if p.Type != gohtmx.Number || p.Min != nil || p.Max != nil || p.Format != "" {
				t.Errorf("coordinate schema was narrowed/coerced: %+v", p)
			}
		}
		if !reflect.DeepEqual(d.Events, []string{"click", "change", "ely:action", "ely:change"}) {
			t.Fatalf("owner input incorrectly changed outgoing events: %v", d.Events)
		}
	}
	if !found {
		t.Fatal("ContextMenu definition missing")
	}
	schema, err := registry.JSONSchema()
	if err != nil {
		t.Fatal(err)
	}
	defs := schema["$defs"].(map[string]any)
	var props map[string]any
	for _, raw := range defs {
		candidate, ok := raw.(map[string]any)
		if ok && candidate["title"] == "menus/ContextMenu" {
			props = candidate["properties"].(map[string]any)["props"].(map[string]any)
		}
	}
	if props == nil {
		t.Fatal("JSON Schema ContextMenu missing")
	}
	fields := props["properties"].(map[string]any)
	request := fields["contextRequest"].(map[string]any)
	if !reflect.DeepEqual(request["type"], []string{"object", "null"}) || request["additionalProperties"] != false || !reflect.DeepEqual(request["required"], []string{"number", "x", "y"}) {
		t.Fatalf("JSON Schema lost nullable/closed/required constraints: %#v", request)
	}
	if required, ok := props["required"].([]string); ok {
		for _, key := range required {
			if key == "contextMode" || key == "contextRequest" {
				t.Errorf("optional prop %s marked required", key)
			}
		}
	}
	children := request["properties"].(map[string]any)
	number := children["number"].(map[string]any)
	if number["type"] != "string" || number["maxLength"] != 20 || number["x-ely-maxBytes"] != 20 {
		t.Fatalf("JSON Schema identity type/limits lost: %v", number)
	}
	pattern, err := regexp.Compile(number["pattern"].(string))
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{"0", "9007199254740993", "18446744073709551615"} {
		if !pattern.MatchString(value) {
			t.Errorf("editor pattern rejects valid %q", value)
		}
	}
	for _, value := range []string{"", "00", "+1", "1.5", "1e2", "١", "100000000000000000000"} {
		if pattern.MatchString(value) {
			t.Errorf("editor pattern accepts noncanonical %q", value)
		}
	}
	for _, axis := range []string{"x", "y"} {
		field := children[axis].(map[string]any)
		if field["type"] != "number" || field["minimum"] != nil || field["maximum"] != nil {
			t.Errorf("coordinate JSON Schema narrowed: %v", field)
		}
	}
	limits := schema["x-ely-limits"].(map[string]any)
	if limits["schemaBytes"] != core.MaxSchemaBytes || limits["normalizedValues"] != core.MaxValues || limits["normalizedBytes"] != core.MaxNormalizationBytes {
		t.Fatalf("existing payload limits changed: %v", limits)
	}
}

func TestContextRequestNumberFormatRemainsRendererScoped(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	properties := map[string]gohtmx.Property{"label": {Type: gohtmx.String, Target: "Label", Format: "context-request-number"}}
	for _, component := range []string{"ContextMenu", "PieMenu", "SearchableMenu", "DropdownMenu"} {
		err := gohtmx.NewRegistry(tpl).Register(gohtmx.Definition{Name: "scoped-format", Chapter: "menus", Component: component, Properties: properties})
		if (component == "ContextMenu") != (err == nil) {
			t.Errorf("%s format scope: %v", component, err)
		}
	}
	if err := core.NewRegistry().Register(core.Definition{Name: "semantic-only", Properties: map[string]core.Property{"number": {Type: core.String, Format: "context-request-number"}}}); err == nil {
		t.Fatal("web request format leaked into renderer-neutral core")
	}
}
