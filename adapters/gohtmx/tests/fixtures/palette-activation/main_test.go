package main

import (
	"bytes"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/paletteactivation"
	"strings"
	"testing"
)

func TestActivationCompiledFixtures(t *testing.T) {
	for _, route := range []string{"/", "/empty-initial", "/empty-disabled"} {
		var out bytes.Buffer
		if err := dump(&out, "sdui", route); err != nil {
			t.Fatal(err)
		}
		if err := paletteactivation.Inspect(out.String(), "sdui", paletteactivation.Variant(route), identities()); err != nil {
			t.Fatal(route, err)
		}
		for _, pair := range [][2]string{{`&#34;sourceAction&#34;:&#34;run&#34;`, `&#34;sourceAction&#34;:&#34;not-run&#34;`}, {`&#34;action&#34;:&#34;query-observed&#34;`, `&#34;action&#34;:&#34;wrong&#34;`}, {`data-ely-submit="run"`, `data-ely-submit="wrong"`}} {
			changed := strings.Replace(out.String(), pair[0], pair[1], 1)
			if changed == out.String() {
				t.Fatal("missing mutation", pair)
			}
			if paletteactivation.Inspect(changed, "sdui", paletteactivation.Variant(route), identities()) == nil {
				t.Fatal("accepted route corruption", pair)
			}
		}
	}
}
