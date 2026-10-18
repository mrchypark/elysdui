package uiexamples

import (
	"fmt"
	"strings"

	"github.com/mrchypark/elysdui/ui/gohtmx"
)

// advancedWorkspaceCases gives the gallery one caller-owned case for each primary story.
func advancedWorkspaceCases() []AdvancedCase {
	sourcePreviews := workspaceSourcePreviews()
	stories := map[string][]string{
		"editor":    {"CodeEditor", "WhitespaceRenderer", "InlineDiff", "CompletionMenu", "CodeActionMenu", "FindWidget", "SearchPanel", "ProblemsPanel", "DebugConsole", "SettingsEditor", "WelcomePage", "CursorPosition"},
		"terminal":  {"Terminal", "CommandBlock", "AnsiText", "LogViewer", "ProcessList"},
		"git":       {"DiffViewer", "ThreeWayMerge", "ChangesList", "CommitGraph", "BranchSelector", "BlameView", "PullRequestCard"},
		"debug":     {"DebugToolbar", "BreakpointList", "VariablesPanel", "MemoryViewer", "PerformanceProfiler", "NetworkInspector"},
		"documents": {"RichTextEditor", "MarkdownEditor", "BlockEditor", "Block types", "TodoItem", "MarkdownRenderer", "DocumentViewer", "OfficePreview", "EpubReader", "Footnote", "FocusMode", "PrintPreview", "PageTree", "PageCover", "Backlinks", "TemplatePicker", "TrashBin", "VersionHistory"},
		"collab":    {"PresenceAvatars", "CommentThread", "CommentBubble", "CommentSidebar", "Annotation", "SuggestionMode", "ShareDialog", "ActivityLog"},
		"files":     {"FileIcon", "FileItem", "FileList", "FileGrid", "FileExplorer", "FolderTree", "FileContextMenu", "RenameInline", "DragDropFiles", "FilePreview", "RecentFiles", "Favorites", "FileSearch", "DuplicateFinder", "ArchiveViewer", "HexViewer", "FileOperationProgress", "TransferQueue", "DownloadManager", "StorageUsage"},
		"canvas":    {"InfiniteCanvas", "ToolPalette", "LayerPanel", "ColorPanel", "ConstraintsEditor", "NodeEditor", "FlowChart", "MindMap", "Whiteboard"},
		"devtools":  {"ConnectionManager", "SchemaTree", "QueryEditor", "TableStructureEditor", "RedisKeyBrowser", "DocumentViewer", "ApiRequestBuilder", "WebSocketConsole", "GraphQLExplorer", "RegexTester", "ContainerList"},
	}
	var cases []AdvancedCase
	for _, chapter := range []string{"editor", "terminal", "git", "debug", "documents", "collab", "files", "canvas", "devtools"} {
		names := stories[chapter]
		for index, name := range names {
			id := fmt.Sprintf("audit-%s-%d", chapter, index+1)
			value := "<caller value " + id + ">"
			if chapter == "documents" && (name == "MarkdownEditor" || name == "MarkdownRenderer") {
				value = "# Caller markdown\n\nSafe preview"
				if name == "MarkdownRenderer" {
					value += "\n\n## Caller details" + strings.Repeat("\n\nCaller reading content for the scroll container.", 20)
				}
			}
			props := map[string]any{
				"Name": "payload", "Value": value, "Placeholder": "Enter a value", "Required": index%5 == 0, "Disabled": false,
				"Action": "operate", "ActionLabel": "Request host operation", "SubmitLabel": "Send to host", "Status": "Awaiting host", "Filter": "", "Zoom": "100", "CanvasText": name + " canvas", "Language": "go", "Cursor": "Ln 2, Col 8", "Query": "caller", "Command": "caller-command --safe", "Markdown": "# Caller markdown\n\n<escaped content>", "Content": "Caller rich text content", "Ours": "caller ours", "Theirs": "caller theirs", "Merged": "caller merged", "Method": "POST", "Endpoint": "/caller/resource", "Accept": ".txt,.md",
				"Lines": []map[string]any{{"Number": 1, "Text": "caller line one"}, {"Number": 2, "Text": "caller line two"}}, "Hunks": []map[string]any{{"Lines": []map[string]any{{"Type": "remove", "Prefix": "-", "Text": "old caller value"}, {"Type": "add", "Prefix": "+", "Text": "new caller value"}}}},
				"Rows": []map[string]any{{"Author": "Caller", "Revision": "r1", "Line": 1, "Text": "caller row", "Label": "Caller row", "Value": "caller-row", "Detail": "caller detail"}}, "Variables": []map[string]any{{"Name": "callerValue", "Value": "42", "Type": "int"}}, "Entries": []map[string]any{{"Text": "caller terminal output"}}, "History": []string{"caller-command --safe"},
				"Nodes": []map[string]any{{"ID": "n1", "X": 80, "Y": 80, "Label": "start"}, {"ID": "n2", "X": 260, "Y": 120, "Label": "finish"}}, "Edges": []map[string]any{{"FromX": 80, "FromY": 80, "ToX": 260, "ToY": 120}}, "Shapes": []map[string]any{{"ID": "shape-a", "X": 80, "Y": 80, "Width": 120, "Height": 64, "Label": "Caller shape"}},
				"Items":   []map[string]any{{"Value": id + "-one", "Label": "First " + name, "Detail": "caller item"}, {"Value": id + "-two", "Label": "Second " + name, "Detail": "independent item"}},
				"Options": []map[string]any{{"Value": "one", "Label": "One"}, {"Value": "two", "Label": "Two"}}, "Selected": "one",
			}
			switch chapter + "/" + name {
			case "editor/CompletionMenu":
				props["Value"], props["CodeContext"] = "pri", "let result = pri"
				props["SelectedCandidate"] = "complete-print"
				props["Candidates"] = []map[string]any{{"ID": "complete-print", "Label": "printCaller", "InsertText": "printCaller()", "Detail": "caller function", "Documentation": "Writes the caller value to the configured output."}, {"ID": "complete-read", "Label": "readCaller", "InsertText": "readCaller()", "Detail": "caller reader", "Documentation": "Reads the caller value from the current document."}}
				props["PreviewExamples"] = []map[string]any{{"CodeContext": "let result = pri"}, {"CodeContext": "const reader = rea", "SelectedCandidate": "complete-read"}}
			case "editor/InlineDiff":
				props["DiffLayout"] = "unified"
				props["DiffLayouts"] = []map[string]any{{"Value": "unified", "Label": "Unified"}, {"Value": "split", "Label": "Split"}}
				props["Hunks"] = []map[string]any{{"Header": "@@ -12,5 +12,6 @@ func caller()", "Folded": true, "HiddenLines": 4, "Lines": []map[string]any{{"Type": "context", "Old": 12, "New": 12, "Prefix": " ", "Text": "func caller() {"}, {"Type": "remove", "Old": 13, "Prefix": "-", "Text": "  return oldValue"}, {"Type": "add", "New": 13, "Prefix": "+", "Text": "  return newValue"}, {"Type": "context", "Old": 14, "New": 14, "Prefix": " ", "Text": "}"}}}}
			case "editor/CodeEditor":
				props["Name"], props["Minimap"] = "code", true
				props["Breadcrumbs"] = []map[string]any{{"Value": "src", "Label": "src"}, {"Value": "src/worker.go", "Label": "worker.go"}}
				props["EditorTools"] = []map[string]any{{"Action": "toggle-minimap", "Label": "MiniMap", "Pressed": true}, {"Action": "format-document", "Label": "Format document"}}
				props["Ruler"] = "Column 80"
				props["Lines"] = []map[string]any{{"Number": 1, "Spans": []map[string]any{{"Text": "func", "Tone": "keyword"}, {"Text": " caller()", "Tone": "function"}}, "Inlay": ": error", "Diagnostic": map[string]any{"Severity": "warning", "Message": "Caller warning"}}, {"Number": 2, "Text": "  return nil", "Folded": true}}
				props["CodeLenses"] = []map[string]any{{"ID": "references", "Label": "2 references"}}
				props["PreviewStack"] = true
				props["PreviewExamples"] = []map[string]any{{}, {"PreviewName": "MiniMap", "MinimapLabel": "Caller code minimap"}}
			case "editor/CodeActionMenu":
				props["Path"], props["Value"], props["CodeContext"] = "src/worker.go", "callerSource", "const callerValue = expensiveCall()"
				props["CodeActions"] = []map[string]any{{"ID": "action-extract", "Label": "Extract caller function", "Command": "refactor.extract", "Detail": "Extract selected expression"}}
				props["PreviewExamples"] = []map[string]any{{"CodeContext": "const callerValue = expensiveCall()"}, {"CodeContext": "import unusedCaller", "CodeActions": []map[string]any{{"ID": "action-organize", "Label": "Organize imports", "Command": "source.organizeImports", "Detail": "Remove unused imports"}}}}
			case "editor/ProblemsPanel":
				props["Problems"] = []map[string]any{{"ID": "diag-1", "Severity": "warning", "Message": "Caller value is unused", "File": "src/worker.go", "Line": 27, "Column": 8}}
				props["Output"] = "Caller diagnostic output"
				props["PreviewExamples"] = []map[string]any{{}, {"Problems": []map[string]any{{"ID": "diag-2", "Severity": "error", "Message": "Caller argument is missing", "File": "src/api.go", "Line": 12, "Column": 3}}}}
			case "editor/WhitespaceRenderer":
				props["Value"] = "a b\tc\n"
			case "editor/DebugConsole":
				props["Expression"], props["Session"], props["Output"] = "request.attempts", "session-12", "Caller debugger output"
				props["ConsoleEntries"] = []map[string]any{{"Kind": "input", "Severity": "input", "Command": "request.attempts", "Text": "request.attempts", "Time": "10:40"}, {"Kind": "value", "Severity": "output", "Text": "3", "Type": "i64", "Time": "10:40"}, {"Kind": "error", "Severity": "error", "Text": "caller token expired", "Time": "10:41"}}
				props["PreviewExamples"] = []map[string]any{{}, {"Expression": "job.id", "ConsoleEntries": []map[string]any{{"Kind": "input", "Severity": "input", "Command": "job.id", "Text": "job.id"}, {"Kind": "warning", "Severity": "warning", "Text": "caller job is stale", "Type": "warning"}}}}
			case "editor/SettingsEditor":
				props["Groups"] = []map[string]any{{"Label": "Editor", "Settings": []map[string]any{{"Key": "fontSize", "Label": "Font size", "Description": "Code text size in pixels.", "Type": "number", "Value": 14, "Min": 10, "Max": 32, "Required": true}, {"Key": "language", "Label": "Language", "Description": "Language used for caller code.", "Value": "go"}}}, {"Label": "Files", "Settings": []map[string]any{{"Key": "tabSize", "Label": "Tab size", "Description": "Spaces inserted for a tab.", "Type": "number", "Value": 2, "Min": 1, "Max": 8}}}}
				props["PreviewExamples"] = []map[string]any{
					{},
					{"Groups": []map[string]any{
						{"Label": "Files", "Settings": []map[string]any{{"Key": "trimWhitespace", "Label": "Trim whitespace", "Description": "Trim lines before caller save.", "Value": "true"}}},
					}},
				}
			case "editor/WelcomePage":
				props["WelcomeTitle"], props["WelcomeSubtitle"], props["ShowAtStart"] = "Caller workspace", "Quiet tools for the caller project.", true
				props["Projects"] = []map[string]any{{"Name": "Caller workspace", "Path": "~/Caller/workspace", "Branch": "main", "Opened": "now"}, {"Name": "Caller notes", "Path": "~/Caller/notes", "Opened": "2 h ago"}}
				props["Tasks"] = []map[string]any{{"ID": "task-check", "Label": "Check caller project", "Command": "go test ./...", "Status": "Passed"}}
				props["Help"] = []map[string]any{{"Label": "Caller documentation", "URL": "#caller-docs"}, {"Label": "Keyboard shortcuts", "URL": "#caller-keys"}}
				props["PreviewExamples"] = []map[string]any{{}, {"WelcomeTitle": "Caller notes", "Projects": []map[string]any{{"Name": "Caller notes", "Path": "~/Caller/notes", "Opened": "Recent"}}, "Tasks": []map[string]any{{"ID": "task-open", "Label": "Open caller folder", "Command": "open .", "Status": "Idle"}}}}
			case "editor/CursorPosition":
				props["Value"], props["Lines"], props["Name"], props["Required"] = "first\nsecond", nil, "code", true
			case "git/CommitGraph":
				props["GraphLayout"], props["GraphZoom"] = "timeline", 100
				props["GraphLayouts"] = []map[string]any{{"Value": "timeline", "Label": "Timeline"}, {"Value": "lanes", "Label": "Lanes"}}
				props["Nodes"] = []map[string]any{{"ID": "commit-parent", "X": 80, "Y": 80, "Label": "Caller parent"}, {"ID": "commit-child", "X": 260, "Y": 120, "Label": "Caller child", "Parents": []string{"commit-parent"}}}
				props["Edges"] = []map[string]any{{"FromX": 80, "FromY": 80, "ToX": 260, "ToY": 120}}
			case "git/PullRequestCard":
				props["Number"], props["Subject"], props["PullRequestID"], props["Author"], props["Status"], props["Updated"] = 42, "Caller review", "pr-42", "Caller reviewer", "Open", "2 h ago"
				props["SourceBranch"], props["TargetBranch"], props["URL"], props["Added"], props["Removed"], props["CommentCount"] = "feature/worker", "main", "#caller-pr", 12, 3, 4
				props["Reviewers"] = []map[string]any{{"Name": "Reviewer one", "Status": "Pending"}, {"Name": "Reviewer two", "Status": "Approved"}}
				props["Checks"] = []map[string]any{{"Name": "caller tests", "Status": "Passed", "Detail": "42 tests"}, {"Name": "caller lint", "Status": "Pending"}}
				props["Comments"] = []map[string]any{{"ID": "comment-8", "Author": "Caller reviewer", "Time": "10:30", "Status": "Open", "Text": "Explain caller change", "Quote": "Caller passage"}}
			case "documents/RichTextEditor":
				props["Content"], props["Name"], props["Required"] = "# Caller notes\n\nA **careful** document with [a caller link](#caller).", "content", true
				props["EditorTools"] = []map[string]any{{"Value": "heading", "Label": "Heading"}, {"Value": "bullet-list", "Label": "Bullets"}, {"Value": "link", "Label": "Link"}, {"Value": "code", "Label": "Code"}}
				props["PreviewExamples"] = []map[string]any{{}, {"Content": "## Caller draft\n\nMention @caller and write :sparkles:"}}
			case "documents/MarkdownEditor":
				props["Value"], props["Name"], props["MarkdownMode"], props["Required"] = "# Lift\n\nA **caller** markdown document.\n\n- Tokens in one place\n- Light and dark", "markdown", "split", true
				props["MarkdownModes"] = []map[string]any{{"Value": "visual", "Label": "Visual"}, {"Value": "source", "Label": "Source"}, {"Value": "split", "Label": "Split"}}
				props["PreviewExamples"] = []map[string]any{{"MarkdownMode": "visual"}, {"MarkdownMode": "split"}, {"MarkdownMode": "source"}}
			case "documents/BlockEditor":
				props["Blocks"] = []map[string]any{{"ID": "block-title", "Type": "heading", "Text": "Project notes"}, {"ID": "block-body", "Type": "paragraph", "Text": "Type / for every kind of block."}, {"ID": "block-task", "Type": "todo", "Text": "Check caller notes"}}
				props["BlockMenu"] = []map[string]any{{"Type": "paragraph", "Label": "Text", "Text": "Caller text"}, {"Type": "heading", "Label": "Heading", "Text": "Caller heading"}, {"Type": "todo", "Label": "To-do", "Text": "Caller task"}}
			case "documents/Block types":
				props["Content"], props["Name"], props["Required"] = "Caller body", "content", true
				props["Blocks"] = []map[string]any{{"ID": "block-heading", "Type": "h2", "Label": "Heading", "Text": "Caller inserted heading"}, {"ID": "block-code", "Type": "code", "Label": "Code", "Text": "callerCode()"}, {"ID": "block-math", "Type": "math", "Label": "Math", "Text": "c' = c + (1 - c)t"}, {"ID": "block-diagram", "Type": "diagram", "Label": "Diagram", "Text": "graph LR; tokens --> components --> app"}, {"ID": "block-table", "Type": "table", "Label": "Table", "Rows": [][]string{{"Token", "Light", "Dark"}, {"Base", "0.50", "0.48"}}}, {"ID": "block-image", "Type": "image", "Label": "Image", "URL": "/assets/sample.svg", "Alt": "Caller palette", "Text": "Caller palette at noon"}, {"ID": "block-columns", "Type": "columns", "Label": "Columns", "Columns": []string{"Light: caller paper", "Dark: caller ink"}}, {"ID": "block-sync", "Type": "synced", "Label": "Synced", "SyncID": "caller-note", "Text": "Synced caller note"}, {"ID": "block-divider", "Type": "divider", "Label": "Divider"}, {"ID": "block-embed", "Type": "embed", "Label": "Embed", "URL": "#caller-site", "Text": "Caller project site"}}
			case "documents/Footnote":
				props["Text"], props["Term"], props["Definition"], props["Number"] = "Caller passage explains the document", "CallerTerm", "Caller footnote definition", 1
				props["Footnotes"] = []map[string]any{{"Number": 1, "Text": "A small step moves the eye."}, {"Number": 2, "Text": "Tokens stay in one place."}, {"Number": 3, "Text": "Caller definitions remain local."}, {"Number": 4, "Text": "Reading returns to the source."}}
			case "documents/FocusMode":
				props["Title"], props["Content"], props["Description"] = "Caller draft", "Caller focused paragraph", "Reader tools"
			case "documents/PrintPreview":
				props["DocumentID"], props["Paper"], props["Orientation"], props["Copies"] = "doc-21", "A4", "portrait", 2
				props["Pages"] = []map[string]any{{"Title": "Caller first page", "Content": "Caller page one"}, {"Title": "Caller second page", "Content": "Caller page two"}}
			case "documents/PageTree":
				props["Favorites"] = []map[string]any{{"Value": "lift", "Label": "🚀 Lift"}, {"Value": "lift/design", "Label": "Design"}}
				props["Pinned"] = []map[string]any{{"Value": "lift/design", "Label": "Design"}}
				props["Items"] = []map[string]any{{"Value": "lift", "Label": "🚀 Lift", "Children": []map[string]any{{"Value": "lift/overview", "Label": "Overview"}, {"Value": "lift/design", "Label": "Design", "Children": []map[string]any{{"Value": "lift/design/decisions", "Label": "Decisions"}, {"Value": "lift/design/research", "Label": "Research"}}}}}, {"Value": "archive", "Label": "Archive", "Children": []map[string]any{{"Value": "archive/2025", "Label": "2025"}}}}
			case "documents/PageCover":
				props["ImageURL"], props["Alt"], props["Icon"], props["PageTitle"], props["Content"] = "/assets/sample.svg", "Project cover", "🚀", "Lift", "A shared project home"
				props["Properties"] = []map[string]any{{"Name": "Status", "Value": "Draft", "Options": []map[string]any{{"Value": "Draft", "Label": "Draft"}, {"Value": "Review", "Label": "Review"}}}, {"Name": "Due", "Type": "date", "Value": "2026-10-20"}, {"Name": "Tags", "Value": "design, launch"}, {"Name": "Published", "Type": "checkbox", "Checked": true}, {"Name": "Owner", "Value": "Grace Lin", "Readonly": true}, {"Name": "Updated", "Value": "Today", "Readonly": true}}
			case "documents/Backlinks":
				props["Links"] = []map[string]any{{"ID": "source", "Icon": "↗", "URL": "#caller-source", "Title": "Source page", "ExcerptBefore": "A linked passage from ", "ExcerptAfter": " explains the caller change."}, {"ID": "review", "Icon": "↗", "URL": "#caller-review", "Title": "Review notes", "ExcerptBefore": "Related ", "ExcerptAfter": " retain the implementation context."}}
				props["GraphNodes"] = []map[string]any{{"ID": "current", "X": 250, "Y": 110, "Label": "Lift"}, {"ID": "source", "X": 85, "Y": 55, "Label": "Source page"}, {"ID": "review", "X": 95, "Y": 180, "Label": "Review notes"}, {"ID": "plan", "X": 430, "Y": 60, "Label": "Launch plan"}, {"ID": "decisions", "X": 430, "Y": 190, "Label": "Decisions"}}
				props["GraphEdges"] = []map[string]any{{"FromX": 250, "FromY": 110, "ToX": 85, "ToY": 55}, {"FromX": 250, "FromY": 110, "ToX": 95, "ToY": 180}, {"FromX": 250, "FromY": 110, "ToX": 430, "ToY": 60}, {"FromX": 250, "FromY": 110, "ToX": 430, "ToY": 190}}
			case "documents/TemplatePicker":
				props["SelectedTemplate"], props["SelectedCategory"] = "tpl-brief", "notes"
				props["TemplateCategories"] = []map[string]any{{"Value": "notes", "Label": "Notes"}, {"Value": "planning", "Label": "Planning"}}
				props["Templates"] = []map[string]any{{"ID": "tpl-brief", "Name": "Project brief", "Category": "notes", "Description": "Scope, decisions, and open questions", "Content": "# Project brief\n\n## Decisions", "Preview": "# Project brief\n\n## Decisions"}, {"ID": "tpl-meeting", "Name": "Meeting notes", "Category": "notes", "Description": "Attendees, notes, and next steps", "Content": "# Meeting notes\n\n## Next steps"}, {"ID": "tpl-plan", "Name": "Launch plan", "Category": "planning", "Description": "Milestones, owners, and risks", "Content": "# Launch plan\n\n## Milestones"}}
			case "collab/PresenceAvatars":
				props["DocumentTitle"] = "Handbook / Color / Lift"
				props["People"] = []map[string]any{{"ID": "ada", "Name": "Ada Park", "Initials": "AP", "Status": "Reading In dark", "Hue": 0}, {"ID": "grace", "Name": "Grace Lin", "Initials": "GL", "Status": "Writing the opening", "Hue": 1}, {"ID": "alan", "Name": "Alan Reyes", "Initials": "AR", "Status": "In the comments", "Hue": 2}, {"ID": "mae", "Name": "Mae Okafor", "Initials": "MO", "Status": "Viewing", "Hue": 3}, {"ID": "tim", "Name": "Tim Novak", "Initials": "TN", "Status": "Viewing"}, {"ID": "joan", "Name": "Joan Ito", "Initials": "JI", "Status": "Viewing"}}
				props["PassageParts"] = []map[string]any{{"Text": "A lift blends a color toward white.\nHalf a lift sits midway; "}, {"Text": "a full lift", "Selected": true, "Author": "Alan Reyes", "Hue": 2}, {"Text": " is white itself.\nIn dark, "}, {"Text": "accents lift further so they read with the same weight.", "Cursor": true, "Author": "Grace Lin", "Hue": 1}}
			case "collab/CommentBubble", "collab/CommentSidebar":
				props["Threads"], props["ActiveThread"] = workspaceCollaborationThreads(), "gamma"
				if name == "CommentBubble" {
					props["Threads"] = workspaceCollaborationThreads()[1:2]
					props["Passage"] = "In dark, accents lift further so they read with the same weight."
				}
			case "collab/Annotation":
				props["AnnotationParts"] = []map[string]any{{"Text": "Every accent in the library is "}, {"ID": "base", "Text": "a base color and a lift", "Author": "Ada Park", "Note": "The one idea to remember.", "Hue": 0}, {"Text": ". The base carries the hue; the lift carries "}, {"ID": "loud", "Text": "how loud the color is", "Author": "Grace Lin", "Hue": 1}, {"Text": ". Hover, press and focus are "}, {"ID": "accent", "Text": "lifts of the accent", "Author": "Alan Reyes", "Note": "Link to the motion page.", "Hue": 2}, {"Text": "."}}
			case "collab/SuggestionMode":
				props["Mode"], props["Draft"] = "suggesting", "A tint blends every color toward white. Half a lift sits midway."
				props["ChangeParts"] = []map[string]any{{"Text": "A "}, {"Text": "lift", "Kind": "removed"}, {"Text": "tint", "Kind": "added"}, {"Text": " blends "}, {"Text": "every ", "Kind": "added"}, {"Text": "color toward white. Half a lift sits midway"}, {"Text": " between", "Kind": "removed"}, {"Text": "."}}
				props["Suggestions"] = []map[string]any{{"ID": "replace-lift", "Author": "You", "Status": "Pending", "Original": "lift", "Replacement": "tint"}, {"ID": "add-every", "Author": "You", "Status": "Pending", "Replacement": "every"}, {"ID": "delete-between", "Author": "You", "Status": "Pending", "Original": "between"}}
			case "collab/ActivityLog":
				props["Activities"] = []map[string]any{{"Author": "Alan Reyes", "Initials": "AR", "Action": "replied on", "Time": "4 minutes ago", "DateTime": "2026-10-11T10:40:00+09:00", "Target": "blends in gamma space", "URL": "#gamma-space"}, {"Author": "Grace Lin", "Initials": "GL", "Action": "suggested a change to", "Time": "35 minutes ago", "DateTime": "2026-10-11T10:09:00+09:00", "Target": "Lift", "URL": "#lift"}, {"Author": "Ada Park", "Initials": "AP", "Action": "resolved", "Time": "3 hours ago", "DateTime": "2026-10-11T07:40:00+09:00", "Target": "On Lift", "URL": "#on-lift"}, {"Author": "You", "Initials": "Y", "Action": "shared", "Time": "Yesterday", "DateTime": "2026-10-10T10:40:00+09:00", "Target": "Lift", "URL": "#lift"}}
			case "devtools/QueryEditor":
				props["Required"], props["Name"], props["Language"] = true, "query", "sql"
				props["Lines"] = []map[string]any{{"Number": 1, "Text": "SELECT email, orders"}, {"Number": 2, "Text": "FROM accounts"}, {"Number": 3, "Text": "ORDER BY orders DESC;"}}
				props["QueryColumns"], props["QueryRows"] = []string{"email", "orders"}, [][]string{{"ada@example.test", "7"}, {"grace@example.test", "5"}}
				props["QueryHistory"] = []map[string]any{{"ID": "run-1", "Query": "SELECT email FROM users", "Status": "5 rows", "Duration": 18}}
				props["PlanSteps"] = []map[string]any{{"ID": "limit", "Label": "Limit", "Rows": 5, "Cost": "12.4", "Open": true, "Children": []map[string]any{{"ID": "scan-users", "Label": "Seq Scan users", "Rows": 5, "Cost": "8.2", "Detail": "Caller indexed scan"}}}}
			case "collab/CommentThread":
				props["Threads"] = workspaceCollaborationThreads()[:1]
			case "devtools/ApiRequestBuilder", "devtools/ConnectionManager", "devtools/WebSocketConsole", "collab/ShareDialog":
				props["MethodOptions"] = []map[string]any{{"Value": "GET", "Label": "GET"}, {"Value": "POST", "Label": "POST"}, {"Value": "PATCH", "Label": "PATCH"}}
				if chapter == "collab" {
					props["Action"], props["InviteRole"], props["LinkAccess"] = "share-invite", "edit", "restricted"
					props["DocumentTitle"], props["ShareURL"] = "Lift", "https://example.com/d/lift"
					props["Roles"] = []map[string]any{{"Value": "edit", "Label": "Can edit"}, {"Value": "comment", "Label": "Can comment"}, {"Value": "view", "Label": "Can view"}}
					props["Invitees"] = []map[string]any{{"Email": "pending@example.test"}}
					props["Members"] = []map[string]any{{"ID": "owner-1", "Name": "Caller owner", "Email": "owner@example.test", "Role": "edit", "Owner": true}, {"ID": "member-2", "Name": "Caller reviewer", "Email": "reviewer@example.test", "Role": "comment"}}
				}
			case "files/FileIcon":
				icons := []map[string]any{{"Name": "Folder", "Folder": true}, {"Name": "Open", "Folder": true, "Open": true}}
				for _, filename := range []string{"Brief.md", "main.rs", "build.sh", "config.toml", "data.json", "Atrium.jpg", "Theme.mp3", "Clip.mov", "Archive.zip", "Budget.csv", "Inter.ttf", "Makefile"} {
					icons = append(icons, map[string]any{"Name": filename})
				}
				props["Files"] = icons
			case "files/FileItem":
				props["Files"], props["Selected"] = workspaceFileEntries()[:5], "Home/Projects/Atrium/Brief.md"
			case "files/FileGrid":
				props["Files"], props["Selected"] = workspaceFileEntries(), ""
			case "files/RecentFiles":
				props["Title"], props["Description"] = "", ""
				props["Now"], props["Zone"] = "2026-10-13T06:46:00Z", "UTC"
				props["Files"] = []map[string]any{
					{"Name": "Survey.csv", "Folder": "Projects/Dunes", "Opened": "2026-10-09T06:46:00Z"},
					{"Name": "Brief.md", "Folder": "Projects/Atrium", "Opened": "2026-10-13T06:34:00Z"},
					{"Name": "Budget.csv", "Folder": "Projects/Atrium", "Opened": "2026-10-13T05:11:00Z"},
					{"Name": "Walkthrough.mov", "Folder": "Projects/Atrium/Recordings", "Opened": "2026-10-12T04:46:00Z"},
					{"Name": "Invoice.pdf", "Folder": "Documents", "Opened": "2026-10-12T00:46:00Z"},
				}
			case "files/Favorites":
				props["Pins"] = []map[string]any{{"Key": "atrium", "Icon": "📐", "Title": "Atrium"}, {"Key": "roadmap", "Icon": "🗺️", "Title": "Roadmap.md"}, {"Key": "music", "Icon": "🎧", "Title": "Music"}}
			case "files/FileContextMenu":
				props["Files"], props["Path"] = workspaceFileEntries()[:6], "Home/Projects/Atrium/Brief.md"
				props["Actions"] = []map[string]any{{"Action": "open-file", "Label": "Open"}, {"Action": "rename-file", "Label": "Rename"}, {"Action": "duplicate-file", "Label": "Duplicate"}, {"Action": "trash-file", "Label": "Move to Trash", "Separator": true}}
			case "files/DuplicateFinder":
				props["DuplicateSets"] = []map[string]any{
					{"Name": "Atrium.jpg", "Bytes": 2140000, "Paths": []map[string]any{{"Path": "Projects/Atrium/Atrium.jpg"}, {"Path": "Downloads/Atrium.jpg", "Marked": true}, {"Path": "Desktop/Atrium copy.jpg", "Marked": true}}},
					{"Name": "Walkthrough.mov", "Bytes": 184000000, "Paths": []map[string]any{{"Path": "Projects/Atrium/Recordings/Walkthrough.mov"}, {"Path": "Downloads/Walkthrough.mov", "Marked": true}}},
				}
			case "files/ArchiveViewer":
				props["ArchiveName"] = "Atrium.zip"
				props["ArchiveEntries"] = []map[string]any{
					{"Path": "Atrium/Brief.md", "Size": 4800, "Packed": 1900}, {"Path": "Atrium/Budget.csv", "Size": 18300, "Packed": 4100},
					{"Path": "Atrium/Design/Moodboard.png", "Size": 3200000, "Packed": 3050000}, {"Path": "Atrium/Design/Palette.json", "Size": 2100, "Packed": 600},
					{"Path": "Atrium/main.rs", "Size": 9200, "Packed": 2700}, {"Path": "README.md", "Size": 1400, "Packed": 700},
				}
			case "files/FileExplorer", "files/FileList":
				props["Path"], props["DirectoryName"], props["DirectoryEntries"] = "Home/Projects/Atrium", "Atrium", workspaceFileEntries()
				props["Breadcrumbs"] = []map[string]any{{"Value": "Home", "Label": "Home"}, {"Value": "Home/Projects", "Label": "Projects"}, {"Value": "Home/Projects/Atrium", "Label": "Atrium"}}
				props["Levels"] = workspaceFileLevels()
				if name == "FileExplorer" {
					props["FileView"] = "columns"
				} else {
					props["FileView"] = "list"
				}
			case "files/FolderTree":
				props["Items"] = workspaceFileTree("Home")
			case "files/DragDropFiles":
				props["Accept"], props["Action"], props["Hint"] = "", "upload", "Any kind of file"
			case "files/RenameInline":
				props["Path"], props["Name"], props["Value"], props["Required"] = "docs/brief.md", "name", "brief.md", true
			case "files/FileSearch":
				props["FoundFiles"], props["Query"] = []map[string]any{}, ""
				props["PreviewExamples"] = []map[string]any{{}, {"Query": "Brief", "FoundFiles": []map[string]any{{"Name": "Brief.md", "Folder": "Projects/Atrium"}}}, {"Query": "missing"}}
			case "editor/SearchPanel":
				props["Query"] = ""
				props["Items"] = []map[string]any{{"Path": "src/worker.go", "Detail": "worker result"}, {"Path": "docs/brief.md", "Detail": "brief result"}}
				if chapter == "editor" {
					props["Include"] = "src/**"
					props["PreviewExamples"] = []map[string]any{{}, {"Query": "brief", "Include": "docs/**"}}
				}
			case "editor/FindWidget":
				props["Query"] = "caller"
				props["Lines"] = []map[string]any{{"Text": "const caller = readCaller()"}, {"Text": "return caller"}}
				props["PreviewExamples"] = []map[string]any{{}, {"Query": "read", "Lines": []map[string]any{{"Text": "const reader = readCaller()"}}}}
			case "files/FilePreview":
				props["Files"] = []map[string]any{
					{"Name": "Atrium.jpg", "Path": "Home/Projects/Atrium/Atrium.jpg", "Extension": "JPG", "ImageURL": "/assets/ely/workspace-atrium.jpg", "Alt": "Atrium with a curved stair", "Ratio": 1.5, "Size": "2.1 MB", "Modified": "2 days ago"},
					{"Name": "Brief.md", "Path": "Home/Projects/Atrium/Brief.md", "Extension": "MD", "Size": "4.8 KB", "Modified": "2 hours ago", "Content": "# Atrium\n\nA quiet hall for the new library.\n\n- Light from above, all day\n- One stair, curved, in plaster\n- Olive trees by the windows\n\nNext: the model walkthrough on Friday."},
					{"Name": "Archive.zip", "Path": "Home/Projects/Atrium/Archive.zip", "Extension": "ZIP", "Size": "48 MB", "Modified": "1 month ago"},
				}
			case "files/HexViewer":
				// First 512 bytes of upstream gallery assets/atrium.jpg at 49ed1f8.
				props["Bytes"], props["Offset"] = []int{255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 72, 0, 72, 0, 0, 255, 225, 0, 76, 69, 120, 105, 102, 0, 0, 77, 77, 0, 42, 0, 0, 0, 8, 0, 1, 135, 105, 0, 4, 0, 0, 0, 1, 0, 0, 0, 26, 0, 0, 0, 0, 0, 3, 160, 1, 0, 3, 0, 0, 0, 1, 0, 1, 0, 0, 160, 2, 0, 4, 0, 0, 0, 1, 0, 0, 3, 192, 160, 3, 0, 4, 0, 0, 0, 1, 0, 0, 2, 128, 0, 0, 0, 0, 255, 237, 0, 56, 80, 104, 111, 116, 111, 115, 104, 111, 112, 32, 51, 46, 48, 0, 56, 66, 73, 77, 4, 4, 0, 0, 0, 0, 0, 0, 56, 66, 73, 77, 4, 37, 0, 0, 0, 0, 0, 16, 212, 29, 140, 217, 143, 0, 178, 4, 233, 128, 9, 152, 236, 248, 66, 126, 255, 192, 0, 17, 8, 2, 128, 3, 192, 3, 1, 34, 0, 2, 17, 1, 3, 17, 1, 255, 196, 0, 31, 0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 255, 196, 0, 181, 16, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125, 1, 2, 3, 0, 4, 17, 5, 18, 33, 49, 65, 6, 19, 81, 97, 7, 34, 113, 20, 50, 129, 145, 161, 8, 35, 66, 177, 193, 21, 82, 209, 240, 36, 51, 98, 114, 130, 9, 10, 22, 23, 24, 25, 26, 37, 38, 39, 40, 41, 42, 52, 53, 54, 55, 56, 57, 58, 67, 68, 69, 70, 71, 72, 73, 74, 83, 84, 85, 86, 87, 88, 89, 90, 99, 100, 101, 102, 103, 104, 105, 106, 115, 116, 117, 118, 119, 120, 121, 122, 131, 132, 133, 134, 135, 136, 137, 138, 146, 147, 148, 149, 150, 151, 152, 153, 154, 162, 163, 164, 165, 166, 167, 168, 169, 170, 178, 179, 180, 181, 182, 183, 184, 185, 186, 194, 195, 196, 197, 198, 199, 200, 201, 202, 210, 211, 212, 213, 214, 215, 216, 217, 218, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 255, 196, 0, 31, 1, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 255, 196, 0, 181, 17, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119, 0, 1, 2, 3, 17, 4, 5, 33, 49, 6, 18, 65, 81, 7, 97, 113, 19, 34, 50, 129, 8, 20, 66, 145, 161, 177, 193, 9, 35, 51, 82, 240, 21, 98, 114, 209, 10, 22, 36, 52, 225, 37, 241, 23, 24, 25, 26, 38, 39, 40, 41, 42, 53, 54, 55, 56, 57, 58, 67, 68, 69, 70, 71, 72, 73, 74, 83}, 0
			case "debug/MemoryViewer":
				props["Label"], props["Reading"] = "Caller memory", "0x7FFD5A201005 · 65 · i8 65 · u16 32577"
				props["HexHeaders"] = []string{"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"}
				props["HexRows"] = []map[string]any{{"Address": "00007ffd5a201000", "Text": "·A··caller-memory", "Cells": []map[string]any{{"Index": 0, "Hex": "00", "Reading": "0x7FFD5A201000 · 0 · i8 0", "Selected": false}, {"Index": 1, "Hex": "41", "Reading": "0x7FFD5A201001 · 65 · i8 65", "Selected": false}, {"Index": 2, "Hex": "7f", "Reading": "0x7FFD5A201002 · 127 · i8 127", "Selected": false}, {"Index": 3, "Hex": "ff", "Reading": "0x7FFD5A201003 · 255 · i8 -1", "Selected": false}, {"Index": 4, "Hex": "10", "Reading": "0x7FFD5A201004 · 16 · i8 16", "Selected": false}, {"Index": 5, "Hex": "41", "Reading": "0x7FFD5A201005 · 65 · i8 65 · u16 32577", "Selected": true}, {"Index": 6, "Hex": "42", "Reading": "0x7FFD5A201006 · 66 · i8 66", "Selected": false}, {"Index": 7, "Hex": "43", "Reading": "0x7FFD5A201007 · 67 · i8 67", "Selected": false}, {"Index": 8, "Hex": "20", "Reading": "0x7FFD5A201008 · 32 · i8 32", "Selected": false}, {"Index": 9, "Hex": "6d", "Reading": "0x7FFD5A201009 · 109 · i8 109", "Selected": false}, {"Index": 10, "Hex": "65", "Reading": "0x7FFD5A20100A · 101 · i8 101", "Selected": false}, {"Index": 11, "Hex": "6d", "Reading": "0x7FFD5A20100B · 109 · i8 109", "Selected": false}, {"Index": 12, "Hex": "6f", "Reading": "0x7FFD5A20100C · 111 · i8 111", "Selected": false}, {"Index": 13, "Hex": "72", "Reading": "0x7FFD5A20100D · 114 · i8 114", "Selected": false}, {"Index": 14, "Hex": "79", "Reading": "0x7FFD5A20100E · 121 · i8 121", "Selected": false}, {"Index": 15, "Hex": "21", "Reading": "0x7FFD5A20100F · 33 · i8 33", "Selected": false}}}}
				for row := 1; row < 8; row++ {
					cells := make([]map[string]any, 0, 16)
					for column := 0; column < 16; column++ {
						value := (row*29 + column*17) % 256
						cells = append(cells, map[string]any{"Index": row*16 + column, "Hex": fmt.Sprintf("%02x", value), "Reading": fmt.Sprintf("0x7FFD5A201%03X · %d", row*16+column, value)})
					}
					props["HexRows"] = append(props["HexRows"].([]map[string]any), map[string]any{"Address": fmt.Sprintf("00007ffd5a201%03x", row*16), "Text": "caller memory row", "Cells": cells})
				}
				props["Instructions"] = []map[string]any{{"Address": "0x1000", "Bytes": "55", "Opcode": "push", "Source": "fn caller()", "Current": true}, {"Address": "0x1001", "Bytes": "48 89 e5", "Opcode": "mov", "Source": "frame pointer"}, {"Address": "0x1004", "Bytes": "48 83 ec 30", "Opcode": "sub", "Source": "stack frame"}, {"Address": "0x1008", "Bytes": "48 89 7d e8", "Opcode": "mov", "Source": "caller argument"}, {"Address": "0x100c", "Bytes": "e8 9a 01", "Opcode": "call", "Source": "lookup caller"}, {"Address": "0x1010", "Bytes": "48 85 c0", "Opcode": "test", "Source": "caller result"}, {"Address": "0x1013", "Bytes": "74 12", "Opcode": "je", "Source": "fallback"}, {"Address": "0x1015", "Bytes": "c3", "Opcode": "ret", "Source": "return"}}
				props["PreviewExamples"] = []map[string]any{{}, {"PreviewName": "Disassembly"}}
			case "files/FileOperationProgress":
				props["Operations"] = []map[string]any{
					{"ID": "copy", "Operation": "copy", "Count": 12, "To": "Atrium", "Moved": 46000000, "Total": 184000000, "State": "moving", "Rate": 38000000, "Current": "Recordings/Walkthrough.mov", "CanPause": true, "CanResume": true, "CanCancel": true},
					{"ID": "failed", "Operation": "move", "Count": 3, "To": "Backup", "Moved": 820000, "Total": 4800000, "State": "failed", "Error": "The disk Backup is full."},
					{"ID": "done", "Operation": "move", "Count": 1, "To": "Documents", "Moved": 88000, "Total": 88000, "State": "done"},
				}
			case "files/TransferQueue":
				props["TransferStates"] = true
				props["Transfers"] = []map[string]any{
					{"ID": "walkthrough", "Name": "Walkthrough.mov", "Upload": true, "Moved": 61000000, "Total": 184000000, "State": "moving", "Rate": 4200000, "CanPause": true, "CanCancel": true},
					{"ID": "budget", "Name": "Budget.csv", "Upload": true, "Moved": 0, "Total": 18300, "State": "queued", "CanCancel": true},
					{"ID": "moodboard", "Name": "Moodboard.png", "Moved": 1100000, "Total": 3200000, "State": "paused", "CanResume": true, "CanCancel": true},
					{"ID": "survey", "Name": "Survey.csv", "Moved": 9000, "Total": 42000, "State": "failed", "Error": "The server hung up.", "CanRetry": true, "CanCancel": true},
					{"ID": "brief", "Name": "Brief.md", "Upload": true, "Moved": 4800, "Total": 4800, "State": "done"},
				}
			case "files/DownloadManager":
				props["TransferStates"], props["CanClear"] = true, true
				props["Transfers"] = []map[string]any{
					{"ID": "inter", "Name": "Inter-4.1.zip", "Moved": 2600000, "Total": 6900000, "State": "moving", "Rate": 1800000, "CanCancel": true},
					{"ID": "rust", "Name": "rust-1.95.pkg", "Moved": 0, "Total": 312000000, "State": "queued", "CanCancel": true},
					{"ID": "atrium", "Name": "Atrium.jpg", "Moved": 2140000, "Total": 2140000, "State": "done", "CanOpen": true, "CanShow": true},
					{"ID": "notes", "Name": "Release notes.pdf", "Moved": 430000, "Total": 430000, "State": "done", "CanOpen": true, "CanShow": true},
				}
			case "files/StorageUsage":
				props["Capacity"], props["Label"] = 512000000000, "Storage usage"
				props["Parts"] = []map[string]any{{"Name": "Documents", "Bytes": 38000000000}, {"Name": "Photos", "Bytes": 142000000000}, {"Name": "Music", "Bytes": 61000000000}, {"Name": "Apps", "Bytes": 96000000000}}
			case "devtools/SchemaTree":
				props["Nodes"] = []map[string]any{{"Name": "public", "Path": "public", "Kind": "schema", "Children": []map[string]any{{"Name": "projects", "Path": "public.projects", "Kind": "table", "Children": []map[string]any{{"Name": "id", "Path": "public.projects.id", "Kind": "uuid"}}}}}}
			case "devtools/TableStructureEditor":
				props["Action"] = "update-table-structure"
				props["Columns"] = []map[string]any{{"Name": "project_id", "Type": "uuid", "Nullable": false, "TypeOptions": []map[string]any{{"Value": "uuid", "Label": "UUID"}, {"Value": "text", "Label": "Text"}}}, {"Name": "notes", "Type": "text", "Nullable": true, "TypeOptions": []map[string]any{{"Value": "uuid", "Label": "UUID"}, {"Value": "text", "Label": "Text"}}}}
			case "devtools/RedisKeyBrowser":
				props["Keys"], props["Preview"] = []map[string]any{{"Key": "session:42", "Type": "string", "Preview": "caller-session-token"}, {"Key": "project:7", "Type": "hash", "Preview": "{\"name\":\"Caller project\"}"}}, "Select a caller key"
			case "devtools/DocumentViewer":
				props["Fields"], props["JSON"] = []map[string]any{{"Name": "_id", "Type": "string", "Value": "project-7"}, {"Name": "active", "Type": "boolean", "Value": "true"}}, "{\"_id\":\"project-7\",\"active\":true}"
			case "devtools/ContainerList":
				props["Containers"] = []map[string]any{{"ID": "a1b2c3d4", "Image": "caller/api:1.2", "Status": "running", "Ports": "8080:8080"}}
			case "devtools/GraphQLExplorer":
				props["Action"], props["Name"], props["Query"], props["VariablesJSON"], props["Required"] = "graphql-query", "query", "query Project($id: ID!) { project(id: $id) { name } }", "{\"id\":\"project-7\"}", true
				props["ResponseJSON"] = "{\"data\":{\"project\":{\"name\":\"Caller project\"}}}"
				props["SchemaTypes"] = []map[string]any{{"Name": "Query", "Kind": "object", "Fields": []map[string]any{{"Name": "project", "Type": "Project"}}}, {"Name": "Project", "Kind": "object", "Fields": []map[string]any{{"Name": "name", "Type": "String"}}}}
			case "devtools/RegexTester":
				props["Action"], props["Pattern"], props["Text"], props["Required"] = "evaluate-regex", "caller-[0-9]+", "caller-42\nother", true
			case "debug/DebugToolbar":
				props["Session"], props["Status"] = "session-12", "Paused"
				props["PreviewExamples"] = []map[string]any{{}, {"Status": "Running"}}
			case "debug/BreakpointList":
				props["Breakpoints"] = []map[string]any{{"ID": "bp-4", "File": "src/worker.go", "Line": 27, "Enabled": true, "Condition": "count > 3", "Hits": 3}, {"ID": "bp-5", "File": "src/api.go", "Line": 12, "Enabled": false, "Hits": 0}}
				props["Stack"] = []map[string]any{{"ID": "frame-2", "Function": "HandleRequest", "File": "src/worker.go", "Line": 27, "Library": false}, {"ID": "frame-lib", "Function": "runtime.goexit", "File": "runtime/asm.go", "Line": 1700, "Library": true}}
			case "debug/VariablesPanel":
				props["Scopes"] = []map[string]any{{"Name": "Locals", "Open": true, "Variables": []map[string]any{{"Key": "Locals/request", "Name": "request", "Type": "Request", "Kind": "struct", "Value": "{…}", "Open": true, "Children": []map[string]any{{"Key": "Locals/request/attempts", "Name": "attempts", "Type": "int", "Kind": "number", "Value": 4, "Changed": true}}}}}, {"Name": "Globals", "Open": false, "Variables": []map[string]any{{"Key": "Globals/version", "Name": "version", "Type": "string", "Kind": "string", "Value": "caller"}}}}
				props["Variables"], props["Expression"] = []map[string]any{{"Key": "Locals/request", "Name": "request", "Type": "Request", "Kind": "struct", "Value": "{…}", "Open": true, "Children": []map[string]any{{"Key": "Locals/request/attempts", "Name": "attempts", "Type": "int", "Kind": "number", "Value": 4, "Changed": true}}}}, "request.attempts"
				props["Watches"] = []map[string]any{{"Expression": "request.attempts", "Value": 4, "Kind": "number"}, {"Expression": "request.token", "Error": "caller token expired"}}
				props["PreviewStack"] = true
			case "debug/PerformanceProfiler":
				props["Duration"], props["ProfileReading"], props["TimelineRange"] = 200, "Render · 120 samples · 60% of all", "0–200 ms"
				props["ProfileFrames"] = []map[string]any{{"ID": "root", "Name": "caller::serve", "Samples": 200, "Depth": 0, "Start": 0, "End": 200}, {"ID": "parse", "Name": "ParseRequest", "Samples": 40, "Depth": 1, "Start": 0, "End": 40}, {"ID": "render", "Name": "Render", "Samples": 120, "Depth": 1, "Start": 40, "End": 160}, {"ID": "encode", "Name": "EncodeJSON", "Samples": 60, "Depth": 2, "Start": 65, "End": 125}}
				props["TimelineTracks"] = []map[string]any{{"Name": "Main", "Spans": []map[string]any{{"ID": "span-parse", "Name": "Parse", "Start": 0, "End": 40}, {"ID": "span-render", "Name": "Render", "Start": 45, "End": 165}}}, {"Name": "IO", "Spans": []map[string]any{{"ID": "span-write", "Name": "Write", "Start": 165, "End": 200}}}}
				props["PreviewStack"] = true
			case "debug/NetworkInspector":
				props["Requests"] = []map[string]any{{"Name": "notes", "Method": "POST", "URL": "/caller/notes", "Status": 202, "Kind": "fetch", "Size": "1.2 kB", "Start": 0, "Duration": 18, "Selected": true, "Headers": []map[string]any{{"Name": "Content-Type", "Value": "application/json"}, {"Name": "Cache-Control", "Value": "no-store"}}, "Body": "{\"accepted\":true}"}, {"Name": "assets", "Method": "GET", "URL": "/caller/assets.js", "Status": 200, "Kind": "script", "Size": "42 kB", "Start": 20, "Duration": 33, "Headers": []map[string]any{{"Name": "Content-Type", "Value": "application/javascript"}}}, {"Name": "stream", "Method": "GET", "URL": "/caller/stream", "Status": "pending", "Kind": "fetch", "Size": "0 B", "Start": 58, "Duration": 42, "Headers": []map[string]any{{"Name": "Accept", "Value": "text/event-stream"}}}}
				props["PreviewStack"] = true
			case "terminal/Terminal":
				props["Command"], props["Output"], props["Status"], props["Required"] = "cargo test --lib", "running caller tests…", "Running", true
				props["Entries"] = []map[string]any{{"Text": "$ cargo test --lib"}, {"Text": "test caller::works … ok"}}
				props["History"] = []string{"cargo test --lib", "git status --short"}
				props["PreviewExamples"] = []map[string]any{{}, {"Command": "git status --short", "Status": "Ready", "Output": "M src/worker.go"}}
			case "terminal/CommandBlock":
				props["Command"], props["CWD"], props["Output"], props["Status"], props["State"], props["Duration"] = "cargo test --lib", "~/Caller/workspace", "test caller::works … ok", "Exited 0", "done", "3 s"
				props["PreviewExamples"] = []map[string]any{{}, {"Command": "cargo build", "Output": "error: caller dependency missing", "Status": "Exited 101", "State": "failed", "Duration": "9 s"}}
			case "terminal/ProcessList":
				props["Processes"] = []map[string]any{{"PID": 4242, "Name": "caller-worker", "User": "caller", "CPU": 12.5, "Memory": "48 MB"}, {"PID": 7123, "Name": "caller-indexer", "User": "caller", "CPU": 3.1, "Memory": "24 MB"}}
			case "terminal/AnsiText":
				props["AnsiSpans"] = []map[string]any{{"Tone": "red", "Text": "FAIL "}, {"Tone": "green", "Text": "PASS "}, {"Tone": "dim", "Text": "caller output"}}
			case "terminal/LogViewer":
				props["Query"] = ""
				props["Entries"] = []map[string]any{{"Time": "10:32", "Level": "info", "Text": "caller ready"}, {"Time": "10:33", "Level": "error", "Text": "caller retry"}, {"Time": "10:34", "Level": "warning", "Text": "caller slow"}}
			case "git/DiffViewer":
				props["Path"], props["DiffLayout"] = "src/worker.go", "unified"
				props["DiffLayouts"] = []map[string]any{{"Value": "unified", "Label": "Unified"}, {"Value": "split", "Label": "Side by side"}}
				props["Hunks"] = []map[string]any{{"Header": "@@ -12,3 +12,3 @@", "Folded": true, "HiddenLines": 4, "Lines": []map[string]any{{"Type": "context", "Old": 12, "New": 12, "Prefix": " ", "Text": "func caller() {"}, {"Type": "remove", "Old": 13, "Prefix": "-", "Text": " return oldValue"}, {"Type": "add", "New": 13, "Prefix": "+", "Text": " return newValue"}}}}
			case "git/ThreeWayMerge":
				props["Ours"], props["Base"], props["Theirs"], props["Merged"], props["Required"] = "return callerOld", "return callerBase", "return callerNew", "return callerOld", true
				props["MergeSides"] = []map[string]any{{"ID": "ours", "Label": "main", "Content": "return callerOld"}, {"ID": "base", "Label": "base", "Content": "return callerBase"}, {"ID": "theirs", "Label": "feature/caller", "Content": "return callerNew"}}
			case "git/BranchSelector":
				props["Selected"] = "main"
				props["Branches"] = []map[string]any{{"Value": "main", "Label": "main", "Upstream": "origin/main"}, {"Value": "feature/worker", "Label": "feature/worker", "Upstream": "origin/feature/worker", "Ahead": 2}, {"Value": "origin/release", "Label": "origin/release", "Remote": true, "Behind": 1}}
				props["PreviewExamples"] = []map[string]any{{}, {"Selected": "feature/worker"}}
			case "git/BlameView":
				props["Path"] = "src/worker.go"
				props["Rows"] = []map[string]any{{"Author": "Caller", "Revision": "a1b2c3d", "Line": 1, "Text": "func caller() {", "Age": "recent"}, {"Author": "Reviewer", "Revision": "d4e5f6a", "Line": 2, "Text": " return nil", "Age": "older", "Current": true}}
			case "git/ChangesList":
				props["Changes"] = []map[string]any{{"Path": "src/worker.go", "Status": "Modified"}, {"Path": "docs/brief.md", "Status": "Added"}}
				props["StagedChanges"] = []map[string]any{{"Path": "go.mod", "Status": "Modified"}}
				props["PreviewExamples"] = []map[string]any{{}, {"Changes": []map[string]any{{"Path": "src/api.go", "Status": "Deleted"}}, "StagedChanges": []map[string]any{{"Path": "docs/brief.md", "Status": "Added"}}}}
			case "documents/TodoItem":
				props["ChecklistTitle"] = "Launch"
				props["Todos"] = []map[string]any{{"ID": "todo-1", "Text": "Review caller brief", "Checked": true}, {"ID": "todo-2", "Text": "Publish brief", "Checked": true}, {"ID": "todo-3", "Text": "Motion that settles", "Checked": false}, {"ID": "todo-4", "Text": "A site that shows it all", "Checked": false}}
			case "documents/MarkdownRenderer":
				props["Value"] = "# Lift\n\nA lift blends a color toward white.\n\n## In light\n\nSurfaces stay quiet.\n\n## In dark\n\nThe same colors retain their weight." + strings.Repeat("\n\nCaller reading content for the scroll container.", 20)
				props["PreviewExamples"] = []map[string]any{{}, {"Value": "# Caller guide\n\n## Overview\n\nCaller reading content."}}
			case "documents/DocumentViewer", "documents/OfficePreview", "documents/EpubReader":
				props["Chapters"] = []map[string]any{{"Title": "Overview", "Content": "Caller overview"}, {"Title": "Details", "Content": "Caller document details"}, {"Title": "Notes", "Content": "Caller reading notes"}}
				if name != "EpubReader" {
					props["Filename"] = "caller.pdf"
					props["Pages"] = []map[string]any{{"Title": "Caller cover", "Content": "Caller overview"}, {"Title": "Caller details", "Content": "Caller document details"}, {"Title": "Caller notes", "Content": "Caller reading notes"}}
				}
				if name == "OfficePreview" {
					props["Filename"] = "caller-release.pptx"
					props["Pages"] = []map[string]any{{"Title": "Lift", "Content": "Caller overview"}, {"Title": "Tokens", "Content": "Caller document details"}, {"Title": "Review", "Content": "Caller reading notes"}}
				} else if name == "EpubReader" {
					props["BookTitle"] = "On Caller Lift"
				}
			case "documents/VersionHistory":
				props["SelectedRevision"], props["CurrentRevision"] = 0, 0
				props["Revisions"] = []map[string]any{{"ID": "rev-2", "Author": "Writer", "Time": "2026-10-11 10:00", "Summary": "Current version", "Content": "Updated project revision", "Removed": "Define project scope", "Added": "Define project scope and owners"}, {"ID": "rev-1", "Author": "Reviewer", "Time": "2026-10-11 09:00", "Summary": "Initial scope", "Content": "Original project revision", "Removed": "Unclear project scope", "Added": "Define project scope"}}
			case "documents/TrashBin":
				props["Deleted"] = []map[string]any{{"ID": "deleted-8", "Path": "docs/retired.md", "DeletedAt": "2026-10-09"}}
			case "canvas/ToolPalette":
				props["Tool"] = "select"
				props["Tools"] = []map[string]any{{"Value": "select", "Label": "Select"}, {"Value": "rectangle", "Label": "Rectangle"}}
			case "canvas/LayerPanel":
				props["Layers"] = []map[string]any{{"ID": "shape-a", "Name": "Title layer", "Visible": true}}
			case "canvas/ColorPanel":
				props["Color"], props["Opacity"] = "#336699", 85
			case "canvas/ConstraintsEditor":
				props["Width"], props["Height"], props["Gap"], props["AutoLayout"] = 320, 180, 16, true
			case "canvas/NodeEditor":
				props["Nodes"] = []map[string]any{{"ID": "node-source", "Type": "rect", "X": 40, "Y": 70, "Width": 130, "Height": 60, "HandleX": 122, "HandleY": 52, "Label": "Read caller", "Ports": []map[string]any{{"ID": "output", "X": 130, "Y": 30}}}, {"ID": "node-target", "Type": "rect", "X": 300, "Y": 70, "Width": 140, "Height": 60, "HandleX": 132, "HandleY": 52, "Label": "Transform caller", "Ports": []map[string]any{{"ID": "input", "X": 0, "Y": 30}, {"ID": "output", "X": 140, "Y": 30}}}}
				props["Edges"] = []map[string]any{{"FromX": 170, "FromY": 100, "ToX": 300, "ToY": 100}}
			case "canvas/InfiniteCanvas":
				props["CanvasLabel"] = "Project workspace"
				props["Rulers"], props["MiniMap"] = true, true
				props["Artboards"] = []map[string]any{{"X": 24, "Y": 32, "Width": 342, "Height": 300, "Label": "Home", "LabelX": 32, "LabelY": 52}, {"X": 430, "Y": 32, "Width": 342, "Height": 300, "Label": "Detail", "LabelX": 438, "LabelY": 52}}
				props["Guides"] = []map[string]any{{"Path": "M24 0 L24 420"}, {"Path": "M0 212 L800 212"}}
				props["Shapes"] = []map[string]any{{"ID": "brief", "Type": "rect", "X": 70, "Y": 60, "Width": 170, "Height": 80, "HandleX": 162, "HandleY": 72, "Label": "Project brief"}, {"ID": "launch", "Type": "text", "X": 380, "Y": 95, "Width": 150, "Height": 72, "HandleX": 142, "HandleY": 64, "Label": "Launch plan"}, {"ID": "review", "Type": "ellipse", "X": 570, "Y": 250, "Width": 68, "Height": 68, "CenterX": 34, "CenterY": 34, "RadiusX": 34, "RadiusY": 34, "HandleX": 60, "HandleY": 60, "Label": "Review"}}
				props["Edges"] = []map[string]any{{"FromX": 240, "FromY": 100, "ToX": 380, "ToY": 130}, {"FromX": 530, "FromY": 145, "ToX": 570, "ToY": 280}}
			case "canvas/FlowChart":
				props["CanvasLabel"] = "Release flow"
				props["Shapes"] = []map[string]any{{"ID": "start", "Type": "ellipse", "X": 60, "Y": 165, "Width": 110, "Height": 56, "CenterX": 55, "CenterY": 28, "RadiusX": 55, "RadiusY": 28, "HandleX": 102, "HandleY": 48, "Label": "Start"}, {"ID": "review", "Type": "diamond", "X": 260, "Y": 165, "Width": 140, "Height": 56, "Points": "70,0 140,28 70,56 0,28", "HandleX": 132, "HandleY": 48, "Label": "Review?"}, {"ID": "publish", "Type": "rect", "X": 510, "Y": 165, "Width": 130, "Height": 56, "HandleX": 122, "HandleY": 48, "Label": "Publish"}}
				props["Edges"] = []map[string]any{{"FromX": 170, "FromY": 193, "ToX": 260, "ToY": 193}, {"FromX": 400, "FromY": 193, "ToX": 510, "ToY": 193}}
			case "canvas/MindMap":
				props["CanvasLabel"] = "Launch map"
				props["Shapes"] = []map[string]any{{"ID": "root", "X": 335, "Y": 175, "Width": 140, "Height": 64, "Label": "Launch"}, {"ID": "research", "X": 90, "Y": 80, "Width": 135, "Height": 56, "Label": "Research"}, {"ID": "content", "X": 90, "Y": 290, "Width": 135, "Height": 56, "Label": "Content"}, {"ID": "release", "X": 590, "Y": 95, "Width": 130, "Height": 56, "Label": "Release"}, {"ID": "measure", "X": 590, "Y": 280, "Width": 130, "Height": 56, "Label": "Measure"}}
				props["Edges"] = []map[string]any{{"FromX": 335, "FromY": 205, "ToX": 225, "ToY": 108}, {"FromX": 335, "FromY": 208, "ToX": 225, "ToY": 318}, {"FromX": 475, "FromY": 205, "ToX": 590, "ToY": 123}, {"FromX": 475, "FromY": 208, "ToX": 590, "ToY": 308}}
			case "canvas/Whiteboard":
				props["CanvasLabel"] = "Workshop whiteboard"
				props["Shapes"] = []map[string]any{{"ID": "question", "Type": "note", "X": 95, "Y": 80, "Width": 150, "Height": 90, "HandleX": 142, "HandleY": 82, "Label": "What changed?"}, {"ID": "idea", "Type": "note", "X": 340, "Y": 160, "Width": 155, "Height": 90, "HandleX": 147, "HandleY": 82, "Label": "Try smaller steps"}, {"ID": "next", "Type": "note", "X": 570, "Y": 70, "Width": 140, "Height": 90, "HandleX": 132, "HandleY": 82, "Label": "Next review"}}
				props["Edges"] = []map[string]any{{"FromX": 245, "FromY": 125, "ToX": 340, "ToY": 205}, {"FromX": 495, "FromY": 205, "ToX": 570, "ToY": 115}}
			}
			if chapter == "devtools" {
				props["Devtools"] = workspaceDevtoolsModel(name)
			}
			if chapter == "canvas" {
				props["CanvasScene"] = workspaceCanvasScene(name)
			}
			if source, ok := sourcePreviews[chapter+"/"+name]; ok {
				props["PreviewStack"] = true
				props["PreviewExamples"] = []map[string]any{source}
			}
			cases = append(cases, AdvancedCase{Family: "workspace", Component: ui.Component{Chapter: chapter, Name: name, ID: id, Props: props}})
		}
	}
	return cases
}

// Deterministic equivalents of collab/talk.rs; timestamps remain caller-owned.
func workspaceCollaborationThreads() []map[string]any {
	return []map[string]any{
		{"ID": "gamma", "Quote": "blends in gamma space", "Comments": []map[string]any{
			{"ID": "gamma-ada", "Author": "Ada Park", "Initials": "AP", "Time": "5 hours ago", "Text": "Should this say gamma? Most readers won't know the word.", "Reactions": []map[string]any{{"Emoji": "👀", "Count": 2, "Mine": false}}},
			{"ID": "gamma-alan", "Author": "Alan Reyes", "Initials": "AR", "Hue": 2, "Time": "3 hours ago", "Text": "Keep it, and link the glossary entry beside it.", "Reactions": []map[string]any{{"Emoji": "👍", "Count": 1, "Mine": true}}},
		}},
		{"ID": "weight", "Quote": "read with the same weight", "Comments": []map[string]any{{"ID": "weight-grace", "Author": "Grace Lin", "Initials": "GL", "Hue": 1, "Time": "1 day ago", "Text": "Could we show a light and a dark pair side by side here?"}}},
		{"ID": "title", "Quote": "On Lift", "Resolved": true, "Comments": []map[string]any{{"ID": "title-mae", "Author": "Mae Okafor", "Initials": "MO", "Hue": 3, "Time": "2 days ago", "Text": "The title reads well now."}, {"ID": "title-ada", "Author": "Ada Park", "Initials": "AP", "Time": "2 days ago", "Text": "Agreed, closing this."}}},
	}
}

func workspaceFileEntries() []map[string]any {
	entries := []map[string]any{
		{"Name": "Design", "Folder": true, "Modified": "3 hours ago"}, {"Name": "Recordings", "Folder": true, "Modified": "1 day ago"},
		{"Name": "Brief.md", "Bytes": 4800, "Size": "4.8 KB", "Modified": "2 hours ago", "Content": "# Atrium\nCaller brief preview"},
		{"Name": "Budget.csv", "Bytes": 18300, "Size": "18 KB", "Modified": "1 day ago", "Content": "Caller budget preview"},
		{"Name": "Atrium.jpg", "Bytes": 2140000, "Size": "2.1 MB", "Modified": "2 days ago"},
		{"Name": "Walkthrough.mov", "Bytes": 184000000, "Size": "184 MB", "Modified": "5 days ago"},
		{"Name": "main.rs", "Bytes": 9200, "Size": "9.2 KB", "Modified": "1 hour ago"},
		{"Name": "Archive.zip", "Bytes": 48000000, "Size": "48 MB", "Modified": "1 month ago"},
		{"Name": "Quarterly review with the design team, final.pdf", "Bytes": 820000, "Size": "820 KB", "Modified": "6 hours ago"},
	}
	for i, entry := range entries {
		entry["Path"] = "Home/Projects/Atrium/" + entry["Name"].(string)
		entry["ModifiedUnix"] = []int{99700, 97000, 99800, 97400, 95000, 88000, 99900, 30000, 99400}[i]
	}
	return entries
}

func workspaceFileLevels() []map[string]any {
	return []map[string]any{
		{"Path": "Home", "Name": "Home", "Entries": []map[string]any{{"Name": "Documents", "Path": "Home/Documents", "Folder": true}, {"Name": "Music", "Path": "Home/Music", "Folder": true}, {"Name": "Projects", "Path": "Home/Projects", "Folder": true}, {"Name": "Notes.txt", "Path": "Home/Notes.txt", "Size": "1.2 KB", "Bytes": 1200}}},
		{"Path": "Home/Projects", "Name": "Projects", "Entries": []map[string]any{{"Name": "Atrium", "Path": "Home/Projects/Atrium", "Folder": true}, {"Name": "Dunes", "Path": "Home/Projects/Dunes", "Folder": true}, {"Name": "Roadmap.md", "Path": "Home/Projects/Roadmap.md", "Bytes": 6400, "Size": "6.4 KB"}}},
		{"Path": "Home/Projects/Atrium", "Name": "Atrium", "Entries": workspaceFileEntries()},
		{"Path": "Home/Documents", "Name": "Documents", "Entries": []map[string]any{{"Name": "Contract.docx", "Path": "Home/Documents/Contract.docx", "Size": "64 KB", "Bytes": 64000}, {"Name": "Invoice.pdf", "Path": "Home/Documents/Invoice.pdf", "Size": "88 KB", "Bytes": 88000}}},
		{"Path": "Home/Music", "Name": "Music", "Entries": []map[string]any{{"Name": "Ambient.flac", "Path": "Home/Music/Ambient.flac", "Size": "31 MB", "Bytes": 31000000}, {"Name": "Theme.mp3", "Path": "Home/Music/Theme.mp3", "Size": "7.4 MB", "Bytes": 7400000}}},
		{"Path": "Home/Projects/Dunes", "Name": "Dunes", "Entries": []map[string]any{{"Name": "Dunes.jpg", "Path": "Home/Projects/Dunes/Dunes.jpg", "Size": "2.8 MB", "Bytes": 2800000}, {"Name": "Survey.csv", "Path": "Home/Projects/Dunes/Survey.csv", "Size": "42 KB", "Bytes": 42000}}},
		{"Path": "Home/Projects/Atrium/Recordings", "Name": "Recordings", "Entries": []map[string]any{{"Name": "Voiceover.m4a", "Path": "Home/Projects/Atrium/Recordings/Voiceover.m4a", "Size": "12 MB", "Bytes": 12000000}, {"Name": "Walkthrough.mov", "Path": "Home/Projects/Atrium/Recordings/Walkthrough.mov", "Size": "184 MB", "Bytes": 184000000}}},
		{"Path": "Home/Projects/Atrium/Design", "Name": "Design", "Entries": []map[string]any{{"Name": "Moodboard.png", "Path": "Home/Projects/Atrium/Design/Moodboard.png", "Bytes": 3200000, "Size": "3.2 MB"}, {"Name": "Palette.json", "Path": "Home/Projects/Atrium/Design/Palette.json", "Bytes": 2100, "Size": "2.1 KB"}, {"Name": "Display.ttf", "Path": "Home/Projects/Atrium/Design/Display.ttf", "Bytes": 180000, "Size": "180 KB"}}},
	}
}

func workspaceFileTree(path string) []map[string]any {
	for _, level := range workspaceFileLevels() {
		if level["Path"] != path {
			continue
		}
		var items []map[string]any
		for _, entry := range level["Entries"].([]map[string]any) {
			fullPath := entry["Path"].(string)
			item := map[string]any{"Value": strings.TrimPrefix(fullPath, "Home/"), "Label": entry["Name"], "Folder": entry["Folder"]}
			if entry["Folder"] == true {
				item["Children"] = workspaceFileTree(fullPath)
				item["Collapsed"] = path != "Home"
			}
			items = append(items, item)
		}
		return items
	}
	return nil
}
