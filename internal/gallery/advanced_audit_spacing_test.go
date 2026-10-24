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
