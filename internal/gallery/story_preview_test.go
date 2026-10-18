package uiexamples

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestPublicNativePreviewsOmitSyntheticValues(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	for _, record := range advancedNativeCases() {
		placeholder := "value-" + strings.ReplaceAll(strings.ToLower(record.Component.Name), " ", "-")
		for _, preview := range storyPreviewComponents(record.Component) {
			var output bytes.Buffer
			if err := ui.RenderComponent(server.templates, &output, preview); err != nil {
				t.Errorf("%s/%s: %v", preview.Chapter, preview.Name, err)
				continue
			}
			if strings.Contains(output.String(), placeholder) {
				t.Errorf("%s/%s still exposes synthetic example value %q", preview.Chapter, preview.Name, placeholder)
			}
		}
	}
}

func TestEveryStoryRendersItsComposedPublicAPI(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	ids := regexp.MustCompile(`\sid="([^"]+)"`)
	icons := regexp.MustCompile(`\bdata-(?:native-icon|interaction-icon|tool-icon|icon)="([a-z0-9-]+)"`)
	for _, chapter := range server.components {
		for _, story := range chapter.Stories {
			path := componentHref(chapter.Slug, story.Slug)
			response := httptest.NewRecorder()
			server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
			body := response.Body.String()
			if response.Code != http.StatusOK || !strings.Contains(body, "data-ely-family=") {
				t.Errorf("%s did not render its public API: %d %s", path, response.Code, body)
				continue
			}
			for _, icon := range icons.FindAllStringSubmatch(body, -1) {
				if _, err := ui.Files.ReadFile("assets/ely/icons/" + icon[1] + ".svg"); err != nil {
					t.Errorf("%s references unavailable CSS icon %s: %v", path, icon[1], err)
				}
			}
			seen := map[string]bool{}
			for _, id := range ids.FindAllStringSubmatch(body, -1) {
				if seen[id[1]] {
					t.Errorf("%s repeated instance ID %q", path, id[1])
				}
				seen[id[1]] = true
			}
		}
	}
}

func TestStoryPreviewDoesNotMutateAuditFixtures(t *testing.T) {
	source := ui.Component{Chapter: "forms", Name: "Input", ID: "audit-input", Props: map[string]any{
		"Disabled": true, "Title": "Caller Input", "Value": "alpha", "Label": "Caller field",
		"Items": []map[string]any{{"Value": "alpha", "Label": "First caller item"}},
	}}
	preview := storyPreviewComponent(source)
	if preview.ID != "component-preview" || preview.Props["Disabled"] != false || preview.Props["Label"] != "field" {
		t.Fatalf("incorrect preview: %#v", preview)
	}
	if source.Props["Disabled"] != true || source.Props["Label"] != "Caller field" || source.Props["Items"].([]map[string]any)[0]["Label"] != "First caller item" {
		t.Fatal("preview changed its audit fixture")
	}
	if preview.Props["Items"].([]map[string]any)[0]["Value"] != "alpha" {
		t.Fatal("preview changed a selection value")
	}
}

func TestEveryStoryHasReferenceDescription(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	for _, chapter := range server.components {
		for _, story := range chapter.Stories {
			if server.referenceNotes[chapter.Slug+"/"+story.Slug] == "" {
				t.Errorf("missing Ely reference description for %s/%s", chapter.Slug, story.Slug)
			}
		}
	}
}

func TestPublicStoriesDoNotShowAuditPlaceholders(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	for _, chapter := range server.components {
		if chapter.Slug == "charts" {
			continue
		}
		for _, story := range chapter.Stories {
			path := componentHref(chapter.Slug, story.Slug)
			response := httptest.NewRecorder()
			server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
			for _, placeholder := range []string{">Example content", ">First item<", ">Second item<", ">First option<"} {
				if strings.Contains(response.Body.String(), placeholder) {
					t.Errorf("%s still shows %q", path, placeholder)
				}
			}
		}
	}
}

func TestStoryPreviewPreservesMeaningfulTitle(t *testing.T) {
	component := ui.Component{Chapter: "collab", Name: "ShareDialog", Props: map[string]any{"Title": "Share project notes"}}
	if got := storyPreviewComponent(component).Props["Title"]; got != "Share project notes" {
		t.Fatalf("lost example title: %v", got)
	}
}

func TestStoryPreviewOmitsAuditOnlyCopy(t *testing.T) {
	component := ui.Component{Chapter: "shell", Name: "TitleBar", Props: map[string]any{
		"Description": "Caller supplied content for isolation and escaped-value checks.",
		"Text":        "Project notes", "Value": "audit-value",
	}}
	preview := storyPreviewComponent(component)
	if preview.Props["Description"] != "" || preview.Props["Text"] != "Project notes" || preview.Props["Value"] != "audit-value" {
		t.Fatalf("lost caller data or retained audit-only copy: %#v", preview.Props)
	}
}

func TestStoryVariantsKeepIndependentCallerState(t *testing.T) {
	component := ui.Component{Chapter: "forms", Name: "Input", Props: map[string]any{"Value": "base", "PreviewExamples": []map[string]any{{"Value": "first", "PreviewName": "ClearableInput"}, {"Value": "second", "Disabled": true}}}}
	examples := storyPreviewComponents(component)
	if len(examples) != 2 || examples[0].ID == examples[1].ID || examples[0].Props["Value"] != "first" || examples[1].Props["Value"] != "second" || examples[1].Props["Disabled"] != true {
		t.Fatalf("invalid independent examples: %#v", examples)
	}
	if examples[0].Name != "ClearableInput" || examples[0].Props["PreviewName"] != nil {
		t.Fatal("preview alias did not use the component API")
	}
	examples[0].Props["Value"] = "edited"
	if examples[1].Props["Value"] != "second" || component.Props["Value"] != "base" || component.Props["PreviewExamples"] == nil {
		t.Fatal("example composition changed another instance or audit fixture")
	}
}

func TestStoryVariantsUseTheirLoadedFamily(t *testing.T) {
	for _, record := range advancedCases() {
		base, err := ui.ResolveComponent(record.Component.Chapter, record.Component.Name)
		if err != nil {
			t.Fatal(err)
		}
		for _, preview := range storyPreviewComponents(record.Component) {
			definition, err := ui.ResolveComponent(preview.Chapter, preview.Name)
			if err != nil || definition.Family != base.Family {
				t.Errorf("%s/%s preview %s does not use its loaded family %s: %v", preview.Chapter, record.Component.Name, preview.Name, base.Family, err)
			}
		}
	}
}
