package main

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/searchablefixture"
)

func TestProductionStandaloneSearchableFixtures(t *testing.T) {
	for _, mode := range []string{"qualified", "chapter"} {
		render, err := renderer(mode)
		if err != nil {
			t.Fatal(err)
		}
		for _, full := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/full=%t", mode, full), func(t *testing.T) {
				spec := searchablefixture.Spec{ID: "primary"}
				var out bytes.Buffer
				if err := searchablefixture.Write(&out, render, full, spec); err != nil {
					t.Fatal(err)
				}
				if err := searchablefixture.Inspect(out.String(), full, false, spec); err != nil {
					t.Fatal(err)
				}
			})
		}
		for _, kind := range []string{"", "empty", "alloff"} {
			t.Run(mode+"/replacement/"+kind, func(t *testing.T) {
				spec := searchablefixture.Spec{ID: "replacement-owner", Rows: kind}
				var out bytes.Buffer
				if err := searchablefixture.Write(&out, render, false, spec); err != nil {
					t.Fatal(err)
				}
				if err := searchablefixture.Inspect(out.String(), false, false, spec); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
}

func TestStandaloneSearchableRejectsInvalidModesAndComponentNames(t *testing.T) {
	if _, err := renderer("sdui"); err == nil {
		t.Fatal("invalid standalone mode was accepted")
	}
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"searchablemenu", "FilterableMenu"} {
		for _, mode := range []string{"qualified", "chapter"} {
			component := ui.Component{Name: "menus/" + name, ID: "primary", Props: searchablefixture.GoProps(searchablefixture.Spec{})}
			if mode == "chapter" {
				component.Chapter, component.Name = "menus", name
			}
			if err := ui.RenderComponent(tpl, &bytes.Buffer{}, component); err == nil {
				t.Fatalf("%s accepted non-public component %s", mode, name)
			}
		}
	}
}

func TestStandaloneSearchableDefaultAccessibleLabel(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	props := searchablefixture.GoProps(searchablefixture.Spec{})
	delete(props, "Placeholder")
	var out bytes.Buffer
	if err := ui.RenderComponent(tpl, &out, ui.Component{Name: "menus/SearchableMenu", ID: "fallback", Props: props}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), `type="search" aria-label="Find a place" value="root-query" placeholder="" data-interaction-filter`) {
		t.Fatal("production search input lost its fallback accessible label")
	}
}

func TestSearchableInspectionRejectsMarkupDrift(t *testing.T) {
	render, err := renderer("qualified")
	if err != nil {
		t.Fatal(err)
	}
	spec := searchablefixture.Spec{ID: "primary"}
	var out bytes.Buffer
	if err := searchablefixture.Write(&out, render, true, spec); err != nil {
		t.Fatal(err)
	}
	markup := out.String()
	if err := searchablefixture.Inspect(markup, true, false, spec); err != nil {
		t.Fatal(err)
	}
	cases := []struct{ name, old, replacement string }{
		{"duplicate-id", `id="peer"`, `id="primary"`},
		{"wrong-component", `data-ely-component="menus/SearchableMenu"`, `data-ely-component="menus/Menu"`},
		{"unescaped-label", `Search commands &lt;safe&gt;`, `Search commands <safe>`},
		{"unescaped-placeholder", `Find commands &lt;safe&gt;`, `Find commands <safe>`},
		{"wrong-heading", `Commands &lt;safe&gt;`, `Wrong heading`},
		{"wrong-panel-owner", `aria-controls="primary-search-menu"`, `aria-controls="peer-search-menu"`},
		{"missing-panel-marker", `data-interaction-search-menu`, `data-wrong-search-menu`},
		{"missing-input-marker", `data-interaction-filter`, `data-wrong-filter`},
		{"wrong-input-type", `type="search"`, `type="text"`},
		{"wrong-accessible-label", `aria-label="Find commands &lt;safe&gt;"`, `aria-label="Wrong label"`},
		{"wrong-placeholder", `placeholder="Find commands &lt;safe&gt;"`, `placeholder="Wrong placeholder"`},
		{"wrong-root-query", `value="root-query"`, `value="alpha-one"`},
		{"disabled-query", `data-interaction-filter`, `data-interaction-filter disabled`},
		{"leaf-uses-root-query", `value="alpha-one"`, `value="root-query"`},
		{"wrong-action", `data-ely-action="choose-one"`, `data-ely-action="choose-two"`},
		{"wrong-label", `>Alpha one</span>`, `>Alpha two</span>`},
		{"enabled-blocked-row", `data-ely-action="blocked-action" disabled`, `data-ely-action="blocked-action"`},
		{"disabled-enabled-row", `value="alpha-one"`, `value="alpha-one" disabled`},
		{"fixture-hides-unrelated", `value="hidden"`, `value="hidden" hidden`},
		{"wrong-row-role", `role="menuitem" value="hidden"`, `role="menuitemcheckbox" value="hidden"`},
		{"unexpected-checkbox-state", `value="alpha-one"`, `value="alpha-one" aria-checked="false"`},
		{"wrong-slot", `data-fixture-slot="peer"`, `data-fixture-slot="primary"`},
		{"missing-shell-script", `src="/assets/htmx.min.js"`, `src="/assets/wrong.js"`},
		{"inline-script", `</head>`, `<script>window.fixtureBehavior = true</script></head>`},
		{"inline-handler", `id="swap-source"`, `id="swap-source" onclick="void 0"`},
		{"wrong-caller-value", `value="caller-value"`, `value="wrong-value"`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mutated := strings.Replace(markup, tc.old, tc.replacement, 1)
			if mutated == markup {
				t.Fatalf("mutation %q did not apply", tc.old)
			}
			if err := searchablefixture.Inspect(mutated, true, false, spec); err == nil {
				t.Fatal("inspection accepted broken fixture contract")
			}
		})
	}
}
