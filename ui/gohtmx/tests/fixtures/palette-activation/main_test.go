package main

import (
	"bytes"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/paletteactivation"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/palettefixture"
	"strings"
	"testing"
)

func TestActivationProductionFixtures(t *testing.T) {
	for _, surface := range []string{"go-qualified", "go-chapter"} {
		for _, route := range []string{"/", "/empty-initial", "/empty-disabled"} {
			var out bytes.Buffer
			if err := dump(&out, surface, route); err != nil {
				t.Fatal(err)
			}
			if err := paletteactivation.Inspect(out.String(), surface, paletteactivation.Variant(route), palettefixture.StandaloneIdentities()); err != nil {
				t.Fatal(surface, route, err)
			}
			for _, pair := range [][2]string{{`name="cmdQuery"`, `name="wrong"`}, {`data-ely-submit="run"`, `data-ely-submit="wrong"`}, {`src="/activation-observer.js"`, `src="/wrong.js"`}} {
				changed := strings.Replace(out.String(), pair[0], pair[1], 1)
				if changed == out.String() {
					t.Fatal("missing corruption target")
				}
				if paletteactivation.Inspect(changed, surface, paletteactivation.Variant(route), palettefixture.StandaloneIdentities()) == nil {
					t.Fatal("accepted corruption", pair)
				}
			}
		}
	}
}
func TestResolverIdentity(t *testing.T) {
	for _, route := range []string{"/empty-initial", "/empty-disabled"} {
		var a, b bytes.Buffer
		_ = dump(&a, "go-qualified", route)
		_ = dump(&b, "go-chapter", route)
		if strings.Replace(a.String(), `data-fixture-surface="go-qualified"`, `data-fixture-surface="go-chapter"`, 1) != b.String() {
			t.Fatal("resolver drift")
		}
	}
}
