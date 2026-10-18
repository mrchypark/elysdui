package ui_test

import (
	"bytes"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
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

func TestMenuExplicitEmptySubmenuGoContracts(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Menu", "DropdownMenu", "ContextMenu", "CheckboxMenuItem", "RadioMenuItem", "OverflowMenu", "SplitButton", "SubMenu"} {
		for _, qualified := range []bool{false, true} {
			mode := "chapter"
			if qualified {
				mode = "qualified"
			}
			t.Run(name+"/"+mode, func(t *testing.T) {
				props := map[string]any{"Label": "Caller", "Items": []map[string]any{
					{"Label": "Empty <safe>", "Value": "empty", "Items": []map[string]any{}, "Checkbox": true, "Radio": true, "Selected": true, "Action": "must-not-run"},
					{"Label": "Empty with inherited defaults", "Value": "default-empty", "Items": []any{}, "Action": "must-not-run"},
					{"Label": "Leaf", "Value": "leaf", "Action": "select-leaf"},
					{"Label": "Nil leaf", "Value": "nil-leaf", "Items": ([]map[string]any)(nil), "Action": "select-leaf"},
					{"Label": "Disabled empty", "Value": "disabled-empty", "Items": []any{}, "Disabled": true, "Action": "must-not-run"},
					{"Label": "Populated", "Value": "populated", "Items": []map[string]any{{"Label": "Deep <unsafe>", "Value": "deep-empty", "Items": []any{}, "Checkbox": true}}},
				}}
				component := ui.Component{Chapter: "menus", Name: name, ID: "empty-contract", Props: props}
				if qualified {
					component.Chapter = ""
					component.Name = "menus/" + name
				}
				var out bytes.Buffer
				if err := ui.RenderComponent(tpl, &out, component); err != nil {
					t.Fatal(err)
				}
				assertEmptySubmenu(t, out.String())
			})
		}
	}
}

func TestMenuItemsPresenceHelper(t *testing.T) {
	helper := ui.Funcs()["menuHasItems"].(func(any) (bool, error))
	type namedRows []map[string]any
	allocated := []map[string]any{}
	var nilRows []any
	var nilPointer *[]any
	for _, tt := range []struct {
		name    string
		value   any
		want    bool
		wantErr bool
	}{
		{"missing", nil, false, false}, {"nil slice", nilRows, false, false}, {"nil pointer", nilPointer, false, false},
		{"empty maps", allocated, true, false}, {"empty JSON", []any{}, true, false}, {"array", [0]map[string]any{}, true, false},
		{"named", namedRows{}, true, false}, {"pointer", &allocated, true, false}, {"populated", []map[string]any{{"Label": "child"}}, true, false},
		{"false", false, false, true}, {"true", true, false, true}, {"string", "", false, true}, {"object", map[string]any{}, false, true}, {"number", 0, false, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := helper(tt.value)
			if got != tt.want || (err != nil) != tt.wantErr {
				t.Fatalf("got %v,%v; want presence=%v error=%v", got, err, tt.want, tt.wantErr)
			}
		})
	}
}

func TestMenuEmptySubmenuTruthinessControl(t *testing.T) {
	source, err := ui.Files.ReadFile("templates/ely-api-interaction.html")
	if err != nil {
		t.Fatal(err)
	}
	anchor := `{{$submenu := menuHasItems .Items}}`
	if strings.Count(string(source), anchor) != 1 {
		t.Fatal("presence mutation anchor must be unique")
	}
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = tpl.Parse(strings.Replace(string(source), anchor, `{{$submenu := .Items}}`, 1)); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	err = ui.RenderComponent(tpl, &out, ui.Component{Name: "menus/Menu", ID: "mutant", Props: map[string]any{"Items": []map[string]any{{"Value": "empty", "Items": []any{}, "Action": "must-not-run"}}}})
	if err != nil {
		t.Fatal(err)
	}
	rows, panels := emptySubmenuNodes(t, out.String())
	if rows["empty"]["data-ely-action"] != "must-not-run" || rows["empty"]["aria-haspopup"] != "" || len(panels) != 1 {
		t.Fatal("truthiness control must reproduce the original actionable-empty-child defect")
	}
}

func TestMenuItemsPresenceActualGoRendering(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	allocated := []map[string]any{}
	var nilRows []map[string]any
	for _, tt := range []struct {
		name    string
		items   any
		submenu bool
		wantErr bool
	}{
		{"array", [0]map[string]any{}, true, false}, {"pointer to empty", &allocated, true, false}, {"pointer to nil", &nilRows, false, false},
		{"scalar false", false, false, true}, {"scalar true", true, false, true}, {"string", "children", false, true}, {"map", map[string]any{}, false, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var out bytes.Buffer
			err := ui.RenderComponent(tpl, &out, ui.Component{Name: "menus/Menu", ID: "presence", Props: map[string]any{"Items": []map[string]any{{"Label": "Row", "Value": "row", "Items": tt.items, "Action": "choose"}}}})
			if tt.wantErr {
				if err == nil || !strings.Contains(err.Error(), "menu Items must be an array or slice") {
					t.Fatalf("expected descriptive render error, got %v", err)
				}
				if out.Len() != 0 {
					t.Fatal("invalid children must not publish partial action markup")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			rows, panels := emptySubmenuNodes(t, out.String())
			row := rows["row"]
			if (row["aria-haspopup"] == "menu") != tt.submenu {
				t.Fatalf("submenu=%v: %v", tt.submenu, row)
			}
			if tt.submenu {
				if len(panels) != 2 {
					t.Fatalf("empty child panel missing: %v", panels)
				}
				if _, ok := row["data-ely-action"]; ok {
					t.Fatal("empty child became an action")
				}
			} else if row["data-ely-action"] != "choose" {
				t.Fatal("nil child must retain legacy leaf action")
			}
		})
	}
}
