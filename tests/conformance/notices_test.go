package conformance_test

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestEmbeddedNoticesMatchCanonicalSources(t *testing.T) {
	for _, name := range []string{"LICENSE", "THIRD_PARTY_UI.md"} {
		want, err := os.ReadFile(filepath.Join("..", "..", name))
		if err != nil {
			t.Fatal(err)
		}
		got, err := os.ReadFile(filepath.Join("..", "..", "ui", "gohtmx", name))
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(got, want) {
			t.Fatalf("%s embed copy is stale; run node scripts/sync-ui-notices.mjs", name)
		}
	}
}
