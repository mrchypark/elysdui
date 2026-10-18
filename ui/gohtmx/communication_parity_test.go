package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestCommunicationParityVariants(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		chapter, name string
		props         map[string]any
		wants         []string
	}{
		{"agent", "ToolApprovalDialog", map[string]any{"Permission": true, "Payload": "task-1"}, []string{"allow-once", "allow-always", "data-ely-action=\"deny\""}},
		{"chat", "ChatContainer", map[string]any{"Items": []map[string]any{{"Value": "m1", "Role": "assistant", "Content": "Ready"}}}, []string{"data-ely-chat-log", "data-ely-scroll-bottom"}},
		{"agent", "AgentStepList", map[string]any{"Items": []map[string]any{{"Value": "next", "Label": "Next", "Status": "working"}}}, []string{"data-agent-step=\"next\"", "data-ely-agent-complete"}},
		{"mail", "MailList", map[string]any{"Items": []map[string]any{{"Value": "mail-1", "Label": "Ana", "Title": "Review", "Time": "09:30", "Starred": true, "Unread": true}}}, []string{"data-ely-mail-open", "data-ely-mail-star", "aria-pressed=\"true\"", "data-unread"}},
		{"calendar", "CalendarMonthView", map[string]any{"Items": []map[string]any{{"Date": "2026-10-12", "Day": "12"}}}, []string{"data-ely-calendar-day", "value=\"2026-10-12\"", "data-variant=\"ghost\""}},
		{"calendar", "EventEditor", map[string]any{"AllDay": true, "Start": "2026-10-12", "End": "2026-10-13", "Location": "Room 1", "Notes": "Bring notes", "ShowCancel": true, "ShowDelete": true}, []string{"data-ely-event-all-day", "name=\"location\"", "name=\"notes\"", "cancel-event", "delete-event"}},
		{"project", "KanbanBoard", map[string]any{"Lanes": []map[string]any{{"Value": "todo", "Cards": []map[string]any{{"Value": "task-1", "Title": "Review"}}}}}, []string{"tabindex=\"0\"", "aria-keyshortcuts=\"Alt+ArrowLeft Alt+ArrowRight\""}},
		{"agent", "BrowserPreview", map[string]any{"URL": "https://elygpui.com", "PreviewURL": "/assets/sample.svg"}, []string{"name=\"url\"", "data-ely-action=\"open-browser\"", "data-ely-action=\"browser-next\""}},
		{"agent", "MCPServerList", map[string]any{"Servers": []map[string]any{{"Value": "files", "Label": "Files", "Permission": "Read only", "Enabled": true}, {"Value": "github", "Label": "GitHub", "ActionLabel": "Open setup"}}}, []string{"data-ely-server-toggle", "configure-server", "Configure", "Read only", "Open setup"}},
		{"chat", "MathBlock", map[string]any{"Formula": "c' = c + t(1 - c)", "Label": "Color lift formula"}, []string{"<math", "data-ely-math=", "Color lift formula"}},
		{"chat", "TableBlock", map[string]any{"Caption": "Lift values", "Columns": []string{"Theme", "Lift"}, "Rows": []map[string]any{{"Cells": []string{"Light", "0.50"}}}}, []string{"<table>", "Lift values", "<th scope=\"col\">Theme"}},
		{"chat", "MermaidRenderer", map[string]any{"Diagram": "flowchart LR", "Caption": "Color flow"}, []string{"data-ely-diagram-source", "render-diagram", "Color flow"}},
		{"chat", "SuggestionChips", map[string]any{"Items": []map[string]any{{"Value": "Explain a lift", "Label": "Explain a lift"}}}, []string{"ely-chat-suggestion-chips", "data-ely-welcome-suggestion", `name="message"`}},
		{"chat", "PromptTemplateMenu", map[string]any{"Templates": []map[string]any{{"Value": "review", "Label": "Review code", "Content": "Review this code."}}}, []string{"ely-chat-model-selector", "data-ely-model-menu", "data-ely-template-choice"}},
		{"chat", "ProjectKnowledgePanel", map[string]any{"Files": []map[string]any{{"Value": "notes", "Name": "notes.pdf", "Content": "42 KB"}}, "Used": "42 KB", "Capacity": "2 MB"}, []string{"ely-chat-project-knowledge", "add-project-file", "remove-project-file"}},
		{"chat", "PromptInput", map[string]any{"Temperature": 0, "TemperatureMin": 0, "TemperatureMax": 0, "TemperatureStep": 0}, []string{`min="0"`, `max="0"`, `step="0"`, `value="0"`, `data-ely-value>0<`}},
		{"project", "Pomodoro Timer", map[string]any{"Progress": 0, "Value": "00:00"}, []string{`data-ely-timer-progress="0"`}},
	} {
		t.Run(tc.chapter+"/"+tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "parity", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.wants {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q in %s", want, out.String())
				}
			}
		})
	}
}
