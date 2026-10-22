package uiexamples

import (
	"bytes"
	"reflect"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

// This is render/source proof only; browser state and pixel gates remain separate.
func TestCodeEditorActionContractAliases(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]AdvancedCase{}
	for _, f := range advancedCases() {
		fixtures[f.Component.Chapter+"/"+f.Component.Name] = f
	}
	base := fixtures["editor/CodeEditor"].Component
	render := func(name string) string {
		t.Helper()
		f, ok := fixtures["editor/"+name]
		if !ok {
			f = fixtures["editor/CodeEditor"]
		}
		c := f.Component
		c.Name = name
		c.ID = "contract-editor"
		c.Props = aliasFixtureProps(c.Props, "editor/"+name)
		if !reflect.DeepEqual(c.Props, base.Props) {
			t.Fatalf("%s fixture props differ", name)
		}
		d, e := ui.ResolveComponent("editor", name)
		if e != nil || d.Name != "CodeEditor" || d.Family != "workspace" {
			t.Fatalf("%s binding: %+v %v", name, d, e)
		}
		if BehaviorCheckKey("editor/"+name, "editor/"+d.Name) != "editor/CodeEditor" {
			t.Fatalf("%s check binding differs", name)
		}
		var b bytes.Buffer
		if e = ui.RenderComponent(server.templates, &b, c); e != nil {
			t.Fatal(e)
		}
		return b.String()
	}
	canonical := render("CodeEditor")
	for _, name := range []string{"CodeEditor", "EditorGutter", "LineNumbers", "FoldingControl", "MiniMap", "Ruler", "IndentGuide", "BracketMatcher", "RainbowBrackets", "MultiCursor", "SelectionHighlight", "StickyScroll", "Breadcrumb", "InlayHints", "CodeLens", "InlineDecoration"} {
		t.Run(name, func(t *testing.T) {
			html := render(name)
			marker := `data-ely-component="editor/` + name + `"`
			if !strings.Contains(html, marker) {
				t.Fatal("lost actual public alias identity")
			}
			normalized := strings.ReplaceAll(html, marker, `data-ely-component="editor/CodeEditor"`)
			if name == "MiniMap" {
				if normalized == canonical || strings.Contains(html, "data-workspace-rich") {
					t.Fatal("MiniMap must remain distinct and excluded")
				}
				return
			}
			if normalized != canonical {
				t.Fatal("alias changes rendered controls, state, defaults or payload attributes")
			}
			for _, control := range []string{"data-workspace-rich", `data-ws-required="true"`, `data-ws-code-lens="references"`, `data-ws-editor-tool="toggle-minimap"`, `data-ws-editor-breadcrumb="src/worker.go"`} {
				if !strings.Contains(html, control) {
					t.Fatalf("missing %s", control)
				}
			}
		})
	}
}
