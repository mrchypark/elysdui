// Package paletteactivation owns test-only supplemental activation data. It
// reuses the original shell and actual renderers without replacing runtime UI.
package paletteactivation

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/palettefixture"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const BaseCommit = "ee28495c7cd6581d49d53874e831c6cea40930a4"
const BaseTree = "c2d6ed91c378f59070fde8d626df2748e9fd837c"

func Variant(route string) string {
	switch route {
	case "/empty-initial":
		return "initial"
	case "/empty-disabled":
		return "disabled"
	default:
		return "full"
	}
}
func Props(spec palettefixture.Spec, variant string) map[string]any {
	props := palettefixture.GoProps(spec)
	if !spec.Peer {
		if variant == "initial" {
			props["Items"] = []map[string]any{}
		}
		if variant == "disabled" {
			for _, row := range props["Items"].([]map[string]any) {
				row["Disabled"] = true
			}
		}
	}
	return props
}
func Page(w io.Writer, surface string, render palettefixture.Renderer, assets func(io.Writer) error) error {
	var out bytes.Buffer
	if err := palettefixture.WritePage(&out, surface, render, assets); err != nil {
		return err
	}
	markup := strings.Replace(out.String(), `<script src="/fixture-observer.js"></script>`, `<script src="/fixture-observer.js"></script><script src="/activation-observer.js"></script>`, 1)
	markup = strings.Replace(markup, `<button id="palette-outside" type="button">Outside palette</button>`, `<input id="palette-peer-field" aria-label="Outside callback field" value="peer unchanged">`, 1)
	_, err := io.WriteString(w, markup)
	return err
}
func SourcePaths(surface string) []string {
	paths := []string{}
	for _, path := range palettefixture.SourcePaths(surface) {
		if path == "ui/gohtmx/tests/fixtures/palette-query/main.go" || path == "adapters/gohtmx/tests/fixtures/palette-query/main.go" {
			continue
		}
		paths = append(paths, path)
	}
	paths = append(paths, "ui/gohtmx/tests/fixtures/paletteactivation/fixture.go", "ui/gohtmx/tests/fixtures/paletteactivation/verify.go", "ui/gohtmx/tests/browser/palette-activation-observer.js")
	if surface == "sdui" {
		return append(paths, "adapters/gohtmx/tests/fixtures/palette-activation/main.go", "adapters/gohtmx/tests/fixtures/palette-activation/main_test.go")
	}
	return append(paths, "ui/gohtmx/tests/fixtures/palette-activation/main.go", "ui/gohtmx/tests/fixtures/palette-activation/main_test.go")
}
func Manifest(w io.Writer, surface string, extra map[string]any) error {
	root, err := os.Getwd()
	if err != nil {
		return err
	}
	for {
		if _, err := os.Stat(filepath.Join(root, "go.mod")); err == nil {
			break
		}
		parent := filepath.Dir(root)
		if parent == root {
			return fmt.Errorf("run activation fixture within repository")
		}
		root = parent
	}
	sources := []palettefixture.Source{}
	for _, path := range SourcePaths(surface) {
		body, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(path)))
		if err != nil {
			return err
		}
		sources = append(sources, palettefixture.Source{Path: path, SHA256: fmt.Sprintf("%x", sha256.Sum256(body)), Bytes: len(body)})
	}
	extra["sourceFiles"] = sources
	extra["suite"] = "palette-activation"
	extra["classification"] = "supplemental activation and empty-confirmation baseline; close-rebind cancellation is added web ownership policy, not native parity"
	extra["activationBaselineCommit"] = BaseCommit
	extra["activationBaselineTree"] = BaseTree
	extra["productionReference"] = "activation baseline is immutable; current source and served policy are recorded by the loader"
	extra["activationObserverURL"] = "/activation-observer.js"
	extra["variants"] = map[string]any{"full": Props(palettefixture.Primary("original"), "full")["Items"], "initial": Props(palettefixture.Primary("original"), "initial")["Items"], "disabled": Props(palettefixture.Primary("original"), "disabled")["Items"]}
	return palettefixture.WriteManifest(w, surface, extra)
}
