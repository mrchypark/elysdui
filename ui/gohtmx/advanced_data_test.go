package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestAdvancedDataPrimariesRenderCallerData(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	chapters, err := Catalogue()
	if err != nil {
		t.Fatal(err)
	}
	for _, chapter := range chapters {
		if !map[string]bool{"data": true, "lists": true, "tables": true, "charts": true, "finance": true, "dashboard": true}[chapter.Slug] {
			continue
		}
		for _, story := range chapter.Stories {
			t.Run(chapter.Slug+"/"+story.Name, func(t *testing.T) {
				var body bytes.Buffer
				props := map[string]any{"ID": "data-test", "Chapter": chapter.Slug, "Kind": story.Name, "Title": `<b>caller</b>`, "Value": "7", "Items": []map[string]any{{"Value": "one", "Label": "One"}}, "Columns": []map[string]any{{"Label": "Name"}}, "Rows": []map[string]any{{"Cells": []string{"One"}}}, "Cells": []map[string]any{{"Name": "a1", "Label": "A1", "Value": "A1", "Level": "2"}}}
				if err := tpl.ExecuteTemplate(&body, "ely-api-data", props); err != nil {
					t.Fatal(err)
				}
				if strings.TrimSpace(body.String()) == "" {
					t.Fatal("empty renderer")
				}
				if strings.Contains(body.String(), `<b>caller</b>`) {
					t.Fatal("caller string rendered as HTML")
				}
			})
		}
	}
}

func TestAdvancedDataInstancesKeepIDsLocal(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"data-one", "data-two"} {
		var body bytes.Buffer
		if err := tpl.ExecuteTemplate(&body, "ely-api-data", map[string]any{"ID": id, "Chapter": "data", "Kind": "BeforeAfter", "Value": 25}); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(body.String(), `data-ely-range`) {
			t.Fatal("range renderer missing")
		}
	}
}

func TestAdvancedDataKeepsEmptyAndDisabledState(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var table, form bytes.Buffer
	if err := tpl.ExecuteTemplate(&table, "ely-api-data", map[string]any{"Chapter": "tables", "Kind": "Table", "Empty": "No caller rows"}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(table.String(), "No caller rows") {
		t.Fatal("empty table state missing")
	}
	if err := tpl.ExecuteTemplate(&form, "ely-api-data", map[string]any{"Chapter": "data", "Kind": "PropertyGrid", "Fields": []map[string]any{{"Name": "title", "Label": "Title", "Disabled": true}}}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(form.String(), "disabled") {
		t.Fatal("disabled field state missing")
	}
}

func TestAdvancedDataPrimariesRenderThroughComponentAPI(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	chapters, err := Catalogue()
	if err != nil {
		t.Fatal(err)
	}
	allowed := map[string]bool{"data": true, "lists": true, "tables": true, "charts": true, "finance": true, "dashboard": true}
	for _, chapter := range chapters {
		if !allowed[chapter.Slug] {
			continue
		}
		for index, story := range chapter.Stories {
			t.Run(chapter.Slug+"/"+story.Name, func(t *testing.T) {
				var body bytes.Buffer
				err := RenderComponent(tpl, &body, Component{Chapter: chapter.Slug, Name: story.Name, ID: "data-api-" + chapter.Slug + "-" + string(rune('a'+index)), Props: map[string]any{"Title": "Caller title", "Items": []map[string]any{{"Value": "one", "Label": "One"}}, "Columns": []map[string]any{{"Label": "Name"}}, "Rows": []map[string]any{{"Cells": []string{"One"}}}}})
				if err != nil {
					t.Fatal(err)
				}
				if !strings.Contains(body.String(), `data-ely-family="data"`) {
					t.Fatal("data wrapper missing")
				}
			})
		}
	}
}

func TestAdvancedDataGroupedTreeAndPivotRenderCallerStructure(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		kind  string
		props map[string]any
		want  string
	}{
		{"RowGrouping", map[string]any{"ID": "groups", "Chapter": "tables", "Kind": "RowGrouping", "Columns": []map[string]any{{"Label": "Name"}}, "Groups": []map[string]any{{"Value": "open", "Label": "Open", "Rows": []map[string]any{{"Cells": []string{"Alpha"}}}}}}, "data-ely-group"},
		{"TreeTable", map[string]any{"ID": "tree", "Chapter": "tables", "Kind": "TreeTable", "Columns": []map[string]any{{"Label": "Name"}}, "Rows": []map[string]any{{"Value": "parent", "Label": "Parent", "Children": []map[string]any{{"Cells": []string{"Child"}}}}}}, "data-ely-tree-row"},
		{"PivotTable", map[string]any{"ID": "pivot", "Chapter": "tables", "Kind": "PivotTable", "Columns": []map[string]any{{"Label": "Name"}}, "Measures": []map[string]any{{"Value": "count", "Label": "Count", "Selected": true, "Rows": []map[string]any{{"Cells": []string{"Two"}}}}}}, "data-ely-pivot-rows"},
	} {
		var body bytes.Buffer
		if err := tpl.ExecuteTemplate(&body, "ely-api-data", test.props); err != nil {
			t.Fatalf("%s: %v", test.kind, err)
		}
		if !strings.Contains(body.String(), test.want) {
			t.Fatalf("%s did not render %s", test.kind, test.want)
		}
	}
}

func TestDrawingToolsMountsTheRenderedSVG(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := RenderComponent(tpl, &output, Component{Chapter: "finance", Name: "DrawingTools", ID: "drawing-api", Props: map[string]any{"ViewBox": "0 0 320 160", "Points": "0,20 320,80"}}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), `<svg data-ely-drawing-surface`) {
		t.Fatal("DrawingTools rendered no mountable drawing surface")
	}
}
