package ui

import (
	"strings"
	"testing"
)

func TestAccountHelpCallerProps(t *testing.T) {
	cases := []struct {
		chapter, name string
		props         map[string]any
		wants         []string
	}{
		{"account", "LoginForm", map[string]any{"Label": "Caller login", "Email": "reader@example.test", "Action": "caller-login", "Remember": true, "Providers": []map[string]any{{"Value": "caller-provider", "Label": "Caller provider"}}}, []string{"Caller login", "reader@example.test", `data-ely-submit="caller-login"`, `value="caller-provider"`, `name="remember" checked`}},
		{"account", "SignupForm", map[string]any{"TermsLabel": "Caller terms", "Disabled": true}, []string{"Caller terms", "data-suite-rule", "disabled"}},
		{"account", "ProfileCard", map[string]any{}, []string{"ely-api-profile-card", "data-suite-initials"}},
		{"account", "ProfileEditor", map[string]any{"Fields": []map[string]any{{"Name": "custom_name", "Value": "<Caller profile>"}}}, []string{"custom_name", "&lt;Caller profile&gt;", `data-suite-validate="profile"`}},
		{"account", "SessionList", map[string]any{"Items": []map[string]any{{"Value": "caller-device", "Label": "Caller device", "Current": true}}, "OthersAction": "caller-out"}, []string{`data-suite-record="caller-device"`, `data-suite-current="true"`, "This device", `data-ely-action="caller-out"`}},
		{"account", "ApiKeyManager", map[string]any{"Secret": "example-only", "Items": []map[string]any{{"Value": "key-7", "Label": "Caller key"}}}, []string{"example-only", "Caller key", `data-suite-confirm="Revoke key?"`}},
		{"account", "TeamMemberTable", map[string]any{"Items": []map[string]any{{"Value": "owner-id", "Label": "Caller owner", "Owner": true}}}, []string{"Caller owner", "Owner"}},
		{"account", "Paywall", map[string]any{"Label": "Caller plan", "Benefits": []string{"Caller benefit"}, "ActionLabel": "Choose", "DismissLabel": "Later"}, []string{"Caller plan", "Caller benefit", "Later", "data-suite-dismiss"}},
		{"onboarding", "HelpPanel", map[string]any{"Items": []map[string]any{{"Value": "caller-article", "Label": "Caller heading", "Text": "Summary", "Body": "<Caller body>", "Links": []map[string]any{{"Value": "next", "Label": "Next article"}}}}}, []string{"Summary", "&lt;Caller body&gt;", `data-ely-help-open="next"`}},
		{"onboarding", "ContactSupport", map[string]any{"Action": "caller-support", "Address": "support@example.test", "Fields": []map[string]any{{"Name": "caller-message", "Label": "Message", "Type": "textarea"}}}, []string{`data-ely-submit="caller-support"`, "support@example.test", "caller-message"}},
		{"onboarding", "OnboardingWizard", map[string]any{"Action": "caller-finish", "Items": []map[string]any{{"Label": "Caller step"}}}, []string{`data-suite-finish-action="caller-finish"`, "Caller step"}},
		{"settings", "SettingsLayout", map[string]any{"Items": []map[string]any{{"Label": "Caller section", "Fields": []map[string]any{{"Name": "caller_key", "Label": "Caller setting", "Value": "caller-value", "Keywords": []string{"custom-keyword"}}}}}}, []string{"Caller section", "Caller setting", "caller-value", "custom-keyword"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := renderAdvancedForm(t, tc.chapter, tc.name, tc.props)
			for _, want := range tc.wants {
				if !strings.Contains(got, want) {
					t.Errorf("missing %q", want)
				}
			}
			if tc.name == "TeamMemberTable" && strings.Contains(got, `data-ely-action="remove-member"`) {
				t.Error("owner received Remove control")
			}
		})
	}
}

func TestAccountFactorKeepsOneVisibleTitle(t *testing.T) {
	body := renderAdvancedForm(t, "account", "TwoFactorInput", map[string]any{"Label": "Two-step sign-in", "Items": []int{1, 2, 3, 4, 5, 6}})
	if strings.Count(body, ">Two-step sign-in<") != 1 {
		t.Fatal("factor title is repeated as a visible PIN label")
	}
	if !strings.Contains(body, `role="group"`) || !strings.Contains(body, `aria-label="Two-step sign-in"`) || strings.Count(body, `data-ui-pin-slot`) != 6 {
		t.Fatal("factor group lost its accessible name or six slots")
	}
}
