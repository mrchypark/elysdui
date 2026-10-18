package uiexamples

import (
	"bytes"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"html/template"
	"strings"
	"testing"
)

func TestInteractionLoadingSourceFixtures(t *testing.T) {
	expected := map[string][]string{
		"Countdown":        {`data-clock-value="8047"`, `data-clock-value="10"`, `data-clock-mode="timer"`},
		"Spinner":          {`is-ring`, `is-dots`, `is-bars`, `is-pulse`, `is-orbit`, `is-wave`, `data-loading-size="12"`, `data-loading-size="24"`},
		"Skeleton":         {`ely-loading-skeleton-card`, `data-loading-width="72"`, `data-loading-width="48"`, `data-loading-width="36"`},
		"Shimmer":          {"Quarterly review", "Revenue rose 12%"},
		"LoadingButton":    {"Save changes", "Export", `data-loading-delay="1600"`, `data-loading-delay="2400"`},
		"LoadMore":         {"Ada Lovelace", "Fei-Fei Li", `data-page-size="5"`, `data-shown="5"`},
		"ProgressBar":      {`data-progress-value="35"`, `data-progress-buffer="70"`, `data-progress-segments="4"`, `data-progress-indeterminate`, `data-loading-ring-fill`},
		"LoadingOverlay":   {"Oat milk · 2.40", "Espresso beans · 14.90", "Rye bread · 4.20"},
		"LazyLoad":         {"Row 1 of 12", "Row 12 of 12"},
		"Suspense":         {`data-loading-delay="1500"`, "the report service answered 503", "Try again"},
		"RefreshIndicator": {"Mia is typing…", "almost", "Up to date"},
		"UploadList":       {"brand-guidelines.pdf", "hero@2x.png", "interview.mov", "notes.md"},
		"Transition":       {`data-loading-entrance="fade"`, `data-loading-entrance="rise"`, `data-loading-entrance="slide"`},
	}
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	seen := 0
	for _, f := range advancedInteractionCases() {
		c := f.Component
		want, ok := expected[c.Name]
		if !ok || (c.Chapter != "motion" && c.Chapter != "feedback") {
			continue
		}
		seen++
		if c.Props["Disabled"] != false {
			t.Errorf("%s disabled", c.Name)
		}
		var b bytes.Buffer
		if err := ui.RenderComponent(tpl, &b, c); err != nil {
			t.Fatal(err)
		}
		for _, text := range want {
			if !strings.Contains(b.String(), text) {
				t.Errorf("%s missing %s", c.Name, text)
			}
		}
		if c.Name == "LoadMore" && len(c.Props["Items"].([]map[string]any)) != 18 {
			t.Error("incomplete LoadMore data")
		}
	}
	if seen != 13 {
		t.Fatalf("got %d fixtures, want 13", seen)
	}
}

// Independently validate this family's source fixtures while other families are edited.
// The full catalogue test remains required and is not replaced by this check.
func TestInteractionLoadingIsolatedTemplates(t *testing.T) {
	tpl, err := template.New("").Funcs(ui.Funcs()).ParseFS(ui.Files, "templates/ely-api-interaction.html")
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{"Countdown": true, "Spinner": true, "Skeleton": true, "Shimmer": true, "LoadingButton": true, "LoadMore": true, "ProgressBar": true, "LoadingOverlay": true, "LazyLoad": true, "Suspense": true, "RefreshIndicator": true, "UploadList": true, "Transition": true}
	seen := 0
	for _, fixture := range advancedInteractionCases() {
		c := fixture.Component
		if !names[c.Name] || (c.Chapter != "motion" && c.Chapter != "feedback") {
			continue
		}
		seen++
		props := map[string]any{}
		for k, v := range c.Props {
			props[k] = v
		}
		props["Kind"] = c.Name
		props["ID"] = c.ID
		name := "ely-api-motion"
		if c.Chapter == "feedback" {
			name = "ely-api-feedback"
		}
		var b bytes.Buffer
		if err := tpl.ExecuteTemplate(&b, name, props); err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		if strings.Contains(b.String(), "style=") {
			t.Errorf("%s contains inline style markup", c.Name)
		}
	}
	if seen != 13 {
		t.Fatalf("got %d fixtures, want 13", seen)
	}
}
