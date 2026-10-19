package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/palettefixture"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/palettesupplemental"
)

func TestStandaloneProductionPaletteFixtures(t *testing.T) {
	for _, surface := range []string{"go-qualified", "go-chapter"} {
		for _, route := range []string{"/", "/fragment"} {
			t.Run(surface+route, func(t *testing.T) {
				var out bytes.Buffer
				if err := dump(&out, surface, route); err != nil {
					t.Fatal(err)
				}
				if err := palettesupplemental.Inspect(out.String(), surface, route == "/fragment", palettefixture.StandaloneIdentities()); err != nil {
					t.Fatal(err)
				}
			})
		}
		var out bytes.Buffer
		if err := dump(&out, surface, "/manifest.json"); err != nil {
			t.Fatal(err)
		}
		var manifest struct {
			Surface, ProductionMutation string
			SourceFiles                 []palettefixture.Source
			Identities                  []palettefixture.Identity
		}
		if err := json.Unmarshal(out.Bytes(), &manifest); err != nil {
			t.Fatal(err)
		}
		if manifest.Surface != surface || manifest.ProductionMutation != "reviewed CommandPalette repair; causal served-byte variants declared separately by invocation" || len(manifest.SourceFiles) < 18 || len(manifest.Identities) != 2 {
			t.Fatal(out.String())
		}
		for _, source := range manifest.SourceFiles {
			if strings.HasPrefix(source.Path, "sdui/") || strings.HasPrefix(source.Path, "adapters/") || len(source.SHA256) != 64 || source.Bytes == 0 {
				t.Fatalf("standalone manifest %v", source)
			}
		}
	}
}

func TestStandalonePaletteRejectsUnknownSurfaceAndRoute(t *testing.T) {
	for _, test := range [][2]string{{"sdui", "/"}, {"go-qualified", "/missing"}} {
		var out bytes.Buffer
		if err := dump(&out, test[0], test[1]); err == nil || out.Len() != 0 {
			t.Fatalf("accepted %v", test)
		}
	}
}

func TestPaletteInspectionRejectsDrift(t *testing.T) {
	var out bytes.Buffer
	if err := dump(&out, "go-qualified", "/"); err != nil {
		t.Fatal(err)
	}
	for _, mutation := range [][2]string{
		{`id="palette-peer"`, `id="palette-primary"`},
		{`data-fixture-generation="original"`, `data-fixture-generation="fresh"`},
		{`name="cmdQuery"`, `name="wrongQuery"`},
		{`id="palette-primary-component-palette-query"`, `id="wrong-query"`},
		{`aria-controls="palette-primary-component-palette-results"`, `aria-controls="palette-peer-component-palette-results"`},
		{`id="palette-primary-component-palette-results"`, `id="wrong-results"`},
		{`id="palette-primary-component-palette-option-5"`, `id="palette-primary-component-palette-option-45"`},
		{`id="palette-primary-component-palette-option-44"`, `id="wrong-last-option"`},
		{`value="entry-40"`, `value="wrong-last-entry"`},
		{`value="peer-entry-01"`, `value="entry-01"`},
		{`>Entry 40<`, `>Entry 41<`},
		{`data-ely-action="entry-command" disabled`, `data-ely-action="entry-command"`},
		{`src="/supplemental-observer.js"`, `src="/fake-observer.js"`},
		{`<script src="/supplemental-observer.js">`, `<script type="module" src="/supplemental-observer.js">`},
		{`value="open-file"`, `value="wrong-command"`},
		{`data-ely-action="disabled-command" disabled`, `data-ely-action="disabled-command"`},
		{`role="option"`, `role="button"`},
		{`data-interaction-palette-group="Commands"`, `data-interaction-palette-group="Other"`},
		{`hx-target="#palette-primary"`, `hx-target="#palette-peer"`},
		{`<script src="/fixture-observer.js">`, `<script type="module" src="/fixture-observer.js">`},
		{`src="/assets/htmx.min.js"`, `src="/assets/fake-htmx.js"`},
	} {
		changed := strings.Replace(out.String(), mutation[0], mutation[1], 1)
		if changed == out.String() {
			t.Fatalf("mutation did not apply %v", mutation)
		}
		if err := palettesupplemental.Inspect(changed, "go-qualified", false, palettefixture.StandaloneIdentities()); err == nil {
			t.Fatalf("accepted drift %v", mutation)
		}
	}
}

func TestStandaloneSupplementalResolverSpellingsMatch(t *testing.T) {
	var qualified, chapter bytes.Buffer
	if err := dump(&qualified, "go-qualified", "/fragment"); err != nil {
		t.Fatal(err)
	}
	if err := dump(&chapter, "go-chapter", "/fragment"); err != nil {
		t.Fatal(err)
	}
	if qualified.String() != chapter.String() {
		t.Fatal("qualified and chapter resolver spellings rendered different content")
	}
}
