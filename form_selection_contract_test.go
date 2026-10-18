package ui

import (
	"golang.org/x/net/html"
	"strings"
	"testing"
)

func TestFormSelectionRegisteredContracts(t *testing.T) {
	for _, name := range []string{"Select", "NativeSelect", "Combobox", "Autocomplete"} {
		t.Run(name, func(t *testing.T) {
			d, err := ResolveComponent("forms", name)
			if err != nil {
				t.Fatal(err)
			}
			want := "Select"
			if name == "Combobox" || name == "Autocomplete" {
				want = "Combobox"
			}
			if d.Name != want {
				t.Fatalf("resolved %s as %s", name, d.Name)
			}
			markup := renderAdvancedForm(t, "forms", name, map[string]any{"Name": "choice", "Value": "b<", "Label": "Caller label", "Readonly": true, "Disabled": true, "Options": []Option{{Value: "a", Label: "Alpha", Disabled: true}, {Value: "b<", Label: "Beta <caller>"}}})
			doc, err := html.Parse(strings.NewReader(markup))
			if err != nil {
				t.Fatal(err)
			}
			if want == "Select" {
				selects := formNodes(doc, "select")
				if len(selects) != 1 {
					t.Fatal("missing native select")
				}
				requireFormAttr(t, selects[0], "name", "choice")
				requireFormAttr(t, selects[0], "disabled", "")
			} else {
				if strings.Contains(markup, "data-ui-combobox-free") != (name == "Autocomplete") {
					t.Fatal("incorrect free mode")
				}
				for _, input := range formNodes(doc, "input") {
					requireFormAttr(t, input, "value", "b<")
					requireFormAttr(t, input, "disabled", "")
					if role, _ := formAttr(input, "role"); role == "combobox" {
						requireFormAttr(t, input, "readonly", "")
						requireFormAttr(t, input, "aria-controls", "advanced-"+strings.ToLower(name)+"-control-listbox")
					}
				}
			}
			if !strings.Contains(markup, "Beta &lt;caller&gt;") {
				t.Fatal("lost escaped caller label")
			}
		})
	}
}
