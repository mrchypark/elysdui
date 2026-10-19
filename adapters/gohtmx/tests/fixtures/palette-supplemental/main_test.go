package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	gohtmx "github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/palettefixture"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/palettesupplemental"
)

func TestCompiledProductionPaletteFixtures(t *testing.T) {
	for _, route := range []string{"/", "/fragment"} {
		t.Run(route, func(t *testing.T) {
			var out bytes.Buffer
			if err := dump(&out, "sdui", route); err != nil {
				t.Fatal(err)
			}
			if err := palettesupplemental.Inspect(out.String(), "sdui", route == "/fragment", identities()); err != nil {
				t.Fatal(err)
			}
		})
	}
	for _, slot := range []string{"primary", "peer"} {
		var out bytes.Buffer
		if err := dump(&out, "sdui", "/sdui-response-"+slot); err != nil {
			t.Fatal(err)
		}
		for _, want := range []string{`<section id="palette-` + slot + `-result" data-sdui-region="palette-` + slot + `-result">`, `Command observed`} {
			if !strings.Contains(out.String(), want) {
				t.Fatalf("response lacks %s: %s", want, out.String())
			}
		}
		if strings.Contains(out.String(), "<script") || strings.Contains(out.String(), "data-ely-family") || strings.Contains(out.String(), "data-sdui-screen") {
			t.Fatal("response must contain only actual result region")
		}
	}
}

func TestCompiledPaletteSourceManifest(t *testing.T) {
	var out bytes.Buffer
	if err := dump(&out, "sdui", "/manifest.json"); err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Surface, ProductionMutation string
		SourceFiles                 []palettefixture.Source
		Identities                  []palettefixture.Identity
		SDUISourceActions           []string
	}
	if err := json.Unmarshal(out.Bytes(), &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Surface != "sdui" || manifest.ProductionMutation != "reviewed CommandPalette repair; causal served-byte variants declared separately by invocation" || len(manifest.Identities) != 2 || len(manifest.SDUISourceActions) != 6 {
		t.Fatal(out.String())
	}
	sources := map[string]bool{}
	for _, source := range manifest.SourceFiles {
		if len(source.SHA256) != 64 || source.Bytes == 0 {
			t.Fatal(source)
		}
		sources[source.Path] = true
	}
	for _, path := range []string{"adapters/gohtmx/assets/sdui.js", "adapters/gohtmx/render.go", "sdui/compile.go", "ui/gohtmx/assets/ely-api-interaction.js"} {
		if !sources[path] {
			t.Fatalf("missing source %s", path)
		}
	}
	for i, want := range identities() {
		if manifest.Identities[i] != want {
			t.Fatalf("identity got=%+v want=%+v", manifest.Identities[i], want)
		}
	}
}

func TestCompiledPaletteRejectsInventedRootProps(t *testing.T) {
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := wireScreen(palettefixture.Primary("original"))
	if err != nil {
		t.Fatal(err)
	}
	for _, property := range []string{"action", "query", "ariaActiveDescendant"} {
		t.Run(property, func(t *testing.T) {
			screen, err := gohtmx.Decode(bytes.NewReader(raw))
			if err != nil {
				t.Fatal(err)
			}
			screen.Root.Children[0].Props[property] = "invented"
			if _, err := gohtmx.Compile(screen, registry); err == nil {
				t.Fatalf("accepted untyped root property %s", property)
			}
		})
	}
}

func TestAdapterPaletteRejectsUnknownSurfaceAndRoute(t *testing.T) {
	for _, test := range [][2]string{{"go-qualified", "/"}, {"sdui", "/missing"}} {
		var out bytes.Buffer
		if err := dump(&out, test[0], test[1]); err == nil || out.Len() != 0 {
			t.Fatalf("accepted %v", test)
		}
	}
}

// Wire assertions are independent of palettesupplemental.Props: matching output
// must come from the actual lower-camel catalogue contract, never a Go-prop copy.
func TestSupplementalWireRowsAndQueriesAreIndependent(t *testing.T) {
	for _, spec := range []palettefixture.Spec{palettefixture.Primary("original"), palettefixture.Peer()} {
		raw, err := wireScreen(spec)
		if err != nil {
			t.Fatal(err)
		}
		screen, err := gohtmx.Decode(bytes.NewReader(raw))
		if err != nil {
			t.Fatal(err)
		}
		node := screen.Root.Children[0]
		if node.Type != "navigation/CommandPalette" || node.ID != spec.ComponentID || len(node.Props) != 5 || len(node.Bindings) != 0 {
			t.Fatalf("unexpected catalogue node: %+v", node)
		}
		for key, want := range map[string]string{"label": "Command search", "name": spec.QueryName, "value": "", "placeholder": "Type a command"} {
			if node.Props[key] != want {
				t.Fatalf("%s: %s = %#v", spec.OwnerID, key, node.Props[key])
			}
		}
		rows, ok := node.Props["items"].([]any)
		if !ok || len(rows) != 45 {
			t.Fatalf("items shape: %#v", node.Props["items"])
		}
		values := []string{"open-file", "option-file", "other-place", "disabled-open", "zebra-file"}
		if spec.Peer {
			values = []string{"peer-open", "peer-option", "peer-other", "peer-disabled", "peer-zebra"}
		}
		labels := []string{"Open", "Option", "Other place", "Open disabled", "Zebra"}
		actions := []string{"open-command", "option-command", "other-command", "disabled-command", "zebra-command"}
		for index, rawRow := range rows {
			row, ok := rawRow.(map[string]any)
			if !ok {
				t.Fatalf("row shape: %#v", rawRow)
			}
			value, label, action := "", "", ""
			if index < 5 {
				value, label, action = values[index], labels[index], actions[index]
			} else {
				value, label, action = fmt.Sprintf("entry-%02d", index-4), fmt.Sprintf("Entry %02d", index-4), "entry-command"
				if spec.Peer {
					value = "peer-" + value
				}
			}
			for key, want := range map[string]string{"label": label, "value": value, "action": action, "group": "Commands"} {
				if row[key] != want {
					t.Fatalf("%s row %d %s: got %#v want %q", spec.OwnerID, index, key, row[key], want)
				}
			}
			disabled, _ := row["disabled"].(bool)
			if disabled != (index == 3 || index == 11) {
				t.Fatalf("disabled index %d: %#v", index, row)
			}
			for key := range row {
				if key != "label" && key != "value" && key != "action" && key != "group" && key != "disabled" {
					t.Fatalf("noncontract row key %q", key)
				}
			}
		}
	}
}

func TestSupplementalCompileRejectsPascalCaseWireAndInvalidRows(t *testing.T) {
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := wireScreen(palettefixture.Primary("original"))
	if err != nil {
		t.Fatal(err)
	}
	for _, mutation := range []struct {
		name string
		edit func(map[string]any)
	}{
		{"PascalCase root", func(props map[string]any) { props["Items"] = props["items"]; delete(props, "items") }},
		{"PascalCase item", func(props map[string]any) {
			row := props["items"].([]any)[5].(map[string]any)
			row["Label"] = row["label"]
			delete(row, "label")
		}},
		{"string disabled", func(props map[string]any) { props["items"].([]any)[11].(map[string]any)["disabled"] = "true" }},
	} {
		t.Run(mutation.name, func(t *testing.T) {
			screen, err := gohtmx.Decode(bytes.NewReader(raw))
			if err != nil {
				t.Fatal(err)
			}
			mutation.edit(screen.Root.Children[0].Props)
			if _, err := gohtmx.Compile(screen, registry); err == nil {
				t.Fatal("invalid wire fixture compiled")
			}
		})
	}
}

func TestSupplementalCompiledInspectionRejectsOwnershipAndIdentityDrift(t *testing.T) {
	var out bytes.Buffer
	if err := dump(&out, "sdui", "/"); err != nil {
		t.Fatal(err)
	}
	identity := identities()[0]
	for _, mutation := range [][2]string{
		{`id="` + identity.FamilyID + `-palette-option-5"`, `id="` + identity.FamilyID + `-palette-option-45"`},
		{`id="` + identity.FamilyID + `-palette-query"`, `id="invented-query"`},
		{`value="peer-entry-40"`, `value="entry-40"`},
		{`data-ely-action="entry-command" disabled`, `data-ely-action="entry-command"`},
		{`data-sdui-endpoint="/sdui-action"`, `data-sdui-endpoint="/wrong-action"`},
		{`&#34;sourceAction&#34;:&#34;entry-command&#34;`, `&#34;sourceAction&#34;:&#34;wrong-command&#34;`},
	} {
		changed := strings.Replace(out.String(), mutation[0], mutation[1], 1)
		if changed == out.String() {
			t.Fatalf("mutation did not apply: %v", mutation)
		}
		if err := palettesupplemental.Inspect(changed, "sdui", false, identities()); err == nil {
			t.Fatalf("accepted drift: %v", mutation)
		}
	}
}
