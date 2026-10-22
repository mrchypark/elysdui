package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestBasicDialogMarginCoversRootAndNestedWithoutCallerClass(t *testing.T) {
	css, err := Files.ReadFile("assets/ely-controls.css")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(css), `dialog[data-ui-component="dialog"], [data-ui-component] dialog { margin: auto; }`) {
		t.Fatal("root native dialog must recover auto margins while retaining nested dialog support")
	}
	if strings.Contains(string(css), "dialog[data-ui-component],") {
		t.Fatal("unrelated marked root dialogs must not gain auto margins")
	}
	if !strings.Contains(string(css), "dialog[data-ui-component]:not([open]) { display: none; }") {
		t.Fatal("closed dialog visibility changed")
	}
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tpl.Parse(`{{define "caller-nested-dialog"}}<section data-ui-component="caller-shell">{{template "dialog" .}}<input name="unrelated" value="caller"></section>{{end}}{{define "caller-other-dialog"}}<dialog data-ui-component="sheet" style="margin:7px">Caller sheet</dialog>{{end}}`); err != nil {
		t.Fatal(err)
	}
	var unrelated bytes.Buffer
	if err := tpl.ExecuteTemplate(&unrelated, "caller-other-dialog", nil); err != nil {
		t.Fatal(err)
	}
	if unrelated.String() != `<dialog data-ui-component="sheet" style="margin:7px">Caller sheet</dialog>` {
		t.Fatal("unrelated caller dialog markup or custom inline margin changed")
	}
	for _, nested := range []bool{false, true} {
		for _, open := range []bool{false, true} {
			attrs := map[string]any{}
			if open {
				attrs["open"] = ""
			}
			props := map[string]any{"ID": "caller-dialog", "Label": "Caller <label>", "Content": "Caller <content>", "Attrs": attrs}
			name := "dialog"
			if nested {
				name = "caller-nested-dialog"
			}
			var out bytes.Buffer
			if err := tpl.ExecuteTemplate(&out, name, props); err != nil {
				t.Fatal(err)
			}
			got := out.String()
			for _, want := range []string{`<dialog id="caller-dialog" data-ui-component="dialog"`, `aria-label="Caller &lt;label&gt;"`, "Caller &lt;content&gt;", `<form method="dialog">`, ">Close</button>"} {
				if !strings.Contains(got, want) {
					t.Errorf("dialog contract lost: %s", want)
				}
			}
			if strings.Contains(got, "class=") {
				// The Close button has its own classes; the dialog must not require one.
				dialogTag := strings.SplitN(strings.SplitN(got, "<dialog", 2)[1], ">", 2)[0]
				if strings.Contains(dialogTag, "class=") {
					t.Fatal("dialog unexpectedly requires a caller class")
				}
			}
			if strings.Contains(got, ` open=""`) != open {
				t.Fatal("caller initial-open attribute changed")
			}
			if nested && !strings.Contains(got, `<input name="unrelated" value="caller">`) {
				t.Fatal("unrelated caller control changed")
			}
		}
	}
}
