package ui

import (
	"strings"
	"testing"
)

func TestSubAgentTreeSelectionHasAccessibleVisibleCurrentState(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out strings.Builder
	if err := RenderComponent(tpl, &out, Component{
		Chapter: "agent",
		Name:    "SubAgentTree",
		ID:      "agent-tree-selection",
		Props: map[string]any{"Items": []map[string]any{{
			"Value": "lead", "Label": "Lead", "Children": []map[string]any{{"Value": "tests", "Label": "Tests"}},
		}}},
	}); err != nil {
		t.Fatal(err)
	}
	markup := out.String()
	for _, want := range []string{
		`data-ely-value="lead" aria-current="false"`,
		`data-ely-value="tests" aria-current="false"`,
	} {
		if !strings.Contains(markup, want) {
			t.Errorf("SubAgentTree markup missing %q: %s", want, markup)
		}
	}
	if strings.Contains(markup, "aria-selected=") {
		t.Fatal("SubAgentTree exposes aria-selected on buttons without a supporting widget role")
	}

	css, err := Files.ReadFile("assets/ely-api-communication.css")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(css), `.ely-agent-tree summary button[aria-current=true]{background:`) {
		t.Fatal("SubAgentTree has no visible selected-state treatment")
	}

	js, err := Files.ReadFile("assets/ely-api-communication.js")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		`const tree=element.closest('.ely-agent-tree')`,
		`tree.querySelectorAll('[data-ely-select][aria-current="true"]')`,
		`element.setAttribute('aria-current','true')`,
		`changed(root,'selection'`,
		`emit(root,'select',detail(root,element))`,
	} {
		if !strings.Contains(string(js), want) {
			t.Errorf("SubAgentTree selection behavior missing %q", want)
		}
	}
}
