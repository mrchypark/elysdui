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
