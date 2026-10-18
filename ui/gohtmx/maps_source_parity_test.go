package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestMapsCallerViewportAndCoordinates(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	props := map[string]any{"ID": "caller-map", "Center": map[string]any{"Latitude": 0, "Longitude": -179.5}, "Zoom": 0, "Width": 480, "Height": 288, "Attribution": "Caller <source>", "PickAction": "caller-pick", "MarkerAction": "caller-marker", "ViewportAction": "caller-view", "Points": []map[string]any{{"Key": "port-1", "Label": "Caller port", "Hue": 0, "Latitude": 12.5, "Longitude": -178}}, "Disabled": true}
	if err := tpl.ExecuteTemplate(&out, "map-view", props); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`data-map-latitude="0"`, `data-map-longitude="-179.5"`, `data-map-initial-zoom="0"`, `data-map-width="480"`, `data-map-height="288"`, `data-map-pick-action="caller-pick"`, `data-map-marker-action="caller-marker"`, `data-map-viewport-action="caller-view"`, `data-key="port-1"`, `data-map-disabled="true"`, `Caller &lt;source&gt;`} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("missing %s", want)
		}
	}
	out.Reset()
	if err := tpl.ExecuteTemplate(&out, "coordinate-display", map[string]any{"ID": "position", "Value": "<caller coordinate>", "Label": "Caller format", "Disabled": true}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`id="position"`, `&lt;caller coordinate&gt;`, `Caller format`, `data-map-copy`, `disabled`, `data-map-copy-status`} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("missing %s", want)
		}
	}
}
