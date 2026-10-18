package main

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func attrs(n *html.Node) map[string]string {
	out := map[string]string{}
	for _, a := range n.Attr {
		out[a.Key] = a.Val
	}
	return out
}

func walk(n *html.Node, visit func(*html.Node)) {
	visit(n)
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		walk(child, visit)
	}
}

// This validates the executable browser fixture independently of Chromium. It
// does not claim native focus, pointer, scroll or HTMX behavior was exercised.
func TestProductionRendererFixtures(t *testing.T) {
	for _, mode := range []string{"all", "qualified", "chapter", "sdui"} {
		for _, fragment := range []bool{false, true} {
			for _, mutation := range []string{"", "template-truthiness"} {
				t.Run(fmt.Sprintf("%s/fragment=%v/mutation=%s", mode, fragment, mutation), func(t *testing.T) {
					tpl, manifest, err := templates(mutation)
					if err != nil {
						t.Fatal(err)
					}
					if manifest["anchorCount"] != 1 || (manifest["sourceSHA256"] == manifest["servedSHA256"]) != (mutation == "") {
						t.Fatalf("invalid exact-template manifest: %v", manifest)
					}
					var output bytes.Buffer
					if err := writeFixture(&output, tpl, mode, fragment); err != nil {
						t.Fatal(err)
					}
					markup := output.String()
					if strings.Contains(markup, "<!doctype html>") == fragment {
						t.Fatal("page/fragment shell mismatch")
					}
					doc, err := html.Parse(strings.NewReader(markup))
					if err != nil {
						t.Fatal(err)
					}
					ids := map[string]bool{}
					var roots []*html.Node
					var screens int
					walk(doc, func(node *html.Node) {
						a := attrs(node)
						if id := a["id"]; id != "" {
							if ids[id] {
								t.Fatalf("duplicate fixture ID %s", id)
							}
							ids[id] = true
						}
						if a["data-ely-family"] == "interaction" {
							roots = append(roots, node)
						}
						if a["data-sdui-screen"] != "" {
							screens++
						}
						if node.Type == html.ElementNode && node.Data == "safe" {
							t.Fatal("caller label escaped into an element")
						}
					})
					wantRoots := 3
					if mode == "all" {
						wantRoots = 9
					}
					if len(roots) != wantRoots {
						t.Fatalf("family roots = %d, want %d", len(roots), wantRoots)
					}
					wantScreens := 0
					if mode == "all" || mode == "sdui" {
						wantScreens = 3
					}
					if screens != wantScreens {
						t.Fatalf("actual SDUI screens = %d, want %d", screens, wantScreens)
					}
					for _, root := range roots {
						rows, panels := map[string]*html.Node{}, map[string]*html.Node{}
						walk(root, func(node *html.Node) {
							a := attrs(node)
							if node.Type == html.ElementNode && node.Data == "button" && a["value"] != "" {
								rows[a["value"]] = node
							}
							if a["role"] == "menu" {
								panels[a["id"]] = node
							}
						})
						for _, value := range []string{"disabled-empty", "empty", "empty-check", "empty-radio", "disabled-grandchild", "empty-grandchild"} {
							node := rows[value]
							if node == nil {
								t.Fatalf("missing production row %s", value)
							}
							a := attrs(node)
							if mutation != "" {
								if a["data-interaction-menu"] != "" || a["aria-controls"] != "" || a["data-ely-action"] == "" {
									t.Fatalf("truthiness mutant must specifically regress empty row %s to a leaf: %v", value, a)
								}
								continue
							}
							if a["role"] != "menuitem" || a["aria-haspopup"] != "menu" || a["aria-expanded"] != "false" || a["data-interaction-menu"] == "" || a["data-interaction-menu"] != a["aria-controls"] {
								t.Fatalf("empty row %s must retain submenu identity: %v", value, a)
							}
							for _, forbidden := range []string{"aria-checked", "data-interaction-checkbox", "data-interaction-menu-radio", "data-interaction-menu-action", "data-ely-action"} {
								if _, present := a[forbidden]; present {
									t.Fatalf("empty submenu %s retains %s", value, forbidden)
								}
							}
							panel := panels[a["aria-controls"]]
							if panel == nil || panel.FirstChild != nil {
								t.Fatalf("empty row %s must own an actually empty panel", value)
							}
							pa := attrs(panel)
							if pa["tabindex"] != "-1" || pa["aria-label"] == "" {
								t.Fatalf("empty panel must be named and focusable: %v", pa)
							}
							if _, hidden := pa["hidden"]; !hidden {
								t.Fatal("empty panel must start hidden")
							}
						}
						if attrs(rows["branch"])["data-interaction-menu"] == "" {
							t.Fatal("nonempty nested submenu must survive either template")
						}
						if attrs(rows["legacy"])["data-ely-action"] != "legacy-action" || attrs(rows["legacy"])["data-interaction-menu"] != "" {
							t.Fatal("missing-items legacy row must remain actionable in either template")
						}
					}
					t.Logf("roots=%d SDUI=%d bytes=%d fixtureSHA256=%x templateSHA256=%s", len(roots), screens, len(markup), sha256.Sum256(output.Bytes()), manifest["servedSHA256"])
				})
			}
		}
	}
}

func TestUnknownTemplateMutationFailsClosed(t *testing.T) {
	if _, _, err := templates("misspelled-control"); err == nil {
		t.Fatal("unknown template mutations must not silently generate a positive fixture")
	}
}
