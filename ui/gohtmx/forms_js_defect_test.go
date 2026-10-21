package ui

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

// renderDefectComponent renders a shared component and returns the parsed
// document so a defect test can assert the markup contract callers observe.
func renderDefectComponent(t *testing.T, chapter, name string, props map[string]any) *html.Node {
	t.Helper()
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := RenderComponent(tpl, &out, Component{Chapter: chapter, Name: name, ID: "defect-" + strings.ToLower(name), Props: props}); err != nil {
		t.Fatalf("render %s/%s: %v", chapter, name, err)
	}
	doc, err := html.Parse(strings.NewReader(out.String()))
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

// defectNodesByAttr returns the elements with the given tag that carry the
// given attribute, in document order.
func defectNodesByAttr(doc *html.Node, tag, key string) []*html.Node {
	var nodes []*html.Node
	var walk func(*html.Node)
	walk = func(current *html.Node) {
		if current.Type == html.ElementNode && current.Data == tag {
			if _, ok := formAttr(current, key); ok {
				nodes = append(nodes, current)
			}
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)
	return nodes
}

// defectFormsScript returns the shared forms browser runtime source.
func defectFormsScript(t *testing.T) string {
	t.Helper()
	data, err := Files.ReadFile("assets/ely-api-forms.js")
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

// defectSourceSlice returns the source starting at the given marker and
// ending at the next marker, so a static assertion can target one code path.
func defectSourceSlice(t *testing.T, source, start, end string) string {
	t.Helper()
	from := strings.Index(source, start)
	if from < 0 {
		t.Fatalf("source lacks %q", start)
	}
	to := len(source)
	if end != "" {
		if index := strings.Index(source[from:], end); index >= 0 {
			to = from + index
		}
	}
	return source[from:to]
}

// TestMentionInputRendersListboxContract covers defect 1: the mention
// combobox must expose a listbox, stable option ids, and aria-controls so the
// runtime can publish aria-activedescendant against real elements.
func TestMentionInputRendersListboxContract(t *testing.T) {
	doc := renderDefectComponent(t, "forms", "MentionInput", map[string]any{
		"Label":   "Note",
		"Options": []map[string]any{{"Value": "ada", "Label": "Ada"}, {"Value": "alan", "Label": "Alan"}},
	})

	textareas := defectNodesByAttr(doc, "textarea", "data-ely-mention")
	if len(textareas) != 1 {
		t.Fatalf("mention textarea count = %d, want 1", len(textareas))
	}
	requireFormAttr(t, textareas[0], "aria-controls", "defect-mentioninput-mention-list")

	lists := defectNodesByAttr(doc, "div", "data-ely-mention-list")
	if len(lists) != 1 {
		t.Fatalf("mention list count = %d, want 1", len(lists))
	}
	requireFormAttr(t, lists[0], "id", "defect-mentioninput-mention-list")
	requireFormAttr(t, lists[0], "role", "listbox")

	options := defectNodesByAttr(doc, "button", "data-ely-mention-value")
	if len(options) != 2 {
		t.Fatalf("mention option count = %d, want 2", len(options))
	}
	for index, option := range options {
		requireFormAttr(t, option, "id", fmt.Sprintf("defect-mentioninput-mention-option-%d", index))
		requireFormAttr(t, option, "role", "option")
		if _, ok := formAttr(option, "aria-selected"); ok {
			t.Errorf("option %d must not pre-declare aria-selected before the runtime activates it", index)
		}
	}
	requireFormAttr(t, options[0], "value", "ada")
}

// TestFormsRuntimeTracksActiveMentionOption covers defect 1: the runtime must
// keep an active option index, cycle it with wrapping, reset it when the
// filtered list changes, and activate the selected option with Enter instead
// of always clicking the first option.
func TestFormsRuntimeTracksActiveMentionOption(t *testing.T) {
	source := defectFormsScript(t)

	for _, want := range []string{
		"let mentionActiveIndex=-1;",
		"const mentionOptions=",
		"const mentionActiveOption=",
		"const setMentionActive=",
		"aria-activedescendant",
		"aria-selected",
	} {
		if !strings.Contains(source, want) {
			t.Errorf("forms runtime lacks %q", want)
		}
	}
	if strings.Contains(source, "options[0].click()") {
		t.Error("forms runtime must not always click the first mention option")
	}

	key := defectSourceSlice(t, source, "if(event.target.matches('[data-ely-mention]'))", "if(event.target.matches('[data-ely-color-plane]')")
	for _, want := range []string{
		"mentionActiveIndex",
		"mentionActiveOption()",
		"active.click()",
		"setMentionActive(next)",
		"+options.length)%options.length",
		"'ArrowDown'",
		"'ArrowUp'",
	} {
		if !strings.Contains(key, want) {
			t.Errorf("mention key handler lacks %q", want)
		}
	}

	input := defectSourceSlice(t, source, "if(field.matches('[data-ely-mention]'))", "if(field.matches('[data-ui-calendar-input]'))")
	if !strings.Contains(input, "setMentionActive(0)") {
		t.Error("mention filter change must reset the active option index")
	}
}

// TestWizardRuntimeDisablesEveryButtonWithoutSteps covers defect 2: both
// wizard implementations must disable Skip, Previous, Next, and Finish when
// the wizard renders zero steps, and must not throw on the missing step.
func TestWizardRuntimeDisablesEveryButtonWithoutSteps(t *testing.T) {
	source := defectFormsScript(t)

	sections := []struct {
		name  string
		start string
		end   string
	}{
		{name: "account wizard", start: "const showStep=index=>", end: "const snapshot=()=>"},
		{name: "forms wizard", start: "const showStep = index =>", end: "const stepValid ="},
	}
	for _, section := range sections {
		t.Run(section.name, func(t *testing.T) {
			body := defectSourceSlice(t, source, section.start, section.end)
			if !strings.Contains(body, "if(!steps.length){") {
				t.Fatal("wizard must handle the zero step case")
			}
			for _, want := range []string{
				"skip.disabled=true",
				"previous.disabled=true",
				"next.disabled=true",
				"finish.disabled=true",
				"next.hidden=false",
				"finish.hidden=false",
			} {
				if !strings.Contains(body, want) {
					t.Errorf("zero step branch lacks %q", want)
				}
			}
		})
	}

	if !strings.Contains(source, "steps.length>0&&") {
		t.Error("wizard step validation must guard the missing step")
	}
}

// TestOnboardingWizardWithoutStepsRendersEveryButton covers the markup half
// of defect 2: a wizard rendered with zero steps still exposes the four
// navigation buttons so the runtime can disable them.
func TestOnboardingWizardWithoutStepsRendersEveryButton(t *testing.T) {
	doc := renderDefectComponent(t, "onboarding", "OnboardingWizard", map[string]any{
		"Label":      "Welcome",
		"SkipAction": "skip-onboarding",
		"Empty":      "No steps",
	})
	for _, key := range []string{"data-ely-wizard-skip", "data-ely-wizard-previous", "data-ely-wizard-next", "data-ely-wizard-finish"} {
		if len(defectNodesByAttr(doc, "button", key)) != 1 {
			t.Errorf("wizard button %s count = %d, want 1", key, len(defectNodesByAttr(doc, "button", key)))
		}
	}
	if len(defectNodesByAttr(doc, "fieldset", "data-ely-step")) != 0 {
		t.Error("wizard rendered a step fieldset while configured with zero steps")
	}
}

// TestDurationPickerFallsBackToOptions covers defect 3: the unit select is
// documented to come from UnitsOptions, falling back to Options.
func TestDurationPickerFallsBackToOptions(t *testing.T) {
	doc := renderDefectComponent(t, "forms", "DurationPicker", map[string]any{
		"Name":  "delay",
		"Label": "Delay",
		"Value": "30",
		"Unit":  "minutes",
		"Options": []map[string]any{
			{"Value": "minutes", "Label": "Minutes"},
			{"Value": "hours", "Label": "Hours"},
		},
	})
	selects := defectNodesByAttr(doc, "select", "name")
	var unit *html.Node
	for _, candidate := range selects {
		if name, _ := formAttr(candidate, "name"); name == "delay_unit" {
			unit = candidate
		}
	}
	if unit == nil {
		t.Fatalf("duration unit select is missing when UnitsOptions is empty")
	}
	values := map[string]string{}
	for _, option := range formNodes(unit, "option") {
		value, _ := formAttr(option, "value")
		values[value] = formText(option)
	}
	if values["minutes"] != "Minutes" || values["hours"] != "Hours" {
		t.Errorf("duration unit options = %v, want Minutes and Hours", values)
	}

	preferred := renderDefectComponent(t, "forms", "DurationPicker", map[string]any{
		"Name":         "delay",
		"Label":        "Delay",
		"Value":        "2",
		"Unit":         "days",
		"UnitsOptions": []map[string]any{{"Value": "days", "Label": "Days"}},
		"Options": []map[string]any{
			{"Value": "minutes", "Label": "Minutes"},
			{"Value": "hours", "Label": "Hours"},
		},
	})
	for _, candidate := range defectNodesByAttr(preferred, "select", "name") {
		if name, _ := formAttr(candidate, "name"); name != "delay_unit" {
			continue
		}
		for _, option := range formNodes(candidate, "option") {
			if value, _ := formAttr(option, "value"); value == "minutes" {
				t.Error("UnitsOptions must win over Options when both are supplied")
			}
		}
	}
}
