package uiexamples

import (
	"bytes"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestFinanceAndDashboardFixturesKeepSourceSpecimens(t *testing.T) {
	fixtures := map[string]AdvancedCase{}
	for _, fixture := range advancedDataCases() {
		fixtures[fixture.Component.Chapter+"/"+fixture.Component.Name] = fixture
	}
	board := fixtures["dashboard/Dashboard Grid"].Component.Props["Widgets"].([]map[string]any)
	if len(board) != 5 || board[2]["Label"] != "CPU" || board[3]["W"] != 8 {
		t.Fatal("Dashboard Grid lost the five-tile source layout")
	}
	uptime := fixtures["dashboard/UptimeBar"].Component.Props["HealthChecks"].([]map[string]any)
	if len(uptime) != 5 || uptime[4]["Label"] != "Search index" {
		t.Fatal("UptimeBar lost the pending source check")
	}
	incident := fixtures["dashboard/AlertList"].Component.Props["Incident"].(map[string]any)
	if len(incident["Updates"].([]map[string]any)) != 3 {
		t.Fatal("AlertList lost the full source incident timeline")
	}
	orders := fixtures["finance/OrderEntry"].Component.Props
	if orders["Symbol"] != "ELY" || orders["Quantity"] != 100 || len(orders["OrderKinds"].([]map[string]any)) != 3 {
		t.Fatal("OrderEntry lost its caller ticket controls")
	}
	book := fixtures["finance/OrderBook"].Component.Props
	if len(book["Bids"].([]map[string]any)) != 12 || len(book["Asks"].([]map[string]any)) != 12 || len(book["Level2"].([]map[string]any)) != 6 {
		t.Fatal("OrderBook lost its depth and venue context")
	}
	watchlist := fixtures["finance/Watchlist"].Component.Props
	if len(watchlist["Items"].([]map[string]any)) != 8 || len(watchlist["SymbolBadges"].([]map[string]any)) != 4 {
		t.Fatal("Watchlist lost its source symbols or search controls")
	}
	tape := fixtures["finance/Ticker"].Component.Props["Tape"].([]map[string]any)
	if len(tape) != 8 || tape[0]["Value"] != "187.24" || tape[7]["Label"] != "TERRA" {
		t.Fatal("Ticker lost the complete upstream tape")
	}
	portfolio := fixtures["finance/PortfolioSummary"].Component.Props["Holdings"].([]map[string]any)
	if len(portfolio) != 6 || portfolio[0]["Text"] != "$48,210" || portfolio[5]["Label"] != "Cash" {
		t.Fatal("PortfolioSummary lost the caller allocation specimen")
	}
	converter := fixtures["finance/CurrencyConverter"].Component.Props
	if converter["Value"] != 1000 || converter["Converted"] != "€917.43" || len(converter["Transfers"].([]map[string]any)) != 5 {
		t.Fatal("CurrencyConverter lost the source conversion or five transfer specimen")
	}
	leverage := fixtures["finance/LeverageSlider"].Component.Props
	if leverage["MarginUsed"] != "$21,500" || leverage["Risk"] != 13 {
		t.Fatal("LeverageSlider lost margin or bounded risk context")
	}
	calendar := fixtures["finance/EconomicCalendar"].Component.Props
	if len(calendar["Earnings"].([]map[string]any)) != 4 || len(calendar["Stories"].([]map[string]any)) != 4 {
		t.Fatal("EconomicCalendar lost source earnings or news")
	}
	dividends := fixtures["finance/DividendTable"].Component.Props
	if len(dividends["Rows"].([]map[string]any)) != 4 || len(dividends["StatementRows"].([]map[string]any)) != 7 {
		t.Fatal("DividendTable lost source dividends or statement lines")
	}
}

func TestHeatmapChartAndCalendarAliasRenderVisibleCells(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	var chart *AdvancedCase
	for _, fixture := range advancedDataCases() {
		if fixture.Component.Chapter == "charts" && fixture.Component.Name == "HeatmapChart" {
			copy := fixture
			chart = &copy
			break
		}
	}
	if chart == nil {
		t.Fatal("missing canonical HeatmapChart fixture")
	}
	cells, ok := chart.Component.Props["Cells"].([]map[string]any)
	if !ok || len(cells) < 6 {
		t.Fatalf("HeatmapChart fixture cells = %#v; want supplied calendar grid cells", chart.Component.Props["Cells"])
	}
	for _, name := range []string{"HeatmapChart", "CalendarHeatmap"} {
		t.Run(name, func(t *testing.T) {
			component := chart.Component
			component.Name = name
			var body bytes.Buffer
			if err := ui.RenderComponent(server.templates, &body, component); err != nil {
				t.Fatal(err)
			}
			markup := body.String()
			if strings.Count(markup, `class="ely-data__heatmap"`) != 1 || strings.Count(markup, `data-level=`) < 6 {
				t.Fatalf("heatmap root has no supplied cell geometry: %s", markup)
			}
		})
	}
}

func TestDataChartViewBoxCallerCases(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	affected := map[string]bool{"AreaChart": true, "PieChart": true, "ScatterChart": true, "RadarChart": true, "Treemap": true, "SankeyChart": true, "WaterfallChart": true, "Histogram": true, "NetworkGraph": true, "IndicatorOverlay": true, "PortfolioSummary": true}
	count := 0
	for _, fixture := range advancedDataCases() {
		if !affected[fixture.Component.Name] {
			continue
		}
		if viewBox, ok := fixture.Component.Props["ViewBox"].(string); !ok || viewBox == "" {
			t.Errorf("%s fixture has no explicit ViewBox", fixture.Component.Name)
		}
		definition, err := ui.ResolveComponent(fixture.Component.Chapter, fixture.Component.Name)
		if err != nil {
			t.Fatal(err)
		}
		seen := map[string]bool{}
		for _, name := range append([]string{definition.Name}, definition.Aliases...) {
			if seen[name] {
				continue
			}
			seen[name] = true
			count++
			for _, state := range []string{"missing", "empty", "custom"} {
				t.Run(fixture.Component.Chapter+"/"+name+"/"+state, func(t *testing.T) {
					component := fixture.Component
					component.Name = name
					component.Props = make(map[string]any, len(fixture.Component.Props))
					for key, value := range fixture.Component.Props {
						component.Props[key] = value
					}
					want := "0 0 320 120"
					switch state {
					case "missing":
						delete(component.Props, "ViewBox")
					case "empty":
						component.Props["ViewBox"] = ""
					case "custom":
						want = "0 0 640 240"
						component.Props["ViewBox"] = want
					}
					var body bytes.Buffer
					if err := ui.RenderComponent(server.templates, &body, component); err != nil {
						t.Fatal(err)
					}
					markup := body.String()
					if strings.Count(markup, `viewBox="`+want+`"`) != 1 || strings.Contains(markup, `viewBox=""`) {
						t.Fatalf("missing valid SVG viewBox: %s", markup)
					}
					if !strings.Contains(markup, `<path `) && !strings.Contains(markup, `<polyline `) && !strings.Contains(markup, `<circle `) && !strings.Contains(markup, `<polygon `) && !strings.Contains(markup, `<rect `) {
						t.Fatalf("missing actual chart geometry: %s", markup)
					}
				})
			}
		}
	}
	if count != 29 {
		t.Fatalf("covered %d chart names, want 11 canonical plus 18 aliases", count)
	}
}
