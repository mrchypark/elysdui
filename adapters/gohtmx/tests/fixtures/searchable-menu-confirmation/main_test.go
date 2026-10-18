package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	gohtmx "github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/searchablefixture"
)

func TestRealCatalogueSearchableFixtures(t *testing.T) {
	render, err := renderer()
	if err != nil {
		t.Fatal(err)
	}
	for _, full := range []bool{false, true} {
		t.Run(fmt.Sprintf("full=%t", full), func(t *testing.T) {
			spec := searchablefixture.Spec{ID: "primary"}
			var out bytes.Buffer
			if err := searchablefixture.Write(&out, render, full, spec); err != nil {
				t.Fatal(err)
			}
			if err := searchablefixture.Inspect(out.String(), full, true, spec); err != nil {
				t.Fatal(err)
			}
		})
	}
	for _, kind := range []string{"", "empty", "alloff"} {
		t.Run("replacement/"+kind, func(t *testing.T) {
			spec := searchablefixture.Spec{ID: "replacement-owner", Rows: kind}
			var out bytes.Buffer
			if err := searchablefixture.Write(&out, render, false, spec); err != nil {
				t.Fatal(err)
			}
			markup := out.String()
			if err := searchablefixture.Inspect(markup, false, true, spec); err != nil {
				t.Fatal(err)
			}
			for _, old := range []string{`data-sdui-screen="replacement-owner-screen"`, `id="replacement-owner-screen"`, `data-sdui-node="menus/SearchableMenu"`} {
				mutated := strings.Replace(markup, old, "", 1)
				if mutated == markup {
					t.Fatalf("screen mutation %q did not apply", old)
				}
				if err := searchablefixture.Inspect(mutated, false, true, spec); err == nil {
					t.Fatalf("inspection accepted missing %s", old)
				}
			}
		})
	}
}

func TestCatalogueSearchableRejectsWrongCaseAndUnknownNames(t *testing.T) {
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := wireScreen(searchablefixture.Spec{ID: "primary"})
	if err != nil {
		t.Fatal(err)
	}
	screen, err := gohtmx.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := gohtmx.Compile(screen, registry); err != nil {
		t.Fatalf("baseline authored wire screen is invalid: %v", err)
	}
	cases := []struct{ name, old, replacement string }{
		{"component-case", `menus/SearchableMenu`, `menus/searchablemenu`},
		{"unknown-alias", `menus/SearchableMenu`, `menus/FilterableMenu`},
		{"root-prop-case", `"value":"root-query"`, `"Value":"root-query"`},
		{"item-prop-case", `"action":"hidden-action"`, `"Action":"hidden-action"`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mutated := strings.Replace(string(raw), tc.old, tc.replacement, 1)
			if mutated == string(raw) {
				t.Fatalf("wire mutation %q did not apply", tc.old)
			}
			screen, err := gohtmx.Decode(strings.NewReader(mutated))
			if err == nil {
				_, err = gohtmx.Compile(screen, registry)
			}
			if err == nil {
				t.Fatal("real catalogue accepted an invalid wire contract")
			}
		})
	}
}

func TestCatalogueSearchableDefaultAccessibleLabel(t *testing.T) {
	raw, err := wireScreen(searchablefixture.Spec{ID: "fallback"})
	if err != nil {
		t.Fatal(err)
	}
	var authored map[string]any
	if err := json.Unmarshal(raw, &authored); err != nil {
		t.Fatal(err)
	}
	delete(authored["root"].(map[string]any)["props"].(map[string]any), "placeholder")
	raw, err = json.Marshal(authored)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	screen, err := gohtmx.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	plan, err := gohtmx.Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := plan.Render(&out, gohtmx.RenderContext{}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), `type="search" aria-label="Find a place" value="root-query" placeholder="" data-interaction-filter`) {
		t.Fatal("catalogue search input lost its fallback accessible label")
	}
}
