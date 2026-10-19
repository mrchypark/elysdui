// Package palettefixture supplies a test-only document shell and explicit source
// manifest. Production renderers provide every component; no SDUI import or
// palette interaction implementation belongs in this package.
package palettefixture

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const BaseCommit = "0a972e071452f7bdb9bc64f6d27d50c042108885"
const BaseTree = "c400233c889a6701682ded31429a3ce0127bacf0"
const Component = "navigation/CommandPalette"
const Label = "Command search"
const Placeholder = "Type a command"

type Spec struct {
	OwnerID     string `json:"ownerID"`
	ComponentID string `json:"componentID"`
	QueryName   string `json:"queryName"`
	Generation  string `json:"generation"`
	Peer        bool   `json:"peer"`
}

type Renderer func(io.Writer, Spec) error

func Primary(generation string) Spec {
	return Spec{"palette-primary", "palette-primary-component", "cmdQuery", generation, false}
}
func Peer() Spec {
	return Spec{"palette-peer", "palette-peer-component", "peerQuery", "original", true}
}

// GoProps is intentionally independent of the adapter's lower-camel JSON rows.
func GoProps(spec Spec) map[string]any {
	values := []string{"open-file", "option-file", "other-place", "disabled-open", "zebra-file"}
	if spec.Peer {
		values = []string{"peer-open", "peer-option", "peer-other", "peer-disabled", "peer-zebra"}
	}
	return map[string]any{
		"Label": Label, "Name": spec.QueryName, "Value": "", "Placeholder": Placeholder,
		"Items": []map[string]any{
			{"Label": "Open", "Value": values[0], "Action": "open-command", "Group": "Commands"},
			{"Label": "Option", "Value": values[1], "Action": "option-command", "Group": "Commands"},
			{"Label": "Other place", "Value": values[2], "Action": "other-command", "Group": "Commands"},
			{"Label": "Open disabled", "Value": values[3], "Action": "disabled-command", "Group": "Commands", "Disabled": true},
			{"Label": "Zebra", "Value": values[4], "Action": "zebra-command", "Group": "Commands"},
		},
	}
}

func WriteOwner(w io.Writer, render Renderer, spec Spec) error {
	if spec != Primary(spec.Generation) && spec != Peer() {
		return fmt.Errorf("invalid palette fixture spec")
	}
	if spec.Generation != "original" && spec.Generation != "fresh" {
		return fmt.Errorf("invalid fixture generation %q", spec.Generation)
	}
	if _, err := fmt.Fprintf(w, `<div id="%s" data-fixture-owner="%s" data-fixture-generation="%s">`, spec.OwnerID, spec.OwnerID, spec.Generation); err != nil {
		return err
	}
	if err := render(w, spec); err != nil {
		return err
	}
	_, err := io.WriteString(w, `</div>`)
	return err
}

func WritePage(w io.Writer, surface string, render Renderer, assets func(io.Writer) error) error {
	if surface != "go-qualified" && surface != "go-chapter" && surface != "sdui" {
		return fmt.Errorf("unknown palette surface %q", surface)
	}
	if _, err := io.WriteString(w, `<!doctype html><html><head><meta charset="utf-8"><title>CommandPalette query baseline</title><link rel="icon" href="data:,"><script src="/fixture-observer.js"></script><script src="/assets/htmx.min.js"></script>`); err != nil {
		return err
	}
	if err := assets(w); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, `<style>body{margin:24px}main{display:flex;gap:32px;align-items:start}#palette-owner-result{display:block;min-height:24px;margin-top:24px}</style></head><body data-fixture-surface="%s"><button id="palette-outside" type="button">Outside palette</button><button id="palette-swap" type="button" hx-get="/fragment" hx-target="#palette-primary" hx-swap="outerHTML">Replace primary palette</button><main>`, surface); err != nil {
		return err
	}
	for _, spec := range []Spec{Primary("original"), Peer()} {
		if err := WriteOwner(w, render, spec); err != nil {
			return err
		}
	}
	_, err := io.WriteString(w, `</main><output id="palette-owner-result" aria-live="polite"></output></body></html>`)
	return err
}

// SourcePaths is deliberately explicit: evidence must identify the real loaded
// runtime, shared renderer, fixture and typed adapter rather than a broad glob.
func SourcePaths(surface string) []string {
	paths := []string{
		"ui/gohtmx/component.go", "ui/gohtmx/ui.go", "ui/gohtmx/components.json",
		"ui/gohtmx/templates/ely-api.html", "ui/gohtmx/templates/ely-api-interaction.html", "ui/gohtmx/templates/ui-client.html",
		"ui/gohtmx/assets/htmx.min.js", "ui/gohtmx/assets/app.css", "ui/gohtmx/assets/ely-api.css", "ui/gohtmx/assets/ely-api-interaction.css",
		"ui/gohtmx/assets/ely-controls.css", "ui/gohtmx/assets/ely-patterns.css",
		"ui/gohtmx/assets/ely-controls.js", "ui/gohtmx/assets/ely-patterns.js",
		"ui/gohtmx/assets/ely-api.js", "ui/gohtmx/assets/ely-api-interaction.js", "ui/gohtmx/assets/ely-api-interaction-entry.js",
		"ui/gohtmx/tests/fixtures/palettefixture/fixture.go",
		"ui/gohtmx/tests/browser/palette-query-observer.js",
	}
	if surface == "sdui" {
		paths = append(paths, "adapters/gohtmx/tests/fixtures/palette-query/main.go", "adapters/gohtmx/catalogue.go", "adapters/gohtmx/catalogue_manifest.json.gz", "adapters/gohtmx/registry.go", "adapters/gohtmx/render.go", "adapters/gohtmx/assets/sdui.js", "adapters/gohtmx/assets/sdui.css", "sdui/schema.go", "sdui/compile.go", "sdui/resolve.go")
	} else {
		paths = append(paths, "ui/gohtmx/tests/fixtures/palette-query/main.go")
	}
	return paths
}

type Identity struct {
	OwnerID  string `json:"ownerID"`
	ScreenID string `json:"screenID,omitempty"`
	NodeID   string `json:"nodeID"`
	FamilyID string `json:"familyID"`
	DialogID string `json:"dialogID"`
	ResultID string `json:"resultID,omitempty"`
}

func StandaloneIdentities() []Identity {
	result := []Identity{}
	for _, spec := range []Spec{Primary("original"), Peer()} {
		result = append(result, Identity{OwnerID: spec.OwnerID, NodeID: spec.ComponentID, FamilyID: spec.ComponentID, DialogID: spec.ComponentID + "-palette"})
	}
	return result
}

type Source struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Bytes  int    `json:"bytes"`
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
			return "", fmt.Errorf("run palette fixture within repository")
		}
		dir = next
	}
}

func WriteManifest(w io.Writer, surface string, extra map[string]any) error {
	root, err := repositoryRoot()
	if err != nil {
		return err
	}
	sources := make([]Source, 0)
	for _, path := range SourcePaths(surface) {
		body, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(path)))
		if err != nil {
			return err
		}
		sources = append(sources, Source{path, fmt.Sprintf("%x", sha256.Sum256(body)), len(body)})
	}
	manifest := map[string]any{
		"identities":    StandaloneIdentities(),
		"schemaVersion": 1, "surface": surface, "component": Component,
		"baselineCommit": BaseCommit, "baselineTree": BaseTree, "productionMutation": "none",
		"owners": []Spec{Primary("original"), Peer()}, "replacement": Primary("fresh"),
		"initialQuery": "", "label": Label, "placeholder": Placeholder, "group": "Commands", "rowCount": 5,
		"rows": GoProps(Primary("original"))["Items"], "peerRows": GoProps(Peer())["Items"],
		"observerURL": "/fixture-observer.js", "hostResultID": "palette-owner-result", "sourceFiles": sources,
	}
	for key, value := range extra {
		manifest[key] = value
	}
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	return encoder.Encode(manifest)
}
