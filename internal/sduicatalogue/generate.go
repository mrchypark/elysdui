package sduicatalogue

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	gallery "github.com/mrchypark/elysdui/internal/gallery"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"sort"
	"strings"
)

// Build derives deterministic metadata and separate test-only caller values.
func Build() (Manifest, []TestFixture, error) {
	manifest := Manifest{Version: "1"}
	tpl, err := ui.NewTemplates()
	if err != nil {
		return manifest, nil, err
	}
	defs, err := ui.ComponentDefinitions()
	if err != nil {
		return manifest, nil, err
	}
	chapters, err := ui.Catalogue()
	if err != nil {
		return manifest, nil, err
	}
	manifest.Primaries = len(defs)
	manifest.Chapters = len(chapters)
	raw := gallery.SDUIFixtures()
	byName := map[string][]Fixture{}
	for _, f := range raw {
		key := f.Component.Chapter + "/" + f.Component.Name
		byName[key] = append(byName[key], Fixture{Name: key, Props: f.Component.Props, Source: f.Source})
		if strings.HasPrefix(f.Source, "fixture:") {
			manifest.SourceFixtures++
		} else {
			manifest.PreviewFixtures++
		}
	}
	names := map[string]bool{}
	for _, d := range defs {
		for _, name := range append([]string{d.Name}, d.Aliases...) {
			names[d.Chapter+"/"+name] = true
		}
	}
	manifest.QualifiedNames = len(names)
	manifest.BasicTemplates = len(BasicNames())
	inputs := map[string][]Fixture{}
	contracts := map[string]Contract{}
	for _, key := range sortedKeys(names) {
		d, err := ui.ResolveComponent("", key)
		if err != nil {
			return manifest, nil, err
		}
		name := strings.SplitN(key, "/", 2)[1]
		samples := byName[key]
		if len(samples) == 0 {
			samples = byName[d.Chapter+"/"+d.Name]
		}
		if len(samples) == 0 {
			return manifest, nil, fmt.Errorf("missing fixture %s", key)
		}
		for _, f := range samples {
			f.Name = key
			f.Props = gallery.SDUIAliasProps(f.Props, name)
			inputs[key] = append(inputs[key], f)
		}
		contracts[key] = Contract{Name: key, Chapter: d.Chapter, Component: name, Primary: d.Name, Family: d.Family, Events: []string{"click", "change", "ely:action", "ely:change"}, SandboxHTML: d.Chapter == "misc" && (d.Name == "WebView" || d.Name == "IframeEmbed")}
	}
	for _, f := range BasicFixtures() {
		inputs[f.Name] = append(inputs[f.Name], f)
		contracts[f.Name] = Contract{Name: f.Name, Template: f.Template, Events: []string{"click", "change", "ely:action", "ely:change"}}
	}
	fixtures := []TestFixture{}
	for _, key := range sortedKeys(contracts) {
		c := contracts[key]
		templateName := c.Template
		fixed := map[string]any{"ID": "generated-control"}
		if c.Component != "" {
			d, _ := ui.ResolveComponent(c.Chapter, c.Component)
			templateName = d.Template
			fixed["Kind"], fixed["Chapter"], fixed["Variant"], fixed["ComponentName"] = d.Name, d.Chapter, c.Component, c.Component
		}
		a := analyze(tpl, templateName, fixed)
		c.ContainsForm = a.forms
		c.Assets = sortedKeys(a.assets)
		full := Property{Type: "object", Properties: map[string]Property{}}
		canonical := []map[string]any{}
		for _, f := range inputs[key] {
			v, err := canonicalValue(f.Props)
			if err != nil {
				return manifest, nil, err
			}
			m := v.(map[string]any)
			canonical = append(canonical, m)
			full = merge(full, infer(m))
		}
		c.Properties, c.Excluded, err = schemaFor(full, a, c.SandboxHTML)
		if err != nil {
			return manifest, nil, fmt.Errorf("%s: %w", key, err)
		}
		if err := applyMapCoordinateTypes(&c); err != nil {
			return manifest, nil, fmt.Errorf("%s: %w", key, err)
		}
		applyContextRequestContract(&c)
		manifest.Contracts = append(manifest.Contracts, c)
		seen := map[string]int{}
		for i, f := range inputs[key] {
			props, excluded, err := project(Property{Type: "object", Properties: c.Properties}, canonical[i], "")
			if err != nil {
				return manifest, nil, fmt.Errorf("fixture %s: %w", key, err)
			}
			encoded, _ := json.Marshal(props)
			hash := string(encoded)
			if previous, exists := seen[hash]; exists {
				fixtures[previous].Sources = append(fixtures[previous].Sources, f.Source)
				continue
			}
			seen[hash] = len(fixtures)
			fixtures = append(fixtures, TestFixture{Name: key, Source: f.Source, Props: props.(map[string]any), Excluded: excluded})
		}
	}
	sort.Slice(fixtures, func(i, j int) bool {
		if fixtures[i].Name == fixtures[j].Name {
			return fixtures[i].Source < fixtures[j].Source
		}
		return fixtures[i].Name < fixtures[j].Name
	})
	// Hash source content, not modification times, and never the generated files.
	hash := sha256.New()
	data, _ := ui.Files.ReadFile("components.json")
	hash.Write(data)
	entries, _ := ui.Files.ReadDir("templates")
	for _, entry := range entries {
		if !entry.IsDir() {
			data, _ := ui.Files.ReadFile("templates/" + entry.Name())
			hash.Write([]byte(entry.Name()))
			hash.Write(data)
		}
	}
	evidence, _ := json.Marshal(fixtures)
	hash.Write(evidence)
	basic, _ := json.Marshal(BasicFixtures())
	hash.Write(basic)
	manifest.SourceHash = hex.EncodeToString(hash.Sum(nil))

	return manifest, fixtures, nil
}
func Encode() (manifest, fixtures []byte, err error) {
	m, f, err := Build()
	if err != nil {
		return nil, nil, err
	}
	manifest, err = json.Marshal(m)
	if err != nil {
		return nil, nil, err
	}
	fixtures, err = json.Marshal(f)
	if err != nil {
		return nil, nil, err
	}
	compress := func(data []byte) ([]byte, error) {
		var b bytes.Buffer
		w := gzip.NewWriter(&b)
		if _, err := w.Write(append(data, '\n')); err != nil {
			return nil, err
		}
		if err := w.Close(); err != nil {
			return nil, err
		}
		return b.Bytes(), nil
	}
	manifest, err = compress(manifest)
	if err != nil {
		return nil, nil, err
	}
	fixtures, err = compress(fixtures)
	return manifest, fixtures, err
}
