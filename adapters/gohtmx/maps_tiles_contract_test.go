package gohtmx_test

import (
	"bytes"
	"strings"
	"testing"

	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
)

func TestCatalogueMapsSelectOnlyHostTileProviderID(t *testing.T) {
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	contracts, err := sdui.CatalogueContracts()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range mapContractNames {
		t.Run(name, func(t *testing.T) {
			found := false
			for _, c := range contracts {
				if c.Name == name {
					p := c.Properties["tileProvider"]
					if p.Type != sdui.String || p.Target != "TileProvider" || p.Format != "text" {
						t.Fatalf("wrong tile provider contract: %+v", p)
					}
					found = true
				}
			}
			if !found {
				t.Fatalf("missing %s", name)
			}
			screen := sdui.Screen{Version: sdui.Version, ID: "tiles-screen", Root: sdui.Node{ID: "tiles", Type: name, Props: map[string]any{"tileProvider": "local-tiles"}}}
			plan, err := sdui.Compile(screen, registry)
			if err != nil {
				t.Fatal(err)
			}
			var out bytes.Buffer
			if err := plan.Render(&out, sdui.RenderContext{}); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(out.String(), `data-map-tile-provider="local-tiles"`) {
				t.Fatal("provider ID lost")
			}
			screen.Root.Props = nil
			screen.Root.Bindings = map[string]string{"tileProvider": "/provider"}
			plan, err = sdui.Compile(screen, registry)
			if err != nil {
				t.Fatal(err)
			}
			out.Reset()
			if err := plan.Render(&out, sdui.RenderContext{Data: map[string]any{"provider": "bound-local"}}); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(out.String(), `data-map-tile-provider="bound-local"`) {
				t.Fatal("bound provider ID lost")
			}
			screen.Root.Bindings = nil
			for _, value := range []any{42, true, map[string]any{"urlTemplate": "/{z}/{x}/{y}"}, []any{"local"}} {
				screen.Root.Props = map[string]any{"tileProvider": value}
				if _, err := sdui.Compile(screen, registry); err == nil {
					t.Fatalf("accepted non-string provider: %v", value)
				}
			}
			for _, forbidden := range []string{"urlTemplate", "tileURL", "tileSource", "tileCallback", "providerRevision", "minZoom", "maxZoom", "apiKey"} {
				screen.Root.Props = map[string]any{forbidden: "untrusted"}
				if _, err := sdui.Compile(screen, registry); err == nil {
					t.Fatalf("accepted host-only option %s", forbidden)
				}
			}
		})
	}
}
