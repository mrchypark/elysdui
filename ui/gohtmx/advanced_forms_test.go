package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func renderAdvancedForm(t *testing.T, chapter, name string, props map[string]any) string {
	t.Helper()
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := RenderComponent(tpl, &out, Component{Chapter: chapter, Name: name, ID: "advanced-" + strings.ToLower(name), Props: props}); err != nil {
		t.Fatal(err)
	}
	return out.String()
}

func TestFormPartsComposeWithoutNestedForms(t *testing.T) {
	for _, name := range []string{"FormSection", "FormField", "FieldArray", "DirtyIndicator"} {
		t.Run(name, func(t *testing.T) {
			markup := renderAdvancedForm(t, "forms", name, map[string]any{
				"Label": "Caller field", "Name": "links", "Value": "caller", "Dirty": true,
				"Values": []string{"https://example.test", "<caller>"}, "Disabled": true,
				"Fields": []map[string]any{{"Name": "title", "Label": "Title", "Value": "Caller title"}},
			})
			if strings.Contains(markup, "<form") {
				t.Fatal("form part created a nested form")
			}
			if name == "FieldArray" && (!strings.Contains(markup, `name="links"`) || !strings.Contains(markup, `&lt;caller&gt;`) || !strings.Contains(markup, "disabled")) {
				t.Fatal("field array lost caller values, name, escaping, or disabled state")
			}
			if name == "DirtyIndicator" && !strings.Contains(markup, "Unsaved changes") {
				t.Fatal("dirty indicator lost its explicit state")
			}
		})
	}
}

func TestAdvancedColorPickerPreservesZeroAlpha(t *testing.T) {
	markup := renderAdvancedForm(t, "forms", "ColorPicker", map[string]any{"Name": "accent", "Value": "#3772bb", "Alpha": 0, "Disabled": true})
	doc, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, input := range formNodes(doc, "input") {
		if name, _ := formAttr(input, "name"); name == "accent_alpha" {
			found = true
			requireFormAttr(t, input, "value", "0")
			requireFormAttr(t, input, "disabled", "")
		}
	}
	if !found {
		t.Fatal("alpha submission field is missing")
	}
}

func TestAdvancedFormAliasesUseNativeControls(t *testing.T) {
	cases := []struct {
		chapter string
		name    string
		props   map[string]any
		want    string
	}{
		{"forms", "DateTimePicker", map[string]any{"Label": "When"}, `type="datetime-local"`},
		{"forms", "TimePicker", map[string]any{"Label": "When"}, `type="time"`},
		{"forms", "WeekPicker", map[string]any{"Label": "Week"}, `type="week"`},
		{"forms", "YearPicker", map[string]any{"Label": "Year"}, `type="number"`},
		{"forms", "QuarterPicker", map[string]any{"Name": "period", "Value": "Q4", "Year": "2026"}, `value="Q4" selected`},
		{"forms", "RadioCard", map[string]any{"Name": "plan", "Options": []map[string]any{{"Value": "pro", "Label": "Pro"}}}, `type="radio"`},
		{"forms", "TimezoneSelect", map[string]any{"Label": "Zone", "Options": []map[string]any{{"Value": "UTC", "Label": "UTC"}}}, `<select`},
		{"forms", "DurationPicker", map[string]any{"Name": "delay", "Label": "Delay", "UnitsOptions": []map[string]any{{"Value": "minutes", "Label": "Minutes"}}}, `name="delay_unit"`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := renderAdvancedForm(t, tc.chapter, tc.name, tc.props); !strings.Contains(got, tc.want) {
				t.Fatalf("missing %s in %s", tc.want, got)
			}
		})
	}
}

func TestAdvancedFormsKeepEmptyAndDisabledState(t *testing.T) {
	empty := renderAdvancedForm(t, "onboarding", "OnboardingWizard", map[string]any{"Label": "Start", "Empty": "No steps"})
	for _, want := range []string{"No steps", `data-ely-wizard-next`, `data-ely-wizard-finish`} {
		if !strings.Contains(empty, want) {
			t.Fatalf("empty wizard missing %q: %s", want, empty)
		}
	}
	disabled := renderAdvancedForm(t, "onboarding", "OnboardingWizard", map[string]any{"Disabled": true, "Items": []map[string]any{{"Label": "One", "Fields": []map[string]any{{"Name": "name", "Label": "Name"}}}}})
	if strings.Count(disabled, "disabled") < 2 {
		t.Fatalf("disabled wizard did not disable fields and controls: %s", disabled)
	}
	open := renderAdvancedForm(t, "onboarding", "WhatsNewDialog", map[string]any{"Open": true})
	if !strings.Contains(open, `data-ely-whats-new-initial="true"`) {
		t.Fatalf("open dialog did not request initial activation: %s", open)
	}
	disabledDialog := renderAdvancedForm(t, "onboarding", "WhatsNewDialog", map[string]any{"Open": true, "Disabled": true})
	if strings.Contains(disabledDialog, `data-ely-whats-new-initial="true"`) || !strings.Contains(disabledDialog, "disabled") {
		t.Fatalf("disabled dialog can activate: %s", disabledDialog)
	}
}

func TestAdvancedFormsUseDedicatedSemanticVariants(t *testing.T) {
	cases := []struct {
		chapter string
		name    string
		props   map[string]any
		wants   []string
	}{
		{"forms", "RangeSlider", map[string]any{"Name": "range", "Label": "Start", "End": "8"}, []string{`data-ely-range-end`, `name="range_end"`}},
		{"settings", "ImportExportSettings", map[string]any{"Label": "Settings", "Value": `{"theme":"dark"}`}, []string{`data-ely-settings-json`, `data-ely-export-settings`, `data-ely-import-settings`}},
		{"account", "ApiKeyManager", map[string]any{"Items": []map[string]any{{"Value": "key_1", "Label": "Deploy", "Text": "Last used today"}}}, []string{"Deploy", `data-ely-action="revoke-api-key"`, `data-ely-submit="create-api-key"`}},
		{"account", "InvitationList", map[string]any{"Items": []map[string]any{{"Value": "invite_1", "Email": "a@example.test"}}}, []string{"a@example.test", `data-ely-action="resend-invitation"`, `data-ely-action="revoke-invitation"`}},
		{"account", "PaymentMethodForm", map[string]any{"Label": "Card"}, []string{`data-ely-submit="update-payment-method"`, "Card"}},
		{"account", "Paywall", map[string]any{"Label": "Upgrade", "ActionLabel": "Choose plan"}, []string{"Upgrade", `data-ely-action="upgrade"`}},
		{"onboarding", "WhatsNewDialog", map[string]any{"Title": "What is new", "Disabled": true}, []string{"<dialog", `data-ely-whats-new-open`, `data-ely-whats-new-close`, `disabled`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := renderAdvancedForm(t, tc.chapter, tc.name, tc.props)
			for _, want := range tc.wants {
				if !strings.Contains(got, want) {
					t.Fatalf("missing %q in %s", want, got)
				}
			}
		})
	}
}

func TestAdvancedDurationPartsKeepBoundsAndNames(t *testing.T) {
	markup := renderAdvancedForm(t, "forms", "DurationPicker", map[string]any{"Name": "delay", "Disabled": true, "DurationParts": []map[string]any{{"Name": "minutes", "Label": "m", "Value": 0, "Max": 59}}})
	doc, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		t.Fatal(err)
	}
	for _, input := range formNodes(doc, "input") {
		if name, _ := formAttr(input, "name"); name == "delay_minutes" {
			requireFormAttr(t, input, "type", "number")
			requireFormAttr(t, input, "min", "0")
			requireFormAttr(t, input, "max", "59")
			requireFormAttr(t, input, "value", "0")
			requireFormAttr(t, input, "disabled", "")
			return
		}
	}
	t.Fatal("duration part submission field is missing")
}
