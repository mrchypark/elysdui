// Command menu-alias-contracts renders exact public Go and SDUI alias names.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/sdui"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func lowerProps(value any) any {
	switch v := value.(type) {
	case map[string]any:
		out := map[string]any{}
		for k, x := range v {
			out[strings.ToLower(k[:1])+k[1:]] = lowerProps(x)
		}
		return out
	case []any:
		for i, x := range v {
			v[i] = lowerProps(x)
		}
		return v
	default:
		return v
	}
}
func main() {
	tpl, err := ui.NewTemplates()
	if err != nil {
		panic(err)
	}
	// An optional test-only override lets the browser serve an exact source mutant.
	// Normal fixtures always use the embedded production template unchanged.
	if path := os.Getenv("MENU_ALIAS_TEMPLATE_FILE"); path != "" {
		raw, err := os.ReadFile(path)
		if err != nil {
			panic(err)
		}
		if _, err = tpl.Parse(string(raw)); err != nil {
			panic(err)
		}
	}
	registry := gohtmx.NewRegistry(tpl)
	if err = gohtmx.RegisterCatalogue(registry); err != nil {
		panic(err)
	}
	only := ""
	if len(os.Args) > 1 {
		only = os.Args[1]
	}
	if only == "" {
		fmt.Print(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/ely-api.css"><link rel="stylesheet" href="/assets/ely-api-interaction.css"><script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-interaction-entry.js"></script><style>body{padding:16px}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:32px;align-items:start}.case{min-height:55px}</style></head><body><button id="before">Before menus</button><main>`)
	}
	render := func(surface, kind, name string, props map[string]any) {
		id := surface + "-" + kind
		if only != "" && only != id {
			return
		}
		fmt.Printf(`<section class="case" id="case-%s">`, id)
		if surface != "sdui" {
			component := ui.Component{Name: "menus/" + name, ID: id, Props: props}
			if surface == "go-chapter" {
				component.Chapter, component.Name = "menus", name
			}
			err = ui.RenderComponent(tpl, os.Stdout, component)
		} else {
			raw, e := json.Marshal(props)
			if e != nil {
				panic(e)
			}
			var normalized any
			if e = json.Unmarshal(raw, &normalized); e != nil {
				panic(e)
			}
			plan, e := gohtmx.Compile(sdui.Screen{Version: sdui.Version, ID: "alias-screen-" + id, Root: sdui.Node{ID: id, Type: "menus/" + name, Props: lowerProps(normalized).(map[string]any)}}, registry)
			if e != nil {
				panic(e)
			}
			err = plan.Render(os.Stdout, gohtmx.RenderContext{Endpoint: "/sdui", CSRF: "alias-test"})
		}
		if err != nil {
			panic(err)
		}
		fmt.Print(`</section>`)
	}
	for _, surface := range []string{"go", "go-chapter", "sdui"} {
		rows := []map[string]any{
			{"Heading": "Density <safe>"}, {"Separator": true},
			{"Label": "Unavailable", "Value": "off", "Disabled": true, "Group": "density", "Action": "blocked"},
			{"Label": "Comfortable", "Value": "comfortable", "Selected": true, "Group": "density", "Action": "density"},
			{"Label": "Compact <safe>", "Value": "compact", "Group": "density", "Action": "density"},
			{"Label": "Dark", "Value": "dark", "Group": "theme", "Selected": true, "Action": "theme"},
			{"Label": "Explicit check", "Value": "check", "Radio": false, "Action": "check"},
			{"Label": "Nested", "Value": "parent", "Items": []map[string]any{{"Label": "Child", "Value": "child", "Action": "child"}}},
		}
		render(surface, "radio", "RadioMenuItem", map[string]any{"Label": surface + " density", "Items": rows})
		render(surface, "overflow", "OverflowMenu", map[string]any{"Label": surface + " more commands", "Action": "must-not-run", "Items": []map[string]any{{"Label": "Off", "Value": "off", "Action": "blocked", "Disabled": true}, {"Label": "Open", "Value": "open", "Action": "open-file"}}})
		render(surface, "disabled-radio", "RadioMenuItem", map[string]any{"Label": "Disabled radio", "Disabled": true, "Items": rows})
		render(surface, "disabled-overflow", "OverflowMenu", map[string]any{"Label": "Disabled overflow", "Disabled": true, "Items": []map[string]any{{"Label": "Open", "Value": "open", "Action": "blocked"}}})
		render(surface, "legacy-dropdown", "DropdownMenu", map[string]any{"Label": "Publish", "Action": "publish", "Value": "branch", "Items": []map[string]any{{"Label": "Open", "Value": "open"}}})
		render(surface, "explicit-split", "OverflowMenu", map[string]any{"Host": "split", "Label": "Publish", "Action": "publish", "Value": "branch", "Items": []map[string]any{{"Label": "Open", "Value": "open"}}})
	}
	if only == "" {
		fmt.Print(`</main><button id="after">After menus</button></body></html>`)
	}
}
