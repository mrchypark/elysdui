package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestWorkspaceCollaborationThreadContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"CommentThread", "Reply", "Reactions", "ReactionPicker", "CommentBubble", "CommentMarker", "CommentSidebar"} {
		for _, disabled := range []bool{false, true} {
			var out bytes.Buffer
			props := map[string]any{"Disabled": disabled, "ActiveThread": "open", "Threads": []map[string]any{
				{"ID": "open", "Quote": "<caller quote>", "Comments": []map[string]any{{"ID": "message", "Author": "Caller", "Text": "<script>literal</script>", "Reactions": []map[string]any{{"Emoji": "👍", "Count": 2, "Mine": true}}}}},
				{"ID": "done", "Resolved": true, "Comments": []map[string]any{{"Text": "Resolved"}}},
			}}
			if err := RenderComponent(tpl, &out, Component{Chapter: "collab", Name: name, ID: "caller-threads", Props: props}); err != nil {
				t.Fatal(err)
			}
			doc, err := html.Parse(strings.NewReader(out.String()))
			if err != nil {
				t.Fatal(err)
			}
			if len(formNodes(doc, "script")) != 0 || !strings.Contains(out.String(), "&lt;caller quote&gt;") {
				t.Fatalf("%s: unescaped caller text", name)
			}
			replies, resolves, reactions := 0, 0, 0
			for _, form := range formNodes(doc, "form") {
				if action, _ := formAttr(form, "data-ely-submit"); action == "reply-comment" {
					replies++
					for _, field := range formNodes(form, "input") {
						if fieldName, _ := formAttr(field, "name"); fieldName == "comment" {
							if value, _ := formAttr(field, "value"); value != "open" {
								t.Fatalf("%s: resolved thread has reply", name)
							}
						}
					}
				}
			}
			for _, button := range formNodes(doc, "button") {
				if _, got := formAttr(button, "disabled"); got != disabled {
					t.Fatalf("%s: disabled control mismatch", name)
				}
				if action, _ := formAttr(button, "data-ely-action"); action == "resolve-comment" {
					resolves++
				}
				if emoji, _ := formAttr(button, "data-ws-reaction"); emoji == "👍" {
					reactions++
					if pressed, _ := formAttr(button, "aria-pressed"); pressed != "true" {
						t.Fatal("lost caller reaction ownership")
					}
				}
			}
			if replies != 1 || resolves != 2 || reactions != 1 {
				t.Fatalf("%s: replies=%d resolve=%d reactions=%d", name, replies, resolves, reactions)
			}
		}
	}
}

func TestWorkspaceCollaborationSafeDefaultsAndSharePermissions(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"PresenceAvatars", "CommentThread", "CommentBubble", "CommentSidebar", "Annotation", "SuggestionMode", "ShareDialog", "ActivityLog"} {
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: "collab", Name: name, ID: "empty-collab"}); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
	}
	var out bytes.Buffer
	err = RenderComponent(tpl, &out, Component{Chapter: "collab", Name: "ShareDialog", ID: "caller-share", Props: map[string]any{
		"ShareURL": "https://example.test/doc", "Invitees": []map[string]any{{"Email": "one@example.test"}},
		"Members": []map[string]any{{"ID": "owner", "Name": "Owner", "Owner": true, "Role": "edit"}, {"ID": "reader", "Name": "Reader", "Role": "view"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	doc, err := html.Parse(strings.NewReader(out.String()))
	if err != nil {
		t.Fatal(err)
	}
	owner, restricted, pending := false, false, false
	for _, selectNode := range formNodes(doc, "select") {
		if member, _ := formAttr(selectNode, "data-member"); member == "owner" {
			_, owner = formAttr(selectNode, "disabled")
		}
		if _, link := formAttr(selectNode, "data-ws-link-access"); link {
			for _, option := range formNodes(selectNode, "option") {
				if value, _ := formAttr(option, "value"); value == "restricted" {
					_, restricted = formAttr(option, "selected")
				}
			}
		}
	}
	for _, button := range formNodes(doc, "button") {
		if _, remove := formAttr(button, "data-ws-share-remove"); remove {
			if value, _ := formAttr(button, "value"); value == "owner" {
				t.Fatal("owner can be removed")
			}
		}
	}
	for _, input := range formNodes(doc, "input") {
		if value, _ := formAttr(input, "value"); value == "one@example.test" {
			name, _ := formAttr(input, "name")
			kind, _ := formAttr(input, "type")
			pending = name == "invitee" && kind == "email"
		}
	}
	if !owner || !restricted || !pending {
		t.Fatalf("owner=%v restricted=%v pending=%v", owner, restricted, pending)
	}
}
