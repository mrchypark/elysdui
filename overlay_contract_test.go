package ui

import (
	"bytes"
	"strings"
	"testing"
)

// Browser behavior is covered separately by scripts/overlay-contracts-browser-test.mjs.
func TestGenericDialogAccessibleDismissalContract(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, dismissible := range []bool{true, false} {
		var out bytes.Buffer
		err = RenderComponent(tpl, &out, Component{Chapter: "overlays", Name: "Dialog", ID: "contract-dialog", Props: map[string]any{"Label": "Open", "Title": "Edit <account>", "Content": "Private & detail", "Name": "account", "Dismissible": dismissible}})
		if err != nil {
			t.Fatal(err)
		}
		html := out.String()
		for _, want := range []string{`aria-labelledby="contract-dialog-dialog-title"`, `id="contract-dialog-dialog-title">Edit &lt;account&gt;`, `aria-describedby="contract-dialog-dialog-detail"`, `id="contract-dialog-dialog-detail">Private &amp; detail`} {
			if !strings.Contains(html, want) {
				t.Errorf("missing %s in %s", want, html)
			}
		}
		if got := strings.Contains(html, "data-interaction-close"); got != dismissible {
			t.Errorf("close control = %v; Dismissible = %v", got, dismissible)
		}
		want := `data-interaction-dismissible="false"`
		if dismissible {
			want = `data-interaction-dismissible="true"`
		}
		if !strings.Contains(html, want) {
			t.Errorf("missing %s", want)
		}
	}
}
