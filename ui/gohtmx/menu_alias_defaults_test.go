package ui_test

import (
	"bytes"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"golang.org/x/net/html"
)

func renderMenuAlias(t *testing.T, surface, name string, props map[string]any) string {
	t.Helper()
	var out bytes.Buffer

	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	component := ui.Component{Name: name, ID: "alias", Props: props}
	if surface == "go-chapter" {
		parts := strings.SplitN(name, "/", 2)
		component.Chapter, component.Name = parts[0], parts[1]
	}
	if err = ui.RenderComponent(tpl, &out, component); err != nil {
		t.Fatal(err)
	}
	return out.String()
}
func menuAliasNodes(t *testing.T, markup string) []map[string]string {
	t.Helper()
	doc, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		t.Fatal(err)
	}
	nodes := []map[string]string{}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			a := map[string]string{"tag": n.Data}
			for _, v := range n.Attr {
				a[v.Key] = v.Val
			}
			nodes = append(nodes, a)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return nodes
}
func TestMenuAliasRadioDefaults(t *testing.T) {
	for _, surface := range []string{"go-qualified", "go-chapter"} {
		t.Run(surface, func(t *testing.T) {
			props := map[string]any{"Label": "Density <safe>", "Items": []map[string]any{
				{"Heading": "Choose <safe>"}, {"Separator": true},
				{"Label": "Comfortable", "Value": "comfortable", "Selected": true, "Group": "density"},
				{"Label": "Compact", "Value": "compact", "Group": "density", "Action": "density"},
				{"Label": "Off", "Value": "off", "Disabled": true},
				{"Label": "Explicit false", "Value": "false", "Radio": false},
				{"Label": "Explicit check", "Value": "check", "Checkbox": true},
				{"Label": "Explicit radio", "Value": "radio", "Radio": true},
				{"Label": "Radio wins explicit check", "Value": "both", "Radio": true, "Checkbox": true},
				{"Label": "Explicit unchecked kind", "Value": "check-false", "Checkbox": false},
				{"Label": "Nested", "Value": "parent", "Items": []map[string]any{{"Label": "Child", "Value": "child"}}},
			}}
			for _, name := range []string{"RadioMenuItem", "CheckboxMenuItem"} {
				t.Run(name, func(t *testing.T) {
					markup := renderMenuAlias(t, surface, "menus/"+name, props)
					rows := map[string]map[string]string{}
					for _, n := range menuAliasNodes(t, markup) {
						if n["value"] != "" {
							rows[n["value"]] = n
						}
						if n["role"] == "menu" && (n["aria-label"] == "" || n["tabindex"] != "-1") {
							t.Error("menu panel needs a name and focus fallback")
						}
					}
					for _, value := range []string{"comfortable", "compact", "off", "false", "check", "radio", "both", "check-false", "parent", "child"} {
						role := "menuitemcheckbox"
						if value == "parent" || value == "child" {
							role = "menuitem"
						} else if value == "radio" || value == "both" || name == "RadioMenuItem" && value != "false" && value != "check" {
							role = "menuitemradio"
						}
						row := rows[value]
						if row["role"] != role {
							t.Errorf("%s role=%q want %s", value, row["role"], role)
						}
						if role == "menuitemradio" {
							group := "default"
							if value == "comfortable" || value == "compact" {
								group = "density"
							}
							if row["data-interaction-menu-radio"] != group {
								t.Errorf("%s radio group=%q want %s", value, row["data-interaction-menu-radio"], group)
							}
							if _, ok := row["data-interaction-checkbox"]; ok {
								t.Errorf("%s must not have checkbox dispatch", value)
							}
						}
						if role == "menuitemcheckbox" {
							if _, ok := row["data-interaction-checkbox"]; !ok {
								t.Errorf("%s missing checkbox dispatch", value)
							}
						}
						if value != "parent" {
							if _, ok := row["data-interaction-menu-action"]; !ok {
								t.Errorf("%s missing settled action delegation", value)
							}
						}
					}
					if rows["comfortable"]["aria-checked"] != "true" || rows["compact"]["aria-checked"] != "false" {
						t.Error("owner selection must be retained")
					}
					if _, ok := rows["off"]["disabled"]; !ok {
						t.Error("disabled row must remain disabled")
					}
					if !strings.Contains(markup, "Choose &lt;safe&gt;") || !strings.Contains(markup, "Density &lt;safe&gt;") {
						t.Error("caller text must stay escaped")
					}
				})
			}
		})
	}
}
func TestMenuAliasOverflowDefaultsAndExplicitHosts(t *testing.T) {
	for _, surface := range []string{"go-qualified", "go-chapter"} {
		for _, name := range []string{"OverflowMenu", "DropdownMenu", "SplitButton"} {
			for _, host := range []string{"omitted", "", "dropdown", "split", "overflow"} {
				t.Run(surface+"/"+name+"/"+host, func(t *testing.T) {
					props := map[string]any{"Label": "More <safe>", "Action": "publish", "Value": "branch", "Items": []map[string]any{{"Label": "Open", "Value": "open", "Action": "open-file"}}}
					if host != "omitted" {
						props["Host"] = host
					}
					effective := host
					if host == "omitted" {
						effective = ""
					}
					if effective == "" && name == "OverflowMenu" {
						effective = "overflow"
					}
					markup := renderMenuAlias(t, surface, "menus/"+name, props)
					primaries, triggers := 0, 0
					nodes := menuAliasNodes(t, markup)
					panels := map[string]bool{}
					for _, n := range nodes {
						if n["role"] == "menu" {
							panels[n["id"]] = true
						}
					}
					for _, n := range nodes {
						if _, ok := n["data-interaction-menu-primary"]; ok {
							primaries++
							if n["data-ely-action"] != "publish" || n["value"] != "branch" {
								t.Error("split primary must preserve caller action")
							}
						}
						if _, ok := n["data-interaction-menu"]; ok {
							triggers++
							if n["aria-label"] != "More <safe>" || !panels[n["aria-controls"]] || n["aria-controls"] != n["data-interaction-menu"] || n["aria-expanded"] != "false" || n["aria-haspopup"] != "menu" {
								t.Errorf("invalid accessible trigger: %v", n)
							}
						}
					}
					want := 0
					if effective == "" || effective == "split" {
						want = 1
					}
					if primaries != want {
						t.Errorf("primary actions=%d want %d", primaries, want)
					}
					if triggers != 1 {
						t.Errorf("triggers=%d want 1", triggers)
					}
					if effective == "overflow" && !strings.Contains(markup, "⋯") {
						t.Error("overflow needs the ellipsis-only trigger")
					}
				})
			}
		}
	}
}
func TestMenuAliasDisabledRootsAndIdentity(t *testing.T) {
	for _, surface := range []string{"go-qualified", "go-chapter"} {
		for _, name := range []string{"RadioMenuItem", "OverflowMenu"} {
			t.Run(surface+"/"+name, func(t *testing.T) {
				markup := renderMenuAlias(t, surface, "menus/"+name, map[string]any{"Disabled": true, "Items": []map[string]any{{"Label": "Blocked", "Value": "off"}}})
				if !strings.Contains(markup, `data-ely-component="menus/`+name+`"`) {
					t.Error("requested alias identity lost")
				}
				count := 0
				for _, n := range menuAliasNodes(t, markup) {
					if n["tag"] == "button" {
						count++
						if _, ok := n["disabled"]; !ok {
							t.Errorf("root-disabled control is enabled: %v", n)
						}
					}
				}
				if count != 2 {
					t.Errorf("buttons=%d want 2", count)
				}
			})
		}
	}
	a, err := ui.ResolveComponent("menus", "SplitButton")
	if err != nil {
		t.Fatal(err)
	}
	b, err := ui.ResolveComponent("buttons", "SplitButton")
	if err != nil {
		t.Fatal(err)
	}
	if a.Chapter != "menus" || a.Name != "DropdownMenu" || b.Chapter != "buttons" || b.Name != "SplitButton" {
		t.Fatal("distinct split-button names must retain registration")
	}
}
