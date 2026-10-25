package uiexamples

import (
	"strings"
	"testing"
)

func TestCalendarPopoverAuditTwinSpacingIsCaseScoped(t *testing.T) {
	css, err := Files.ReadFile("assets/advanced.css")
	if err != nil {
		t.Fatal(err)
	}

	want := "/* Calendar details are absolute overlays, so they do not increase the audit row's normal-flow height. */\n" +
		"[data-audit-case][data-audit-name=\"calendar/EventPopover\"]>.advanced-grid," +
		"[data-audit-case][data-audit-name=\"calendar/AttendeeList\"]>.advanced-grid{row-gap:180px}"
	if strings.Count(string(css), want) != 1 {
		t.Fatalf("advanced audit CSS must contain exactly one case-scoped calendar twin-spacing rule")
	}
}

func TestActionSheetAuditMainReservesViewportFlowSpace(t *testing.T) {
	css, err := Files.ReadFile("assets/advanced.css")
	if err != nil {
		t.Fatal(err)
	}

	want := "/* Native modal sheets stay viewport-anchored; reserve flow space after the main audit specimen. */\n" +
		"[data-audit-case][data-audit-name=\"buttons/ActionSheet\"]>.advanced-grid>[data-audit-main]{min-block-size:100vh}"
	if strings.Count(string(css), want) != 1 {
		t.Fatalf("ActionSheet viewport reservation must be a single case-scoped main-wrapper rule")
	}
}

func TestMultiSelectShadowAuditSpacingRequiresSingleExactCase(t *testing.T) {
	css, err := Files.ReadFile("assets/advanced.css")
	if err != nil {
		t.Fatal(err)
	}
	want := `.advanced-cases>[data-audit-case][data-audit-name="forms/MultiSelect"]:only-child>.advanced-grid>[data-audit-main]{min-block-size:100vh}`
	if strings.Count(string(css), want) != 1 {
		t.Fatal("MultiSelect spacing must reserve only the single-case primary, leaving its twin rendered")
	}
}

func TestRegionalComboboxAuditSpacingRequiresSingleExactCase(t *testing.T) {
	css, err := Files.ReadFile("assets/advanced.css")
	if err != nil {
		t.Fatal(err)
	}
	var selectors []string
	for _, name := range []string{"LanguageSelect", "CountrySelect", "CurrencySelect"} {
		selectors = append(selectors, `.advanced-cases>[data-audit-case][data-audit-name="forms/`+name+`"]:only-child>.advanced-grid>[data-audit-main]`)
	}
	if strings.Count(string(css), strings.Join(selectors, ",")+`{min-block-size:100vh}`) != 1 {
		t.Fatal("Regional popup spacing must be limited to these three single-case primary wrappers")
	}
	if strings.Contains(string(css), ".ely-api-region-picker") {
		t.Fatal("Audit separation must not restyle the product combobox or its twin")
	}
}
