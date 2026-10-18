package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestExportPreservesAssetsAndDoesNotOverwrite(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "ui")
	if err := export(dir); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"templates/shadcn-input.html", "assets/ely/LICENSE.txt", "assets/geist.woff2", "components.json", "LICENSE", "THIRD_PARTY_UI.md"} {
		original, err := ui.Files.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		copied, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(name)))
		if err != nil || !bytes.Equal(copied, original) {
			t.Fatalf("export %s: %v", name, err)
		}
	}
	path := filepath.Join(dir, "templates/shadcn-input.html")
	if err := os.WriteFile(path, []byte("user customization"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := export(dir); err == nil {
		t.Fatal("export replaced an existing directory")
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "user customization" {
		t.Fatal("customization was changed")
	}
}
