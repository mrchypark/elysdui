package main

import (
	"bytes"
	"os/exec"
	"testing"

	"golang.org/x/net/html"
)

func attribute(n *html.Node, name string) (string, bool) {
	for _, attr := range n.Attr {
		if attr.Key == name {
			return attr.Val, true
		}
	}
	return "", false
}
func elements(n *html.Node, predicate func(*html.Node) bool) []*html.Node {
	var result []*html.Node
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node.Type == html.ElementNode && predicate(node) {
			result = append(result, node)
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
	}
	visit(n)
	return result
}
func owner(n *html.Node) *html.Node {
	for node := n; node != nil; node = node.Parent {
		if _, ok := attribute(node, "data-ely-family"); ok {
			return node
		}
	}
	return nil
}

// Validate the exact command consumed by the browser harness, including its
// intentionally hidden reusable table. A selector matching both controllers is
// incorrect even though their sort buttons carry the same data attribute.
func TestProductionFixtureStructure(t *testing.T) {
	for _, fragment := range []bool{false, true} {
		args := []string{"run", "."}
		if fragment {
			args = append(args, "fragment")
		}
		output, err := exec.Command("go", args...).Output()
		if err != nil {
			t.Fatal(err)
		}
		doc, err := html.Parse(bytes.NewReader(output))
		if err != nil {
			t.Fatal(err)
		}
		ids := map[string]*html.Node{}
		for _, node := range elements(doc, func(n *html.Node) bool { _, ok := attribute(n, "id"); return ok }) {
			id, _ := attribute(node, "id")
			if ids[id] != nil {
				t.Fatalf("duplicate ID %q", id)
			}
			ids[id] = node
		}
		roots := elements(doc, func(n *html.Node) bool { _, ok := attribute(n, "data-ely-family"); return ok })
		wantRoots := []string{"table-a", "table-b", "table-disabled", "table-empty"}
		if fragment {
			wantRoots = wantRoots[:1]
		}
		if len(roots) != len(wantRoots) {
			t.Fatalf("family roots: got %d want %d", len(roots), len(wantRoots))
		}
		for index, root := range roots {
			id, _ := attribute(root, "id")
			if id != wantRoots[index] {
				t.Fatalf("family root: got %q want %q", id, wantRoots[index])
			}
			if id != "table-a" && id != "table-b" {
				continue
			}
			children := []*html.Node{}
			for n := root.FirstChild; n != nil; n = n.NextSibling {
				if n.Type == html.ElementNode {
					children = append(children, n)
				}
			}
			if len(children) != 2 || children[0].Data != "div" || children[1].Data != "section" {
				t.Fatalf("%s: expected hidden wrapper and paged section", id)
			}
			if _, hidden := attribute(children[0], "hidden"); !hidden {
				t.Fatalf("%s: reuse wrapper must be hidden", id)
			}
			paged := elements(root, func(n *html.Node) bool { _, ok := attribute(n, "data-ely-paged-table"); return ok })
			if len(paged) != 1 || paged[0] != children[1] || owner(paged[0]) != root || ids[id+"-table"] != paged[0] {
				t.Fatalf("%s: expected one direct owned paged controller", id)
			}
			reuse := ids[id+"-table-reuse"]
			if reuse == nil || reuse.Parent != children[0] || owner(reuse) != root {
				t.Fatalf("%s: separate hidden reuse fixture missing", id)
			}
			sorts := elements(root, func(n *html.Node) bool { value, ok := attribute(n, "data-ui-table-sort"); return ok && value == "0" })
			scoped := elements(paged[0], func(n *html.Node) bool { value, ok := attribute(n, "data-ui-table-sort"); return ok && value == "0" })
			if len(sorts) != 2 || len(scoped) != 1 {
				t.Fatalf("%s: broad sort count %d, owned paged sort count %d", id, len(sorts), len(scoped))
			}
			nested := elements(root, func(n *html.Node) bool { _, ok := attribute(n, "data-ely-family"); return n != root && ok })
			if len(nested) != 0 {
				t.Fatalf("%s: unexpected nested family", id)
			}
		}
	}
}
