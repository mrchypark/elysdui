// Package palettesupplemental owns new repair-only ranking and long-list data.
// It has no SDUI dependency. The original nine-case fixture is unchanged.
package palettesupplemental

import (
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/palettefixture"
)

const Count = 40

// RepairCommit identifies the reviewed production revision exercised by this new suite.
const RepairCommit = "6ec664b1b2dfebd324e8054fdf608665cbaf18cc"
const RepairTree = "73b4f7df3525fceabdcdaf5f4cc54bd7ead07972"

func Props(spec palettefixture.Spec) map[string]any {
	props := palettefixture.GoProps(spec)
	rows := props["Items"].([]map[string]any)
	for i := 1; i <= Count; i++ {
		value := fmt.Sprintf("entry-%02d", i)
		if spec.Peer {
			value = "peer-" + value
		}
		rows = append(rows, map[string]any{"Label": fmt.Sprintf("Entry %02d", i), "Value": value, "Action": "entry-command", "Group": "Commands", "Disabled": i == 7})
	}
	props["Items"] = rows
	return props
}
func Page(w io.Writer, surface string, render palettefixture.Renderer, assets func(io.Writer) error) error {
	return palettefixture.WritePage(w, surface, render, func(w io.Writer) error {
		if err := assets(w); err != nil {
			return err
		}
		_, err := io.WriteString(w, `<script src="/supplemental-observer.js"></script>`)
		return err
	})
}

// SourcePaths identifies the sources actually used by this supplemental fixture.
// The original baseline fixture and its provenance remain byte-for-byte unchanged.
func SourcePaths(surface string) []string {
	paths := []string{}
	for _, path := range palettefixture.SourcePaths(surface) {
		if path == "ui/gohtmx/tests/fixtures/palette-query/main.go" || path == "adapters/gohtmx/tests/fixtures/palette-query/main.go" {
			continue
		}
		paths = append(paths, path)
	}
	paths = append(paths,
		"ui/gohtmx/tests/fixtures/palettesupplemental/fixture.go",
		"ui/gohtmx/tests/fixtures/palettesupplemental/fixture_test.go",
		"ui/gohtmx/tests/fixtures/palettesupplemental/verify.go",
		"ui/gohtmx/tests/browser/palette-query-supplemental-observer.js")
	if surface == "sdui" {
		return append(paths, "adapters/gohtmx/tests/fixtures/palette-supplemental/main.go", "adapters/gohtmx/tests/fixtures/palette-supplemental/main_test.go")
	}
	return append(paths, "ui/gohtmx/tests/fixtures/palette-supplemental/main.go", "ui/gohtmx/tests/fixtures/palette-supplemental/main_test.go")
}

func repositoryRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			if _, err := os.Stat(filepath.Join(dir, "ui/gohtmx/component.go")); err == nil {
				return dir, nil
			}
		}
		next := filepath.Dir(dir)
		if next == dir {
			return "", fmt.Errorf("run supplemental palette fixture within repository")
		}
		dir = next
	}
}

func Manifest(w io.Writer, surface string, extra map[string]any) error {
	if surface != "go-qualified" && surface != "go-chapter" && surface != "sdui" {
		return fmt.Errorf("unknown supplemental palette surface %q", surface)
	}
	root, err := repositoryRoot()
	if err != nil {
		return err
	}
	sources := []palettefixture.Source{}
	for _, path := range SourcePaths(surface) {
		body, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(path)))
		if err != nil {
			return err
		}
		sources = append(sources, palettefixture.Source{Path: path, SHA256: fmt.Sprintf("%x", sha256.Sum256(body)), Bytes: len(body)})
	}
	// Do not mutate caller metadata or allow it to replace fixed suite provenance.
	metadata := map[string]any{}
	for key, value := range extra {
		metadata[key] = value
	}
	metadata["sourceFiles"] = sources
	metadata["suite"] = "palette-query-supplemental"
	metadata["classification"] = "new repair coverage; no retroactive baseline credit"
	metadata["productionMutation"] = "reviewed CommandPalette repair; causal served-byte variants declared separately by invocation"
	metadata["repairCommit"] = RepairCommit
	metadata["repairTree"] = RepairTree
	metadata["rowCount"] = 5 + Count
	metadata["rows"] = Props(palettefixture.Primary("original"))["Items"]
	metadata["peerRows"] = Props(palettefixture.Peer())["Items"]
	metadata["supplementalObserverURL"] = "/supplemental-observer.js"
	metadata["routes"] = []string{"/", "/fragment", "/manifest.json"}
	if surface == "sdui" {
		metadata["routes"] = []string{"/", "/fragment", "/manifest.json", "/sdui-response-primary", "/sdui-response-peer"}
	}
	return palettefixture.WriteManifest(w, surface, metadata)
}
