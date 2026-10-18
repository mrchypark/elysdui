package gohtmx

import (
	"bytes"
	"testing"
)

func FuzzDecodeCompileRender(f *testing.F) {
	for _, seed := range []string{
		`{"version":"1","id":"screen","root":{"id":"message","type":"text","props":{"text":"Hello <script>"}}}`,
		`{"version":"1","id":"screen","root":{"id":"region","type":"region","children":[]}}`,
		`{"version":"1","id":"screen","templates":{"label":{"params":{"text":{"type":"string","required":true}},"root":{"id":"label","type":"text","bindings":{"text":"/@params/text"}}}},"root":{"id":"root","use":"label","paramBindings":{"text":"/message"}}}`,
		`{"version":"1","id":"screen","root":{"id":"root","type":"region","children":[{"id":"row","type":"text","repeat":{"items":"/items","as":"item","key":"/id"},"bindings":{"text":"/@vars/item/name"},"when":{"op":"eq","path":"/@vars/item/show","value":true}}]}}`,
		`{"version":"1","id":"screen","root":{"id":"root","type":"text","bindings":{"text":"/a~1b/~0key"},"when":{"op":"any","conditions":[{"op":"exists","path":"/a~1b"},{"op":"not","conditions":[{"op":"exists","path":"/missing"}]}]}}}`,
		`{"version":"1","id":"screen","root":{"id":"root","type":"fuzz-slot","slots":{"content":[{"id":"text","type":"text","props":{"text":"<b>escaped</b>"}}]}}}`,
		`{"version":"1","id":"screen","templates":{"loop":{"root":{"id":"loop","use":"loop"}}},"root":{"id":"root","use":"loop"}}`,
		`{"version":"1","Version":"2"}`,
		`{"root":{"props":{"value":1e10000}}}`,
		`null`, `[]`, `{"root":`,
	} {
		f.Add([]byte(seed))
	}
	registry, err := DefaultRegistry()
	if err != nil {
		f.Fatal(err)
	}
	if _, err := registry.templates.New("fuzz-slot-template").Parse(`<article>{{.Content}}</article>`); err != nil {
		f.Fatal(err)
	}
	if err := registry.Register(Definition{Name: "fuzz-slot", Template: "fuzz-slot-template", Slots: map[string]SlotDefinition{"content": {Target: "Content", MaxNodes: 20}}}); err != nil {
		f.Fatal(err)
	}
	f.Fuzz(func(t *testing.T, input []byte) {
		screen, err := Decode(bytes.NewReader(input))
		if err != nil {
			return
		}
		plan, err := Compile(screen, registry)
		if err != nil {
			return
		}
		var output bytes.Buffer
		if err := plan.Render(&output, RenderContext{Data: map[string]any{"message": "Hello", "a/b": map[string]any{"~key": "Escaped"}, "items": []any{map[string]any{"id": "a", "name": "Ada", "show": true}, map[string]any{"id": "b", "name": "Grace", "show": false}}}, Endpoint: "/action", CSRF: "test"}); err != nil && output.Len() != 0 {
			t.Fatal("failed rendering wrote partial output")
		}
		if output.Len() > MaxRenderBytes {
			t.Fatal("render exceeded budget")
		}
	})
}
