package ui

import (
	"html/template"
	"strconv"
	"strings"
	"testing"
)

func TestBasicTabsNeutralButtonsPreserveSelectionAndPanelARIA(t *testing.T) {
	for _, value := range []string{"", "alpha", "beta"} {
		t.Run("value="+value, func(t *testing.T) {
			doc := renderElyControl(t, "tabs", map[string]any{
				"ID": "caller-tabs", "Label": "Caller tabs", "Value": value, "Disabled": true,
				"Items": []map[string]any{
					{"Value": "alpha", "Label": "<First>", "Content": "<first panel>"},
					{"Value": "beta", "Label": "Second", "Content": "<second panel>"},
				},
			})
			buttons, panels := formNodes(doc, "button"), formNodes(doc, "section")
			if len(buttons) != 2 || len(panels) != 2 {
				t.Fatalf("buttons/panels = %d/%d, want 2/2", len(buttons), len(panels))
			}
			for i, button := range buttons {
				selected := i == 0 && value != "beta" || i == 1 && value == "beta"
				tabID, panelID := "caller-tabs-tab-"+strconv.Itoa(i), "caller-tabs-panel-"+strconv.Itoa(i)
				requireFormAttr(t, button, "id", tabID)
				requireFormAttr(t, button, "role", "tab")
				requireFormAttr(t, button, "data-variant", "ghost")
				requireFormAttr(t, button, "aria-selected", strconv.FormatBool(selected))
				requireFormAttr(t, button, "aria-controls", panelID)
				if _, ok := formAttr(button, "disabled"); !ok {
					t.Fatal("caller disabled state lost")
				}
				requireFormAttr(t, panels[i], "id", panelID)
				requireFormAttr(t, panels[i], "role", "tabpanel")
				requireFormAttr(t, panels[i], "aria-labelledby", tabID)
				if _, hidden := formAttr(panels[i], "hidden"); hidden == selected {
					t.Fatalf("panel %d hidden state does not match selection", i)
				}
			}
			if formText(buttons[0]) != "<First>" || formText(panels[0]) != "<first panel>" || len(formNodes(doc, "first")) != 0 {
				t.Fatal("caller tab label/panel strings must remain escaped")
			}
		})
	}
	button := formNodes(renderElyControl(t, "button", map[string]any{"Label": "Ordinary button"}), "button")[0]
	requireFormAttr(t, button, "data-variant", "default")
}

func TestBasicAlertSeparatesOptionalTitlePreservingContentAndRole(t *testing.T) {
	for _, urgent := range []bool{false, true} {
		for _, title := range []string{"", "Caller <title>"} {
			doc := renderElyControl(t, "alert", map[string]any{
				"Title": title, "Content": "Caller <content>", "Urgent": urgent,
			})
			aside := formNodes(doc, "aside")[0]
			role := "status"
			if urgent {
				role = "alert"
			}
			requireFormAttr(t, aside, "role", role)
			want := "Caller <content>"
			if title != "" {
				want = title + " " + want
			}
			if got := formText(aside); got != want {
				t.Fatalf("alert text = %q, want %q", got, want)
			}
			if len(formNodes(doc, "title")) != 0 || len(formNodes(doc, "content")) != 0 {
				t.Fatal("caller strings must remain escaped")
			}
		}
	}
	doc := renderElyControl(t, "alert", map[string]any{"Title": "Notice", "Content": template.HTML("<em>Trusted</em>")})
	if len(formNodes(doc, "em")) != 1 || !strings.Contains(formText(doc), "Notice Trusted") {
		t.Fatal("trusted caller markup and title separation must be preserved")
	}
}
