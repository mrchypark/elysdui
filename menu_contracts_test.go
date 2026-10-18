package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestMenuFunctionalMarkupContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Menu", "DropdownMenu", "ContextMenu", "CheckboxMenuItem"} {
		t.Run(name, func(t *testing.T) {
			var out bytes.Buffer
			rows := []map[string]any{{"Heading": "Choose <safe>"}, {"Separator": true}, {"Label": "Parent", "Value": "parent", "Items": []map[string]any{{"Label": "Nested", "Value": "nested"}}}, {"Label": "Check", "Value": "check", "Checkbox": true}, {"Label": "Radio", "Value": "radio", "Radio": true, "Group": "density"}, {"Label": "Off", "Value": "off", "Disabled": true}}
			if err := RenderComponent(tpl, &out, Component{Chapter: "menus", Name: name, ID: "contract-menu", Props: map[string]any{"Label": "Caller <safe>", "Host": "dropdown", "Items": rows}}); err != nil {
				t.Fatal(err)
			}
			doc, err := html.Parse(strings.NewReader(out.String()))
			if err != nil {
				t.Fatal(err)
			}
			var visit func(*html.Node)
			visit = func(n *html.Node) {
				attrs := map[string]string{}
				for _, a := range n.Attr {
					attrs[a.Key] = a.Val
				}
				if attrs["role"] == "menu" {
					if attrs["tabindex"] != "-1" {
						t.Error("menu panel needs focus fallback")
					}
					if attrs["aria-label"] == "" && attrs["aria-labelledby"] == "" {
						t.Error("menu panel needs an accessible name")
					}
				}
				if _, ok := attrs["data-interaction-menu"]; ok {
					if attrs["aria-haspopup"] != "menu" {
						t.Error("menu trigger must identify popup")
					}
				}
				if attrs["value"] == "parent" {
					if attrs["role"] != "menuitem" {
						t.Error("submenu trigger must be an ordinary menuitem")
					}
					if _, ok := attrs["data-interaction-checkbox"]; ok {
						t.Error("submenu must not inherit checkbox activation")
					}
				}
				if attrs["value"] == "check" || attrs["value"] == "radio" || attrs["value"] == "nested" {
					if _, ok := attrs["data-interaction-menu-action"]; !ok {
						t.Error("menu leaf must use settled-state action delegation")
					}
					if attrs["tabindex"] != "-1" {
						t.Error("menu row must leave Tab order")
					}
				}
				for c := n.FirstChild; c != nil; c = c.NextSibling {
					visit(c)
				}
			}
			visit(doc)
			if !strings.Contains(out.String(), "Choose &lt;safe&gt;") {
				t.Error("heading must remain escaped")
			}
		})
	}
}
