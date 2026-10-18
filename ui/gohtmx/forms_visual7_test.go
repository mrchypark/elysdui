package ui

import (
	"strings"
	"testing"
)

func TestFormsVisual7CallerContracts(t *testing.T) {
	cases := []struct {
		name  string
		props map[string]any
		wants []string
	}{
		{"CurrencyInput", map[string]any{"Value": "42.25", "Prefix": "€", "Suffix": "EUR", "Name": "amount", "Step": "0.01"}, []string{"€", "EUR", `name="amount"`, `value="42.25"`, `step="0.01"`}},
		{"UnitInput", map[string]any{"Units": []string{"mm", "cm"}, "Suffix": "mm"}, []string{`data-ely-unit="mm"`, `data-ely-unit-option="cm"`}},
		{"UrlInput", map[string]any{"Label": "Caller site", "Value": "https://example.test"}, []string{`type="url"`, `aria-label="Caller site"`, `value="https://example.test"`}},
		{"PhoneInput", map[string]any{"Country": "GB", "CountryName": "region", "Mask": "9999 999999", "Countries": []map[string]any{{"Value": "GB", "Label": "+44", "Mask": "9999 999999"}}}, []string{`name="region"`, `value="GB" data-mask="9999 999999" selected`, `data-ely-mask="9999 999999"`}},
		{"MaskedInput", map[string]any{"Mask": "aa-9999"}, []string{`type="text"`, `inputmode="text"`, `data-ely-mask="aa-9999"`}},
		{"Radio", map[string]any{"Name": "plan", "Value": "pro", "Required": true, "Options": []map[string]any{{"Value": "pro", "Label": "Pro"}, {"Value": "enterprise", "Label": "Enterprise", "Disabled": true}}}, []string{`role="radiogroup"`, `aria-disabled="true"`, `value="enterprise"`, `required`, `disabled`}},
		{"RadioCard", map[string]any{"Name": "space", "Value": "team", "Options": []map[string]any{{"Value": "team", "Label": "Team"}}}, []string{`type="radio"`, `name="space"`, `checked`}},
		{"Knob", map[string]any{"Label": "Gain", "Caption": "gain 65", "Value": "65", "Disabled": true}, []string{`tabindex="-1"`, `aria-disabled="true"`, `role="slider"`, `data-ely-knob-caption>gain 65`}},
		{"Stepper", map[string]any{"Caption": "guests", "Value": "2"}, []string{`data-ely-step="up"`, `data-ely-step="down"`, `data-ely-knob-caption>guests`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := renderAdvancedForm(t, "forms", tc.name, tc.props)
			for _, want := range tc.wants {
				if !strings.Contains(got, want) {
					t.Errorf("missing %s", want)
				}
			}
		})
	}
}

func TestFormsRadioCallerLabelsAndGrouping(t *testing.T) {
	label := "Caller Alpha retains its complete descriptive label, including every word"
	for _, name := range []string{"Radio", "RadioGroup", "RadioCard"} {
		t.Run(name, func(t *testing.T) {
			got := renderAdvancedForm(t, "forms", name, map[string]any{
				"Name": "caller_choice", "Value": "alpha",
				"Options": []map[string]any{{"Value": "alpha", "Label": label}, {"Value": "beta", "Label": "Caller Beta"}},
			})
			if !strings.Contains(got, label) {
				t.Fatal("caller label was truncated or replaced")
			}
			if strings.Count(got, `type="radio"`) != 2 || strings.Count(got, `name="caller_choice"`) != 2 || strings.Count(got, ` checked`) != 1 {
				t.Fatal("radio choices must share caller name and start with exactly one checked input")
			}
		})
	}
}
