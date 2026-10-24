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

func TestFormProfileCanShrinkWithinMobileGrid(t *testing.T) {
	css, err := Files.ReadFile("assets/ely-api-forms.css")
	if err != nil {
		t.Fatal(err)
	}

	preferredWidth := "[data-ely-family='forms'] .ely-api-profile-form,[data-ely-family='forms'] .ely-api-inline-form{inline-size:30rem;max-inline-size:100%}"
	if !strings.Contains(string(css), preferredWidth) {
		t.Fatal("profile and inline forms must retain their 30rem preferred width and container maximum")
	}

	const profileSelector = "[data-ely-family='forms'] .ely-api-profile-form"
	if !hasRootMinInlineSizeZero(css, ".ely-api-profile-form") {
		t.Fatal("the actual profile-form root rule must permit shrinking below min-content width")
	}
	if hasRootMinInlineSizeZero(css, ".ely-api-inline-form") {
		t.Fatal("the actual InlineForm root must not receive the profile-form shrink rule")
	}

	groupedRootMutation := []byte(profileSelector + ",[data-ely-family='forms'] .ely-api-inline-form{min-inline-size:0}")
	if !hasRootMinInlineSizeZero(groupedRootMutation, ".ely-api-inline-form") {
		t.Fatal("grouped selector mutation should detect min-inline-size:0 leaking to the InlineForm root")
	}
	inlineChildRule := []byte("[data-ely-family='forms'] .ely-api-inline-form .ely-api-form-field{min-inline-size:0}")
	if hasRootMinInlineSizeZero(inlineChildRule, ".ely-api-inline-form") {
		t.Fatal("a min-inline-size rule on an InlineForm descendant must remain allowed")
	}
}
