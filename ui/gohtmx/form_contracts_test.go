package ui

import "testing"

func TestBasicFormUnavailableAndMixedContracts(t *testing.T) {
	for _, name := range []string{"checkbox", "switch"} {
		doc := renderSharedForm(t, name, "ID", "choice", "Readonly", true)
		input := formNodes(doc, "input")[0]
		requireFormAttr(t, input, "aria-readonly", "true")
		requireFormAttr(t, input, "data-ui-readonly", "true")
		if _, disabled := formAttr(input, "disabled"); disabled {
			t.Fatal("readonly must remain submitted and focusable")
		}
	}
	expanded := false
	doc := renderSharedForm(t, "button", "ID", "link", "Href", "/next", "Label", "Next", "Disabled", true, "AriaExpanded", &expanded, "AriaControls", "panel", "AriaDescribedby", "help")
	link := formNodes(doc, "a")[0]
	for key, want := range map[string]string{"id": "link", "aria-disabled": "true", "role": "link", "tabindex": "-1", "aria-expanded": "false", "aria-controls": "panel", "aria-describedby": "help"} {
		requireFormAttr(t, link, key, want)
	}
	if _, ok := formAttr(link, "href"); ok {
		t.Fatal("disabled link must not retain native navigation")
	}
	active := formNodes(renderSharedForm(t, "button", "Href", "/next", "Label", "Next", "AriaDisabled", true), "a")[0]
	if _, ok := formAttr(active, "href"); ok {
		t.Fatal("aria-disabled link must not expose native/context-menu navigation")
	}
	requireFormAttr(t, active, "role", "link")
	requireFormAttr(t, active, "tabindex", "0")
	requireFormAttr(t, active, "aria-disabled", "true")
	mixed := formNodes(renderSharedForm(t, "checkbox", "Indeterminate", true), "input")[0]
	requireFormAttr(t, mixed, "data-initial-indeterminate", "true")
}
