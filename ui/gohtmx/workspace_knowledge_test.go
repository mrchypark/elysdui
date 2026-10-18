package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestWorkspaceArchiveCallerContent(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"Content", "Value"} {
		t.Run(field, func(t *testing.T) {
			var out bytes.Buffer
			const content = "caller/archive.txt\n<script>literal</script>"
			if err := RenderComponent(tpl, &out, Component{Chapter: "files", Name: "ArchiveViewer", ID: "caller-archive", Props: map[string]any{field: content}}); err != nil {
				t.Fatal(err)
			}
			doc, err := html.Parse(strings.NewReader(out.String()))
			if err != nil {
				t.Fatal(err)
			}
			pres := formNodes(doc, "pre")
			if len(pres) != 1 || pres[0].FirstChild == nil || pres[0].FirstChild.Data != content || len(formNodes(doc, "script")) != 0 {
				t.Fatal("archive content was lost or treated as HTML")
			}
		})
	}
}

func TestWorkspaceKnowledgeEmptyCallerDefaults(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"PageTree", "PageCover", "Backlinks", "TemplatePicker", "TrashBin", "VersionHistory"} {
		t.Run(name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "documents", Name: name, ID: "empty-knowledge"}); err != nil {
				t.Fatal(err)
			}
			if name == "Backlinks" && !strings.Contains(out.String(), "0 backlinks") {
				t.Fatal(out.String())
			}
		})
	}
	for _, links := range []any{nil, []map[string]any{}, []map[string]any{{"Title": "Caller", "URL": "#caller"}}} {
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: "documents", Name: "Backlinks", ID: "backlink-default", Props: map[string]any{"Links": links}}); err != nil {
			t.Fatal(err)
		}
	}
	var out bytes.Buffer
	if err := RenderComponent(tpl, &out, Component{Chapter: "documents", Name: "VersionHistory", ID: "history-default", Props: map[string]any{"Revisions": []map[string]any{{"ID": "current", "Content": "Current"}, {"ID": "older", "Content": "Older"}}}}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), `aria-selected="true" data-ws-revision="0"`) || !strings.Contains(out.String(), `data-ws-history-restore="1" hidden`) || strings.Contains(out.String(), `data-ws-history-restore="0"`) {
		t.Fatal(out.String())
	}
}

func TestWorkspaceKnowledgeEditablePropertiesAndSafePreview(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, disabled := range []bool{false, true} {
		var out bytes.Buffer
		props := map[string]any{"Disabled": disabled, "Properties": []map[string]any{
			{"Name": "Status", "Value": "review", "Options": []map[string]any{{"Value": "draft", "Label": "Draft"}, {"Value": "review", "Label": "Review"}}},
			{"Name": "Due", "Type": "date", "Value": "2026-10-20"},
			{"Name": "Published", "Type": "checkbox", "Checked": true},
		}}
		if err := RenderComponent(tpl, &out, Component{Chapter: "documents", Name: "PageProperties", ID: "caller-properties", Props: props}); err != nil {
			t.Fatal(err)
		}
		doc, err := html.Parse(strings.NewReader(out.String()))
		if err != nil {
			t.Fatal(err)
		}
		inputs := formNodes(doc, "input")
		if len(inputs) != 2 {
			t.Fatalf("inputs: %d", len(inputs))
		}
		for _, input := range inputs {
			name, _ := formAttr(input, "name")
			if name == "Due" {
				if value, _ := formAttr(input, "value"); value != "2026-10-20" {
					t.Fatal(value)
				}
			}
			if name == "Published" {
				if _, ok := formAttr(input, "checked"); !ok {
					t.Fatal("missing checked")
				}
			}
			if _, ok := formAttr(input, "disabled"); ok != disabled {
				t.Fatal("disabled property mismatch")
			}
		}
		options := formNodes(doc, "option")
		if len(options) != 2 {
			t.Fatal("missing options")
		}
		if _, ok := formAttr(options[1], "selected"); !ok {
			t.Fatal("lost selected property")
		}
	}
	var out bytes.Buffer
	if err := RenderComponent(tpl, &out, Component{Chapter: "documents", Name: "TemplatePicker", ID: "safe-preview", Props: map[string]any{"Templates": []map[string]any{{"ID": "caller", "Name": "Caller", "Content": "# Caller heading\n\n**Strong**\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))"}}}}); err != nil {
		t.Fatal(err)
	}
	doc, err := html.Parse(strings.NewReader(out.String()))
	if err != nil {
		t.Fatal(err)
	}
	if len(formNodes(doc, "script")) != 0 || len(formNodes(doc, "strong")) != 1 || len(formNodes(doc, "h1")) != 1 {
		t.Fatal("unsafe or missing rendered Markdown")
	}
	for _, link := range formNodes(doc, "a") {
		if href, _ := formAttr(link, "href"); strings.HasPrefix(href, "javascript:") {
			t.Fatal("unsafe link")
		}
	}
}
