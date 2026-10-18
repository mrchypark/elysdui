package gohtmx

import (
	"bytes"
	"compress/gzip"
	_ "embed"
	"encoding/json"
	"fmt"
	"github.com/mrchypark/elysdui/sdui"
	"io"
)

//go:generate go run ../../cmd/sdui-catalogue -root ../..
//go:embed catalogue_manifest.json.gz
var catalogueManifest []byte

// CatalogueExclusion identifies an intentionally unavailable escape hatch.
type CatalogueExclusion struct {
	Path   string `json:"path"`
	Reason string `json:"reason"`
}

// CatalogueContract is a renderer-backed, recursively typed component contract.
// It contains no example data and never supplies gallery fixture defaults.
type CatalogueContract struct {
	Definition
	Primary  string               `json:"primary,omitempty"`
	Excluded []CatalogueExclusion `json:"excluded,omitempty"`
}

// CatalogueMetadata describes the source coverage represented by the manifest.
type CatalogueMetadata struct {
	Version         string `json:"version"`
	SourceHash      string `json:"sourceHash"`
	Primaries       int    `json:"primaries"`
	QualifiedNames  int    `json:"qualifiedNames"`
	Chapters        int    `json:"chapters"`
	BasicTemplates  int    `json:"basicTemplates"`
	SourceFixtures  int    `json:"sourceFixtures"`
	PreviewFixtures int    `json:"previewFixtures"`
}
type catalogueDocument struct {
	CatalogueMetadata
	Contracts []CatalogueContract `json:"contracts"`
}

// CatalogueContracts returns an independent copy, suitable for editor/tooling
// descriptions. Qualified names use the catalogue's exact alias spelling;
// public basic templates live under basic/<template-name>.
func CatalogueContracts() ([]CatalogueContract, error) {
	var doc catalogueDocument
	if err := decodeCatalogue(&doc); err != nil {
		return nil, fmt.Errorf("sdui: catalogue manifest: %w", err)
	}
	return doc.Contracts, nil
}
func CatalogueInfo() (CatalogueMetadata, error) {
	var doc catalogueDocument
	if err := decodeCatalogue(&doc); err != nil {
		return CatalogueMetadata{}, err
	}
	return doc.CatalogueMetadata, nil
}

// RegisterCatalogue atomically installs every reviewed catalogue/basic
// definition. The caller supplies all data; no gallery package is imported.
func RegisterCatalogue(r *Registry) error {
	if r == nil || r.templates == nil {
		return fmt.Errorf("sdui: registry requires templates")
	}
	contracts, err := CatalogueContracts()
	if err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	stage := NewRegistry(r.templates, WithURLPolicy(r.urlPolicy))
	stage.core = r.core.Clone(sdui.WithURLPolicy(r.urlPolicy))
	for name, d := range r.definitions {
		stage.definitions[name] = d
	}
	for _, c := range contracts {
		if err := stage.Register(c.Definition); err != nil {
			return fmt.Errorf("sdui: catalogue %s: %w", c.Name, err)
		}
	}
	r.core, r.definitions = stage.core, stage.definitions
	return nil
}

// CatalogueRegistry extends the ten backward-compatible core definitions
// with all catalogue aliases and public basic templates. External URLs require
// an explicit host policy; local absolute paths and fragments work by default.
func CatalogueRegistry(options ...RegistryOption) (*Registry, error) {
	r, err := DefaultRegistry()
	if err != nil {
		return nil, err
	}
	for _, option := range options {
		if option != nil {
			option(r)
		}
	}
	if err := RegisterCatalogue(r); err != nil {
		return nil, err
	}
	return r, nil
}

func decodeCatalogue(doc *catalogueDocument) error {
	reader, err := gzip.NewReader(bytes.NewReader(catalogueManifest))
	if err != nil {
		return err
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, 16<<20))
	if err != nil {
		return err
	}
	return json.Unmarshal(data, doc)
}
