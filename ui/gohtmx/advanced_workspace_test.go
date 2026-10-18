package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestWorkspaceAPIRenderersEscapeCallerDataAndKeepIDsLocal(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, chapter := range []string{"editor", "terminal", "git", "debug", "documents", "collab", "files", "canvas", "devtools"} {
		t.Run(chapter, func(t *testing.T) {
			var out bytes.Buffer
			component := Component{Chapter: chapter, Name: primaryWorkspaceStory(chapter), ID: "one-" + chapter, Props: map[string]any{"Title": `<img src=x onerror=1>`, "Value": "<unsafe>", "Items": []map[string]any{{"Value": "one", "Label": "One"}}, "Options": []map[string]any{{"Value": "one", "Label": "One"}}}}
			if err := RenderComponent(tpl, &out, component); err != nil {
				t.Fatal(err)
			}
			got := out.String()
			if strings.Contains(got, "<img") || !strings.Contains(got, "&lt;img") {
				t.Fatalf("caller strings are not escaped: %s", got)
			}
			if !strings.Contains(got, `id="one-`+chapter) {
				t.Fatalf("renderer lost local ID: %s", got)
			}
		})
	}
}

func TestWorkspaceDomainControlsRetainCallerData(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	props := map[string]any{
		"Title": "Caller title", "Value": "renamed.md", "Name": "name", "Path": "docs/original.md", "Required": true,
		"Content": "<script>caller content</script>", "Bytes": []int{0, 65, 127, 255}, "Offset": 16,
		"Progress": 37, "Total": 80, "Used": 240, "Capacity": 500, "Unit": "GB",
		"Session": "debug-12", "Status": "Paused", "Query": "",
		"Breakpoints":   []map[string]any{{"ID": "bp", "File": "src/main.go", "Line": 27, "Enabled": true}},
		"Stack":         []map[string]any{{"ID": "frame", "Function": "Handle", "File": "src/main.go", "Line": 27}},
		"Variables":     []map[string]any{{"Key": "Locals/request", "Name": "request", "Value": "object", "Children": []map[string]any{{"Key": "Locals/request/attempts", "Name": "attempts", "Value": 4, "Type": "int", "Changed": true}}}},
		"Scopes":        []map[string]any{{"Name": "Locals", "Open": true, "Variables": []map[string]any{{"Key": "Locals/request", "Name": "request", "Value": "object", "Children": []map[string]any{{"Key": "Locals/request/attempts", "Name": "attempts", "Value": 4, "Type": "int", "Changed": true}}}}}, {"Name": "Globals", "Open": false}},
		"ProfileFrames": []map[string]any{{"ID": "root", "Name": "Caller", "Samples": 200, "Depth": 0}, {"ID": "parse", "Name": "Parse", "Samples": 40, "Depth": 1}}, "Duration": 200,
		"TimelineTracks": []map[string]any{{"Name": "Main", "Spans": []map[string]any{{"ID": "caller-span", "Name": "Caller work", "Start": 0, "End": 40}}}},
		"Requests":       []map[string]any{{"Name": "notes", "Method": "POST", "URL": "/notes", "Status": 202, "Kind": "fetch", "Size": "1 kB", "Start": 0, "Duration": 18, "Selected": true, "Body": "caller response"}},
		"Processes":      []map[string]any{{"PID": 4242, "Name": "worker", "CPU": 12.5, "Memory": "48 MB"}},
		"Entries":        []map[string]any{{"Time": "10:32", "Level": "error", "Text": "caller retry"}},
		"AnsiSpans":      []map[string]any{{"Tone": "red", "Text": "FAIL "}, {"Tone": "dim", "Text": "caller retry"}},
		"Branches":       []map[string]any{{"Value": "feature/worker", "Label": "feature/worker"}}, "Selected": "feature/worker",
		"Changes":  []map[string]any{{"Path": "src/main.go", "Status": "Modified"}},
		"Todos":    []map[string]any{{"ID": "todo", "Text": "Review caller", "Checked": true}},
		"Chapters": []map[string]any{{"Title": "Overview", "Content": "Caller overview"}},
		"Columns":  []string{"Name", "Budget"}, "Cells": [][]string{{"Caller", "1200"}},
		"Revisions": []map[string]any{{"ID": "rev1", "Author": "Caller", "Content": "Caller revision"}},
		"Deleted":   []map[string]any{{"ID": "deleted", "Path": "retired.md"}},
		"Transfers": []map[string]any{{"ID": "transfer", "Name": "report.pdf", "Progress": 32, "Total": 80, "Status": "Paused"}},
		"Tools":     []map[string]any{{"Value": "rectangle", "Label": "Rectangle"}}, "Tool": "rectangle",
		"Layers": []map[string]any{{"ID": "layer", "Name": "Caller layer", "Visible": true}},
		"Color":  "#336699", "Width": 320, "Height": 180, "Gap": 16, "AutoLayout": true,
		"Nodes": []map[string]any{{"ID": "node", "X": 40, "Y": 70, "Width": 130, "Height": 60, "Label": "Caller node"}},
		"Items": []map[string]any{{"Path": "src/main.go", "Label": "Caller item"}},
	}
	memoryBytes := []map[string]any{}
	for index, hex := range []string{"00", "41", "7f", "ff", "10", "41", "42", "43", "20", "6d", "65", "6d", "6f", "72", "79", "21"} {
		memoryBytes = append(memoryBytes, map[string]any{"Index": index, "Hex": hex, "Reading": "caller byte"})
	}
	props["Label"] = "Caller memory"
	props["HexRows"] = []map[string]any{{"Address": "00007ffd5a201000", "Text": "caller memory", "Cells": memoryBytes}}
	for _, tc := range []struct {
		chapter, name string
		want          []string
	}{
		{"files", "RenameInline", []string{"data-ws-rename", "data-ws-rename-cancel", "docs/original.md", "renamed.md"}},
		{"files", "FileSearch", []string{"type=\"search\"", "data-ws-search-row", "src/main.go"}},
		{"editor", "SearchPanel", []string{"type=\"search\"", "data-ws-search-row"}},
		{"files", "FilePreview", []string{"data-ws-preview", "&lt;script&gt;caller content&lt;/script&gt;"}},
		{"files", "HexViewer", []string{"data-ws-hex-byte", "00007ffd5a201000", "00", "41", "7f", "ff"}},
		{"debug", "MemoryViewer", []string{"data-ws-hex", "data-ws-hex-byte", "Caller memory"}},
		{"files", "FileOperationProgress", []string{"value=\"37\"", "max=\"80\""}},
		{"files", "TransferQueue", []string{"resume-transfer", "value=\"32\"", "report.pdf"}},
		{"files", "DownloadManager", []string{"cancel-transfer", "report.pdf"}},
		{"files", "StorageUsage", []string{"<meter", "value=\"240\"", "max=\"500\""}},
		{"debug", "DebugToolbar", []string{"debug-run", "debug-pause", "debug-step", "debug-12"}},
		{"debug", "BreakpointList", []string{"type=\"checkbox\"", "data-file=\"src/main.go\"", "data-line=\"27\"", "Call stack"}},
		{"debug", "VariablesPanel", []string{"data-ws-variable-scope", "data-ws-variable-branch", "attempts", ">4</code>"}},
		{"debug", "PerformanceProfiler", []string{"data-ws-flamegraph", "data-ws-timeline", "Caller work", "Parse"}},
		{"debug", "NetworkInspector", []string{"data-ws-network-inspector", "data-ws-network-row", "POST /notes", "202", "18 ms", "caller response"}},
		{"terminal", "ProcessList", []string{"terminate-process", "4242", "12.5", "48 MB"}},
		{"terminal", "AnsiText", []string{"data-ws-ansi", "data-ws-ansi-tone=\"red\"", "FAIL", "caller retry"}},
		{"terminal", "LogViewer", []string{"type=\"search\"", "data-ws-search-row"}},
		{"git", "BranchSelector", []string{"data-ws-branch-dialog", "data-ws-branch-pick=\"feature/worker\"", "feature/worker"}},
		{"git", "ChangesList", []string{"data-ws-change-action=\"stage\"", "src/main.go", "Modified"}},
		{"documents", "TodoItem", []string{"type=\"checkbox\"", "data-ws-todo", "Review caller"}},
		{"documents", "DocumentViewer", []string{"data-ws-page", "Caller overview"}},
		{"documents", "OfficePreview", []string{"<table", "1200"}},
		{"documents", "EpubReader", []string{"data-ws-epub-content", "Caller overview"}},
		{"documents", "VersionHistory", []string{"data-ws-revision", "Caller revision"}},
		{"documents", "TrashBin", []string{"restore-file", "retired.md"}},
		{"canvas", "ToolPalette", []string{"data-ws-tool", "Rectangle"}},
		{"canvas", "LayerPanel", []string{"data-ws-layer", "Caller layer"}},
		{"canvas", "ColorPanel", []string{"type=\"color\"", "fill=\"#336699\""}},
		{"canvas", "ConstraintsEditor", []string{"name=\"width\"", "name=\"height\"", "name=\"gap\"", "name=\"autoLayout\""}},
		{"canvas", "NodeEditor", []string{"translate(40 70)", "width=\"130\"", "Caller node"}},
	} {
		t.Run(tc.chapter+"/"+tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "domain-instance", Props: props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q in %s", want, out.String())
				}
			}
			if strings.Contains(out.String(), "<script>caller") {
				t.Fatal("unescaped caller content")
			}
			if tc.name == "FilePreview" || tc.name == "MemoryViewer" || tc.name == "HexViewer" || tc.name == "OfficePreview" || tc.name == "DocumentViewer" || tc.name == "EpubReader" {
				if strings.Contains(out.String(), "contenteditable=\"true\"") || strings.Contains(out.String(), "<textarea") {
					t.Fatal("readonly display became editable")
				}
			}
		})
	}
}
func TestWorkspaceDomainAliasesAndNativeValidation(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ chapter, name, marker string }{
		{"debug", "ConsoleREPL", "name=\"expression\""}, {"git", "CommitInput", "name=\"message\""},
		{"canvas", "ExportPanel", "data-ely-action=\"export-selection\""},
	} {
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "alias-instance", Props: map[string]any{}}); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(out.String(), tc.marker) {
			t.Errorf("%s loses alias control", tc.name)
		}
	}
	var out bytes.Buffer
	if err := RenderComponent(tpl, &out, Component{Chapter: "files", Name: "RenameInline", ID: "rename-instance", Props: map[string]any{"Disabled": true, "Required": true, "Name": "filename", "Value": "<unsafe>"}}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"<fieldset disabled", "name=\"filename\"", "required", "&lt;unsafe&gt;"} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("rename loses %s", want)
		}
	}
}

func TestWorkspaceMarkdownRendererAliasLandmarks(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ name, marker string }{
		{"MarkdownRenderer", "ely-workspace__markdown"},
		{"TableOfContents", "data-ws-markdown-nav"},
		{"DocumentOutline", "data-ws-markdown-nav"},
		{"ReadingProgress", "data-ws-reading-progress"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			err := RenderComponent(tpl, &out, Component{Chapter: "documents", Name: tc.name, ID: "markdown-alias", Props: map[string]any{"Value": "# Caller heading\n\n## Detail\n\nRead-only content"}})
			if err != nil {
				t.Fatal(err)
			}
			for _, want := range []string{tc.marker, "<h1>Caller heading</h1>", "<h2>Detail</h2>"} {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %s", want)
				}
			}
			if strings.Contains(out.String(), "<textarea") || strings.Contains(out.String(), "contenteditable") {
				t.Fatal("markdown renderer alias became editable")
			}
			if tc.name == "ReadingProgress" && !strings.Contains(out.String(), "data-ws-reading tabindex") {
				t.Fatal("reading progress lacks its own scroll region")
			}
		})
	}
}

func primaryWorkspaceStory(chapter string) string {
	return map[string]string{"editor": "CodeEditor", "terminal": "Terminal", "git": "DiffViewer", "debug": "DebugToolbar", "documents": "RichTextEditor", "collab": "PresenceAvatars", "files": "FileIcon", "canvas": "InfiniteCanvas", "devtools": "ConnectionManager"}[chapter]
}

func TestWorkspaceEditableFormsAndRequestMethods(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ chapter, name, action string }{
		{"editor", "CodeEditor", "save-code"}, {"devtools", "QueryEditor", "save-code"},
		{"documents", "RichTextEditor", "save-content"}, {"documents", "BlockEditor", "save-content"},
		{"collab", "CommentThread", "save-content"},
	} {
		t.Run(tc.chapter+"/"+tc.name, func(t *testing.T) {
			var out bytes.Buffer
			err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "editor-instance", Props: map[string]any{"Name": "callerField", "Value": "<caller code>", "Content": "<caller rich>", "Required": true}})
			if err != nil {
				t.Fatal(err)
			}
			for _, want := range []string{"<form", "data-ely-submit=\"" + tc.action + "\"", "data-ws-edit-form", "data-ws-required=\"true\"", "name=\"callerField\"", "type=\"hidden\"", "data-ws-content-value", "type=\"submit\"", "aria-describedby=\"editor-instance-error\"", "data-ws-edit-error"} {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %s in %s", want, out.String())
				}
			}
			if strings.Contains(out.String(), "<caller code>") || strings.Contains(out.String(), "<caller rich>") {
				t.Fatal("editable caller content is not escaped")
			}
		})
	}
	for _, custom := range []bool{false, true} {
		props := map[string]any{"Method": "POST", "Endpoint": "/caller", "Action": "send-caller"}
		if custom {
			props["MethodOptions"] = []map[string]any{{"Value": "POST", "Label": "Submit"}, {"Value": "PATCH", "Label": "Update"}}
		}
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: "devtools", Name: "ApiRequestBuilder", ID: "request-instance", Props: props}); err != nil {
			t.Fatal(err)
		}
		for _, want := range []string{"name=\"method\"", "value=\"POST\" selected", "value=\"PATCH\"", "data-ely-submit=\"send-caller\""} {
			if !strings.Contains(out.String(), want) {
				t.Errorf("custom=%v missing %s in %s", custom, want, out.String())
			}
		}
		if custom && strings.Contains(out.String(), "value=\"GET\"") {
			t.Fatal("custom MethodOptions were ignored")
		}
	}
}

func TestWorkspaceSemanticEditorDocumentsAndCollaboration(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	props := map[string]any{
		"Title": "Caller title", "Value": "Caller source", "Content": "Caller content", "Path": "src/caller.go",
		"Candidates":  []map[string]any{{"ID": "candidate-1", "Label": "Caller completion", "InsertText": "caller()", "Detail": "Caller signature"}},
		"CodeActions": []map[string]any{{"ID": "action-1", "Label": "Extract caller", "Command": "refactor.extract"}},
		"Problems":    []map[string]any{{"ID": "problem-1", "Severity": "warning", "Message": "Caller warning", "File": "caller.go", "Line": 27, "Column": 8}},
		"Settings":    []map[string]any{{"Key": "fontSize", "Label": "Font size", "Type": "number", "Value": 14, "Min": 10, "Max": 32, "Required": true}},
		"Expression":  "caller.count", "Session": "caller-session", "Output": "Caller output",
		"Projects":      []map[string]any{{"Name": "Caller project", "URL": "#caller-project"}},
		"Tasks":         []map[string]any{{"ID": "caller-task", "Label": "Caller task"}},
		"PullRequestID": "pr-42", "Number": 42, "Subject": "Caller review", "Author": "Caller author", "Status": "Open", "SourceBranch": "feature/caller", "TargetBranch": "main",
		"Reviewers": []map[string]any{{"Name": "Caller reviewer", "Status": "Pending"}},
		"Blocks":    []map[string]any{{"ID": "block-1", "Type": "h2", "Label": "Heading", "Text": "Caller heading"}},
		"Term":      "Caller term", "Text": "Caller passage", "Definition": "Caller definition",
		"DocumentID": "document-1", "Paper": "A4", "Orientation": "portrait", "Pages": []map[string]any{{"Title": "Caller page", "Content": "Caller print content"}},
		"Items":    []map[string]any{{"Value": "page-1", "Label": "Caller parent", "Children": []map[string]any{{"Value": "page-2", "Label": "Caller child"}}}},
		"ImageURL": "/assets/caller.png", "Alt": "Caller image", "Properties": []map[string]any{{"Name": "Status", "Value": "Draft"}},
		"Links":       []map[string]any{{"URL": "#caller-source", "Title": "Caller source page", "Excerpt": "Caller excerpt"}},
		"Templates":   []map[string]any{{"ID": "template-1", "Name": "Caller template", "Content": "Caller template content"}},
		"People":      []map[string]any{{"ID": "person-1", "Name": "Caller person", "Initials": "CP", "Status": "Editing", "Selection": "Caller selection"}},
		"Comments":    []map[string]any{{"ID": "comment-1", "Author": "Caller author", "Status": "Open", "Quote": "Caller quoted text", "Text": "<caller comment>"}},
		"Suggestions": []map[string]any{{"ID": "suggestion-1", "Author": "Caller author", "Status": "Pending", "Original": "Caller old", "Replacement": "Caller new"}},
		"Activities":  []map[string]any{{"DateTime": "2026-10-11T10:40:00+09:00", "Time": "10:40", "Author": "Caller author", "Action": "edited", "Target": "Caller page", "URL": "#caller-page"}},
	}
	for _, tc := range []struct {
		chapter, name string
		want          []string
	}{
		{"editor", "CompletionMenu", []string{"data-ws-completion-source", "data-ws-complete=\"candidate-1\"", "data-insert=\"caller()\""}},
		{"editor", "CodeActionMenu", []string{"apply-code-action", "name=\"command\"", "refactor.extract", "src/caller.go"}},
		{"editor", "ProblemsPanel", []string{"open-location", "Caller warning", "name=\"line\" value=\"27\""}},
		{"editor", "WhitespaceRenderer", []string{"data-ws-whitespace", "Caller source"}},
		{"editor", "DebugConsole", []string{"name=\"expression\"", "caller.count", "name=\"session\"", "Caller output"}},
		{"editor", "SettingsEditor", []string{"name=\"fontSize\"", "type=\"number\"", "min=\"10\"", "max=\"32\""}},
		{"editor", "WelcomePage", []string{"data-ws-project", "value=\"#caller-project\"", "run-task", "Caller task"}},
		{"editor", "CursorPosition", []string{"data-workspace-cursor", "data-ws-content-value"}},
		{"git", "PullRequestCard", []string{"#42 Caller review", "feature/caller", "request-review", "Caller reviewer"}},
		{"documents", "Block types", []string{"data-ws-insert-block=\"h2\"", "data-block-text=\"Caller heading\"", "data-ws-content-value"}},
		{"documents", "Footnote", []string{"href=\"#semantic-instance-note-0\"", "id=\"semantic-instance-note-0\"", "Caller definition"}},
		{"documents", "FocusMode", []string{"data-ws-focus-toggle", "data-ws-focus-content", "Caller content"}},
		{"documents", "PrintPreview", []string{"data-ws-print-page", "Caller print content", "name=\"document\" value=\"document-1\""}},
		{"documents", "PageTree", []string{"aria-label=\"Page tree\"", "Caller parent", "Caller child"}},
		{"documents", "PageCover", []string{"data-ws-cover-image", "src=\"/assets/caller.png\"", "alt=\"Caller image\"", "Draft"}},
		{"documents", "Backlinks", []string{"aria-label=\"Backlinks\"", "href=\"#caller-source\"", "Caller excerpt"}},
		{"documents", "TemplatePicker", []string{"select-template", "name=\"content\"", "Caller template content"}},
		{"collab", "PresenceAvatars", []string{"aria-label=\"Caller person\"", "Editing", "follow-user", "Caller selection"}},
		{"collab", "CommentBubble", []string{"reply-comment", "resolve-comment", "Caller author", "&lt;caller comment&gt;"}},
		{"collab", "CommentSidebar", []string{"reply-comment", "name=\"comment\" value=\"comment-1\""}},
		{"collab", "Annotation", []string{"<mark>Caller quoted text</mark>", "resolve-comment"}},
		{"collab", "SuggestionMode", []string{"<del>Caller old</del>", "<ins>Caller new</ins>", "accept-suggestion", "reject-suggestion"}},
		{"collab", "ActivityLog", []string{"aria-label=\"Activity timeline\"", "datetime=\"2026-10-11T10:40:00&#43;09:00\"", "edited"}},
	} {
		t.Run(tc.chapter+"/"+tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "semantic-instance", Props: props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q in %s", want, out.String())
				}
			}
			if strings.Contains(out.String(), "data-workspace-data") {
				t.Fatal("semantic component fell back to generic row table")
			}
			if tc.name == "WhitespaceRenderer" || tc.name == "PrintPreview" || tc.name == "PageCover" {
				if strings.Contains(out.String(), "contenteditable=\"true\"") {
					t.Fatal("readonly component became editable")
				}
			}
		})
	}
}

func TestWorkspaceFocusedChaptersHaveSemanticRenderersAndSafeAliases(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	definitions, err := ComponentDefinitions()
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, definition := range definitions {
		if definition.Chapter != "editor" && definition.Chapter != "git" && definition.Chapter != "documents" && definition.Chapter != "collab" && definition.Chapter != "canvas" {
			continue
		}
		count++
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: definition.Chapter, Name: definition.Name, ID: "focused-instance", Props: map[string]any{}}); err != nil {
			t.Fatal(err)
		}
		if strings.Contains(out.String(), "data-workspace-data") {
			t.Errorf("%s/%s is still generic", definition.Chapter, definition.Name)
		}
	}
	if count != 54 {
		t.Fatalf("focused chapter primary count = %d, want 54", count)
	}
	for _, name := range []string{"Glossary", "TooltipTerm", "ReviewComment", "FixedFormatToolbar", "FloatingFormatToolbar", "Whiteboard"} {
		chapter := "documents"
		if name == "ReviewComment" {
			chapter = "git"
		}
		if name == "Whiteboard" {
			chapter = "canvas"
		}
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: chapter, Name: name, ID: "safe-instance", Props: map[string]any{"Content": "<script>caller</script>", "Definition": "<caller definition>", "Disabled": true}}); err != nil {
			t.Fatal(err)
		}
		if strings.Contains(out.String(), "<script>caller") {
			t.Fatal("caller rich content trusted as HTML")
		}
		if name == "Glossary" || name == "TooltipTerm" {
			if !strings.Contains(out.String(), "data-ws-glossary") {
				t.Fatal("glossary alias did not retain disclosure")
			}
		}
		if name == "Whiteboard" {
			if !strings.Contains(out.String(), "data-ws-canvas-mode=\"draw\"") || !strings.Contains(out.String(), "data-ws-strokes") {
				t.Fatal("whiteboard lacks drawing controls")
			}
		}
	}
}

func TestWorkspaceAPIUsesCallerItemsAndDisabledState(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	err = tpl.ExecuteTemplate(&out, "ely-api-files", map[string]any{"ID": "two-files", "Kind": "FileList", "Title": "Caller list", "Disabled": true, "Items": []map[string]any{{"Value": "budget", "Label": "Budget.xlsx", "Detail": "8 KB"}}})
	if err != nil {
		t.Fatal(err)
	}
	got := out.String()
	for _, want := range []string{"Caller list", "Budget.xlsx", "8 KB", "disabled"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q", want)
		}
	}
}

func TestWorkspaceFilesAndDevtoolsUseDomainControls(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	file := map[string]any{"Name": "brief.md", "Path": "docs/brief.md", "Extension": "md", "Icon": "MD", "Size": "4 KB", "Modified": "2026-10-11"}
	cases := []struct {
		chapter, name string
		props         map[string]any
		want          []string
	}{
		{"files", "FileIcon", file, []string{"data-ws-file-icon", "data-extension=\"md\"", "docs/brief.md"}},
		{"files", "FileItem", file, []string{"data-ws-file-item", "ely-workspace__file-meta", "2026-10-11"}},
		{"files", "FileGrid", map[string]any{"Files": []map[string]any{file}}, []string{"data-ws-file-grid", "data-ws-file-card", "brief.md"}},
		{"files", "FileContextMenu", map[string]any{"Path": "docs/brief.md", "Actions": []map[string]any{{"Action": "rename-file", "Label": "Rename"}}}, []string{"data-ws-file-menu", "data-ely-action=\"rename-file\"", "value=\"docs/brief.md\""}},
		{"files", "RecentFiles", map[string]any{"Files": []map[string]any{file}}, []string{"data-ws-recent-file", "2026-10-11"}},
		{"files", "Favorites", map[string]any{"Files": []map[string]any{{"Name": "brief.md", "Path": "docs/brief.md", "Favorite": true}}}, []string{"data-ws-favorite", "type=\"checkbox\"", "checked"}},
		{"files", "DuplicateFinder", map[string]any{"DuplicateGroups": []map[string]any{{"Hash": "sha256:caller", "Files": []map[string]any{{"Path": "copy.md", "Size": "4 KB"}}}}}, []string{"data-ws-duplicate-group", "delete-duplicate", "copy.md"}},
		{"devtools", "SchemaTree", map[string]any{"Nodes": []map[string]any{{"Name": "public", "Path": "public", "Kind": "schema", "Children": []map[string]any{{"Name": "projects", "Path": "public.projects", "Kind": "table"}}}}}, []string{"data-ws-schema-tree", "data-schema-path=\"public.projects\""}},
		{"devtools", "TableStructureEditor", map[string]any{"Columns": []map[string]any{{"Name": "project_id", "Type": "uuid", "Nullable": true}}}, []string{"data-ws-table-structure", "name=\"columns[0][name]\"", "name=\"columns[0][nullable]\""}},
		{"devtools", "RedisKeyBrowser", map[string]any{"Keys": []map[string]any{{"Key": "session:42", "Type": "string", "Preview": "caller token"}}}, []string{"data-ws-redis-search", "data-ws-redis-key", "delete-redis-key"}},
		{"devtools", "DocumentViewer", map[string]any{"Fields": []map[string]any{{"Name": "_id", "Type": "string", "Value": "project-7"}}, "JSON": "{\"_id\":\"project-7\"}"}, []string{"data-ws-devtools-document", "data-ws-document-json", "project-7"}},
		{"devtools", "ContainerList", map[string]any{"Containers": []map[string]any{{"ID": "a1b2", "Image": "caller/api", "Status": "running", "Ports": "8080:8080"}}}, []string{"data-ws-container", "start-container", "stop-container", "caller/api"}},
		{"devtools", "GraphQLExplorer", map[string]any{"Query": "query { project { id } }", "VariablesJSON": "{\"id\":\"p7\"}"}, []string{"data-ws-graphql", "name=\"query\"", "name=\"variables\""}},
		{"devtools", "RegexTester", map[string]any{"Pattern": "caller-[0-9]+", "Text": "caller-42"}, []string{"data-ws-regex", "name=\"pattern\"", "name=\"text\"", "evaluate-regex"}},
	}
	for _, tc := range cases {
		t.Run(tc.chapter+"/"+tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "domain-" + strings.ToLower(tc.name), Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			got := out.String()
			if strings.Contains(got, "data-workspace-data") {
				t.Fatal("domain component fell back to generic data renderer")
			}
			for _, want := range tc.want {
				if !strings.Contains(got, want) {
					t.Errorf("missing %q in %s", want, got)
				}
			}
		})
	}
}

func TestWorkspaceAPIRendersEveryPrimaryStory(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	definitions, err := ComponentDefinitions()
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, definition := range definitions {
		if definition.Family != "workspace" {
			continue
		}
		count++
		var out bytes.Buffer
		err := RenderComponent(tpl, &out, Component{Chapter: definition.Chapter, Name: definition.Name, ID: "check-" + definition.Chapter + "-" + strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(definition.Name, " ", "-"), "_", "-")), Props: map[string]any{
			"Title": definition.Name + " caller title", "Value": "caller value", "Items": []map[string]any{{"Value": "first", "Label": "Caller item"}}, "Options": []map[string]any{{"Value": "first", "Label": "Caller option"}},
		}})
		if err != nil {
			t.Errorf("%s/%s: %v", definition.Chapter, definition.Name, err)
			continue
		}
		if !strings.Contains(out.String(), definition.Name+" caller title") {
			t.Errorf("%s/%s did not render caller data", definition.Chapter, definition.Name)
		}
	}
	if count != 96 {
		t.Fatalf("workspace primary count = %d, want 96", count)
	}
}
