package main

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/pointerfixture"
)

func TestProductionStandalonePointerFixtures(t *testing.T) {
	for _, mode := range []string{"qualified", "chapter"} {
		render, err := renderer(mode)
		if err != nil {
			t.Fatal(err)
		}
		for _, alias := range pointerfixture.Aliases() {
			for _, full := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s/%s/full=%t", mode, alias, full), func(t *testing.T) {
					var out bytes.Buffer
					spec := pointerfixture.Spec{ID: "primary", Component: alias}
					if err := pointerfixture.Write(&out, render, full, spec); err != nil {
						t.Fatal(err)
					}
					if err := pointerfixture.Inspect(out.String(), full, false, spec); err != nil {
						t.Fatal(err)
					}
				})
			}
		}
	}
}

func TestStandalonePointerFragmentOwnerID(t *testing.T) {
	for _, mode := range []string{"qualified", "chapter"} {
		render, err := renderer(mode)
		if err != nil {
			t.Fatal(err)
		}
		spec := pointerfixture.Spec{ID: "replacement-owner", Component: "ContextMenu"}
		var out bytes.Buffer
		if err := pointerfixture.Write(&out, render, false, spec); err != nil {
			t.Fatal(err)
		}
		if err := pointerfixture.Inspect(out.String(), false, false, spec); err != nil {
			t.Fatal(err)
		}
	}
}

func TestStandalonePointerRejectsInvalidModesAndAliases(t *testing.T) {
	if _, err := renderer("sdui"); err == nil {
		t.Fatal("invalid standalone mode was accepted")
	}
	render, err := renderer("qualified")
	if err != nil {
		t.Fatal(err)
	}
	if err := pointerfixture.Write(&bytes.Buffer{}, render, false, pointerfixture.Spec{ID: "primary", Component: "menu"}); err == nil {
		t.Fatal("non-public alias was accepted")
	}
}

func TestPointerInspectionRejectsMarkupDrift(t *testing.T) {
	render, err := renderer("qualified")
	if err != nil {
		t.Fatal(err)
	}
	spec := pointerfixture.Spec{ID: "primary", Component: "Menu"}
	var out bytes.Buffer
	if err := pointerfixture.Write(&out, render, true, spec); err != nil {
		t.Fatal(err)
	}
	markup := out.String()
	if err := pointerfixture.Inspect(markup, true, false, spec); err != nil {
		t.Fatal(err)
	}
	cases := []struct{ name, old, replacement string }{
		{"duplicate-id", `id="peer"`, `id="primary"`},
		{"wrong-component", `data-ely-component="menus/Menu"`, `data-ely-component="menus/SubMenu"`},
		{"unescaped-label", `First &lt;safe&gt;`, `First <safe>`},
		{"wrong-role", `role="menuitem" value="first"`, `role="menuitemcheckbox" value="first"`},
		{"disabled-leaf", `value="first"`, `value="first" disabled`},
		{"wrong-action", `data-ely-action="first-action"`, `data-ely-action="wrong-action"`},
		{"wrong-child-owner", `aria-controls="primary-sub-6"`, `aria-controls="peer-sub-6"`},
		{"missing-empty-panel", `id="primary-sub-9"`, `id="missing-empty-panel"`},
		{"wrong-radio-group", `data-interaction-menu-radio="density"`, `data-interaction-menu-radio="theme"`},
		{"wrong-radio-selection", `aria-checked="true"`, `aria-checked="false"`},
		{"missing-icon", `data-interaction-icon="circle"`, `data-interaction-icon="square"`},
		{"missing-branch-icon", `data-interaction-icon="circle" aria-hidden="true"></span><span data-interaction-menu-label>Branch</span>`, `aria-hidden="true"></span><span data-interaction-menu-label>Branch</span>`},
		{"missing-disabled-branch-icon", `data-interaction-icon="circle" aria-hidden="true"></span><span data-interaction-menu-label>Unavailable branch</span>`, `aria-hidden="true"></span><span data-interaction-menu-label>Unavailable branch</span>`},
		{"missing-empty-child-icon", `data-interaction-icon="circle" aria-hidden="true"></span><span data-interaction-menu-label>Empty child</span>`, `aria-hidden="true"></span><span data-interaction-menu-label>Empty child</span>`},
		{"missing-alloff-child-icon", `data-interaction-icon="circle" aria-hidden="true"></span><span data-interaction-menu-label>All unavailable child</span>`, `aria-hidden="true"></span><span data-interaction-menu-label>All unavailable child</span>`},
		{"missing-heading", `Commands &lt;safe&gt;`, `Wrong heading`},
		{"missing-shell-script", `src="/assets/htmx.min.js"`, `src="/assets/wrong.js"`},
		{"wrong-form-value", `value="caller-value"`, `value="wrong-value"`},
		{"wrong-manual-mode", `data-ely-context-mode="manual"`, `data-ely-context-mode="automatic"`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mutated := strings.Replace(markup, tc.old, tc.replacement, 1)
			if mutated == markup {
				t.Fatalf("mutation %q did not apply", tc.old)
			}
			if err := pointerfixture.Inspect(mutated, true, false, spec); err == nil {
				t.Fatal("inspection accepted broken fixture contract")
			}
		})
	}
}
