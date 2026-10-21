package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

// TestWorkspaceCommunicationSelectionRoles pins the role contract for the
// repaired selection widgets: every element that carries aria-selected must be
// an option inside a listbox, a tab inside a tablist, or a table row.
func TestWorkspaceCommunicationSelectionRoles(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		chapter, name string
		marker        string
		role          string
		container     string
	}{
		{"messaging", "ChannelList", "data-ely-channel", "option", "data-ely-roving-list"},
		{"messaging", "ChannelItem", "data-ely-channel", "option", "data-ely-roving-list"},
		{"messaging", "MemberList", "data-ely-member", "option", "data-ely-members"},
		{"mail", "MailboxList", "data-ely-mailbox", "option", "ely-communication-list"},
		{"mail", "MailList", "data-ely-mail-open", "option", "data-ely-mail-list"},
		{"calendar", "AgendaView", "data-calendar-agenda", "option", "ely-calendar-agenda"},
		{"documents", "PrintPreview", "data-ws-print-thumb", "option", "data-ws-print-pages"},
		{"documents", "DocumentViewer", "data-ws-page", "option", "data-ws-page-thumbnails"},
		{"documents", "EpubReader", "data-ws-epub-chapter", "option", "data-ws-epub-nav"},
	}
	for _, tc := range cases {
		t.Run(tc.chapter+"/"+tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "role-instance", Props: workspaceCommunicationProps()}); err != nil {
				t.Fatal(err)
			}
			doc, err := html.Parse(strings.NewReader(out.String()))
			if err != nil {
				t.Fatal(err)
			}
			var found bool
			var walk func(*html.Node)
			walk = func(n *html.Node) {
				if n.Type == html.ElementNode {
					if _, ok := formAttr(n, tc.marker); ok {
						found = true
						if role := interactionAriaRole(n); role != tc.role {
							t.Errorf("[%s] has role %q, want %q", tc.marker, role, tc.role)
						}
						if _, ok := formAttr(n, "aria-selected"); !ok {
							t.Errorf("[%s] lost aria-selected", tc.marker)
						}
						if !interactionAriaAncestorRole(n, "listbox") {
							t.Errorf("[%s] is not inside a listbox container", tc.marker)
						}
					}
				}
				for child := n.FirstChild; child != nil; child = child.NextSibling {
					walk(child)
				}
			}
			walk(doc)
			if !found {
				t.Fatalf("marker %s not rendered", tc.marker)
			}
		})
	}
}

// The option role makes descendants presentational; completion must remain
// independent: https://www.w3.org/TR/wai-aria-1.2/#option.
func TestTaskItemIndependentCompletionAndSelection(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, disabled := range []bool{false, true} {
		var out bytes.Buffer
		props := map[string]any{"Disabled": disabled, "Items": []map[string]any{{"Value": "task-1", "Title": "Review task", "Done": true}}}
		if err := RenderComponent(tpl, &out, Component{Chapter: "project", Name: "TaskItem", ID: "task-access", Props: props}); err != nil {
			t.Fatal(err)
		}
		doc, err := html.Parse(strings.NewReader(out.String()))
		if err != nil {
			t.Fatal(err)
		}
		var button, checkbox *html.Node
		var walk func(*html.Node)
		walk = func(n *html.Node) {
			if _, ok := formAttr(n, "data-project-task-select"); ok {
				button = n
			}
			if _, ok := formAttr(n, "data-ely-task-done"); ok {
				checkbox = n
			}
			for child := n.FirstChild; child != nil; child = child.NextSibling {
				walk(child)
			}
		}
		walk(doc)
		if button == nil || checkbox == nil {
			t.Fatal("task needs independent selection button and completion checkbox")
		}
		if button.Data != "button" {
			t.Fatal("selection must be a native button")
		}
		if kind, _ := formAttr(checkbox, "type"); checkbox.Data != "input" || kind != "checkbox" || checkbox.Parent != button.Parent {
			t.Fatal("completion must be a native checkbox beside the selection button")
		}
		if label, _ := formAttr(checkbox, "aria-label"); label != "Complete Review task" {
			t.Fatalf("completion label = %q", label)
		}
		if pressed, _ := formAttr(button, "aria-pressed"); pressed != "false" {
			t.Fatalf("initial pressed state = %q", pressed)
		}
		if interactionAriaAncestorRole(checkbox, "option", "listbox", "button") || interactionAriaAncestorTag(checkbox, "button") {
			t.Fatal("checkbox semantics hidden by selection ancestor")
		}
		if _, ok := formAttr(checkbox, "checked"); !ok {
			t.Fatal("lost Done state")
		}
		for _, n := range []*html.Node{button, checkbox} {
			if _, ok := formAttr(n, "disabled"); ok != disabled {
				t.Fatal("lost disabled state")
			}
		}
		if len(interactionAriaSelectedNodes(doc)) != 0 {
			t.Fatal("task must use pressed state, not aria-selected")
		}
	}
}

// TestWorkspaceCommunicationNativeRowsKeepAriaSelected checks that native
// table rows keep aria-selected: a plain table gives its rows an implicit
// row role, which supports the attribute.
func TestWorkspaceCommunicationNativeRowsKeepAriaSelected(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		chapter, name string
		marker        string
	}{
		{"debug", "NetworkInspector", "data-ws-network-row"},
		{"terminal", "ProcessList", "data-ws-process"},
	}
	for _, tc := range cases {
		t.Run(tc.chapter+"/"+tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "row-instance", Props: workspaceCommunicationProps()}); err != nil {
				t.Fatal(err)
			}
			doc, err := html.Parse(strings.NewReader(out.String()))
			if err != nil {
				t.Fatal(err)
			}
			var found bool
			var walk func(*html.Node)
			walk = func(n *html.Node) {
				if n.Type == html.ElementNode {
					if _, ok := formAttr(n, tc.marker); ok {
						found = true
						if role := interactionAriaRole(n); role != "row" {
							t.Errorf("[%s] has role %q, want the implicit row role", tc.marker, role)
						}
						if _, ok := formAttr(n, "aria-selected"); !ok {
							t.Errorf("[%s] lost aria-selected", tc.marker)
						}
					}
				}
				for child := n.FirstChild; child != nil; child = child.NextSibling {
					walk(child)
				}
			}
			walk(doc)
			if !found {
				t.Fatalf("marker %s not rendered", tc.marker)
			}
		})
	}
}

// workspaceCommunicationProps returns generic caller data that exercises the
// list, table and card branches of the workspace and communication templates.
func workspaceCommunicationProps() map[string]any {
	return map[string]any{
		"Title": "Caller title", "Value": "caller-value", "Content": "caller content",
		"Path": "src/main.go", "Name": "main.go", "Query": "caller", "Include": "src/**",
		"DocumentID": "doc-1", "Paper": "A4", "Orientation": "portrait", "Copies": 1,
		"Selected": "caller-value", "SelectedCandidate": "one", "SelectedTemplate": "one",
		"SelectedPath": "src/main.go", "MarkdownMode": "visual", "Filter": "src/**",
		"Items": []map[string]any{{
			"Value": "one", "Label": "One", "Title": "One", "Path": "src/main.go", "Name": "main.go",
			"Text": "caller text", "Line": 12, "Author": "Ana", "Revision": "abc", "Age": "2d", "Hue": 12,
			"Start": "09:00", "End": "10:00", "Selected": true, "Unread": 3, "Message": "caller message",
		}},
		"Files":      []map[string]any{{"Value": "one", "Label": "One", "Path": "src/main.go", "Name": "main.go"}},
		"Options":    []map[string]any{{"Value": "one", "Label": "One"}},
		"Candidates": []map[string]any{{"ID": "one", "Label": "One", "Detail": "caller", "InsertText": "one"}},
		"Rows": []map[string]any{{
			"Value": "one", "Label": "One", "Detail": "caller", "Current": true, "Revision": "abc",
			"Author": "Ana", "Age": "2d", "Line": 12, "Text": "caller text",
		}},
		"Entries":      []map[string]any{{"Value": "src/main.go", "Label": "main.go", "Path": "src/main.go", "Name": "main.go", "Size": "12 B", "Modified": "today"}},
		"Pages":        []map[string]any{{"Title": "Page one", "Content": "caller page"}},
		"Chapters":     []map[string]any{{"Title": "Chapter one", "Content": "caller chapter"}},
		"Requests":     []map[string]any{{"Name": "notes", "Method": "POST", "URL": "/notes", "Status": 202, "Kind": "fetch", "Size": "1 kB", "Start": 0, "Duration": 18, "Selected": true, "Body": "caller response"}},
		"Processes":    []map[string]any{{"PID": 4242, "Name": "worker", "CPU": 12.5, "Memory": "48 MB"}},
		"Branches":     []map[string]any{{"Value": "feature/worker", "Label": "feature/worker"}},
		"Revisions":    []map[string]any{{"ID": "rev1", "Author": "Ana", "Content": "caller revision", "Time": "09:00", "Initials": "AN"}},
		"Variables":    []map[string]any{{"Name": "caller", "Value": "1", "Type": "int"}},
		"SearchGroups": []map[string]any{{"Path": "src/main.go", "Hits": []map[string]any{{"Line": 12, "Text": "caller text"}}}},
		"Pins":         []map[string]any{{"Value": "caller", "Label": "Caller", "Title": "Caller"}},
		"FoundFiles":   []map[string]any{{"Name": "main.go", "Folder": "src", "Path": "src/main.go"}},
		"Cells":        [][]string{{"caller"}},
		"Columns":      []string{"Name"},
		"Sections":     []map[string]any{{"Label": "Section", "Items": []map[string]any{{"Value": "one", "Label": "One"}}}},
	}
}

// TestWorkspaceCommunicationAriaSelectedRoles renders the workspace and
// communication templates and checks every aria-selected element.
func TestWorkspaceCommunicationAriaSelectedRoles(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		chapter string
		name    string
	}{
		{"editor", "SearchPanel"},
		{"editor", "CompletionMenu"},
		{"documents", "MarkdownEditor"},
		{"terminal", "Terminal"},
		{"git", "BlameView"},
		{"git", "BranchSelector"},
		{"debug", "NetworkInspector"},
		{"terminal", "ProcessList"},
		{"documents", "PrintPreview"},
		{"documents", "DocumentViewer"},
		{"documents", "EpubReader"},
		{"documents", "VersionHistory"},
		{"documents", "TemplatePicker"},
		{"files", "FileGrid"},
		{"files", "FileItem"},
		{"files", "FileSearch"},
		{"files", "FileList"},
		{"messaging", "ChannelList"},
		{"messaging", "ChannelItem"},
		{"messaging", "MemberList"},
		{"mail", "MailboxList"},
		{"mail", "MailList"},
		{"calendar", "AgendaView"},
		{"project", "TaskItem"},
		{"project", "DatabaseView"},
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
			interactionAriaCheckSelected(t, tc.chapter+"/"+tc.name, doc)
		})
	}
}

// TestWorkspaceCommunicationNoOrphanAriaSelected pins the repaired call
// sites: the buttons and articles that used to carry aria-selected outside a
// role structure must now sit in a listbox/option pair.
func TestWorkspaceCommunicationNoOrphanAriaSelected(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		chapter, name string
		markers       []string
		options       []string
	}{
		{"documents", "PrintPreview", []string{"data-ws-print-thumb"}, []string{"data-ws-print-pages"}},
		{"documents", "DocumentViewer", []string{"data-ws-page"}, []string{"data-ws-page-thumbnails"}},
		{"messaging", "ChannelList", []string{"data-ely-channel"}, []string{"data-ely-roving-list"}},
		{"messaging", "MemberList", []string{"data-ely-member"}, []string{"data-ely-members"}},
		{"mail", "MailboxList", []string{"data-ely-mailbox"}, []string{"ely-communication-list"}},
		{"mail", "MailList", []string{"data-ely-mail-open"}, []string{"data-ely-mail-list"}},
		{"calendar", "AgendaView", []string{"data-calendar-agenda"}, []string{"ely-calendar-agenda"}},
		{"project", "TaskItem", []string{"data-project-row"}, []string{"ely-project-tasks"}},
	}
	for _, tc := range cases {
		t.Run(tc.chapter+"/"+tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "orphan-instance", Props: workspaceCommunicationProps()}); err != nil {
				t.Fatal(err)
			}
			markup := out.String()
			for _, marker := range tc.markers {
				if !strings.Contains(markup, marker) {
					t.Fatalf("missing %s in %s", marker, markup)
				}
			}
			for _, marker := range tc.options {
				if !strings.Contains(markup, marker) {
					t.Fatalf("missing container %s in %s", marker, markup)
				}
			}
			doc, err := html.Parse(strings.NewReader(markup))
			if err != nil {
				t.Fatal(err)
			}
			for _, node := range interactionAriaSelectedNodes(doc) {
				role := interactionAriaRole(node)
				if role == "" {
					t.Errorf("<%s> still carries aria-selected without a role", node.Data)
					continue
				}
				if role == "option" && !interactionAriaAncestorRole(node, "listbox") {
					t.Errorf("<%s role=option> is not inside a listbox container", node.Data)
				}
			}
		})
	}
}

// TestWorkspaceSearchPanelKeepsIncludeWithoutDeadIgnore checks that the
// editor search panel keeps its working include filter and no longer renders
// the checkbox that no script ever read.
func TestWorkspaceSearchPanelKeepsIncludeWithoutDeadIgnore(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := RenderComponent(tpl, &out, Component{Chapter: "editor", Name: "SearchPanel", ID: "search-instance", Props: workspaceCommunicationProps()}); err != nil {
		t.Fatal(err)
	}
	markup := out.String()
	if !strings.Contains(markup, "data-ws-search-include") {
		t.Fatalf("search panel lost the include filter: %s", markup)
	}
	if strings.Contains(markup, "data-ws-search-ignore") {
		t.Fatalf("search panel still renders the dead ignore checkbox: %s", markup)
	}
}
