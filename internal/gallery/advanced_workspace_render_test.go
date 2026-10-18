package uiexamples

import (
	"bytes"
	"os"
	"regexp"
	"strings"
	"testing"

	"golang.org/x/net/html"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestWorkspaceRenderCallerState(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	want := map[string][]string{
		"files/RecentFiles":           {`data-ws-recent-files`, `2026-10-13T06:34:00Z`, `Projects/Atrium`, `Survey.csv`},
		"files/Favorites":             {`data-ws-pins`, `data-ws-favorite="atrium"`, `Roadmap.md`, `data-ws-favorite-unpin`},
		"files/FileSearch":            {`data-ws-file-query`, `data-ws-file-results`},
		"files/DuplicateFinder":       {`data-ws-duplicate-set`, `data-bytes="2140000"`, `Downloads/Walkthrough.mov`},
		"files/ArchiveViewer":         {`data-ws-archive-entry`, `Atrium.zip`, `Atrium/Design/Palette.json`, `data-packed="600"`},
		"files/HexViewer":             {`data-ws-byte`, `000001ff`},
		"files/FileOperationProgress": {`data-ws-operation="copy"`, `data-rate="38000000"`, `The disk Backup is full.`},
		"files/TransferQueue":         {`data-ws-transfer="walkthrough"`, `data-state="moving"`, `retry-transfer`},
		"files/DownloadManager":       {`data-ws-transfers-done`, `data-ws-clear-downloads`, `Inter-4.1.zip`},
		"files/StorageUsage":          {`data-capacity="512000000000"`, `data-bytes="142000000000"`, `Photos`},
		"files/FileGrid":              {`data-ws-file-grid-list`, `data-name="Brief.md"`, `data-name="Design"`},
		"collab/ShareDialog":          {`ely-workspace__share-trigger`, `data-ws-share-member`, `owner@example.test`, `pending@example.test`},
		"collab/ActivityLog":          {`data-ws-activity-entry`, `Alan Reyes`, `Grace Lin`, `Ada Park`, `data-ws-activity-avatar`},
		"collab/PresenceAvatars":      {`data-ws-follow`, `data-ws-remote-cursor`, `Handbook / Color / Lift`, `Joan Ito`},
		"collab/CommentThread":        {`data-ws-thread="gamma"`, `gamma-ada`, `data-ws-reaction="👀"`, `name="reply"`},
		"collab/CommentBubble":        {`data-ws-comment-marker`, `data-ws-comment-bubble`, `data-ws-thread="weight"`},
		"collab/CommentSidebar":       {`data-ws-comment-filter="resolved"`, `data-active-thread="gamma"`, `data-ws-thread="title"`},
		"collab/Annotation":           {`data-ws-annotation="base"`, `The one idea to remember.`, `data-ws-annotation="loud"`},
		"collab/SuggestionMode":       {`data-ws-suggestion-mode="viewing"`, `data-ws-change-preview`, `accept-all-suggestions`, `replace-lift`},
		"documents/PageTree":          {`data-ws-page-tree-layout`, `Favorites`, `Pinned`, `aria-label="Page tree"`, `Lift`, `Decisions`, `Research`},
		"documents/PageCover":         {`data-ws-page-cover`, `data-ws-page-icon`, `Grace Lin`},
		"documents/Backlinks":         {`data-ws-backlink`, `href="#caller-source"`, `Source page`, `data-workspace-graph`, `Launch plan`, `Decisions`},
		"documents/TemplatePicker":    {`data-ws-template-picker`, `data-ws-template-layout`, `data-ws-template-search`, `Project brief`, `Meeting notes`},
		"documents/VersionHistory":    {`data-ws-history-layout`, `role="listbox"`, `data-ws-history-tab="changes"`, `2026-10-11 10:00`, `data-ely-action="restore-revision"`},
		"documents/RichTextEditor":    {`data-workspace-rich`, `data-ws-format="heading"`, `data-ws-format="bullet-list"`, `Caller notes`},
		"documents/MarkdownEditor":    {`data-ws-markdown-modes`, `data-ws-markdown-layout="split"`, `data-workspace-markdown-preview`},
		"documents/BlockEditor":       {`data-ws-block-editor`, `data-ws-block-handle`, `data-ws-slash-menu`, `Project notes`},
		"documents/Block types":       {`data-ws-block-canvas`, `data-ws-block-type="code"`, `callerCode()`, `data-ws-block-type="table"`},
		"documents/TodoItem":          {`data-ws-todo-progress`, `data-ws-todo-row`, `Review caller brief`, `max="4"`},
		"documents/MarkdownRenderer":  {`data-ws-reading`, `data-ws-markdown-nav`, `In light`, `In dark`},
		"documents/DocumentViewer":    {`data-ws-viewer`, `data-ws-page-thumbnails`, `data-ws-viewer-zoom`, `Caller cover`},
		"documents/OfficePreview":     {`caller-release.pptx`, `data-ws-page-stage`, `Caller document details`},
		"documents/EpubReader":        {`data-ws-epub`, `data-ws-epub-nav`, `On Caller Lift`},
		"documents/Footnote":          {`data-ws-footnote-definitions`, `note-3`, `Caller definitions remain local.`},
		"documents/FocusMode":         {`data-ws-focus-content`, `data-ws-format="strong"`, `Caller focused paragraph`},
		"documents/PrintPreview":      {`data-ws-print-preview`, `data-ws-print-thumb="1"`},
		"debug/DebugToolbar":          {`data-ws-debug-toolbar`, `data-ws-debug-request`, `data-ely-action="debug-step-over"`, `data-ely-action="debug-step-into"`, `data-ely-action="debug-step-out"`, `data-ely-action="debug-restart"`},
		"debug/VariablesPanel":        {`data-ws-variable-scope`, `data-ws-variable-branch`, `data-ws-watch-panel`, `caller token expired`},
		"debug/MemoryViewer":          {`data-ws-hex-byte`, `00007ffd5a201000`, `0x7FFD5A201005`},
		"debug/PerformanceProfiler":   {`data-ws-flamegraph`, `data-ws-timeline`, `EncodeJSON`, `span-render`},
		"debug/NetworkInspector":      {`data-ws-network-filter`, `data-ws-network-row`, `data-ws-network-detail-panel="0"`, `caller/assets.js`},
		"editor/CodeEditor":           {`data-ws-minimap`, `data-ws-fold`, `data-ws-syntax="keyword"`, `data-ws-code-lens="references"`},
		"editor/DebugConsole":         {`data-ws-console-history`, `data-severity="error"`, `request.attempts`, `caller token expired`},
		"editor/SettingsEditor":       {`data-ws-settings-nav`, `data-ws-settings-group="1"`, `data-ws-setting-key="fontSize"`, `data-ws-setting-key="tabSize"`},
		"editor/InlineDiff":           {`data-ws-diff-unfold`, `Show 4 unchanged lines`},
		"editor/WelcomePage":          {`data-ws-welcome-show`, `data-ely-action="new-file"`, `data-ely-action="open-project"`, `Caller documentation`},
		"terminal/Terminal":           {`data-ws-terminal-output`, `data-workspace-history`, `test caller::works`},
		"terminal/CommandBlock":       {`data-ws-command-block`, `~/Caller/workspace`, `data-ws-command-fold`},
		"terminal/AnsiText":           {`data-ws-ansi`, `data-ws-ansi-tone="red"`, `FAIL`},
		"terminal/LogViewer":          {`data-ws-log-level`, `data-ws-log-follow`, `caller retry`},
		"terminal/ProcessList":        {`data-ws-process-filter`, `data-ws-process-select`, `caller-indexer`},
		"git/DiffViewer":              {`data-ws-diff-hunk`, `data-ws-diff-unfold`, `src/worker.go`},
		"git/ThreeWayMerge":           {`data-ws-merge-side="base"`, `return callerNew`, `data-ws-merge-status`},
		"git/ChangesList":             {`data-ws-change-list="staged"`, `data-ws-change-action="stage"`, `go.mod`},
		"git/BranchSelector":          {`data-ws-branch-dialog`, `data-ws-branch-pick="feature/worker"`, `origin/main`},
		"git/BlameView":               {`data-ws-blame-filter`, `data-ws-blame-row`, `d4e5f6a`},
		"git/PullRequestCard":         {`data-ws-pull-request`, `data-ws-pr-checks`, `caller tests`, `12 additions`},
		"debug/BreakpointList":        {`data-ws-breakpoint-filter`, `data-ws-library-frames`, `remove-breakpoint`, `3 hits`},
		"git/CommitGraph":             {`data-ws-graph-layout="timeline"`, `data-ws-graph-zoom`},
		"files/FileExplorer":          {`data-ws-file-view="columns"`, `data-ws-file-pane="icons"`, `data-ws-file-pane="columns"`, `data-ws-directory-level="Home/Projects/Atrium"`, `Moodboard.png`, `Palette.json`},
		"devtools/GraphQLExplorer":    {`data-ws-devtools-source`, `Ada Lovelace`, `Customer`, `GraphQLExplorer`},
		"devtools/QueryEditor":        {`data-ws-devtools-source`, `count(o.id)`, `ada@example.com`, `Hash Join`, `users_pkey`},
		"canvas/NodeEditor":           {`data-ws-canvas-scene`, `Load image`, `Save image`, `fromPort`, `image`},
		"canvas/InfiniteCanvas":       {`data-ws-canvas-scene`, `Home · 390`, `Detail · 390`, `Studio Atrium`, `Ask Chloé about the stair`},
		"canvas/FlowChart":            {`data-ws-canvas-scene`, `diamond`, `Start`, `Reviewed?`, `Publish`},
		"canvas/MindMap":              {`Product launch`, `Website`, `Press kit`, `Budget`},
		"canvas/Whiteboard":           {`note`, `Why do people leave in week two?`, `Try a sample project`, `Week two retention`},
	}
	seen := make(map[string]bool, len(want))
	for _, fixture := range advancedWorkspaceCases() {
		component := fixture.Component
		key := component.Chapter + "/" + component.Name
		expected, ok := want[key]
		if !ok {
			continue
		}
		var output bytes.Buffer
		if err := ui.RenderComponent(server.templates, &output, component); err != nil {
			t.Fatal(err)
		}
		body := output.String()
		if key == "documents/PrintPreview" {
			doc, err := html.Parse(strings.NewReader(body))
			if err != nil {
				t.Fatal(err)
			}
			found := false
			var walk func(*html.Node)
			walk = func(node *html.Node) {
				attrs := map[string]string{}
				for _, attr := range node.Attr {
					attrs[attr.Key] = attr.Val
				}
				if node.Type == html.ElementNode && node.Data == "input" && attrs["name"] == "copies" {
					found = true
					if attrs["value"] != "2" || attrs["min"] != "1" || attrs["type"] != "number" {
						t.Errorf("copies field: %v", attrs)
					}
				}
				for child := node.FirstChild; child != nil; child = child.NextSibling {
					walk(child)
				}
			}
			walk(doc)
			if !found {
				t.Fatal("missing copies field")
			}
		}
		for _, value := range expected {
			if !strings.Contains(body, value) {
				t.Fatalf("%s did not render fixture value %q: %s", key, value, body)
			}
		}
		seen[key] = true
	}
	for key := range want {
		if !seen[key] {
			t.Errorf("missing workspace fixture %s", key)
		}
	}
	for _, fixture := range advancedWorkspaceCases() {
		if fixture.Component.Chapter != "editor" || fixture.Component.Name != "CodeEditor" {
			continue
		}
		var preview bytes.Buffer
		for _, component := range storyPreviewComponents(fixture.Component) {
			if err := ui.RenderComponent(server.templates, &preview, component); err != nil {
				t.Fatal(err)
			}
		}
		for _, landmark := range []string{`data-workspace-rich`, `data-ws-minimap`} {
			if !strings.Contains(preview.String(), landmark) {
				t.Fatalf("CodeEditor gallery preview did not render %s", landmark)
			}
		}
	}

	css, err := os.ReadFile("../../ui/gohtmx/assets/ely-api-workspace.css")
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{
		`.ely-workspace__diff-add{background:var(--approved-tint);color:var(--approved)}`,
		`.ely-workspace__diff-remove{background:var(--error-tint);color:var(--error)}`,
	} {
		if !strings.Contains(string(css), value) {
			t.Errorf("workspace diff style is missing %q", value)
		}
	}
	for _, legacy := range []string{"#d9f7e6", "#ffe1e1"} {
		if strings.Contains(string(css), legacy) {
			t.Errorf("workspace CSS retains light-only diff color %q", legacy)
		}
	}
	if !strings.Contains(string(css), ".ely-workspace__share-trigger{justify-self:start;width:auto}") {
		t.Error("workspace ShareDialog trigger must retain compact caller-controlled sizing")
	}
}

func TestWorkspaceTodoItemAllowsOmittedTodos(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := server.templates.ExecuteTemplate(&out, "ely-api-documents", map[string]any{"ID": "empty-todos", "Kind": "TodoItem"}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), `data-ws-todo-progress max="1" value="0"`) {
		t.Fatalf("TodoItem without Todos did not render safe empty progress: %s", out.String())
	}
}

func TestWorkspaceWelcomeUsesCallerScopedIDs(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	render := func(id string) string {
		t.Helper()
		var out bytes.Buffer
		if err := server.templates.ExecuteTemplate(&out, "ely-api-editor", map[string]any{
			"ID": id, "Kind": "WelcomePage", "WelcomeTitle": "Caller workspace",
		}); err != nil {
			t.Fatal(err)
		}
		return out.String()
	}
	first, second := render("welcome-one"), render("welcome-two")
	for _, suffix := range []string{"welcome-title", "welcome-projects", "welcome-show", "welcome-tasks", "welcome-help", "welcome-status"} {
		if !strings.Contains(first, `id="welcome-one-`+suffix+`"`) {
			t.Errorf("first WelcomePage is missing caller-scoped %s", suffix)
		}
		if !strings.Contains(second, `id="welcome-two-`+suffix+`"`) {
			t.Errorf("second WelcomePage is missing caller-scoped %s", suffix)
		}
	}
	idPattern := regexp.MustCompile(`\sid="([^"]+)"`)
	firstIDs := make(map[string]bool)
	for _, match := range idPattern.FindAllStringSubmatch(first, -1) {
		firstIDs[match[1]] = true
	}
	for _, match := range idPattern.FindAllStringSubmatch(second, -1) {
		if firstIDs[match[1]] {
			t.Errorf("WelcomePage instances share id %q", match[1])
		}
	}
}

func TestWorkspaceWelcomeInstancesRemainParsedSiblings(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	for _, id := range []string{"welcome-primary", "welcome-twin"} {
		component := ui.Component{Chapter: "editor", Name: "WelcomePage", ID: id, Props: map[string]any{
			"WelcomeTitle": "Caller workspace",
			"Help":         []map[string]any{{"Label": "Caller documentation", "URL": "#docs"}},
		}}
		if err := ui.RenderComponent(server.templates, &out, component); err != nil {
			t.Fatal(err)
		}
	}
	doc, err := html.Parse(strings.NewReader(out.String()))
	if err != nil {
		t.Fatal(err)
	}
	attr := func(node *html.Node, key string) string {
		for _, item := range node.Attr {
			if item.Key == key {
				return item.Val
			}
		}
		return ""
	}
	var roots []*html.Node
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode && attr(node, "data-ely-component") == "editor/WelcomePage" {
			roots = append(roots, node)
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)
	if len(roots) != 2 || roots[0].Parent != roots[1].Parent {
		t.Fatalf("WelcomePage roots must be parsed siblings, got %d", len(roots))
	}
	if attr(roots[0], "id") == attr(roots[1], "id") {
		t.Fatal("WelcomePage roots share an ID")
	}
}

func TestWorkspaceFileHexSourceFixture(t *testing.T) {
	source, err := os.ReadFile("../../ui/gohtmx/assets/ely/workspace-atrium.jpg")
	if err != nil {
		t.Fatal(err)
	}
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	for _, fixture := range advancedWorkspaceCases() {
		c := fixture.Component
		if c.Chapter != "files" || c.Name != "HexViewer" {
			continue
		}
		data := c.Props["Bytes"].([]int)
		if len(data) != 512 {
			t.Fatalf("hex bytes=%d, want 512", len(data))
		}
		for i, value := range data {
			if value != int(source[i]) {
				t.Fatalf("upstream JPEG byte %d differs", i)
			}
		}
		var output bytes.Buffer
		if err := ui.RenderComponent(server.templates, &output, c); err != nil {
			t.Fatal(err)
		}
		doc, err := html.Parse(strings.NewReader(output.String()))
		if err != nil {
			t.Fatal(err)
		}
		count := 0
		var walk func(*html.Node)
		walk = func(n *html.Node) {
			for _, a := range n.Attr {
				if a.Key == "data-ws-byte" {
					count++
				}
			}
			for child := n.FirstChild; child != nil; child = child.NextSibling {
				walk(child)
			}
		}
		walk(doc)
		if count != 512 {
			t.Fatalf("rendered raw bytes=%d, want 512", count)
		}
		return
	}
	t.Fatal("missing files/HexViewer fixture")
}

func TestWorkspaceDevtoolsSourceFixtures(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	expected := map[string][]string{
		"ConnectionManager":    {"Shop", "10.0.0.12", "Password rejected for user report", "~/notes.db"},
		"SchemaTree":           {"order_items", "public.orders", "recent_orders", "timestamptz"},
		"QueryEditor":          {"ada@example.com", "Hash Join", "users_pkey", "relation"},
		"TableStructureEditor": {"orders_pkey", "orders_user_placed", "user_id"},
		"RedisKeyBrowser":      {"user:42", "queue:mail", "tags:popular", "board:weekly"},
		"DocumentViewer":       {"Ada Lovelace", "Deployment", "registry.example.com/web:1.8.2", "Release notes"},
		"ApiRequestBuilder":    {"staging.api.example.com", "List orders", "Create an order", "x-request-id"},
		"WebSocketConsole":     {"wss://stream.example.com/orders", "subscribe", "1011"},
		"GraphQLExplorer":      {"Ada Lovelace", "Customer", "SHIPPED"},
		"RegexTester":          {"Hello, 世界", "grace.h@navy.mil", "#6b6b6b"},
		"ContainerList":        {"postgres:17", "coredns-6f4b-hx8c", "Network in"},
	}
	for _, fixture := range advancedWorkspaceCases() {
		if fixture.Component.Chapter != "devtools" {
			continue
		}
		c := fixture.Component
		var out bytes.Buffer
		if err := ui.RenderComponent(server.templates, &out, c); err != nil {
			t.Fatal(err)
		}
		doc, err := html.Parse(strings.NewReader(out.String()))
		if err != nil {
			t.Fatal(err)
		}
		var text strings.Builder
		var walk func(*html.Node)
		walk = func(n *html.Node) {
			if n.Type == html.TextNode {
				text.WriteString(n.Data)
			}
			for child := n.FirstChild; child != nil; child = child.NextSibling {
				walk(child)
			}
		}
		walk(doc)
		for _, want := range expected[c.Name] {
			if !strings.Contains(text.String(), want) {
				t.Errorf("%s missing %q", c.Name, want)
			}
		}
		delete(expected, c.Name)
	}
	if len(expected) != 0 {
		t.Fatalf("missing fixtures: %v", expected)
	}
}
