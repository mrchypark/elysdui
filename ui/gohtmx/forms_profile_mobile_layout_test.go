package ui

import (
	"strings"
	"testing"
)

func hasRootMinInlineSizeZero(css []byte, rootClass string) bool {
	for _, rule := range strings.Split(string(css), "}") {
		selectors, declarations, ok := strings.Cut(rule, "{")
		if !ok {
			continue
		}
		shrinks := false
		for _, declaration := range strings.Split(declarations, ";") {
			property, value, ok := strings.Cut(declaration, ":")
			if ok && strings.TrimSpace(property) == "min-inline-size" && strings.TrimSpace(value) == "0" {
				shrinks = true
				break
			}
		}
		if !shrinks {
			continue
		}
		for _, selector := range strings.Split(selectors, ",") {
			if strings.HasSuffix(strings.TrimSpace(selector), rootClass) {
				return true
			}
		}
	}
	return false
}

func hasRuleDeclaration(css []byte, selector, property, value string) bool {
	for _, rule := range strings.Split(string(css), "}") {
		selectors, declarations, ok := strings.Cut(rule, "{")
		if !ok {
			continue
		}
		matches := false
		for _, candidate := range strings.Split(selectors, ",") {
			if strings.TrimSpace(candidate) == selector {
				matches = true
				break
			}
		}
		if !matches {
			continue
		}
		for _, declaration := range strings.Split(declarations, ";") {
			name, current, ok := strings.Cut(declaration, ":")
			if ok && strings.TrimSpace(name) == property && strings.TrimSpace(current) == value {
				return true
			}
		}
	}
	return false
}

func TestFormProfileAndNestedControlsCanShrinkWithinMobileGrid(t *testing.T) {
	formsCSS, err := Files.ReadFile("assets/ely-api-forms.css")
	if err != nil {
		t.Fatal(err)
	}
	baseCSS, err := Files.ReadFile("assets/ely-api.css")
	if err != nil {
		t.Fatal(err)
	}

	const profileForm = "[data-ely-family='forms'] .ely-api-profile-form"
	const inlineForm = "[data-ely-family='forms'] .ely-api-inline-form"
	if !hasRuleDeclaration(formsCSS, profileForm, "max-inline-size", "30rem") {
		t.Fatal("profile form must retain its 30rem maximum width")
	}
	if hasRuleDeclaration(formsCSS, profileForm, "inline-size", "30rem") {
		t.Fatal("profile form must fill a narrow containing track instead of fixing itself at 30rem")
	}
	if !hasRuleDeclaration(formsCSS, profileForm, "min-inline-size", "0") {
		t.Fatal("the profile-form root must still permit shrinking below min-content width")
	}
	if !hasRuleDeclaration(formsCSS, inlineForm, "inline-size", "min(30rem,100%)") || !hasRuleDeclaration(formsCSS, inlineForm, "max-inline-size", "100%") {
		t.Fatal("InlineForm must retain its independent responsive 30rem preferred-width contract")
	}
	if !hasRuleDeclaration(baseCSS, "[data-ely-family]", "display", "grid") || !hasRuleDeclaration(baseCSS, "[data-ely-family]", "min-inline-size", "0") {
		t.Fatal("the measured component wrapper must remain a shrinkable grid root")
	}
	if !hasRuleDeclaration(formsCSS, "[data-ely-family='forms'] fieldset", "min-inline-size", "0") ||
		!hasRuleDeclaration(formsCSS, "[data-ely-family='forms'] .ely-api-form-field", "min-inline-size", "0") ||
		!hasRuleDeclaration(formsCSS, "[data-ely-family='forms'] .ely-api-profile-form .ely-api-field", "max-inline-size", "100%") {
		t.Fatal("fieldset, field grid and label chain must not reintroduce a min-content width")
	}
	if !hasRuleDeclaration(baseCSS, "[data-ely-family] input", "min-inline-size", "0") ||
		!hasRuleDeclaration(baseCSS, "[data-ely-family] input", "max-inline-size", "100%") ||
		!hasRuleDeclaration(formsCSS, "[data-ely-family='forms'] [data-ely-array-row]>input", "min-inline-size", "0") {
		t.Fatal("form controls and flexible array inputs must remain constrained by their inner track")
	}
	if !hasRuleDeclaration(formsCSS, "[data-ely-family='forms'] .ely-api-form-actions", "display", "flex") {
		t.Fatal("the profile form action row must remain in the tested inner layout chain")
	}

	groupedRootMutation := []byte(profileForm + ",[data-ely-family='forms'] .ely-api-inline-form{min-inline-size:0}")
	if !hasRootMinInlineSizeZero(groupedRootMutation, ".ely-api-inline-form") {
		t.Fatal("grouped selector mutation should detect min-inline-size:0 leaking to the InlineForm root")
	}
	inlineChildRule := []byte("[data-ely-family='forms'] .ely-api-inline-form .ely-api-form-field{min-inline-size:0}")
	if hasRootMinInlineSizeZero(inlineChildRule, ".ely-api-inline-form") {
		t.Fatal("a min-inline-size rule on an InlineForm descendant must remain allowed")
	}
}
