package ui

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestMapViewRendersSafeGeometryAndFormValue(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	props := map[string]any{"ID": "study-map", "Label": "Study <map>", "Name": "place", "Value": "37.5,127.0", "Mode": "location", "Points": []map[string]any{{"Latitude": 37.5, "Longitude": 127.0, "Label": `<img onerror=alert(1)>`, "Value": "3"}}, "Routes": []map[string]any{{"Points": []map[string]any{{"Latitude": 37.5, "Longitude": 127.0}, {"Latitude": 35.6, "Longitude": 139.6}}}}}
	var out bytes.Buffer
	if err := tpl.ExecuteTemplate(&out, "map-view", props); err != nil {
		t.Fatal(err)
	}
	body := out.String()
	for _, want := range []string{`id="study-map"`, `data-map-mode="location"`, `name="place"`, `data-map-canvas`, `data-map-route`, `id="study-map-coordinate"`, `data-map-legend`, `data-map-defs`} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %s", want)
		}
	}
	if strings.Contains(body, `<img onerror`) || !strings.Contains(body, "&lt;img") {
		t.Fatal("map label was not escaped")
	}
}

func TestMapViewRendersInlineGeoJSON(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	inline := `{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Testland"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}}]}`
	var out bytes.Buffer
	if err := tpl.ExecuteTemplate(&out, "map-view", map[string]any{"ID": "inline-map", "GeoJSON": inline}); err != nil {
		t.Fatal(err)
	}
	body := out.String()
	if !strings.Contains(body, "template data-map-geojson") || !strings.Contains(body, "Testland") || !strings.Contains(body, "data-map-status") {
		t.Fatalf("inline GeoJSON or geometry status missing: %s", body)
	}
	if strings.Contains(body, `<script`) {
		t.Fatal("inline GeoJSON became executable markup")
	}
}

func TestMapAssetsContainLocalPanAndNaturalEarthSource(t *testing.T) {
	for _, file := range []string{"assets/ely-map.css", "assets/ely-map.js"} {
		data, err := Files.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if len(data) == 0 {
			t.Fatalf("empty %s", file)
		}
	}
	data, _ := Files.ReadFile("assets/ely-map.js")
	for _, want := range []string{"world-land.json", "pointercancel", "htmx:after:swap", "template[data-map-geojson]", ".content.textContent", "data-map-geojson-layer", "mapChoropleth", "data-map-heat-spot", "mapGeojsonFeature", "data-map-legend", "Map geometry is unavailable."} {
		if !strings.Contains(string(data), want) {
			t.Errorf("map script missing %s", want)
		}
	}
}

func TestMapAssetsCleanUpDetachedRootsAndReclusterOnZoom(t *testing.T) {
	data, err := Files.ReadFile("assets/ely-map.js")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"new WeakMap", "new AbortController", "controller.abort()", "clearGenerated", "data-map-generated", "restoreMarkers", "root.dataset.mapReady = 'pending'", "root.dataset.mapReady = 'true'", "root.dataset.mapReady = 'error'", "delete root.dataset.mapReady", "root.isConnected", "new MutationObserver", "updateClusters();", "clusterKey(marker.dataset.lat, marker.dataset.lon, zoom)", "if (event.isTrusted) canvas.setPointerCapture?."} {
		if !strings.Contains(string(data), want) {
			t.Errorf("map lifecycle or zoom clustering missing %s", want)
		}
	}
}

func TestWorldLandIsNaturalEarthCountryGeometry(t *testing.T) {
	data, err := Files.ReadFile("assets/ely/world-land.json")
	if err != nil {
		t.Fatal(err)
	}
	var world struct {
		Provenance struct {
			Source  string `json:"source"`
			Dataset string `json:"dataset"`
			URL     string `json:"url"`
		} `json:"provenance"`
		Features []struct {
			Properties map[string]string `json:"properties"`
			Geometry   json.RawMessage   `json:"geometry"`
		} `json:"features"`
	}
	if err := json.Unmarshal(data, &world); err != nil {
		t.Fatal(err)
	}
	if world.Provenance.Source != "Natural Earth" || world.Provenance.Dataset != "ne_110m_admin_0_countries" || world.Provenance.URL != "https://www.naturalearthdata.com/" {
		t.Fatalf("unexpected provenance: %+v", world.Provenance)
	}
	if len(world.Features) != 177 || len(world.Features[0].Geometry) == 0 || world.Features[0].Properties["name"] == "" {
		t.Fatalf("incomplete country geometry: %d features", len(world.Features))
	}
}
