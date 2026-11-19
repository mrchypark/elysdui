package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestChartAssetHelpersAreSelective(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ name, asset string }{
		{"ui-time-series-assets", "ely-timeseries.css"},
		{"ui-scatter-assets", "ely-scatter.css"},
		{"ui-chart-assets", "ely-charts.css"},
		{"ui-stat-chart-assets", "ely-stat-charts.css"},
		{"ui-density-chart-assets", "ely-density-charts.css"},
		{"ui-relation-chart-assets", "ely-relation-charts.css"},
		{"ui-comparison-chart-assets", "ely-comparison-charts.css"},
		{"ui-horizon-chart-assets", "ely-horizon-charts.css"},
		{"ui-parallel-sets-assets", "ely-parallel-sets.css"},
		{"ui-surface-chart-assets", "ely-surface-chart.css"},
	} {
		var out bytes.Buffer
		if err := tpl.ExecuteTemplate(&out, tc.name, nil); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(out.String(), tc.asset) {
			t.Errorf("%s does not include %s", tc.name, tc.asset)
		}
		if strings.Contains(out.String(), "echarts.esm.min.js") {
			t.Errorf("%s should not eagerly load ECharts", tc.name)
		}
	}
}
