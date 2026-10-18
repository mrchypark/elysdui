package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestInteractionMenuCallerContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	rows := []map[string]any{
		{"Label": "Recent", "Items": []map[string]any{{"Label": "Caller <file>", "Value": "file", "Action": "open-file"}}},
		{"Separator": true}, {"Heading": "Preferences"},
		{"Label": "Sidebar", "Checkbox": true, "Selected": true},
		{"Label": "Compact", "Radio": true, "Group": "density", "Selected": true},
		{"Label": "Unavailable", "Disabled": true},
	}
	for _, tc := range []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"Menu", map[string]any{"Items": rows}, []string{`id="menu-parity-sub-0"`, `data-ely-action="open-file"`, `Caller &lt;file&gt;`, `role="separator"`, `Preferences`, `role="menuitemcheckbox"`, `data-interaction-menu-radio="density"`, ` disabled`}},
		{"CheckboxMenuItem", map[string]any{"Items": rows}, []string{`data-interaction-menu="menu-parity-checks"`, `aria-checked="true"`, `role="menuitemradio"`}},
		{"DropdownMenu", map[string]any{"Host": "dropdown", "Label": "Share", "Items": rows}, []string{`aria-label="Share"`, `aria-haspopup="menu"`, `data-ely-action="open-file"`}},
		{"DropdownMenu", map[string]any{"Host": "split", "Action": "caller-merge", "Value": "branch", "Items": rows}, []string{`data-ely-action="caller-merge" value="branch"`}},
		{"ContextMenu", map[string]any{"Content": "Caller context", "Items": rows}, []string{`data-interaction-context`, `Caller context`, `data-ely-action="open-file"`}},
		{"MenuBar Menu", map[string]any{"Items": []map[string]any{{"Label": "App", "Items": rows}}}, []string{`id="menu-parity-menu-0-sub-0"`, `data-ely-action="open-file"`}},
		{"MegaMenu", map[string]any{"Items": []map[string]any{{"Label": "Docs", "Items": []map[string]any{{"Label": "Guide", "Action": "read", "Content": "Caller description"}}}}}, []string{`ely-interaction__navigation-menu`, `data-ely-action="read"`, `Caller description`}},
		{"SearchableMenu", map[string]any{"Placeholder": "Find caller row", "Items": rows}, []string{`data-interaction-search-menu hidden`, `aria-label="Find caller row"`, `data-interaction-menu-label`}},
		{"PieMenu", map[string]any{"Items": []map[string]any{{"Label": "Copy", "Icon": "copy", "Action": "caller-copy", "Value": "document"}}}, []string{`class="ely-interaction__pie" role="menu" hidden`, `data-ely-action="caller-copy"`, `value="document"`, `data-interaction-pie-close`}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var body bytes.Buffer
			if err := RenderComponent(tpl, &body, Component{Chapter: "menus", Name: tc.name, ID: "menu-parity", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(body.String(), want) {
					t.Errorf("missing %s in %s", want, body.String())
				}
			}
		})
	}
}
