package gohtmx_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
	"golang.org/x/net/html"
	"strings"
	"testing"
)

func emptySubmenuNodes(t *testing.T, markup string) (map[string]map[string]string, map[string]map[string]string) {
	t.Helper()
	doc, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		t.Fatal(err)
	}
	rows, panels := map[string]map[string]string{}, map[string]map[string]string{}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		a := map[string]string{}
		for _, attr := range n.Attr {
			a[attr.Key] = attr.Val
		}
		if n.Type == html.ElementNode && n.Data == "button" && a["value"] != "" {
			rows[a["value"]] = a
		}
		if a["role"] == "menu" {
			panels[a["id"]] = a
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return rows, panels
}

func assertEmptySubmenu(t *testing.T, markup string) {
	t.Helper()
	rows, panels := emptySubmenuNodes(t, markup)
	for _, value := range []string{"empty", "default-empty", "disabled-empty", "deep-empty", "populated"} {
		row, ok := rows[value]
		if !ok {
			t.Fatalf("missing row %s", value)
		}
		if row["role"] != "menuitem" || row["aria-haspopup"] != "menu" || row["aria-expanded"] != "false" || row["tabindex"] != "-1" {
			t.Errorf("%s must retain submenu trigger identity: %v", value, row)
		}
		for _, forbidden := range []string{"data-ely-action", "data-interaction-menu-action", "data-interaction-checkbox", "data-interaction-menu-radio", "aria-checked"} {
			if _, ok := row[forbidden]; ok {
				t.Errorf("%s submenu must suppress %s", value, forbidden)
			}
		}
		id := row["aria-controls"]
		panel, ok := panels[id]
		if !ok || id == "" || row["data-interaction-menu"] != id {
			t.Errorf("%s must control its own rendered submenu: %v", value, row)
			continue
		}
		if panel["tabindex"] != "-1" || panel["aria-label"] == "" {
			t.Errorf("%s must have a named focusable empty panel: %v", value, panel)
		}
		if _, ok := panel["hidden"]; !ok {
			t.Errorf("%s panel must initially be hidden", value)
		}
	}
	if _, ok := rows["disabled-empty"]["disabled"]; !ok {
		t.Error("disabled empty submenu lost disabled state")
	}
	for _, value := range []string{"leaf", "nil-leaf"} {
		row := rows[value]
		if row["data-ely-action"] != "select-leaf" {
			t.Errorf("legacy %s must remain actionable: %v", value, row)
		}
		if _, ok := row["aria-haspopup"]; ok {
			t.Errorf("legacy %s became a submenu", value)
		}
	}
	if !strings.Contains(markup, "Empty &lt;safe&gt;") || strings.Contains(markup, "<unsafe>") {
		t.Error("empty submenu labels must remain escaped")
	}
}

func TestMenuExplicitEmptySubmenuSDUIContracts(t *testing.T) {
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Menu", "DropdownMenu", "ContextMenu", "CheckboxMenuItem", "RadioMenuItem", "OverflowMenu", "SplitButton", "SubMenu"} {
		t.Run(name, func(t *testing.T) {
			raw := `{"version":"1","id":"screen","root":{"id":"empty-contract","type":"menus/` + name + `","props":{"label":"Caller","items":[{"label":"Empty <safe>","value":"empty","items":[],"checkbox":true,"radio":true,"selected":true,"action":"must-not-run"},{"label":"Empty with inherited defaults","value":"default-empty","items":[],"action":"must-not-run"},{"label":"Leaf","value":"leaf","action":"select-leaf"},{"label":"Omitted leaf","value":"nil-leaf","action":"select-leaf"},{"label":"Disabled empty","value":"disabled-empty","items":[],"disabled":true,"action":"must-not-run"},{"label":"Populated","value":"populated","items":[{"label":"Deep <unsafe>","value":"deep-empty","items":[],"checkbox":true}]}]}}}`
			screen, err := sdui.Decode(strings.NewReader(raw))
			if err != nil {
				t.Fatal(err)
			}
			plan, err := sdui.Compile(screen, registry)
			if err != nil {
				t.Fatal(err)
			}
			var out bytes.Buffer
			if err := plan.Render(&out, sdui.RenderContext{Endpoint: "/sdui", CSRF: "test"}); err != nil {
				t.Fatal(err)
			}
			assertEmptySubmenu(t, out.String())
		})
	}
}

func TestMenuEmptySubmenuSDUIRejectsInvalidItems(t *testing.T) {
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, items := range []string{`null`, `true`, `false`, `""`, `{}`, `["row"]`} {
		t.Run(items, func(t *testing.T) {
			screen, err := sdui.Decode(strings.NewReader(`{"version":"1","id":"screen","root":{"id":"menu","type":"menus/Menu","props":{"items":[{"label":"Invalid","items":` + items + `}]}}}`))
			if err != nil {
				t.Fatal(err)
			}
			if _, err = sdui.Compile(screen, registry); err == nil {
				t.Fatal("invalid child items must not become an actionable leaf")
			}
		})
	}
}

func TestMenuEmptySubmenuSDUICutoff(t *testing.T) {
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	contracts, err := sdui.CatalogueContracts()
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, contract := range contracts {
		if !strings.HasPrefix(contract.Name, "menus/") {
			continue
		}
		p := contract.Properties["items"]
		depth := 0
		for p.Items != nil && len(p.Items.Properties) > 0 {
			next, ok := p.Items.Properties["items"]
			if !ok {
				break
			}
			depth++
			p = next
		}
		if p.Format != "empty-array" {
			continue
		}
		count++
		t.Run(contract.Name, func(t *testing.T) {
			if p.Type != sdui.Array || p.Nullable || p.Items == nil || p.Items.Type != sdui.Object || len(p.Items.Properties) != 0 || p.Items.AdditionalProperties != nil {
				t.Fatalf("cutoff schema must be closed and empty-only: %+v", p)
			}
			wantDepth := 6
			if contract.Name == "menus/MenuBar Menu" {
				wantDepth = 7
			}
			if depth != wantDepth {
				t.Fatalf("cutoff depth %d want %d", depth, wantDepth)
			}
			for _, input := range []string{"omitted", "[]", "false", "true", "null", "{}", `[{}]`, `["row"]`, `[{"label":"Deeper"}]`} {
				for _, bound := range []bool{false, true} {
					mode := "props"
					if bound {
						mode = "binding"
					}
					t.Run(input+"/"+mode, func(t *testing.T) {
						row := map[string]any{"label": "Terminal <safe>", "value": "terminal", "action": "choose"}
						if input != "omitted" {
							var value any
							if err := json.Unmarshal([]byte(input), &value); err != nil {
								t.Fatal(err)
							}
							row["items"] = value
						}
						for i := 1; i < depth; i++ {
							row = map[string]any{"label": fmt.Sprint("Level ", i), "items": []any{row}}
						}
						rows := []any{row}
						node := map[string]any{"id": "terminal-menu", "type": contract.Name, "props": map[string]any{"label": "Cutoff", "items": rows}}
						if bound {
							node["props"] = map[string]any{"label": "Cutoff"}
							node["bindings"] = map[string]any{"items": "/rows"}
						}
						raw, err := json.Marshal(map[string]any{"version": "1", "id": "screen", "root": node})
						if err != nil {
							t.Fatal(err)
						}
						screen, err := sdui.Decode(bytes.NewReader(raw))
						if err != nil {
							t.Fatal(err)
						}
						plan, compileErr := sdui.Compile(screen, registry)
						valid := input == "omitted" || input == "[]"
						if !valid && !bound {
							if compileErr == nil {
								t.Fatal("invalid cutoff data compiled")
							}
							return
						}
						if compileErr != nil {
							t.Fatal(compileErr)
						}
						var out bytes.Buffer
						err = plan.Render(&out, sdui.RenderContext{Data: map[string]any{"rows": rows}, Endpoint: "/sdui", CSRF: "test"})
						if !valid {
							if err == nil {
								t.Fatal("invalid bound cutoff data rendered")
							}
							if out.Len() != 0 {
								t.Fatal("invalid bound cutoff leaked partial markup")
							}
							return
						}
						if err != nil {
							t.Fatal(err)
						}
						buttons, panels := emptySubmenuNodes(t, out.String())
						terminal := buttons["terminal"]
						if input == "[]" {
							if terminal["aria-haspopup"] != "menu" || panels[terminal["aria-controls"]]["tabindex"] != "-1" {
								t.Fatalf("terminal [] lost focusable submenu: %v", terminal)
							}
							if _, ok := terminal["data-ely-action"]; ok {
								t.Fatal("terminal [] became actionable")
							}
						} else if terminal["data-ely-action"] != "choose" {
							t.Fatal("omitted terminal Items must remain leaf")
						}
					})
				}
			}
		})
	}
	if count != 15 {
		t.Fatalf("changed cutoff contract count %d want 15", count)
	}
}
