package conformance_test

import (
	"encoding/json"
	"io"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Check the actual dependency graph, not package names in a design document.
func TestPackageDependencyBoundaries(t *testing.T) {
	root := filepath.Join("..", "..")
	for _, tc := range []struct {
		target    string
		forbidden []string
	}{
		{"./ui/gohtmx", []string{"github.com/mrchypark/elysdui/sdui", "github.com/mrchypark/elysdui/adapters/"}},
		{"./sdui", []string{"github.com/mrchypark/elysdui/ui/", "github.com/mrchypark/elysdui/adapters/", "html/template", "golang.org/x/net/html", "github.com/yuin/goldmark/"}},
		{"./examples/gohtmx/...", []string{"github.com/mrchypark/elysdui/sdui", "github.com/mrchypark/elysdui/adapters/"}},
	} {
		t.Run(tc.target, func(t *testing.T) {
			cmd := exec.Command("go", "list", "-buildvcs=false", "-deps", "-json", tc.target)
			cmd.Dir = root
			output, err := cmd.Output()
			if err != nil {
				if failure, ok := err.(*exec.ExitError); ok {
					t.Fatalf("dependency listing: %v: %s", err, failure.Stderr)
				}
				t.Fatalf("dependency listing: %v", err)
			}
			decoder := json.NewDecoder(strings.NewReader(string(output)))
			for {
				var p struct{ ImportPath string }
				if err := decoder.Decode(&p); err == io.EOF {
					break
				} else if err != nil {
					t.Fatal(err)
				}
				if strings.HasPrefix(p.ImportPath, "github.com/mrchypark/ely-htmx") {
					t.Errorf("legacy module dependency: %s", p.ImportPath)
				}
				for _, forbidden := range tc.forbidden {
					if p.ImportPath == forbidden || strings.HasSuffix(forbidden, "/") && strings.HasPrefix(p.ImportPath, forbidden) {
						t.Errorf("%s must not depend on %s", tc.target, p.ImportPath)
					}
				}
			}
		})
	}
}
