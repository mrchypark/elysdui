package uiexamples

import (
	"bytes"
	"strings"
	"testing"
	"time"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestCommunicationVisualFixtureInputs(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, fixture := range advancedCommunicationCases() {
		component := fixture.Component
		switch component.Chapter + "/" + component.Name {
		case "chat/ImageMessage":
			seen[component.Name] = true
			component.Name = "ImageGrid"
			var output bytes.Buffer
			if err := ui.RenderComponent(server.templates, &output, component); err != nil {
				t.Fatal(err)
			}
			for _, source := range []string{"/assets/sample.svg", "/assets/sample-before.svg"} {
				if !strings.Contains(output.String(), `src="`+source+`"`) {
					t.Errorf("ImageGrid fixture missing caller image %s", source)
				}
			}
			if strings.Contains(output.String(), `src=""`) {
				t.Error("ImageGrid fixture emits a blank image source")
			}
		case "mail/SnoozePicker", "mail/ScheduleSend":
			seen[component.Name] = true
			if component.Props["Value"] != "review" {
				t.Errorf("%s lost its caller message identity", component.Name)
			}
			for _, key := range []string{"Until", "SendAt"} {
				value, _ := component.Props[key].(string)
				if _, err := time.Parse("2006-01-02T15:04", value); err != nil {
					t.Errorf("%s %s must seed a civil date/time, got %q: %v", component.Name, key, value, err)
				}
			}
			var output bytes.Buffer
			if err := ui.RenderComponent(server.templates, &output, component); err != nil {
				t.Fatal(err)
			}
			field, key := "until", "Until"
			if component.Name == "ScheduleSend" {
				field, key = "send_at", "SendAt"
			}
			if !strings.Contains(output.String(), `name="`+field+`" value="`+component.Props[key].(string)+`"`) {
				t.Errorf("%s did not render its civil date/time seed", component.Name)
			}
			if !strings.Contains(output.String(), `name="value" value="review"`) {
				t.Errorf("%s did not render the caller message identity", component.Name)
			}
		}
	}
	for _, name := range []string{"ImageMessage", "SnoozePicker", "ScheduleSend"} {
		if !seen[name] {
			t.Errorf("missing fixture %s", name)
		}
	}
}
