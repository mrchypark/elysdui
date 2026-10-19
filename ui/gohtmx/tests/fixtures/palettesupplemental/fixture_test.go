package palettesupplemental

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/palettefixture"
)

func TestSupplementalPropsPreserveBaselineAndAppendExactLongList(t *testing.T) {
	for _, spec := range []palettefixture.Spec{palettefixture.Primary("original"), palettefixture.Primary("fresh"), palettefixture.Peer()} {
		baseline := palettefixture.GoProps(spec)
		props := Props(spec)
		rows := props["Items"].([]map[string]any)
		if len(rows) != 45 || Count != 40 {
			t.Fatalf("unexpected row count %d", len(rows))
		}
		if !reflect.DeepEqual(rows[:5], baseline["Items"]) {
			t.Fatalf("changed original rows: %v", rows[:5])
		}
		for _, key := range []string{"Label", "Name", "Value", "Placeholder"} {
			if props[key] != baseline[key] {
				t.Fatalf("changed original query prop %s", key)
			}
		}
		values := map[string]bool{}
		disabledCount := 0
		for index, row := range rows {
			value, ok := row["Value"].(string)
			if !ok || value == "" || values[value] {
				t.Fatalf("missing or duplicate fixed value at %d: %v", index, row)
			}
			values[value] = true
			if disabled, _ := row["Disabled"].(bool); disabled {
				disabledCount++
			}
			for key := range row {
				if key != "Label" && key != "Value" && key != "Action" && key != "Group" && key != "Disabled" {
					t.Fatalf("noncontract PascalCase prop %q", key)
				}
			}
			if index < 5 {
				continue
			}
			entry := index - 4
			wantValue := fmt.Sprintf("entry-%02d", entry)
			if spec.Peer {
				wantValue = "peer-" + wantValue
			}
			want := map[string]any{"Label": fmt.Sprintf("Entry %02d", entry), "Value": wantValue, "Action": "entry-command", "Group": "Commands", "Disabled": entry == 7}
			if !reflect.DeepEqual(row, want) {
				t.Fatalf("row %d got=%v want=%v", index, row, want)
			}
		}
		if disabledCount != 2 {
			t.Fatalf("disabled count %d", disabledCount)
		}
		// Every invocation must own its maps/slices, including baseline rows.
		rows[0]["Value"] = "mutated"
		rows[5]["Value"] = "mutated"
		if reflect.DeepEqual(rows, Props(spec)["Items"]) || len(palettefixture.GoProps(spec)["Items"].([]map[string]any)) != 5 {
			t.Fatal("fixture row state leaked across calls")
		}
	}
}

func TestSupplementalManifestTracksActualSources(t *testing.T) {
	root, err := repositoryRoot()
	if err != nil {
		t.Fatal(err)
	}
	for _, surface := range []string{"go-qualified", "go-chapter", "sdui"} {
		t.Run(surface, func(t *testing.T) {
			extra := map[string]any{"retained": "yes", "suite": "wrong", "rowCount": 0}
			before := map[string]any{"retained": "yes", "suite": "wrong", "rowCount": 0}
			var out bytes.Buffer
			if err := Manifest(&out, surface, extra); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(extra, before) {
				t.Fatalf("mutated caller metadata: %v", extra)
			}
			var manifest struct {
				Suite, Classification, RepairCommit, RepairTree, BaselineCommit, BaselineTree, Surface, SupplementalObserverURL, ProductionMutation, Retained string
				RowCount                                                                                                                                      int
				Rows, PeerRows                                                                                                                                []map[string]any
				Routes                                                                                                                                        []string
				SourceFiles                                                                                                                                   []palettefixture.Source
			}
			if err := json.Unmarshal(out.Bytes(), &manifest); err != nil {
				t.Fatal(err)
			}
			if manifest.Suite != "palette-query-supplemental" || manifest.Classification != "new repair coverage; no retroactive baseline credit" || manifest.RepairCommit != RepairCommit || manifest.RepairTree != RepairTree || manifest.BaselineCommit != palettefixture.BaseCommit || manifest.BaselineTree != palettefixture.BaseTree || manifest.Surface != surface || manifest.SupplementalObserverURL != "/supplemental-observer.js" || manifest.ProductionMutation != "reviewed CommandPalette repair; causal served-byte variants declared separately by invocation" || manifest.RowCount != 45 || manifest.Retained != "yes" {
				t.Fatal(out.String())
			}
			if !reflect.DeepEqual(manifest.Rows, Props(palettefixture.Primary("original"))["Items"]) || !reflect.DeepEqual(manifest.PeerRows, Props(palettefixture.Peer())["Items"]) {
				t.Fatal("manifest rows differ from fixed Go fixture data")
			}
			wantRoutes := []string{"/", "/fragment", "/manifest.json"}
			if surface == "sdui" {
				wantRoutes = append(wantRoutes, "/sdui-response-primary", "/sdui-response-peer")
			}
			if !reflect.DeepEqual(manifest.Routes, wantRoutes) {
				t.Fatalf("routes: %v", manifest.Routes)
			}
			paths := SourcePaths(surface)
			if len(manifest.SourceFiles) != len(paths) {
				t.Fatalf("source count %d, expected %d", len(manifest.SourceFiles), len(paths))
			}
			seen := map[string]bool{}
			for index, source := range manifest.SourceFiles {
				if source.Path != paths[index] || seen[source.Path] {
					t.Fatalf("wrong source order or duplicate: %v", source)
				}
				seen[source.Path] = true
				body, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(source.Path)))
				if err != nil {
					t.Fatal(err)
				}
				if source.SHA256 != fmt.Sprintf("%x", sha256.Sum256(body)) || source.Bytes != len(body) || source.Bytes == 0 {
					t.Fatalf("source content mismatch: %v", source)
				}
				if strings.Contains(source.Path, "/fixtures/palette-query/") {
					t.Fatalf("misattributed original renderer: %s", source.Path)
				}
				if surface != "sdui" && (strings.HasPrefix(source.Path, "adapters/") || strings.HasPrefix(source.Path, "sdui/")) {
					t.Fatalf("standalone SDUI dependency: %s", source.Path)
				}
			}
			selected := "ui/gohtmx/tests/fixtures/palette-supplemental/main.go"
			if surface == "sdui" {
				selected = "adapters/gohtmx/tests/fixtures/palette-supplemental/main.go"
			}
			for _, required := range []string{selected, strings.TrimSuffix(selected, ".go") + "_test.go", "ui/gohtmx/tests/fixtures/palettesupplemental/fixture.go", "ui/gohtmx/tests/fixtures/palettesupplemental/fixture_test.go", "ui/gohtmx/tests/fixtures/palettesupplemental/verify.go", "ui/gohtmx/tests/browser/palette-query-supplemental-observer.js", "ui/gohtmx/tests/fixtures/palettefixture/fixture.go", "ui/gohtmx/tests/browser/palette-query-observer.js", "ui/gohtmx/templates/ely-api-interaction.html", "ui/gohtmx/assets/ely-api-interaction.js"} {
				if !seen[required] {
					t.Fatalf("missing actual source: %s", required)
				}
			}
		})
	}
}

type failingWriter struct{ err error }

func (w failingWriter) Write([]byte) (int, error) { return 0, w.err }

func TestSupplementalShellAndManifestPropagateFailures(t *testing.T) {
	sentinel := errors.New("supplemental writer failure")
	goodRender := func(io.Writer, palettefixture.Spec) error { return nil }
	goodAssets := func(io.Writer) error { return nil }
	badRender := func(io.Writer, palettefixture.Spec) error { return sentinel }
	badAssets := func(io.Writer) error { return sentinel }
	for _, err := range []error{
		Page(failingWriter{sentinel}, "go-qualified", goodRender, goodAssets),
		Page(io.Discard, "go-qualified", badRender, goodAssets),
		Page(io.Discard, "go-qualified", goodRender, badAssets),
		Manifest(failingWriter{sentinel}, "go-qualified", nil),
	} {
		if !errors.Is(err, sentinel) {
			t.Fatalf("lost writer/render failure: %v", err)
		}
	}
	if err := Manifest(io.Discard, "unknown", nil); err == nil {
		t.Fatal("accepted unknown manifest surface")
	}
	if err := Page(io.Discard, "unknown", goodRender, goodAssets); err == nil {
		t.Fatal("accepted unknown page surface")
	}
	if err := Inspect("", "unknown", false, nil); err == nil {
		t.Fatal("accepted unknown inspection surface")
	}
	if err := Inspect("", "go-qualified", false, nil); err == nil {
		t.Fatal("accepted missing inspection identities")
	}
	t.Chdir(t.TempDir())
	if err := Manifest(io.Discard, "go-qualified", nil); err == nil {
		t.Fatal("manifest succeeded outside repository")
	}
}
