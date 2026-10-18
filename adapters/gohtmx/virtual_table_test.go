package gohtmx_test

import (
	"bytes"
	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
	"strings"
	"testing"
)

func TestVirtualTableLocalSchema(t *testing.T) {
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	props := map[string]any{"tableSource": true, "virtualTotal": 100000, "label": "Caller rows", "rowHeader": "Record", "disabled": false, "empty": "Nothing supplied", "error": "", "columns": []any{map[string]any{"label": "Name"}}, "rows": []any{map[string]any{"key": "caller-key", "label": "First", "cells": []any{"<unsafe>"}}}}
	screen := sdui.Screen{Version: sdui.Version, ID: "screen", Root: sdui.Node{ID: "virtual-json", Type: "tables/VirtualTable", Props: props}}
	plan, err := sdui.Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := plan.Render(&output, sdui.RenderContext{Endpoint: "/sdui", CSRF: "test"}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`data-ely-key="caller-key"`, `scope="row"><div>First</div>`, `&lt;unsafe&gt;`, `1 supplied rows (declared total: 100000)`} {
		if !strings.Contains(output.String(), want) {
			t.Errorf("missing %s", want)
		}
	}
	props["sourceURL"] = "/unimplemented"
	if _, err := sdui.Compile(screen, registry); err == nil {
		t.Fatal("unsupported remote source property must be rejected")
	}
}
