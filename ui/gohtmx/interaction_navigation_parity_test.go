package ui

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestInteractionNavigationCallerContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"NavigationMenu", map[string]any{"Items": []map[string]any{{"Label": "Docs", "Items": []map[string]any{{"Label": "Caller <guide>", "Value": "guide", "Action": "read-guide"}}}}}, []string{`aria-haspopup="menu"`, `data-ely-action="read-guide"`, `Caller &lt;guide&gt;`}},
		{"BackForwardNavigation", map[string]any{"Items": []map[string]any{{"Label": "First", "Value": "first"}, {"Label": "Second", "Value": "second", "Selected": true}}}, []string{`data-interaction-history-index="1"`, `aria-current="page"`, `value="1"`}},
		{"Anchor", map[string]any{"Items": []map[string]any{{"Label": "Intro", "Value": "intro", "Content": "Caller body"}}}, []string{`href="#parity-anchor-intro"`, `id="parity-anchor-intro"`, `data-interaction-anchor="intro"`, `Caller body`}},
		{"JumpTo", map[string]any{"Name": "position", "Value": "24:8", "Max": 80}, []string{`name="position"`, `value="24:8"`, `data-interaction-jump-max="80"`}},
		{"CommandPalette", map[string]any{"Label": "Run task", "Items": []map[string]any{{"Label": "Build", "Value": "build", "Group": "Tasks", "Shortcut": "Ctrl+B"}}}, []string{`aria-label="Run task"`, `Tasks`, `Ctrl&#43;B`, `data-interaction-palette-empty`}},
		{"QuickOpen", map[string]any{"Items": []map[string]any{{"Label": "main.go", "Value": "src/main.go", "Recent": true}}}, []string{`value="src/main.go"`, `data-interaction-palette-recent`, `data-interaction-palette-empty`}},
		{"QuickSwitcher", map[string]any{"Items": []map[string]any{{"Label": "Project", "Value": "project", "Content": "Workspace"}}}, []string{`data-ely-action="switch"`, `Workspace`, `data-interaction-palette-empty`}},
		{"SearchPalette", map[string]any{"Items": []map[string]any{{"Label": "Guide", "Value": "guide", "Group": "Docs"}}}, []string{`data-ely-action="open"`, `Docs`, `data-interaction-palette-empty`}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var body bytes.Buffer
			if err := RenderComponent(tpl, &body, Component{Chapter: "navigation", Name: tc.name, ID: "parity", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(body.String(), want) {
					t.Fatalf("missing %s in %s", want, body.String())
				}
			}
		})
	}
}

func TestInteractionBulkZeroOverridesLegacyValue(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	err = RenderComponent(tpl, &body, Component{Chapter: "buttons", Name: "BulkActionBar", ID: "bulk-zero", Props: map[string]any{"SelectedCount": 0, "Value": "15"}})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`data-interaction-bulk-count="0"`, `<output data-interaction-bulk-count>0</output>`, `class="ely-interaction__bar is-bulk" hidden`} {
		if !strings.Contains(body.String(), want) {
			t.Errorf("missing %s in %s", want, body.String())
		}
	}
}

// IDs come from the owner and source row index, never arbitrary/repeated item
// values or the runtime's ranked position. This is markup, not browser/AT proof.
func TestCommandPaletteOwnedOptionIdentifiers(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, qualified := range []bool{false, true} {
		t.Run(fmt.Sprintf("qualified-%t", qualified), func(t *testing.T) {
			var body bytes.Buffer
			for _, id := range []string{"commands-main", "commands-peer"} {
				c := Component{Chapter: "navigation", Name: "CommandPalette", ID: id, Props: map[string]any{
					"Name": "cmdQuery", "Value": "<query>", "Label": "<Commands>",
					"Items": []map[string]any{{"Label": "First", "Value": `same <payload>`}, {"Label": "Second", "Value": `same <payload>`}, {"Label": "Blocked", "Value": `same <payload>`, "Disabled": true}},
				}}
				if qualified {
					c.Chapter, c.Name = "", "navigation/CommandPalette"
				}
				if err := RenderComponent(tpl, &body, c); err != nil {
					t.Fatal(err)
				}
			}
			doc, err := html.Parse(strings.NewReader(body.String()))
			if err != nil {
				t.Fatal(err)
			}
			ids := map[string]*html.Node{}
			attribute := func(n *html.Node, key string) string {
				for _, a := range n.Attr {
					if a.Key == key {
						return a.Val
					}
				}
				return ""
			}
			var visit func(*html.Node)
			visit = func(n *html.Node) {
				if id := attribute(n, "id"); id != "" {
					if ids[id] != nil {
						t.Errorf("duplicate ID %q", id)
					}
					ids[id] = n
				}
				for child := n.FirstChild; child != nil; child = child.NextSibling {
					visit(child)
				}
			}
			visit(doc)
			for _, id := range []string{"commands-main", "commands-peer"} {
				input, list := ids[id+"-palette-query"], ids[id+"-palette-results"]
				if input == nil || list == nil {
					t.Fatalf("%s: missing input/list IDs", id)
				}
				if input.Data != "input" || attribute(input, "type") != "search" || attribute(input, "aria-controls") != attribute(list, "id") || attribute(list, "role") != "listbox" {
					t.Errorf("%s: missing native searchbox/listbox relation", id)
				}
				if attribute(input, "name") != "cmdQuery" || attribute(input, "value") != "<query>" || attribute(input, "aria-label") != "<Commands>" {
					t.Errorf("%s: query props changed", id)
				}
				for index := range 3 {
					option := ids[fmt.Sprintf("%s-palette-option-%d", id, index)]
					if option == nil || attribute(option, "role") != "option" || attribute(option, "value") != "same <payload>" || option.Parent == nil || option.Parent.Parent != list {
						t.Errorf("%s: option %d is not locally owned", id, index)
					}
				}
			}
		})
	}
}
