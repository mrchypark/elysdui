package uiexamples

import (
	"bytes"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"strings"
	"testing"
)

func TestInteractionFeedbackSourceFixtures(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{"Toast": 6, "Notification": 5, "Alert": 4, "Callout": 4, "InlineMessage": 4, "EmptyState": 3, "ErrorView": 4, "Result": 2, "ConfirmationCard": 2, "SavingIndicator": 3}
	total := 0
	for _, f := range advancedInteractionCases() {
		c := f.Component
		if c.Chapter != "feedback" || c.Name == "Countdown" {
			continue
		}
		total++
		if c.Props["Disabled"] != false {
			t.Errorf("%s disabled", c.Name)
		}
		if want, ok := counts[c.Name]; ok {
			if got := len(c.Props["Items"].([]map[string]any)); got != want {
				t.Errorf("%s: %d rows, want %d", c.Name, got, want)
			}
		}
		var body bytes.Buffer
		if err := ui.RenderComponent(tpl, &body, c); err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		expected := map[string]string{"Notification": "Léa Martin joined", "Callout": "Irreversible", "EmptyState": "Write a message", "ErrorView": "Down for maintenance", "ErrorBoundary": "Revenue, third quarter: 1.2 M", "Result": "View receipt", "ConfirmationCard": "Deleted 3 branches", "SavingIndicator": "Syncing 12 items"}
		if want := expected[c.Name]; want != "" && !strings.Contains(body.String(), want) {
			t.Errorf("%s missing %q", c.Name, want)
		}
	}
	if total != 12 {
		t.Fatalf("%d feedback fixtures, want 12", total)
	}
}
