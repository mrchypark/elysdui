package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestWorkspaceCommitFormSpacingBothLayouts(t *testing.T) {
	css, err := Files.ReadFile("assets/ely-api-workspace.css")
	if err != nil {
		t.Fatal(err)
	}
	// Default CommitInput and ChangesList with ShowCommit share this form.
	if !strings.Contains(string(css), "[data-ely-family='workspace'] [data-ws-changes]>form{display:grid;align-content:start;gap:8px}") {
		t.Fatal("commit form must separate its labels, live count and submit control in both source and default layouts")
	}
}

func TestWorkspaceCommitInputMessageOnlyContract(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, summary := range []bool{false, true} {
		var out bytes.Buffer
		err := RenderComponent(tpl, &out, Component{Chapter: "git", Name: "CommitInput", ID: "commit-caller", Props: map[string]any{"Value": "Update worker", "ShowCommit": summary}})
		if err != nil {
			t.Fatal(err)
		}
		doc, err := html.Parse(strings.NewReader(out.String()))
		if err != nil {
			t.Fatal(err)
		}
		fields := map[string]*html.Node{}
		var walk func(*html.Node)
		walk = func(n *html.Node) {
			if n.Type == html.ElementNode && (n.Data == "input" || n.Data == "textarea" || n.Data == "select") {
				for _, a := range n.Attr {
					if a.Key == "name" {
						fields[a.Val] = n
					}
				}
			}
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				walk(c)
			}
		}
		walk(doc)
		message := fields["message"]
		if message == nil || message.Data != "textarea" || message.FirstChild == nil || message.FirstChild.Data != "Update worker" {
			t.Fatal("commit lost the caller message field or value")
		}
		if (fields["subject"] != nil) != summary {
			t.Fatalf("summary field must be opt-in: ShowCommit=%v", summary)
		}
		if !summary && len(fields) != 1 {
			t.Fatalf("message-only caller gained additional submitted fields: %v", fields)
		}
	}
}
