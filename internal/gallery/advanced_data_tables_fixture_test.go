package uiexamples

import (
	"bytes"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestDataTableFixturesMatchSourceSpecimens(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]AdvancedCase{}
	for _, fixture := range advancedDataCases() {
		fixtures[fixture.Component.Chapter+"/"+fixture.Component.Name] = fixture
	}
	for _, test := range []struct {
		name  string
		wants []string
	}{
		{"tables/Table", []string{"Ada Lovelace", "Analyst", "London"}},
		{"tables/DataTable", []string{"Grace Hopper", "$47,705", "Ken Thompson", "$92,192", "Sophie Wilson", "$83,221", "1–8 of 24", "Rows per page"}},
		{"tables/RowExpansion", []string{"Draft the launch notes", "Review the type scale", "Record the demo"}},
		{"tables/RowGrouping", []string{"Asia", "Americas", "Oceania", "Europe", "$45,849", "Groups keep the order their first rows come in; sort to reorder them."}},
		{"tables/Spreadsheet", []string{"Quarterly budget", "10,176", "108,120", "Share of rent", "9.41"}},
		{"tables/TreeTable", []string{"src", "842 KB", "ui", "main.rs", "assets", "2,480 KB", "Cargo.toml"}},
		{"tables/PivotTable", []string{"Sales in thousands.", "1,301"}},
		{"tables/VirtualTable", []string{"data-ely-total=\"100000\"", "9 supplied rows (declared total: 100000)", "Event 1", "Event 9"}},
		{"tables/HeatmapTable", []string{"Visits by weekday and hour", "Mon", "Sun", "157", "ComparisonTable is Comparison, in Data Display."}},
	} {
		t.Run(test.name, func(t *testing.T) {
			fixture := fixtures[test.name]
			var output bytes.Buffer
			if err := ui.RenderComponent(server.templates, &output, fixture.Component); err != nil {
				t.Fatal(err)
			}
			if test.name == "tables/VirtualTable" && strings.Contains(output.String(), `aria-rowcount="100000"`) {
				t.Fatal("declared total must not pretend unsupplied rows exist")
			}
			for _, want := range test.wants {
				if !strings.Contains(output.String(), want) {
					t.Errorf("missing %q", want)
				}
			}
		})
	}

	t.Run("tables/DataTable retains the complete source dataset", func(t *testing.T) {
		fixture := fixtures["tables/DataTable"]
		rows, ok := fixture.Component.Props["Rows"].([]map[string]any)
		if !ok || len(rows) != 24 {
			t.Fatalf("source DataTable rows = %d, want 24", len(rows))
		}
		if got := rows[0]["Cells"].([]string)[0]; got != "Grace Hopper" {
			t.Fatalf("first sorted source row = %q, want Grace Hopper", got)
		}
	})

	t.Run("tables/TreeTable initial disclosure follows the source specimen", func(t *testing.T) {
		fixture := fixtures["tables/TreeTable"]
		var output bytes.Buffer
		if err := ui.RenderComponent(server.templates, &output, fixture.Component); err != nil {
			t.Fatal(err)
		}
		markup := output.String()
		for _, want := range []string{"aria-expanded=\"true\">▾</button>src", "aria-expanded=\"false\">▸</button>ui", "data-ely-depth=\"2\" hidden"} {
			if !strings.Contains(markup, want) {
				t.Errorf("missing initial disclosure marker %q", want)
			}
		}
	})

	t.Run("tables/Spreadsheet merges its source title across the lettered columns", func(t *testing.T) {
		fixture := fixtures["tables/Spreadsheet"]
		var output bytes.Buffer
		if err := ui.RenderComponent(server.templates, &output, fixture.Component); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(output.String(), `colspan="6" data-ely-sheet-title`) {
			t.Fatal("Spreadsheet title is not a six-column merged cell")
		}
	})
}
