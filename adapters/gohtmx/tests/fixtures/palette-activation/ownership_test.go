package main

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestCompiledActivationOwnershipMarker(t *testing.T) {
	for _, route := range []string{"/", "/empty-initial", "/empty-disabled"} {
		var out bytes.Buffer
		if err := dump(&out, "sdui", route); err != nil {
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
				if !marker || n.Data != "button" || attrs["type"] != "button" || attrs["data-ely-action"] == "" {
					t.Fatal(route, "compiled option ownership/payload")
				}
			}
			if marker {
				markers++
				if !option {
					t.Fatal(route, "marker on non-option")
				}
			}
			if action, ok := attrs["data-ely-submit"]; ok {
				forms++
				if n.Data != "form" || action != "run" {
					t.Fatal(route, "explicit form route changed")
				}
			}
			for child := n.FirstChild; child != nil; child = child.NextSibling {
				visit(child)
			}
		}
		visit(doc)
		want := 10
		if route == "/empty-initial" {
			want = 5
		}
		if options != want || markers != want || forms != 2 {
			t.Fatalf("%s options=%d markers=%d forms=%d", route, options, markers, forms)
		}
	}
}
