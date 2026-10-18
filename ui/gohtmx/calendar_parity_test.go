package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestCalendarCallerParity(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"EventEditor", map[string]any{"Title": "Caller title", "Start": "2026-10-13", "End": "2026-10-13", "AllDay": true, "Location": "Caller room", "Notes": "Keep notes", "Frequency": "Weekly", "Reminders": []int{10, 1440}, "ShowCancel": true, "ShowDelete": true}, []string{"Caller title", "Caller room", "Keep notes", `name="frequency"`, `name="reminders"`, `data-ely-event-all-day checked`, `data-ely-action="cancel-event"`, `data-ely-action="delete-event"`}},
		{"AvailabilityPicker", map[string]any{"Options": []map[string]any{{"Value": "caller-slot", "Label": "Legacy slot", "Selected": true}}}, []string{`type="checkbox"`, `value="caller-slot" checked`, "Legacy slot"}},
		{"AvailabilityPicker", map[string]any{"Days": []map[string]any{{"Date": "2026-10-14", "Label": "Wed 14", "Slots": []map[string]any{{"Value": "2026-10-14T09:00", "Label": "09:00"}}}}}, []string{"data-calendar-availability-day", `data-calendar-slots="2026-10-14"`, `value="2026-10-14T09:00"`}},
		{"EventPopover", map[string]any{"Title": "<Caller>", "Value": "caller", "ShowEdit": true, "ShowDelete": true, "Content": "Caller details", "Attendees": []map[string]any{{"Name": "Guest", "Email": "guest@example.test", "Answer": "Maybe"}}}, []string{"&lt;Caller&gt;", "Caller details", "guest@example.test", "data-calendar-popover hidden", `data-ely-action="edit-event"`, `value="caller"`}},
		{"CalendarMonthView", map[string]any{"Items": []map[string]any{{"Date": "2026-10-13", "Day": 13, "Events": []map[string]any{{"Value": "caller-event", "Label": "Caller event"}}}}}, []string{`data-ely-date="2026-10-13"`, `value="caller-event"`, `data-ely-calendar-nav="today"`}},
		{"CalendarWeekView", map[string]any{"Days": []map[string]any{{"Date": "2026-10-13", "Label": "Caller day"}}, "TimeGrid": []map[string]any{{"Time": "11:00", "Cells": []map[string]any{{"Date": "2026-10-13", "Events": []map[string]any{{"Value": "caller", "Label": "Caller event", "Start": "2026-10-13T11:00", "End": "2026-10-13T12:00"}}}}}}}, []string{"Caller day", "Caller event", `data-event-start="2026-10-13T11:00"`}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "calendar", Name: tc.name, ID: "calendar-caller", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q", want)
				}
			}
		})
	}
}
