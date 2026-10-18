package gohtmx

import (
	"encoding/json"
	"errors"
	"io"
	"strconv"
	"strings"
	"testing"
)

func schemaRegistry(t *testing.T) *Registry {
	t.Helper()
	r, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	return r
}
func schemaScreen() Screen {
	return Screen{Version: Version, ID: "screen", Root: Node{ID: "root", Type: "stack", Children: []Node{{ID: "result", Type: "region", Children: []Node{{ID: "message", Type: "text", Props: map[string]any{"text": "Hello"}}}}}}}
}

func TestDecodeStrict(t *testing.T) {
	valid := `{"version":"1","id":"screen","root":{"id":"root","type":"text","props":{"text":"hello","number":2}}}`
	screen, err := Decode(strings.NewReader(valid))
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := screen.Root.Props["number"].(json.Number); !ok {
		t.Fatalf("number lost type: %T", screen.Root.Props["number"])
	}
	for name, input := range map[string]string{
		"unknown screen":  `{"version":"1","id":"screen","script":"x","root":{}}`,
		"unknown node":    `{"version":"1","id":"screen","root":{"id":"x","type":"text","href":"/"}}`,
		"unknown event":   `{"root":{"event":{"on":"click","action":"save","target":"result","url":"/"}}}`,
		"trailing object": valid + `{}`, "trailing token": valid + ` false`, "truncated": valid[:len(valid)-1],
		"duplicate": `{"version":"1","version":"2"}`, "case duplicate": `{"version":"1","Version":"2"}`,
		"nested duplicate": `{"root":{"props":{"text":"one","text":"two"}}}`,
		"null":             `null`, "array": `[]`, "oversized": strings.Repeat(" ", MaxSchemaBytes+1),
		"deep JSON": `{"x":` + strings.Repeat("[", MaxDepth*3+1) + `0` + strings.Repeat("]", MaxDepth*3+1) + `}`,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Decode(strings.NewReader(input)); err == nil {
				t.Fatal("accepted invalid JSON")
			}
		})
	}
	if _, err := Decode(errorReader{}); !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("read error = %v", err)
	}
}

type errorReader struct{}

func (errorReader) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }

func TestCompileRejectsUnsafeSchemas(t *testing.T) {
	r := schemaRegistry(t)
	cases := map[string]func(*Screen){
		"version": func(s *Screen) { s.Version = "2" }, "screen ID": func(s *Screen) { s.ID = "<script>" },
		"loader URL": func(s *Screen) { s.Loader = "https://example.com" }, "duplicate screen": func(s *Screen) { s.Root.ID = s.ID },
		"duplicate node": func(s *Screen) { s.Root.Children[0].ID = s.Root.ID }, "generated namespace": func(s *Screen) { s.Root.ID = "sdui-internal-x" },
		"unknown component": func(s *Screen) { s.Root.Type = "iframe" }, "leaf children": func(s *Screen) { s.Root.Type = "text"; s.Root.Props = map[string]any{"text": "hello"} },
		"nested forms":     func(s *Screen) { s.Root.Type = "form"; s.Root.Children[0].Type = "form" },
		"required":         func(s *Screen) { s.Root.Children[0].Children[0].Props = nil },
		"wrong scalar":     func(s *Screen) { s.Root.Children[0].Children[0].Props["text"] = true },
		"typed HTML":       func(s *Screen) { s.Root.Children[0].Children[0].Props["text"] = struct{ Text string }{"hello"} },
		"large string":     func(s *Screen) { s.Root.Children[0].Children[0].Props["text"] = strings.Repeat("x", MaxStringBytes+1) },
		"bad token":        func(s *Screen) { s.Root.Props = map[string]any{"gap": "url(evil)"} },
		"unknown prop":     func(s *Screen) { s.Root.Props = map[string]any{"unknown": true} },
		"class":            func(s *Screen) { s.Root.Props = map[string]any{"class": "absolute"} },
		"style":            func(s *Screen) { s.Root.Props = map[string]any{"style": "display:none"} },
		"attributes":       func(s *Screen) { s.Root.Props = map[string]any{"Attrs": map[string]any{"onclick": "alert(1)"}} },
		"URL":              func(s *Screen) { s.Root.Props = map[string]any{"url": "javascript:alert(1)"} },
		"binding conflict": func(s *Screen) { s.Root.Children[0].Children[0].Bindings = map[string]string{"text": "message"} },
		"binding expression": func(s *Screen) {
			s.Root.Children[0].Children[0].Props = nil
			s.Root.Children[0].Children[0].Bindings = map[string]string{"text": "messages[0]"}
		},
		"binding method":  func(s *Screen) { s.Root.Bindings = map[string]string{"gap": "config.Gap()"} },
		"binding proto":   func(s *Screen) { s.Root.Bindings = map[string]string{"gap": "config.constructor.gap"} },
		"binding unknown": func(s *Screen) { s.Root.Bindings = map[string]string{"href": "location"} },
		"event type":      func(s *Screen) { s.Root.Event = &Event{On: "mouseover", Action: "save", Target: "result"} },
		"event leaf target": func(s *Screen) {
			s.Root.Type = "form"
			s.Root.Event = &Event{On: "submit", Action: "save", Target: "message"}
		},
		"event outside target": func(s *Screen) {
			s.Root.Type = "form"
			s.Root.Event = &Event{On: "submit", Action: "save", Target: "outside"}
		},
		"event URL action": func(s *Screen) {
			s.Root.Type = "form"
			s.Root.Event = &Event{On: "submit", Action: "/save", Target: "result"}
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			s := schemaScreen()
			mutate(&s)
			if _, err := Compile(s, r); err == nil {
				t.Fatal("accepted unsafe schema")
			}
		})
	}
	if _, err := Compile(schemaScreen(), nil); err == nil {
		t.Fatal("nil registry accepted")
	}
}

func TestCompileLimitsAndActions(t *testing.T) {
	r := schemaRegistry(t)
	s := schemaScreen()
	s.Root.Children = nil
	node := &s.Root
	for i := 1; i < MaxDepth; i++ {
		node.Children = []Node{{ID: strings.Repeat("n", i), Type: "stack"}}
		node = &node.Children[0]
	}
	if _, err := Compile(s, r); err != nil {
		t.Fatalf("max valid depth: %v", err)
	}
	node.Children = []Node{{ID: "too-deep", Type: "stack"}}
	if _, err := Compile(s, r); err == nil {
		t.Fatal("depth limit ignored")
	}
	s = schemaScreen()
	s.Root.Children = make([]Node, MaxNodes)
	for i := range s.Root.Children {
		s.Root.Children[i] = Node{ID: fmtNodeID(i), Type: "stack"}
	}
	if _, err := Compile(s, r); err == nil {
		t.Fatal("node limit ignored")
	}
	s = schemaScreen()
	s.Loader = "profile.load"
	s.Root.Type = "form"
	s.Root.Event = &Event{On: "submit", Action: "profile.save", Target: "result"}
	plan, err := Compile(s, r)
	if err != nil {
		t.Fatal(err)
	}
	if plan.ScreenID() != "screen" || plan.Loader() != "profile.load" || !plan.HasRegion("result") || plan.HasRegion("message") {
		t.Fatal("plan metadata incorrect")
	}
	if err := plan.ValidateActions(map[string][]string{"profile.save": {"result"}}); err != nil {
		t.Fatal(err)
	}
	if err := plan.ValidateActions(nil); err == nil {
		t.Fatal("unknown action allowed")
	}
	if err := plan.ValidateActions(map[string][]string{"profile.save": {"different"}}); err == nil {
		t.Fatal("forbidden target allowed")
	}
	events := plan.Events()
	events[0].Action = "mutated"
	if plan.Events()[0].Action != "profile.save" {
		t.Fatal("event snapshot mutable")
	}
}

func fmtNodeID(i int) string { return "node-" + strconv.Itoa(i) }
