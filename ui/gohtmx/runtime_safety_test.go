package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestRuntimeSafetyIssue58Templates(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}

	// 1. Nil/empty Columns must not panic on basic table/data-table or grouped/spreadsheet/comparison/row-expansion
	for _, name := range []string{"table", "data-table"} {
		var out bytes.Buffer
		if err := tpl.ExecuteTemplate(&out, name, map[string]any{"ID": "empty-" + name}); err != nil {
			t.Fatalf("%s with empty props failed: %v", name, err)
		}
		if strings.Contains(out.String(), `colspan="0"`) {
			t.Fatalf("%s emitted colspan=0 on empty Columns: %s", name, out.String())
		}
	}
	var grouped bytes.Buffer
	if err := tpl.ExecuteTemplate(&grouped, "data-table", map[string]any{
		"ID": "grouped-empty-cols", "Compact": true, "Grouped": true,
		"Groups": []map[string]any{{"Value": "g1", "Label": "Group 1", "Rows": []map[string]any{{"Cells": []string{"a"}}}}},
	}); err != nil {
		t.Fatalf("grouped data-table with empty Columns failed: %v", err)
	}

	emptyComponents := []Component{
		{Chapter: "tables", Name: "DataTable", ID: "empty-dt"},
		{Chapter: "tables", Name: "DataTable", ID: "paged-empty-cells", Props: map[string]any{
			"Paged": true,
			"Rows":  []map[string]any{{"Cells": []string{}}},
		}},
		{Chapter: "tables", Name: "VirtualTable", ID: "empty-vt"},
		{Chapter: "finance", Name: "Screener", ID: "empty-screener"},
		{Chapter: "data", Name: "Comparison", ID: "empty-comp", Props: map[string]any{
			"Plans":    []map[string]any{{"Label": "Free"}, {"Label": "Pro"}},
			"Features": []map[string]any{{"Label": "Storage", "Values": []string{"5GB"}}},
		}},
		{Chapter: "tables", Name: "Spreadsheet", ID: "empty-sheet", Props: map[string]any{
			"Columns": []map[string]any{{"Label": "A"}},
			"Rows": []map[string]any{
				{"Label": "1", "Cells": []string{}},
				{"Label": "2", "Cells": []string{"x", "y"}},
			},
		}},
		{Chapter: "tables", Name: "RowExpansion", ID: "empty-rowexp", Props: map[string]any{
			"Rows": []map[string]any{{"Key": "r1", "Cells": []string{}}},
		}},
	}
	for _, comp := range emptyComponents {
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, comp); err != nil {
			t.Fatalf("%s/%s failed: %v", comp.Chapter, comp.Name, err)
		}
	}

	// 2. Explicit type="submit" on form buttons
	submitComponents := []Component{
		{Chapter: "finance", Name: "IndicatorOverlay", ID: "sub-ind"},
		{Chapter: "finance", Name: "Screener", ID: "sub-scr"},
		{Chapter: "finance", Name: "CurrencyConverter", ID: "sub-cur"},
		{Chapter: "misc", Name: "QRCodeScanner", ID: "sub-qr", Props: map[string]any{"Manual": true}},
	}
	for _, comp := range submitComponents {
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, comp); err != nil {
			t.Fatalf("%s/%s failed: %v", comp.Chapter, comp.Name, err)
		}
		if strings.Contains(out.String(), "<button>") {
			t.Fatalf("%s/%s still emits <button> without type=: %s", comp.Chapter, comp.Name, out.String())
		}
		if !strings.Contains(out.String(), `<button type="submit"`) {
			t.Fatalf("%s/%s missing explicit type=\"submit\" button: %s", comp.Chapter, comp.Name, out.String())
		}
	}

	// 3. Empty image URLs must not emit <img src="">
	imgComponents := []Component{
		{Chapter: "chat", Name: "VideoMessage", ID: "empty-vid"},
		{Chapter: "chat", Name: "ImageGrid", ID: "empty-grid", Props: map[string]any{"Items": []map[string]any{{"Label": "One"}}}},
		{Chapter: "agent", Name: "BrowserPreview", ID: "empty-bp", Props: map[string]any{"Frames": []map[string]any{{"Label": "F1"}}}},
		{Chapter: "agent", Name: "ComputerUseViewer", ID: "empty-cu"},
	}
	for _, comp := range imgComponents {
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, comp); err != nil {
			t.Fatalf("%s/%s failed: %v", comp.Chapter, comp.Name, err)
		}
		if strings.Contains(out.String(), `<img`) {
			t.Fatalf("%s/%s emitted empty <img> tag without URL: %s", comp.Chapter, comp.Name, out.String())
		}
	}
}
