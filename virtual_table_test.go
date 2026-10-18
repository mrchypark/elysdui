package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestVirtualTableCallerBoundaries(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name   string
		props  map[string]any
		want   []string
		absent []string
	}{
		{"rows", map[string]any{"VirtualTotal": 100000, "Rows": []map[string]any{{"Key": "<key>", "Cells": []string{"<unsafe>"}}}}, []string{`data-ely-virtual-row="0"`, `data-ely-key="&lt;key&gt;"`, `&lt;unsafe&gt;`, `1 supplied rows (declared total: 100000)`, `scope="col"`}, []string{`aria-rowcount="100000"`, `<unsafe>`}},
		{"row-header", map[string]any{"RowHeader": "Record", "Rows": []map[string]any{{"Label": "Row one", "Cells": []string{"Value"}}}}, []string{`scope="row"><div>Row one</div>`, `scope="col"><div>Record</div>`}, nil},
		{"blank-row", map[string]any{"Rows": []map[string]any{{"Key": "blank"}}}, []string{`data-ely-key="blank"><td><div></div></td>`}, nil},
		{"empty", nil, []string{`No rows.`, `0 supplied rows`}, []string{`data-ely-virtual-row=`}},
		{"error", map[string]any{"Error": "<failed>"}, []string{`role="alert">&lt;failed&gt;`}, []string{`data-ely-virtual-viewport`}},
		{"disabled", map[string]any{"Disabled": true}, []string{`tabindex="-1"`, `aria-disabled="true"`}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			props := map[string]any{"TableSource": true, "Columns": []map[string]any{{"Label": "Name"}}}
			for k, v := range tc.props {
				props[k] = v
			}
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "tables", Name: "VirtualTable", ID: "virtual-test", Props: props}); err != nil {
				t.Fatal(err)
			}
			for _, s := range tc.want {
				if !strings.Contains(out.String(), s) {
					t.Errorf("missing %q", s)
				}
			}
			for _, s := range tc.absent {
				if strings.Contains(out.String(), s) {
					t.Errorf("unexpected %q", s)
				}
			}
		})
	}
}
