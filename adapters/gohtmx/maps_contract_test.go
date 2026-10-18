package gohtmx_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"testing"

	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
)

var mapContractNames = []string{
	"basic/map-view", "maps/MapView", "maps/MapMarker", "maps/MapPopup",
	"maps/LocationPicker", "maps/RouteLine", "maps/GeoJSON Layer", "maps/GeoHeatmap",
	"maps/MapCluster", "maps/ChoroplethMap", "maps/WorldMap",
}

func TestCatalogueMapCoordinateSchemas(t *testing.T) {
	contracts, err := sdui.CatalogueContracts()
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, c := range contracts {
		if c.Template != "map-view" && (c.Chapter != "maps" || c.Primary == "CoordinateDisplay") {
			continue
		}
		seen[c.Name] = true
		for _, record := range []sdui.Property{c.Properties["center"], *c.Properties["points"].Items, *c.Properties["routes"].Items.Properties["points"].Items} {
			if record.Type != sdui.Object || record.AdditionalProperties != nil {
				t.Fatalf("%s coordinate record is not closed", c.Name)
			}
			for key, target := range map[string]string{"latitude": "Latitude", "longitude": "Longitude"} {
				p := record.Properties[key]
				if p.Type != sdui.Number || p.Target != target || p.Format != "" || p.Required || p.Nullable || len(p.OneOf) != 0 {
					t.Errorf("%s %s: %+v", c.Name, key, p)
				}
			}
		}
	}
	for _, name := range mapContractNames {
		if !seen[name] {
			t.Errorf("missing map contract %s", name)
		}
	}
	if len(seen) != len(mapContractNames) {
		t.Fatalf("map inventory changed: %v", seen)
	}
}

func TestCatalogueMapCoordinatesPreserveNumbers(t *testing.T) {
	r, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range mapContractNames {
		for _, tc := range []struct {
			name                        string
			latitude, longitude         any
			wantLatitude, wantLongitude float64
		}{
			{"seoul", 37.5665, 126.978, 37.5665, 126.978},
			{"integers", 37, 127, 37, 127},
			{"mixed", 37, 126.978, 37, 126.978},
			{"negative", -33.9249, -70.6693, -33.9249, -70.6693},
			{"zero", 0, 0, 0, 0},
			{"precision", 37.5665123456789, 126.978012345678, 37.5665123456789, 126.978012345678},
			{"exponents", json.Number("3.75665e1"), json.Number("1.26978e2"), 37.5665, 126.978},
			{"float32", float32(37.5665), float32(126.978), float64(float32(37.5665)), float64(float32(126.978))},
		} {
			t.Run(name+"/"+tc.name, func(t *testing.T) {
				coordinate := map[string]any{"latitude": tc.latitude, "longitude": tc.longitude}
				props := map[string]any{"center": coordinate, "points": []any{coordinate}, "routes": []any{map[string]any{"points": []any{coordinate}}}}
				for _, mode := range []string{"typed", "decoded", "bound"} {
					screen := sdui.Screen{Version: sdui.Version, ID: "map-screen", Root: sdui.Node{ID: "map", Type: name, Props: props}}
					ctx := sdui.RenderContext{}
					if mode == "decoded" {
						raw, err := json.Marshal(screen)
						if err != nil {
							t.Fatal(err)
						}
						screen, err = sdui.Decode(bytes.NewReader(raw))
						if err != nil {
							t.Fatal(err)
						}
					}
					if mode == "bound" {
						screen.Root.Props = nil
						screen.Root.Bindings = map[string]string{"center": "/center", "points": "/points", "routes": "/routes"}
						ctx.Data = props
					}
					plan, err := sdui.Compile(screen, r)
					if err != nil {
						t.Fatalf("%s compile: %v", mode, err)
					}
					var output bytes.Buffer
					if err := plan.Render(&output, ctx); err != nil {
						t.Fatalf("%s render: %v", mode, err)
					}
					wantLatitude, wantLongitude := tc.wantLatitude, tc.wantLongitude
					if mode == "decoded" {
						// JSON encodes a float32 with its own shortest decimal, while
						// typed Go input promotes its exact binary value to float64.
						wantLatitude, _ = strconv.ParseFloat(fmt.Sprint(tc.latitude), 64)
						wantLongitude, _ = strconv.ParseFloat(fmt.Sprint(tc.longitude), 64)
					}
					lat := strconv.FormatFloat(wantLatitude, 'g', -1, 64)
					lon := strconv.FormatFloat(wantLongitude, 'g', -1, 64)
					for _, want := range []string{`data-map-latitude="` + lat + `"`, `data-map-longitude="` + lon + `"`} {
						if !strings.Contains(output.String(), want) {
							t.Errorf("%s lost center precision: missing %s", mode, want)
						}
					}
					want := `data-lat="` + lat + `" data-lon="` + lon + `"`
					if got := strings.Count(output.String(), want); got != 2 {
						t.Errorf("%s marker/route precision: %s appears %d times, want 2", mode, want, got)
					}
				}
			})
		}
	}
}

func mapCoordinateInput(path, axis string, value any) map[string]any {
	point := map[string]any{axis: value}
	switch path {
	case "center":
		return map[string]any{"center": point}
	case "points":
		return map[string]any{"points": []any{point}}
	default:
		return map[string]any{"routes": []any{map[string]any{"points": []any{point}}}}
	}
}

func TestCatalogueMapCoordinatesRejectInvalidValues(t *testing.T) {
	r, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range mapContractNames {
		for _, path := range []string{"center", "points", "routes"} {
			for _, axis := range []string{"latitude", "longitude"} {
				for i, value := range []any{"37.5665", "NaN", true, nil, []any{37}, map[string]any{"value": 37}, math.NaN(), math.Inf(1), math.Inf(-1), json.Number("1e999"), json.Number("NaN")} {
					t.Run(fmt.Sprintf("%s/%s/%s/%d", name, path, axis, i), func(t *testing.T) {
						props := mapCoordinateInput(path, axis, value)
						screen := sdui.Screen{Version: sdui.Version, ID: "map-screen", Root: sdui.Node{ID: "map", Type: name, Props: props}}
						if _, err := sdui.Compile(screen, r); err == nil || !strings.Contains(err.Error(), axis) {
							t.Fatalf("invalid literal accepted or diagnostic lost: %v", err)
						}
						if raw, err := json.Marshal(screen); err == nil {
							decoded, err := sdui.Decode(bytes.NewReader(raw))
							if err != nil {
								t.Fatal(err)
							}
							if _, err := sdui.Compile(decoded, r); err == nil || !strings.Contains(err.Error(), axis) {
								t.Fatalf("invalid decoded coordinate accepted or diagnostic lost: %v", err)
							}
						}
						screen.Root.Props = nil
						screen.Root.Bindings = map[string]string{path: "/" + path}
						plan, err := sdui.Compile(screen, r)
						if err != nil {
							t.Fatal(err)
						}
						var out bytes.Buffer
						if err := plan.Render(&out, sdui.RenderContext{Data: props}); err == nil || !strings.Contains(err.Error(), axis) {
							t.Fatalf("invalid binding accepted or diagnostic lost: %v", err)
						}
					})
				}
			}
		}
		for _, props := range []map[string]any{
			{"center": map[string]any{"latitude": 37.5665, "unknown": 1}},
			{"points": []any{map[string]any{"longitude": 126.978, "onclick": "alert(1)"}}},
			{"routes": []any{map[string]any{"points": []any{map[string]any{"latitude": 37.5665, "attrs": map[string]any{}}}}}},
		} {
			if _, err := renderCatalogue(name, props, r); err == nil {
				t.Errorf("%s accepted unknown/reserved coordinate field", name)
			}
		}
	}
	if _, err := renderCatalogue("maps/MapView", map[string]any{"height": 3.5}, r); err == nil {
		t.Fatal("unrelated integer contract widened")
	}
}
