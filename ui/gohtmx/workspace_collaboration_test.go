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

func TestActivityLogMobileLayoutKeepsTimeAndNativeLinkOrder(t *testing.T) {
	css, err := Files.ReadFile("assets/ely-api-workspace.css")
	if err != nil {
		t.Fatal(err)
	}
	for _, rule := range []string{
		"@media (max-width:40rem){[data-ely-family='workspace'] [data-ws-activity-entry]>div{min-width:0;grid-template-columns:minmax(0,1fr)}",
		"[data-ely-family='workspace'] [data-ws-activity-entry]>div>p,[data-ely-family='workspace'] [data-ws-activity-entry]>div>small{min-width:0;overflow-wrap:anywhere}",
		"[data-ely-family='workspace'] [data-ws-activity-entry]>div>time{grid-column:1;min-width:0;white-space:normal}",
	} {
		if !strings.Contains(string(css), rule) {
			t.Errorf("missing responsive ActivityLog rule: %s", rule)
		}
	}

	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	props := map[string]any{"Activities": []map[string]any{
		{"Author": "Caller", "Action": "updated", "Time": "4 minutes ago", "DateTime": "2026-10-11T10:40:00+09:00", "Target": "a long but readable target", "URL": "#caller-target"},
		{"Author": "Second caller", "Action": "reviewed", "Time": "Yesterday", "DateTime": "2026-10-10T10:40:00+09:00", "Target": "second target", "URL": "#second-target"},
	}}
	if err := RenderComponent(tpl, &out, Component{Chapter: "collab", Name: "ActivityLog", ID: "caller-activity", Props: props}); err != nil {
		t.Fatal(err)
	}
	doc, err := html.Parse(strings.NewReader(out.String()))
	if err != nil {
		t.Fatal(err)
	}
	links, times := formNodes(doc, "a"), formNodes(doc, "time")
	if len(links) != 2 || len(times) != 2 {
		t.Fatalf("got %d native links and %d times; want two each", len(links), len(times))
	}
	for i, want := range []string{"#caller-target", "#second-target"} {
		if href, ok := formAttr(links[i], "href"); !ok || href != want {
			t.Fatalf("native target link %d changed: href=%q present=%v", i, href, ok)
		}
		if _, ok := formAttr(links[i], "tabindex"); ok {
			t.Fatal("ActivityLog should preserve native anchor order without tabindex overrides")
		}
	}
	for i, want := range []string{"2026-10-11T10:40:00+09:00", "2026-10-10T10:40:00+09:00"} {
		if value, ok := formAttr(times[i], "datetime"); !ok || value != want {
			t.Fatalf("native time %d changed: datetime=%q present=%v", i, value, ok)
		}
	}
	var sequence []string
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "a" {
			sequence = append(sequence, "link")
		} else if node.Type == html.ElementNode && node.Data == "time" {
			sequence = append(sequence, "time")
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
	}
	visit(doc)
	if got, want := strings.Join(sequence, ","), "link,time,link,time"; got != want {
		t.Fatalf("native target/time DOM order = %q, want %q", got, want)
	}
}
