package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestCommandPaletteOwnsOnlyItsOptionActions(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"CommandPalette", "QuickOpen", "QuickSwitcher", "SearchPalette"} {
		for _, surface := range []string{"qualified", "chapter"} {
			t.Run(kind+"/"+surface, func(t *testing.T) {
				c := Component{Name: "navigation/" + kind, ID: "palette-actions", Props: map[string]any{"Name": "cmdQuery", "Value": "typed query", "Items": []map[string]any{{"Value": "first", "Label": "First", "Action": "pick-first"}, {"Value": "second", "Label": "Second", "Action": "pick-second", "Disabled": true}}}}
				if surface == "chapter" {
					c.Chapter = "navigation"
					c.Name = kind
				}
				var out bytes.Buffer
				if err := RenderComponent(tpl, &out, c); err != nil {
					t.Fatal(err)
				}
				doc, err := html.Parse(strings.NewReader(out.String()))
				if err != nil {
					t.Fatal(err)
				}
				options, markers, forms := 0, 0, 0
				var visit func(*html.Node)
				visit = func(n *html.Node) {
					attrs := map[string]string{}
					for _, a := range n.Attr {
						attrs[a.Key] = a.Val
					}
					_, option := attrs["data-interaction-palette-option"]
					_, marker := attrs["data-interaction-palette-action"]
					if option {
						options++
						if n.Data != "button" || attrs["type"] != "button" || attrs["data-ely-action"] == "" {
							t.Fatal("option semantics changed")
						}
						if marker != (kind == "CommandPalette") {
							t.Fatal("family ownership marker scope", kind)
						}
					}
					if marker {
						markers++
						if !option {
							t.Fatal("marker on non-option")
						}
					}
					if action, ok := attrs["data-ely-submit"]; ok {
						forms++
						if n.Data != "form" || action == "" {
							t.Fatal("form contract removed")
						}
						if kind == "CommandPalette" && action != "run" {
							t.Fatal("CommandPalette form action changed")
						}
					}
					for child := n.FirstChild; child != nil; child = child.NextSibling {
						visit(child)
					}
				}
				visit(doc)
				if options != 2 || forms != 1 {
					t.Fatalf("options=%d forms=%d", options, forms)
				}
				want := 0
				if kind == "CommandPalette" {
					want = 2
				}
				if markers != want {
					t.Fatalf("markers=%d want %d", markers, want)
				}
			})
		}
	}
}
