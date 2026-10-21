package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

// interactionAriaValidRoles lists the ARIA roles for which aria-selected is
// defined on the elements rendered by the shared templates. WAI-ARIA 1.2
// lists gridcell, option, row and tab under "Used in Roles", and inherits
// aria-selected into treeitem, whose superclass role is option.
var interactionAriaValidRoles = map[string]bool{
	"gridcell": true,
	"option":   true,
	"row":      true,
	"tab":      true,
	"treeitem": true,
}

// interactionAriaSelectedNodes returns every element that carries an
// aria-selected attribute, in document order.
func interactionAriaSelectedNodes(root *html.Node) []*html.Node {
	var nodes []*html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			if _, ok := formAttr(n, "aria-selected"); ok {
				nodes = append(nodes, n)
			}
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return nodes
}

// interactionAriaRole returns the explicit role of an element, or the
// implicit row role of a native table row.
func interactionAriaRole(n *html.Node) string {
	if role, ok := formAttr(n, "role"); ok {
		return strings.ToLower(strings.TrimSpace(role))
	}
	if n.Data == "tr" {
		return "row"
	}
	return ""
}

// interactionAriaAncestorRole reports whether the node has an ancestor with
// one of the given roles.
func interactionAriaAncestorRole(n *html.Node, roles ...string) bool {
	for parent := n.Parent; parent != nil; parent = parent.Parent {
		if parent.Type != html.ElementNode {
			continue
		}
		role, ok := formAttr(parent, "role")
		if !ok {
			continue
		}
		role = strings.ToLower(strings.TrimSpace(role))
		for _, want := range roles {
			if role == want {
				return true
			}
		}
	}
	return false
}

// interactionAriaAncestorTag reports whether the node has an ancestor with
// one of the given tag names.
func interactionAriaAncestorTag(n *html.Node, tags ...string) bool {
	for parent := n.Parent; parent != nil; parent = parent.Parent {
		if parent.Type != html.ElementNode {
			continue
		}
		for _, want := range tags {
			if parent.Data == want {
				return true
			}
		}
	}
	return false
}

// interactionAriaCheckSelected verifies that every aria-selected element sits
// in a role structure that supports the attribute.
func interactionAriaCheckSelected(t *testing.T, label string, doc *html.Node) {
	t.Helper()
	for _, node := range interactionAriaSelectedNodes(doc) {
		role := interactionAriaRole(node)
		if role == "" {
			t.Errorf("%s: <%s> has aria-selected without a supporting role", label, node.Data)
			continue
		}
		if !interactionAriaValidRoles[role] {
			t.Errorf("%s: <%s role=%q> has aria-selected but that role does not support it", label, node.Data, role)
			continue
		}
		switch role {
		case "option":
			if !interactionAriaAncestorRole(node, "listbox", "group", "tree") {
				t.Errorf("%s: <%s role=option> has aria-selected without a listbox, group or tree container", label, node.Data)
			}
		case "tab":
			if !interactionAriaAncestorRole(node, "tablist") {
				t.Errorf("%s: <%s role=tab> has aria-selected without a tablist container", label, node.Data)
			}
		case "row":
			if !interactionAriaAncestorRole(node, "table", "grid", "treegrid", "rowgroup") && !interactionAriaAncestorTag(node, "table", "tbody", "thead", "tfoot") {
				t.Errorf("%s: <%s role=row> has aria-selected outside a table structure", label, node.Data)
			}
		case "gridcell":
			if !interactionAriaAncestorRole(node, "row") {
				t.Errorf("%s: <%s role=gridcell> has aria-selected without a row container", label, node.Data)
			}
		case "treeitem":
			// treeitem inherits aria-selected from its option superclass, so
			// it needs the same selection container as option: a tree or a
			// group nested in one.
			if !interactionAriaAncestorRole(node, "tree", "group") {
				t.Errorf("%s: <%s role=treeitem> has aria-selected without a tree or group container", label, node.Data)
			}
		}
	}
}

// TestInteractionAriaSelectedRoles renders the workspace and communication
// components and checks that every aria-selected element carries a role that
// supports the attribute, inside a container that establishes the matching
// selection semantics.
func TestInteractionAriaSelectedRoles(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		chapter string
		name    string
		// wantsSelected marks the components that must keep at least one
		// aria-selected element after the repair.
		wantsSelected bool
	}{
		{"documents", "PrintPreview", true},
		{"documents", "DocumentViewer", true},
		{"documents", "EpubReader", true},
		{"messaging", "ChannelList", true},
		{"messaging", "ChannelItem", true},
		{"messaging", "MemberList", true},
		{"mail", "MailboxList", true},
		{"mail", "MailList", true},
		{"calendar", "AgendaView", true},
		{"project", "TaskItem", true},
		{"lists", "SelectableList", true},
		// WAI-ARIA 1.2 supports aria-selected on treeitem, so the tree
		// widgets carry it on the treeitem element.
		{"lists", "Tree", true},
		{"lists", "FileTree", true},
	}
	for _, tc := range cases {
		t.Run(tc.chapter+"/"+tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "aria-instance", Props: workspaceCommunicationProps()}); err != nil {
				t.Fatal(err)
			}
			doc, err := html.Parse(strings.NewReader(out.String()))
			if err != nil {
				t.Fatal(err)
			}
			nodes := interactionAriaSelectedNodes(doc)
			if tc.wantsSelected && len(nodes) == 0 {
				t.Fatalf("%s/%s rendered no aria-selected element", tc.chapter, tc.name)
			}
			interactionAriaCheckSelected(t, tc.chapter+"/"+tc.name, doc)
		})
	}
}
