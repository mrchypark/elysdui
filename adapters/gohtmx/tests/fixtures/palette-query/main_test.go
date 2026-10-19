package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	gohtmx "github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/palettefixture"
)

func TestCompiledProductionPaletteFixtures(t *testing.T) {
	for _, route := range []string{"/", "/fragment"} {
		t.Run(route, func(t *testing.T) {
			var out bytes.Buffer
			if err := dump(&out, "sdui", route); err != nil {
				t.Fatal(err)
			}
			if err := palettefixture.Inspect(out.String(), "sdui", route == "/fragment", identities()); err != nil {
				t.Fatal(err)
			}
		})
	}
	for _, slot := range []string{"primary", "peer"} {
		var out bytes.Buffer
		if err := dump(&out, "sdui", "/sdui-response-"+slot); err != nil {
			t.Fatal(err)
		}
		for _, want := range []string{`<section id="palette-` + slot + `-result" data-sdui-region="palette-` + slot + `-result">`, `Command observed`} {
			if !strings.Contains(out.String(), want) {
				t.Fatalf("response lacks %s: %s", want, out.String())
			}
		}
		if strings.Contains(out.String(), "<script") || strings.Contains(out.String(), "data-ely-family") || strings.Contains(out.String(), "data-sdui-screen") {
			t.Fatal("response must contain only actual result region")
		}
	}
}

func TestCompiledPaletteSourceManifest(t *testing.T) {
	var out bytes.Buffer
	if err := dump(&out, "sdui", "/manifest.json"); err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Surface, ProductionMutation string
		SourceFiles                 []palettefixture.Source
		Identities                  []palettefixture.Identity
		SDUISourceActions           []string
	}
	if err := json.Unmarshal(out.Bytes(), &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Surface != "sdui" || manifest.ProductionMutation != "none" || len(manifest.Identities) != 2 || len(manifest.SDUISourceActions) != 5 {
		t.Fatal(out.String())
	}
	sources := map[string]bool{}
	for _, source := range manifest.SourceFiles {
		if len(source.SHA256) != 64 || source.Bytes == 0 {
			t.Fatal(source)
		}
		sources[source.Path] = true
	}
	for _, path := range []string{"adapters/gohtmx/assets/sdui.js", "adapters/gohtmx/render.go", "sdui/compile.go", "ui/gohtmx/assets/ely-api-interaction.js"} {
		if !sources[path] {
			t.Fatalf("missing source %s", path)
		}
	}
	for i, want := range identities() {
		if manifest.Identities[i] != want {
			t.Fatalf("identity got=%+v want=%+v", manifest.Identities[i], want)
		}
	}
}

func TestCompiledPaletteRejectsInventedRootProps(t *testing.T) {
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := wireScreen(palettefixture.Primary("original"))
	if err != nil {
		t.Fatal(err)
	}
	for _, property := range []string{"action", "query", "ariaActiveDescendant"} {
		t.Run(property, func(t *testing.T) {
			screen, err := gohtmx.Decode(bytes.NewReader(raw))
			if err != nil {
				t.Fatal(err)
			}
			screen.Root.Children[0].Props[property] = "invented"
			if _, err := gohtmx.Compile(screen, registry); err == nil {
				t.Fatalf("accepted untyped root property %s", property)
			}
		})
	}
}

func TestAdapterPaletteRejectsUnknownSurfaceAndRoute(t *testing.T) {
	for _, test := range [][2]string{{"go-qualified", "/"}, {"sdui", "/missing"}} {
		var out bytes.Buffer
		if err := dump(&out, test[0], test[1]); err == nil || out.Len() != 0 {
			t.Fatalf("accepted %v", test)
		}
	}
}
