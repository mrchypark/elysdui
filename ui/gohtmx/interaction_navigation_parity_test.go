package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestInteractionNavigationCallerContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"NavigationMenu", map[string]any{"Items": []map[string]any{{"Label": "Docs", "Items": []map[string]any{{"Label": "Caller <guide>", "Value": "guide", "Action": "read-guide"}}}}}, []string{`aria-haspopup="menu"`, `data-ely-action="read-guide"`, `Caller &lt;guide&gt;`}},
		{"BackForwardNavigation", map[string]any{"Items": []map[string]any{{"Label": "First", "Value": "first"}, {"Label": "Second", "Value": "second", "Selected": true}}}, []string{`data-interaction-history-index="1"`, `aria-current="page"`, `value="1"`}},
		{"Anchor", map[string]any{"Items": []map[string]any{{"Label": "Intro", "Value": "intro", "Content": "Caller body"}}}, []string{`href="#parity-anchor-intro"`, `id="parity-anchor-intro"`, `data-interaction-anchor="intro"`, `Caller body`}},
		{"JumpTo", map[string]any{"Name": "position", "Value": "24:8", "Max": 80}, []string{`name="position"`, `value="24:8"`, `data-interaction-jump-max="80"`}},
		{"CommandPalette", map[string]any{"Label": "Run task", "Items": []map[string]any{{"Label": "Build", "Value": "build", "Group": "Tasks", "Shortcut": "Ctrl+B"}}}, []string{`aria-label="Run task"`, `Tasks`, `Ctrl&#43;B`, `data-interaction-palette-empty`}},
		{"QuickOpen", map[string]any{"Items": []map[string]any{{"Label": "main.go", "Value": "src/main.go", "Recent": true}}}, []string{`value="src/main.go"`, `data-interaction-palette-recent`, `data-interaction-palette-empty`}},
		{"QuickSwitcher", map[string]any{"Items": []map[string]any{{"Label": "Project", "Value": "project", "Content": "Workspace"}}}, []string{`data-ely-action="switch"`, `Workspace`, `data-interaction-palette-empty`}},
		{"SearchPalette", map[string]any{"Items": []map[string]any{{"Label": "Guide", "Value": "guide", "Group": "Docs"}}}, []string{`data-ely-action="open"`, `Docs`, `data-interaction-palette-empty`}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var body bytes.Buffer
			if err := RenderComponent(tpl, &body, Component{Chapter: "navigation", Name: tc.name, ID: "parity", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(body.String(), want) {
					t.Fatalf("missing %s in %s", want, body.String())
				}
			}
		})
	}
}

func TestInteractionBulkZeroOverridesLegacyValue(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	err = RenderComponent(tpl, &body, Component{Chapter: "buttons", Name: "BulkActionBar", ID: "bulk-zero", Props: map[string]any{"SelectedCount": 0, "Value": "15"}})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`data-interaction-bulk-count="0"`, `<output data-interaction-bulk-count>0</output>`, `class="ely-interaction__bar is-bulk" hidden`} {
		if !strings.Contains(body.String(), want) {
			t.Errorf("missing %s in %s", want, body.String())
		}
	}
}
