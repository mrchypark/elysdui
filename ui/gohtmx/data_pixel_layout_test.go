package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestDataPixelResponsiveStyleGuards(t *testing.T) {
	data, err := Files.ReadFile("assets/ely-api-data.css")
	if err != nil {
		t.Fatal(err)
	}
	css := string(data)
	for _, rule := range []string{
		`.ely-data__chart text{fill:currentColor}`,
		`@media(max-width:36rem){.ely-data__dashboard{grid-template-columns:minmax(0,1fr);grid-auto-rows:auto}`,
		`.ely-data__measures{grid-template-columns:minmax(0,1fr)}`,
		`.ely-data__measures>.ely-data__gauge{width:7rem;max-width:100%;margin:0}`,
	} {
		if !strings.Contains(css, rule) {
			t.Errorf("missing shared narrow-layout/theme guard %s", rule)
		}
	}
	// Preserve desktop caller-coordinate layout and intended horizontal table scrolling.
	for _, rule := range []string{
		`grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-rows:5.5rem`,
		`grid-template-columns:minmax(14rem,2fr) repeat(2,7rem)`,
		`.ely-data__plain-table-wrap{`,
	} {
		if !strings.Contains(css, rule) {
			t.Errorf("existing desktop/table contract changed: %s", rule)
		}
	}
}

func TestDataPixelCallerLabelsAndLayoutMetadataRemain(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"NetworkGraph", "SankeyChart", "Treemap"} {
		t.Run(kind, func(t *testing.T) {
			var out bytes.Buffer
			item := map[string]any{"Label": "<caller>", "X": 1, "Y": 2, "Width": 30, "Height": 40, "TextX": 3, "TextY": 4, "LabelX": 3, "LabelY": 4, "R": 5}
			if err := tpl.ExecuteTemplate(&out, "ely-api-data", map[string]any{"Chapter": "charts", "Kind": kind, "ViewBox": "0 0 100 100", "Items": []any{item}, "Nodes": []any{item}}); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(out.String(), "&lt;caller&gt;</text>") || strings.Contains(out.String(), "<caller>") {
				t.Fatalf("caller SVG label must remain escaped and present: %s", out.String())
			}
		})
	}
	var dashboard, meter bytes.Buffer
	if err := tpl.ExecuteTemplate(&dashboard, "ely-api-data", map[string]any{"Chapter": "dashboard", "Kind": "Dashboard Grid", "Widgets": []map[string]any{{"Key": "owner", "Label": "Caller label", "Subtitle": "Caller subtitle", "Value": "12,400", "X": 8, "Y": 2, "W": 4, "H": 3}}}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`data-ely-key="owner"`, `data-ely-x="8"`, `data-ely-y="2"`, `data-ely-w="4"`, `data-ely-h="3"`, "Caller label", "Caller subtitle", "12,400"} {
		if !strings.Contains(dashboard.String(), want) {
			t.Errorf("lost caller dashboard metadata %s", want)
		}
	}
	if err := tpl.ExecuteTemplate(&meter, "ely-api-data", map[string]any{"Chapter": "data", "Kind": "Meter", "Label": "Storage", "Min": 0, "Max": 100, "Value": 42, "Gauges": []map[string]any{{"Label": "CPU", "Value": "38", "Suffix": "%", "Percent": 38}, {"Label": "Temperature", "Value": "54", "Suffix": "°C", "Percent": 54}}}); err != nil {
		t.Fatal(err)
	}
	if strings.Count(meter.String(), `class="ely-data__gauge"`) != 2 || !strings.Contains(meter.String(), "54°C") || !strings.Contains(meter.String(), "38%") {
		t.Fatalf("caller gauges lost: %s", meter.String())
	}
}
