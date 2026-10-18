package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestWorkspaceFileDetailsCallerContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name    string
		props   map[string]any
		markers []string
	}{
		{"RecentFiles", map[string]any{"Files": []map[string]any{{"Name": "<caller>.md", "Folder": "caller/folder", "Opened": "2026-10-13T12:00:00Z"}}, "Zone": "UTC"}, []string{`data-path="caller/folder/&lt;caller&gt;.md"`, `data-opened="2026-10-13T12:00:00Z"`, `data-zone="UTC"`}},
		{"Favorites", map[string]any{"Pins": []map[string]any{{"Key": "caller-key", "Icon": "☆", "Title": "<pin>"}}}, []string{`data-ws-favorite="caller-key"`, `open-favorite`, `&lt;pin&gt;`}},
		{"Bookmarks", map[string]any{"Pins": []map[string]any{{"Value": "caller-key", "Label": "<pin>"}}}, []string{`data-ws-favorite="caller-key"`, `open-favorite`, `&lt;pin&gt;`}},
		{"FileSearch", map[string]any{"Query": "caller", "FoundFiles": []map[string]any{{"Name": "caller.md", "Folder": "docs"}}, "Items": []map[string]any{{"Path": "unrelated"}}}, []string{`data-ws-file-query`, `data-path="docs/caller.md"`}},
		{"DuplicateFinder", map[string]any{"DuplicateSets": []map[string]any{{"Name": "<copy>", "Bytes": 12, "Paths": []map[string]any{{"Path": "a"}, {"Path": "b", "Marked": true}}}}}, []string{`data-bytes="12"`, `name="marked"`, `value="b"`, `checked`, `&lt;copy&gt;`}},
		{"ArchiveViewer", map[string]any{"ArchiveName": "<caller>.zip", "ArchiveEntries": []map[string]any{{"Path": "folder/<file>", "Size": 80, "Packed": 40}}, "Content": "legacy manifest"}, []string{`&lt;caller&gt;.zip`, `data-path="folder/&lt;file&gt;"`, `data-size="80"`, `data-packed="40"`}},
		{"HexViewer", map[string]any{"Bytes": []int{0, 65, 255}, "Offset": 16, "SelectedStart": 1, "SelectedEnd": 3}, []string{`data-selected-start="1"`, `data-selected-end="3"`, `00000010`, `data-ws-byte`}},
		{"FileOperationProgress", map[string]any{"State": "paused", "Operation": "copy", "Count": 2, "To": "<disk>", "Moved": 5, "Total": 8, "CanResume": true, "CanCancel": true}, []string{`data-state="paused"`, `data-to="&lt;disk&gt;"`, `resume-operation`, `cancel-operation`}},
		{"TransferQueue", map[string]any{"TransferStates": true, "Transfers": []map[string]any{{"ID": "caller", "Name": "<report>", "State": "moving", "Moved": 5, "Total": 8, "Rate": 1, "CanPause": true}}}, []string{`data-ws-transfer="caller"`, `&lt;report&gt;`, `pause-transfer`}},
		{"DownloadManager", map[string]any{"TransferStates": true, "CanClear": true, "Transfers": []map[string]any{{"ID": "caller", "Name": "report", "State": "done", "CanOpen": true, "CanShow": true}}}, []string{`data-ws-transfers-done`, `data-ws-clear-downloads`, `open-download`, `show-download`}},
		{"StorageUsage", map[string]any{"Capacity": 100, "Parts": []map[string]any{{"Name": "<documents>", "Bytes": 80}}}, []string{`data-capacity="100"`, `data-bytes="80"`, `&lt;documents&gt;`}},
	}
	for _, tc := range cases {
		for _, disabled := range []bool{false, true} {
			t.Run(tc.name+map[bool]string{true: "/disabled", false: "/enabled"}[disabled], func(t *testing.T) {
				tc.props["Disabled"] = disabled
				var out bytes.Buffer
				if err := RenderComponent(tpl, &out, Component{Chapter: "files", Name: tc.name, ID: "caller-files", Props: tc.props}); err != nil {
					t.Fatal(err)
				}
				for _, marker := range tc.markers {
					if !strings.Contains(out.String(), marker) {
						t.Fatalf("missing %s in %s", marker, out.String())
					}
				}
				doc, err := html.Parse(strings.NewReader(out.String()))
				if err != nil {
					t.Fatal(err)
				}
				for _, tag := range []string{"button", "input"} {
					for _, control := range formNodes(doc, tag) {
						if _, got := formAttr(control, "disabled"); got != disabled {
							t.Fatalf("%s disabled=%t want %t", tag, got, disabled)
						}
					}
				}
				if tc.name == "FileSearch" && (strings.Contains(out.String(), "data-ws-search-include") || strings.Contains(out.String(), "unrelated")) {
					t.Fatal("file results inherited editor or legacy fields")
				}
			})
		}
	}
}

func TestWorkspaceFileTransferStateActions(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	allowed := map[string][]string{"moving": {"pause-transfer", "cancel-transfer"}, "paused": {"resume-transfer", "cancel-transfer"}, "queued": {"cancel-transfer"}, "failed": {"retry-transfer", "cancel-transfer"}, "done": {"open-download", "show-download"}}
	for state, want := range allowed {
		t.Run(state, func(t *testing.T) {
			var out bytes.Buffer
			props := map[string]any{"TransferStates": true, "Transfers": []map[string]any{{"ID": "key", "Name": "caller", "State": state, "CanPause": true, "CanResume": true, "CanRetry": true, "CanCancel": true, "CanOpen": true, "CanShow": true}}}
			if err := RenderComponent(tpl, &out, Component{Chapter: "files", Name: "DownloadManager", ID: "transfer-state", Props: props}); err != nil {
				t.Fatal(err)
			}
			doc, err := html.Parse(strings.NewReader(out.String()))
			if err != nil {
				t.Fatal(err)
			}
			buttons := formNodes(doc, "button")
			if len(buttons) != len(want) {
				t.Fatalf("%s actions %d want %d", state, len(buttons), len(want))
			}
			for i, button := range buttons {
				if action, _ := formAttr(button, "data-ely-action"); action != want[i] {
					t.Fatalf("action=%s want %s", action, want[i])
				}
				if value, _ := formAttr(button, "value"); value != "key" {
					t.Fatal("lost caller identity")
				}
			}
			bars := formNodes(doc, "progress")
			if (len(bars) == 1) != (state == "moving" || state == "paused") {
				t.Fatal("wrong progress visibility")
			}
		})
	}
}

func TestWorkspaceFileDetailsEmptyAndLegacy(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for name, field := range map[string]string{"Favorites": "Pins", "FileSearch": "FoundFiles", "DuplicateFinder": "DuplicateSets", "ArchiveViewer": "ArchiveEntries", "FileOperationProgress": "Operations", "StorageUsage": "Parts"} {
		for _, value := range []any{nil, []map[string]any{}} {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "files", Name: name, ID: "empty-files", Props: map[string]any{field: value}}); err != nil {
				t.Fatalf("%s: %v", name, err)
			}
		}
	}
	for _, chapter := range []string{"files", "editor"} {
		name := "FileSearch"
		if chapter == "editor" {
			name = "SearchPanel"
		}
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: chapter, Name: name, ID: "legacy-search", Props: map[string]any{"Items": []map[string]any{{"Path": "caller/old.go", "Detail": "legacy result"}}}}); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(out.String(), "caller/old.go") || !strings.Contains(out.String(), "data-ws-search-include") {
			t.Fatal("legacy search contract changed")
		}
	}
}
