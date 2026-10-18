package ui

import (
	"bytes"
	"testing"
)

func TestJoinSupportsJSONArraysWithoutCoercion(t *testing.T) {
	for _, value := range []any{[]string{"first", "second"}, []any{"first", "second"}} {
		got, err := joinStrings(value, " | ")
		if err != nil || got != "first | second" {
			t.Fatalf("join(%T)=%q,%v", value, got, err)
		}
	}
	for _, value := range []any{[]any{"first", 1}, []any{nil}, "first", map[string]any{"first": "second"}} {
		if _, err := joinStrings(value, ","); err == nil {
			t.Errorf("accepted %T", value)
		}
	}
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := RenderComponent(tpl, &out, Component{Chapter: "typography", Name: "Typewriter", ID: "typewriter-json", Props: map[string]any{"TypewriterLines": []any{"Caller first", "Caller second"}, "Label": "Caller lines"}}); err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(out.Bytes(), []byte("Caller first")) || !bytes.Contains(out.Bytes(), []byte("Caller second")) {
		t.Fatal("JSON array data was lost")
	}
}
