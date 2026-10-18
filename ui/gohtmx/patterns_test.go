package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestDataPatternsRenderCallerContentSafely(t *testing.T) {
	templates, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	hostile := `<img src=x onerror=alert(1)>`
	for name, props := range map[string]map[string]any{
		"card":       {"Title": hostile, "Content": hostile},
		"accordion":  {"Items": []map[string]any{{"Label": hostile, "Content": hostile}}},
		"data-table": {"ID": "custom-table", "Columns": []map[string]any{{"Label": "Score"}}, "Rows": []map[string]any{{"Cells": []string{hostile}}}},
		"menu":       {"ID": "custom-menu", "Label": "Actions", "Items": []map[string]any{{"Label": hostile, "Value": "save"}}},
		"calendar":   {"ID": "custom-calendar", "Name": "due", "Value": "2026-11-05", "Min": "2026-11-01", "Max": "2026-11-30", "Required": true},
		"chart":      {"Label": "Scores", "Type": "line", "Points": []map[string]any{{"X": 0, "Y": 30, "Label": hostile}}},
	} {
		var output bytes.Buffer
		if err := templates.ExecuteTemplate(&output, name, props); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		body := output.String()
		if strings.Contains(body, "<img src=x") || strings.Contains(body, "ZgotmplZ") {
			t.Errorf("%s contains unescaped content: %s", name, body)
		}
		if name == "calendar" {
			for _, want := range []string{`name="due"`, `value="2026-11-05"`, `min="2026-11-01"`, `max="2026-11-30"`, ` required`, `data-ui-calendar-day`} {
				if !strings.Contains(body, want) {
					t.Errorf("calendar lacks %s", want)
				}
			}
		}
	}
}

func TestCatalogueIsSharedAndContainsEveryOfficialAlias(t *testing.T) {
	chapters, err := Catalogue()
	if err != nil {
		t.Fatal(err)
	}
	aliases := map[string]bool{}
	stories := 0
	for _, chapter := range chapters {
		stories += len(chapter.Stories)
		for _, story := range chapter.Stories {
			for _, name := range story.Components {
				aliases[name] = true
			}
		}
	}
	if len(chapters) != 44 || stories != 624 || len(aliases) != 1279 {
		t.Fatalf("catalogue: %d chapters, %d stories, %d aliases", len(chapters), stories, len(aliases))
	}
	chapters[0].Title = "mutated"
	fresh, err := Catalogue()
	if err != nil || fresh[0].Title == "mutated" {
		t.Fatal("caller changed the shared catalogue")
	}
}
