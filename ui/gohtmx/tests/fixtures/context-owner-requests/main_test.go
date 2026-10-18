package main

import (
	"bytes"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/contextfixture"
	"testing"
)

func TestProductionStandaloneOwnerFixtures(t *testing.T) {
	render, err := renderer()
	if err != nil {
		t.Fatal(err)
	}
	for _, full := range []bool{false, true} {
		var out bytes.Buffer
		spec := contextfixture.Spec{ID: "manual", Component: "ContextMenu", Mode: "manual", Number: "18446744073709551615", X: 0, Y: 0}
		if err := contextfixture.Write(&out, render, full, spec); err != nil {
			t.Fatal(err)
		}
		if err := contextfixture.Inspect(out.String(), full, false); err != nil {
			t.Fatal(err)
		}
	}
}
