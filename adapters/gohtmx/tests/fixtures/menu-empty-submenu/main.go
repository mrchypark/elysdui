// Command menu-empty-submenu renders the production menu templates for browser
// contracts. It deliberately contains no replacement menu markup or runtime.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"io"
	"os"
	"strings"

	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

const templatePath = "templates/ely-api-interaction.html"
const mutationAnchor = "{{$submenu := menuHasItems .Items}}"
const mutationReplacement = "{{$submenu := .Items}}"

// Literal wire properties exercise the actual lower-camel catalogue contract,
// including preservation of a present but empty items array after normalization.
const wireRows = `[
  {"heading":"Commands <safe>"},
  {"label":"Unavailable empty","value":"disabled-empty","items":[],"disabled":true,"checkbox":true,"action":"forbidden-disabled"},
  {"label":"Empty <safe>","value":"empty","items":[],"action":"forbidden-empty"},
  {"label":"Empty checkbox","value":"empty-check","items":[],"checkbox":true,"selected":true,"action":"forbidden-checkbox"},
  {"label":"Empty radio","value":"empty-radio","items":[],"radio":true,"selected":true,"group":"density","action":"forbidden-radio"},
  {"label":"Branch","value":"branch","items":[
    {"label":"Unavailable grandchild","value":"disabled-grandchild","items":[],"disabled":true},
    {"label":"Empty grandchild","value":"empty-grandchild","items":[],"checkbox":true,"radio":true,"selected":true,"action":"forbidden-grandchild"},
    {"label":"Nested leaf","value":"nested-leaf","action":"nested-action"}
  ]},
  {"label":"Legacy leaf","value":"legacy","action":"legacy-action"},
  {"label":"Legacy checkbox","value":"legacy-check","checkbox":true,"action":"legacy-check-action"},
  {"label":"Legacy radio","value":"legacy-radio","radio":true,"group":"density","action":"legacy-radio-action"}
]`

func goRows() []map[string]any {
	return []map[string]any{
		{"Heading": "Commands <safe>"},
		{"Label": "Unavailable empty", "Value": "disabled-empty", "Items": []map[string]any{}, "Disabled": true, "Checkbox": true, "Action": "forbidden-disabled"},
		{"Label": "Empty <safe>", "Value": "empty", "Items": []map[string]any{}, "Action": "forbidden-empty"},
		{"Label": "Empty checkbox", "Value": "empty-check", "Items": []map[string]any{}, "Checkbox": true, "Selected": true, "Action": "forbidden-checkbox"},
		{"Label": "Empty radio", "Value": "empty-radio", "Items": []map[string]any{}, "Radio": true, "Selected": true, "Group": "density", "Action": "forbidden-radio"},
		{"Label": "Branch", "Value": "branch", "Items": []map[string]any{
			{"Label": "Unavailable grandchild", "Value": "disabled-grandchild", "Items": []map[string]any{}, "Disabled": true},
			{"Label": "Empty grandchild", "Value": "empty-grandchild", "Items": []map[string]any{}, "Checkbox": true, "Radio": true, "Selected": true, "Action": "forbidden-grandchild"},
			{"Label": "Nested leaf", "Value": "nested-leaf", "Action": "nested-action"},
		}},
		{"Label": "Legacy leaf", "Value": "legacy", "Action": "legacy-action"},
		{"Label": "Legacy checkbox", "Value": "legacy-check", "Checkbox": true, "Action": "legacy-check-action"},
		{"Label": "Legacy radio", "Value": "legacy-radio", "Radio": true, "Group": "density", "Action": "legacy-radio-action"},
	}
}

func templates(mutation string) (*template.Template, map[string]any, error) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		return nil, nil, err
	}
	source, err := ui.Files.ReadFile(templatePath)
	if err != nil {
		return nil, nil, err
	}
	served := string(source)
	count := strings.Count(served, mutationAnchor)
	if count != 1 {
		return nil, nil, fmt.Errorf("production submenu anchor must occur exactly once, got %d", count)
	}
	if mutation != "" {
		if mutation != "template-truthiness" {
			return nil, nil, fmt.Errorf("unknown fixture mutation %q", mutation)
		}
		// Reparse the real embedded template with one exact production expression
		// regressed. Both RenderComponent and the real SDUI registry use this same
		// template set; no rendered HTML is patched and no source file is edited.
		served = strings.Replace(served, mutationAnchor, mutationReplacement, 1)
		if _, err := tpl.Parse(served); err != nil {
			return nil, nil, err
		}
	}
	return tpl, map[string]any{
		"templatePath": templatePath, "sourceSHA256": fmt.Sprintf("%x", sha256.Sum256(source)),
		"servedSHA256": fmt.Sprintf("%x", sha256.Sum256([]byte(served))),
		"mutation":     mutation, "anchorCount": count,
	}, nil
}

func render(w io.Writer, tpl *template.Template, registry *sdui.Registry, mode, name, id string) error {
	label := name + " " + mode
	if mode != "sdui" {
		component := ui.Component{Chapter: "menus", Name: name, ID: id, Props: map[string]any{
			"Label": label, "Content": "Right click for " + label, "Items": goRows(),
		}}
		if mode == "qualified" {
			component.Chapter, component.Name = "", "menus/"+name
		}
		return ui.RenderComponent(tpl, w, component)
	}
	var rows json.RawMessage = []byte(wireRows)
	props := map[string]any{"label": label, "items": rows}
	if name == "ContextMenu" {
		props["content"] = "Right click for " + label
	}
	raw, err := json.Marshal(map[string]any{
		"version": "1", "id": id + "-screen",
		"root": map[string]any{"id": id, "type": "menus/" + name, "props": props},
	})
	if err != nil {
		return err
	}
	screen, err := sdui.Decode(bytes.NewReader(raw))
	if err != nil {
		return err
	}
	plan, err := sdui.Compile(screen, registry)
	if err != nil {
		return err
	}
	return plan.Render(w, sdui.RenderContext{})
}

func writeFixture(w io.Writer, tpl *template.Template, mode string, fragment bool) error {
	// Register the real catalogue on the template set, including the exact
	// expression mutant when requested. The schema and compiler are unchanged.
	registry := sdui.NewRegistry(tpl)
	if err := sdui.RegisterCatalogue(registry); err != nil {
		return err
	}
	if !fragment {
		fmt.Fprint(w, `<!doctype html><html><head><meta charset="utf-8"><title>Empty nested submenu contracts</title><link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/ely-api.css"><link rel="stylesheet" href="/assets/ely-api-interaction.css"><script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-interaction-entry.js"></script><style>body{padding:24px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:start;gap:80px;padding:24px;min-height:720px}#outside{min-height:60px}</style></head><body><button id="before">Before menus</button><button id="swap-source" hx-swap="outerHTML">Swap request source</button><main>`)
	}
	for _, renderer := range []string{"qualified", "chapter", "sdui"} {
		if mode != "all" && mode != renderer {
			continue
		}
		for _, host := range []struct{ name, prefix string }{{"Menu", "menu"}, {"CheckboxMenuItem", "checks"}, {"ContextMenu", "context"}} {
			if err := render(w, tpl, registry, renderer, host.name, host.prefix+"-"+renderer); err != nil {
				return err
			}
		}
	}
	if !fragment {
		fmt.Fprint(w, `</main><button id="after">After menus</button><div id="outside">Outside menu space</div></body></html>`)
	}
	return nil
}

func main() {
	fragment := flag.Bool("fragment", false, "render components without a document shell")
	mode := flag.String("mode", "all", "all, qualified, chapter, or sdui")
	mutation := flag.String("mutation", "", "test-only exact production template mutation")
	flag.Parse()
	if flag.NArg() != 0 || (*mode != "all" && *mode != "qualified" && *mode != "chapter" && *mode != "sdui") {
		panic("invalid fixture arguments")
	}
	tpl, manifest, err := templates(*mutation)
	if err != nil {
		panic(err)
	}
	manifest["mode"], manifest["fragment"] = *mode, *fragment
	if err := json.NewEncoder(os.Stderr).Encode(manifest); err != nil {
		panic(err)
	}
	if err := writeFixture(os.Stdout, tpl, *mode, *fragment); err != nil {
		panic(err)
	}
}
