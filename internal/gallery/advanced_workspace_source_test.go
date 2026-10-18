package uiexamples

import (
	"bytes"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"golang.org/x/net/html"
)

func TestWorkspaceSourcePreviews331To360(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	expected := map[string][]string{
		"editor/CodeEditor":         {"pub struct Palette", "data-ws-code-line=", "unused variable", "Column 100"},
		"editor/WhitespaceRenderer": {"HashMap", "pub struct Color"},
		"editor/InlineDiff":         {"data-ws-ghost", "data-ws-readonly", "self.colors[name]"},
		"editor/CompletionMenu":     {"data-ws-signature", "data-ws-hover", "lookup", "HashMap"},
		"editor/CodeActionMenu":     {"data-ws-navigation", "data-ws-reference-list", "paint_theme"},
		"editor/FindWidget":         {"data-ws-replace=", "blend", "match lift"},
		"editor/SearchPanel":        {"data-ws-search-file", "src/palette.rs", "surface_lift"},
		"editor/ProblemsPanel":      {"data-ws-output-panel", "mismatched types", "unused variable", "too many arguments"},
		"editor/DebugConsole":       {"data-ws-extensions", "Even Better TOML", "tints.len()"},
		"editor/SettingsEditor":     {"data-ws-keybindings", "editor.fontSize", "editor.minimap", "files.autoSave"},
		"editor/WelcomePage":        {"Ely Editor", "Quiet tools for careful code.", "ely-gpui-component", "cargo check"},
		"editor/CursorPosition":     {"data-ws-statusbar", "Ln 48, Col 27", "UTF-8", "indexing 214 files"},
		"terminal/Terminal":         {"data-ws-terminal-tabs", "data-ws-terminal-pane=", "Ely-GPUI-Components", "src/main.rs:47:9"},
		"terminal/CommandBlock":     {"cargo test --lib palette", "error[E0308]", "cargo run --example gallery"},
		"terminal/AnsiText":         {"data-ws-ansi-tone=\"15\"", "the cube", "true color", "PASS", "FAIL", "SKIP"},
		"terminal/LogViewer":        {"09:03:19.363", "ely::pty", "slow frame"},
		"terminal/ProcessList":      {"WindowServer", "rust-analyzer", "Safari Networking", "data-ws-process-sort"},
		"git/DiffViewer":            {"src/palette.rs", "BTreeMap", "HashMap", "data-ws-diff-line=\"remove\""},
		"git/ThreeWayMerge":         {"color.mix(WHITE, 0.6)", "color.mix(WHITE, LIFT)", "data-ws-merge-side=\"base\""},
		"git/ChangesList":           {"src/theme/tokens.rs", "tests/palette.rs", "name=\"subject\""},
		"git/CommitGraph":           {"data-ws-commit-history", "data-ws-commit-list", "origin/main", "First palette", "c8d0"},
		"git/BranchSelector":        {"data-ws-ref-lists", "fix/order", "Tints and counts", "WIP on lift"},
		"git/BlameView":             {"data-ws-commit-list", "Sam Ortiz", "base.lift(lift)"},
		"git/PullRequestCard":       {"#128", "#131", "data-ws-review-notes", "Should a lift past one clamp"},
		"debug/DebugToolbar":        {"data-ws-debug-toolbar", "debug-step-over", "debug-restart"},
		"debug/BreakpointList":      {"data-ws-threads", "palette::Palette::lookup", "src/theme/tokens.rs"},
		"debug/VariablesPanel":      {"BTreeMap", "self.colors.len()", "cannot find value"},
		"debug/MemoryViewer":        {"00007ffd5a201000", "10004a4a", "movss", "data-ws-instruction"},
		"debug/PerformanceProfiler": {"measure_text", "taffy::compute", "dispatch_event", "Memory", "225"},
		"debug/NetworkInspector":    {"https://api.ely.dev/v1/orders", "orders are paused", "inter.woff2"},
	}
	seen := 0
	for _, fixture := range advancedWorkspaceCases() {
		key := fixture.Component.Chapter + "/" + fixture.Component.Name
		want, ok := expected[key]
		if !ok {
			continue
		}
		seen++
		t.Run(key, func(t *testing.T) {
			previews := storyPreviewComponents(fixture.Component)
			if len(previews) != 1 {
				t.Fatalf("got %d source previews, want one composed story", len(previews))
			}
			var out bytes.Buffer
			if err := ui.RenderComponent(server.templates, &out, previews[0]); err != nil {
				t.Fatal(err)
			}
			body := out.String()
			for _, token := range want {
				if !strings.Contains(body, token) {
					t.Errorf("missing source content %q", token)
				}
			}
			doc, err := html.Parse(strings.NewReader(body))
			if err != nil {
				t.Fatal(err)
			}
			ids := map[string]bool{}
			counts := map[string]int{}
			var walk func(*html.Node)
			walk = func(n *html.Node) {
				for _, a := range n.Attr {
					counts[a.Key]++
					if a.Key == "id" {
						if ids[a.Val] {
							t.Errorf("duplicate id %q", a.Val)
						}
						ids[a.Val] = true
					}
				}
				for c := n.FirstChild; c != nil; c = c.NextSibling {
					walk(c)
				}
			}
			walk(doc)
			for attr, want := range map[string]int{"data-ws-process": 10, "data-ws-search-file": 2, "data-ws-terminal-pane": 2, "data-ws-log-target": 200} {
				if counts[attr] > 0 && counts[attr] != want {
					t.Errorf("%s count %d, want %d", attr, counts[attr], want)
				}
			}
		})
	}
	if seen != 30 {
		t.Fatalf("reviewed %d stories, want all 30", seen)
	}
}
