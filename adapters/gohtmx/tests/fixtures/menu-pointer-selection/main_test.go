package main

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/pointerfixture"
)

func TestRealCataloguePointerFixtures(t *testing.T) {
	render, err := renderer()
	if err != nil {
		t.Fatal(err)
	}
	for _, alias := range pointerfixture.Aliases() {
		for _, full := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/full=%t", alias, full), func(t *testing.T) {
				var out bytes.Buffer
				spec := pointerfixture.Spec{ID: "primary", Component: alias}
				if err := pointerfixture.Write(&out, render, full, spec); err != nil {
					t.Fatal(err)
				}
				if err := pointerfixture.Inspect(out.String(), full, true, spec); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
}

func TestCataloguePointerFragmentOwnerID(t *testing.T) {
	render, err := renderer()
	if err != nil {
		t.Fatal(err)
	}
	spec := pointerfixture.Spec{ID: "replacement-owner", Component: "ContextMenu"}
	var out bytes.Buffer
	if err := pointerfixture.Write(&out, render, false, spec); err != nil {
		t.Fatal(err)
	}
	if err := pointerfixture.Inspect(out.String(), false, true, spec); err != nil {
		t.Fatal(err)
	}
	markup := out.String()
	for _, old := range []string{`data-sdui-screen="replacement-owner-screen"`, `id="replacement-owner-screen"`} {
		mutated := strings.Replace(markup, old, "", 1)
		if mutated == markup {
			t.Fatalf("screen mutation %q did not apply", old)
		}
		if err := pointerfixture.Inspect(mutated, false, true, spec); err == nil {
			t.Fatalf("inspection accepted missing %s", old)
		}
	}
}
