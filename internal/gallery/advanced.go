package uiexamples

import (
	"bytes"
	"fmt"
	"html/template"
	"net/http"
	"strings"

	"github.com/mrchypark/elysdui/ui/gohtmx"
)

type advancedRenderedCase struct {
	Key, Name, Family string
	Primary           bool
	Preview, Twin     template.HTML
}

type advancedPage struct {
	Cases  []advancedRenderedCase
	Error  string
	Family string
}

func advancedCases() []AdvancedCase {
	var cases []AdvancedCase
	for _, group := range [][]AdvancedCase{advancedFoundationCases(), advancedInteractionCases(), advancedDataCases(), advancedWorkspaceCases(), advancedCommunicationCases(), advancedNativeCases(), advancedFormsCases()} {
		cases = append(cases, group...)
	}
	return cases
}

func (s *Server) markdownPreview(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "invalid Markdown request", http.StatusBadRequest)
		return
	}
	var output bytes.Buffer
	if err := ui.RenderComponent(s.templates, &output, ui.Component{Chapter: "documents", Name: "MarkdownRenderer", ID: "preview-response", Props: map[string]any{"Value": r.FormValue("source"), "Title": "Preview"}}); err != nil {
		http.Error(w, "Markdown preview unavailable", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(output.Bytes())
}

func (s *Server) advancedAudit(w http.ResponseWriter, r *http.Request) {
	definitions, err := ui.ComponentDefinitions()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	fixtures := map[string]AdvancedCase{}
	for _, fixture := range advancedCases() {
		fixtures[fixture.Component.Chapter+"/"+fixture.Component.Name] = fixture
	}
	family, aliases := r.URL.Query().Get("family"), r.URL.Query().Get("aliases") == "1"
	seen := map[string]bool{}
	p := advancedPage{Family: family}
	for _, definition := range definitions {
		if family != "" && family != definition.Family {
			continue
		}
		names := []string{definition.Name}
		if aliases {
			names = append(names, definition.Aliases...)
		}
		for _, name := range names {
			key := definition.Chapter + "/" + name
			if seen[key] {
				continue
			}
			seen[key] = true
			resolved, resolveErr := ui.ResolveComponent(definition.Chapter, name)
			if resolveErr != nil {
				err = resolveErr
				break
			}
			fixture, ok := fixtures[key]
			if !ok {
				fixture, ok = fixtures[resolved.Chapter+"/"+resolved.Name]
			}
			if !ok {
				err = fmt.Errorf("missing behavioral fixture: %s/%s", resolved.Chapter, resolved.Name)
				break
			}
			component := fixture.Component
			component.Name, component.ID = name, fmt.Sprintf("audit-instance-%d", len(p.Cases))
			component.Props = aliasFixtureProps(component.Props, name)
			var preview, twin bytes.Buffer
			if err = ui.RenderComponent(s.templates, &preview, component); err != nil {
				break
			}
			component.ID += "-twin"
			component.Props = aliasFixtureProps(component.Props, name)
			if field, ok := component.Props["Name"].(string); ok {
				component.Props["Name"] = field + "_twin"
			}
			if err = ui.RenderComponent(s.templates, &twin, component); err != nil {
				break
			}
			p.Cases = append(p.Cases, advancedRenderedCase{Key: BehaviorCheckKey(key, resolved.Chapter+"/"+resolved.Name), Name: key, Family: resolved.Family, Primary: name == resolved.Name, Preview: template.HTML(preview.String()), Twin: template.HTML(twin.String())})
		}
		if err != nil {
			break
		}
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err != nil {
		p.Error = err.Error()
		w.WriteHeader(http.StatusInternalServerError)
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := s.templates.ExecuteTemplate(w, "advanced-audit", p); err != nil {
		http.Error(w, "component audit unavailable", http.StatusInternalServerError)
	}
}

func aliasFixtureProps(source map[string]any, name string) map[string]any {
	props := make(map[string]any, len(source))
	for key, value := range source {
		props[key] = value
	}
	switch name {
	case "EAN13":
		props["Value"], props["Format"] = "4006381333931", "ean13"
	case "Barcode", "Code128":
		props["Value"], props["Format"] = "ELY-2026", "code128"
	case "JsonInput", "ImportExportSettings":
		props["Value"] = `{"caller":"source"}`
	case "DateTimePicker":
		props["Value"], props["Type"] = "2026-10-20T12:30", "datetime-local"
	case "TimePicker":
		props["Value"], props["Type"] = "12:30", "time"
	case "WeekPicker":
		props["Value"], props["Type"] = "2026-W42", "week"
	case "YearPicker":
		props["Value"], props["Type"] = "2026", "number"
	case "QuarterPicker":
		props["Value"], props["Type"] = "Q1", "text"
	case "TimezoneSelect":
		props["Value"], props["Options"] = "Asia/Seoul", []map[string]any{{"Value": "Asia/Seoul", "Label": "Seoul"}, {"Value": "UTC", "Label": "UTC"}}
	case "DurationPicker":
		props["Value"], props["Type"], props["Unit"] = "30", "number", "minutes"
		props["Options"] = []map[string]any{{"Value": "minutes", "Label": "Minutes"}, {"Value": "hours", "Label": "Hours"}}
	case "UrlInput":
		props["Value"], props["Type"] = "https://example.test/source", "url"
	case "RadioCard":
		props["Type"] = "radio"
	}
	return props
}

func (s *Server) advancedUsage(w http.ResponseWriter, r *http.Request) {
	fixtures := advancedCases()
	selected := map[string]bool{"editor/CodeEditor": true, "documents/MarkdownEditor": true, "lists/FileTree": true, "chat/PromptInput": true, "calendar/EventEditor": true, "project/KanbanBoard": true, "charts/PieChart": true, "finance/OrderEntry": true, "media/AudioPlayer": true, "forms/CascadeSelect": true, "onboarding/OnboardingWizard": true}
	p := advancedPage{}
	for _, fixture := range fixtures {
		key := fixture.Component.Chapter + "/" + fixture.Component.Name
		if !selected[key] {
			continue
		}
		var output bytes.Buffer
		fixture.Component.ID = fmt.Sprintf("usage-instance-%d", len(p.Cases))
		if err := ui.RenderComponent(s.templates, &output, fixture.Component); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		p.Cases = append(p.Cases, advancedRenderedCase{Key: key, Name: key, Family: fixture.Family, Preview: template.HTML(output.String())})
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := s.templates.ExecuteTemplate(w, "advanced-usage", p); err != nil && !strings.Contains(err.Error(), "broken pipe") {
		http.Error(w, "advanced usage unavailable", http.StatusInternalServerError)
	}
}
