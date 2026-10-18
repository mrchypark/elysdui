package ui

import (
	"bytes"
	"golang.org/x/net/html"
	"strings"
	"testing"
)

func TestCalendarVisualCallerContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	render := func(name string, props map[string]any) *html.Node {
		t.Helper()
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: "calendar", Name: name, ID: "caller-calendar", Props: props}); err != nil {
			t.Fatal(err)
		}
		doc, err := html.Parse(strings.NewReader(out.String()))
		if err != nil {
			t.Fatal(err)
		}
		return doc
	}
	for _, name := range []string{"CalendarMonthView", "YearView", "AgendaView"} {
		props := map[string]any{"Items": []map[string]any{{"Value": "caller", "Date": "2026-10-13", "Day": 13, "Label": "Caller"}}, "Months": []map[string]any{{"Label": "October", "Weeks": []map[string]any{{"Days": []map[string]any{{"Date": "2026-10-13", "Day": 13}}}}}}}
		doc := render(name, props)
		found := false
		for _, button := range formNodes(doc, "button") {
			_, day := formAttr(button, "data-ely-calendar-day")
			_, agenda := formAttr(button, "data-calendar-agenda")
			if day || agenda {
				found = true
				if action, _ := formAttr(button, "data-ely-action"); action != "" {
					t.Errorf("%s still opens through generic single-click action %s", name, action)
				}
			}
		}
		if !found {
			t.Errorf("%s lacks selectable caller item", name)
		}
	}
	doc := render("CalendarWeekView", map[string]any{"Timezone": "UTC", "Days": []map[string]any{{"Date": "2026-10-13", "Label": "Caller day"}}, "TimeGrid": []map[string]any{{"Time": "09:30", "Cells": []map[string]any{{"Date": "2026-10-13"}}}}})
	order := []string{}
	for _, node := range formNodes(doc, "div") {
		class, _ := formAttr(node, "class")
		if class == "ely-calendar-time-head" || class == "ely-calendar-allday" || class == "ely-calendar-time-grid" {
			order = append(order, class)
		}
	}
	if strings.Join(order, ",") != "ely-calendar-time-head,ely-calendar-allday,ely-calendar-time-grid" {
		t.Fatalf("wrong time-view order: %v", order)
	}
	if !strings.Contains(formText(doc), "Caller day") {
		t.Fatal("caller fallback day label lost")
	}
	doc = render("EventPopover", map[string]any{"Title": "Caller event", "Start": "11:00", "Attendees": []map[string]any{{"Name": "Caller guest", "Answer": "Going"}}})
	var target string
	for _, button := range formNodes(doc, "button") {
		if _, ok := formAttr(button, "data-calendar-popover-open"); ok {
			target, _ = formAttr(button, "aria-controls")
		}
	}
	found := false
	for _, article := range formNodes(doc, "article") {
		if id, _ := formAttr(article, "id"); id == target && target != "" {
			found = true
			if !strings.Contains(formText(article), "Caller guest") {
				t.Fatal("popover omitted attendees")
			}
		}
	}
	if !found {
		t.Fatal("popover trigger does not reference its own details")
	}
}
