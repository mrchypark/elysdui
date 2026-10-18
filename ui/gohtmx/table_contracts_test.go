package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestTableContractsRenderProductionSurfaces(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Table", "DataTable", "VirtualTable"} {
		t.Run(name, func(t *testing.T) {
			var out bytes.Buffer
			props := map[string]any{"TableSource": true, "Paged": true, "PageSize": 8, "FilterColumn": 2, "VirtualTotal": 100, "Columns": []map[string]any{{"Label": "Name"}, {"Label": "Status"}}, "Rows": []map[string]any{{"Cells": []string{"<unsafe>", "Live"}}}, "FilterOptions": []map[string]any{{"Label": "Live", "Value": "Live"}}}
			if err := RenderComponent(tpl, &out, Component{Chapter: "tables", Name: name, ID: "contract-table", Props: props}); err != nil {
				t.Fatal(err)
			}
			html := out.String()
			if strings.Contains(html, "<unsafe>") || !strings.Contains(html, "&lt;unsafe&gt;") {
				t.Fatal("cell content not escaped")
			}
			if !strings.Contains(html, `scope="col"`) {
				t.Fatal("missing semantic column headers")
			}
			if name == "DataTable" {
				for _, part := range []string{`data-ely-paged-table`, `data-ely-table-filter-column="2"`, `aria-sort="none"`, `aria-label="Select all rows"`, `aria-live="polite"`} {
					if !strings.Contains(html, part) {
						t.Errorf("missing %s", part)
					}
				}
			} else if strings.Contains(html, `data-ui-table-sort`) {
				t.Fatal("plain source table should not pretend to sort")
			}
		})
	}
}
