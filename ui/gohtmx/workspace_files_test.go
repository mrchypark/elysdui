package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestWorkspaceFilesLegacyShapeAndDisabledRename(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	props := map[string]any{"FileView": "columns", "Disabled": true, "Entries": []map[string]any{{"Text": "unrelated terminal field"}}, "Items": []map[string]any{{"Value": "docs", "Label": "Documents", "Children": []map[string]any{{"Value": "docs/meeting.md", "Label": "meeting.md", "Detail": "6 KB"}}}}}
	if err := RenderComponent(tpl, &out, Component{Chapter: "files", Name: "FileExplorer", ID: "legacy-files", Props: props}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "meeting.md") || strings.Contains(out.String(), "data-ws-directory-table") {
		t.Fatal("generic Entries hijacked legacy Items")
	}
	doc, err := html.Parse(strings.NewReader(out.String()))
	if err != nil {
		t.Fatal(err)
	}
	for _, button := range formNodes(doc, "button") {
		if _, ok := formAttr(button, "disabled"); !ok {
			t.Fatal("legacy file control lost disabled state")
		}
	}
	out.Reset()
	if err := RenderComponent(tpl, &out, Component{Chapter: "files", Name: "RenameInline", ID: "disabled-rename", Props: map[string]any{"Disabled": true, "Path": "original.md", "Name": "filename", "Value": "<draft>"}}); err != nil {
		t.Fatal(err)
	}
	doc, err = html.Parse(strings.NewReader(out.String()))
	if err != nil {
		t.Fatal(err)
	}
	forms := formNodes(doc, "form")
	if len(forms) != 1 {
		t.Fatal("missing rename form")
	}
	fields := formNodes(forms[0], "fieldset")
	if len(fields) != 1 {
		t.Fatal("missing rename fieldset")
	}
	if _, ok := formAttr(fields[0], "disabled"); !ok {
		t.Fatal("rename fieldset enabled")
	}
	if _, ok := formAttr(fields[0], "hidden"); !ok {
		t.Fatal("rename should start closed")
	}
	for _, input := range formNodes(doc, "input") {
		if name, _ := formAttr(input, "name"); name == "filename" {
			if value, _ := formAttr(input, "value"); value != "<draft>" {
				t.Fatal("caller draft lost")
			}
		}
	}
}

func TestWorkspaceFilesDirectoryEntryCompatibility(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"FileList", "FileExplorer"} {
		var out bytes.Buffer
		props := map[string]any{"Disabled": true, "DirectoryEntries": []map[string]any{{"Value": "docs/old.md", "Label": "Legacy name", "Detail": "6 KB"}, {"Path": "docs/new.md", "Name": "<new name>", "Bytes": 12, "Size": "12 B"}}}
		if err := RenderComponent(tpl, &out, Component{Chapter: "files", Name: name, ID: "directory-entries", Props: props}); err != nil {
			t.Fatal(err)
		}
		doc, err := html.Parse(strings.NewReader(out.String()))
		if err != nil {
			t.Fatal(err)
		}
		rows := formNodes(doc, "tbody")
		if len(rows) != 1 {
			t.Fatal("missing directory table")
		}
		entries := formNodes(rows[0], "tr")
		if len(entries) != 2 {
			t.Fatal("missing caller entries")
		}
		for i, want := range []string{"docs/old.md", "docs/new.md"} {
			if path, _ := formAttr(entries[i], "data-path"); path != want {
				t.Fatal("caller path lost", path)
			}
		}
		if !strings.Contains(out.String(), "&lt;new name&gt;") || !strings.Contains(out.String(), "Legacy name") || !strings.Contains(out.String(), "6 KB") {
			t.Fatal("caller names/details lost or unescaped")
		}
		for _, button := range formNodes(doc, "button") {
			if _, ok := formAttr(button, "disabled"); !ok {
				t.Fatal("directory button enabled")
			}
		}
	}
	var empty bytes.Buffer
	if err := RenderComponent(tpl, &empty, Component{Chapter: "files", Name: "FileList", ID: "empty-directory", Props: map[string]any{"DirectoryEntries": []map[string]any{}}}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(empty.String(), "data-ws-directory-table") || !strings.Contains(empty.String(), "0 items") {
		t.Fatal("explicit empty directory fell back to legacy data")
	}
}
