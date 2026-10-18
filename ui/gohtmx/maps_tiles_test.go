package ui

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	_ "image/png"
	"strings"
	"testing"
)

func TestMapTileProviderIsEscapedDeclarativeID(t *testing.T) {
	templates, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := templates.ExecuteTemplate(&out, "map-view", map[string]any{"ID": "tiles", "TileProvider": `host"><script>alert(1)</script>`}); err != nil {
		t.Fatal(err)
	}
	body := out.String()
	if strings.Contains(body, `<script>alert`) || !strings.Contains(body, `data-map-tile-provider="host&#34;&gt;&lt;script&gt;`) {
		t.Fatalf("provider not escaped: %s", body)
	}
	for _, want := range []string{"data-map-tiles", "data-map-attribution", "data-map-tile-status", "data-map-geojson-layer", "data-map-routes", "data-map-markers", "data-map-popup"} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %s", want)
		}
	}
}
func TestBundledMapTilesMatchPinnedProvenance(t *testing.T) {
	data, err := Files.ReadFile("assets/ely/tiles/provenance.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Revision                   string
		TileSize, MinZoom, MaxZoom int
		SHA256                     map[string]string
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Revision != "da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721" || manifest.TileSize != 256 || manifest.MinZoom != 0 || manifest.MaxZoom != 3 || len(manifest.SHA256) != 85 {
		t.Fatalf("unexpected manifest: %+v", manifest)
	}
	for z := 0; z <= 3; z++ {
		for x := 0; x < 1<<z; x++ {
			for y := 0; y < 1<<z; y++ {
				name := fmt.Sprintf("%d/%d/%d.png", z, x, y)
				data, err := Files.ReadFile("assets/ely/tiles/" + name)
				if err != nil {
					t.Fatal(err)
				}
				digest := sha256.Sum256(data)
				if hex.EncodeToString(digest[:]) != manifest.SHA256[name] {
					t.Errorf("changed tile %s", name)
				}
				config, kind, err := image.DecodeConfig(bytes.NewReader(data))
				if err != nil || kind != "png" || config.Width != 256 || config.Height != 256 {
					t.Errorf("invalid tile %s: %+v %s %v", name, config, kind, err)
				}
			}
		}
	}
}
