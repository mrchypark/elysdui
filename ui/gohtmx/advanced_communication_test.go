package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestCommunicationAPIRendersEveryPrimaryWithCallerData(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	definitions, err := ComponentDefinitions()
	if err != nil {
		t.Fatal(err)
	}
	for _, definition := range definitions {
		if definition.Family != "communication" {
			continue
		}
		t.Run(definition.Chapter+"/"+definition.Name, func(t *testing.T) {
			var out bytes.Buffer
			props := map[string]any{"Title": `<img src=x onerror=1>`, "Content": "Caller content", "Value": "12", "Items": []map[string]any{{"Value": "one", "Label": "Caller item", "Content": "Caller detail"}}, "Options": []map[string]any{{"Value": "one", "Label": "One", "Selected": true}}}
			if err := RenderComponent(tpl, &out, Component{Chapter: definition.Chapter, Name: definition.Name, ID: "audit-" + definition.Chapter, Props: props}); err != nil {
				t.Fatal(err)
			}
			got := out.String()
			if strings.TrimSpace(got) == "" || strings.Contains(got, "<img src=x") || !strings.Contains(got, `id="audit-`+definition.Chapter+`"`) {
				t.Fatalf("unsafe or empty renderer: %s", got)
			}
		})
	}
}

func TestCommunicationAPIUsesCallerItemsAndDisabledState(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	err = RenderComponent(tpl, &out, Component{Chapter: "chat", Name: "ConversationList", ID: "audit-chat-disabled", Props: map[string]any{
		"Title": "Caller conversation", "Disabled": true, "Items": []map[string]any{{"Value": "one", "Label": "<caller item>", "Content": "One instance only"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	got := out.String()
	for _, want := range []string{`id="audit-chat-disabled"`, "&lt;caller item&gt;", "One instance only", "disabled"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in %s", want, got)
		}
	}
	if strings.Contains(got, "<caller item>") {
		t.Fatal("caller item was interpreted as HTML")
	}
}

func TestCommunicationAPIStructuredStoriesUseNativeControls(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		chapter, name string
		props         map[string]any
		wants         []string
	}{
		{"calendar", "CalendarMonthView", map[string]any{"Title": "October", "Items": []map[string]any{{"Date": "2026-10-12", "Day": "12", "Events": []map[string]any{{"Value": "event-1", "Label": "Review"}}}}}, []string{"ely-calendar-grid", `data-ely-date="2026-10-12"`, `data-ely-action="open-event"`}},
		{"project", "KanbanBoard", map[string]any{"Lanes": []map[string]any{{"Value": "todo", "Label": "To do", "Cards": []map[string]any{{"Value": "task-1", "Title": "Review", "Priority": "High", "Due": "2026-10-14"}}}}}, []string{`data-lane-id="todo"`, `data-card-id="task-1"`, "High", "2026-10-14"}},
		{"mail", "MailComposer", map[string]any{"To": "to@example.test", "Subject": "Review", "Value": "Body"}, []string{`type="email"`, `name="subject"`, `data-slot="textarea"`, "required"}},
		{"agent", "ToolApprovalDialog", map[string]any{"Title": "Permission", "Content": "Read document", "Payload": "doc-1"}, []string{"<dialog", `data-ely-action="approve"`, `data-ely-action="deny"`}},
		{"agent", "ToolApprovalDialog", map[string]any{"Tool": "write_file", "Payload": "doc-1", "Permission": true, "Disabled": true}, []string{`data-ely-action="allow-once"`, `data-ely-action="allow-always"`, "disabled"}},
		{"agent", "ToolCallCard", map[string]any{"Tool": "run_tests", "Status": "failed", "Arguments": `{"command":"test"}`, "Result": "2 tests failed", "Error": "Host must resolve"}, []string{"ely-agent-tool-call", "Arguments", "Result", "ely-agent-tool-error"}},
		{"agent", "SubAgentTree", map[string]any{"Items": []map[string]any{{"Value": "lead", "Label": "Lead", "Status": "working", "Open": true, "Children": []map[string]any{{"Value": "tests", "Label": "Tests", "Status": "failed"}}}}}, []string{"ely-agent-tree", `data-agent-state="working"`, `data-agent-state="failed"`}},
		{"agent", "FileChangeCard", map[string]any{"Path": "src/theme/lift.rs", "Added": 8, "Removed": 2, "Diff": "- old\n+ new", "Proposed": true, "Expanded": true, "Changes": []map[string]any{{"Value": "lift", "Path": "src/theme/lift.rs", "Selected": true}}}, []string{"ely-agent-file-change", "<details open", "accept-change", "reject-change", "data-ely-change-select"}},
		{"agent", "AgentStepList", map[string]any{"Items": []map[string]any{{"Value": "inspect", "Label": "Inspect", "Status": "complete"}, {"Value": "read", "Label": "Read", "Status": "done"}, {"Value": "search", "Label": "Search", "Status": "working"}, {"Value": "write", "Label": "Write", "Status": "waiting"}, {"Value": "test", "Label": "Test", "Status": "failed"}}}, []string{"data-agent-step=\"inspect\"", "data-agent-state=\"failed\""}},
		{"agent", "BrowserPreview", map[string]any{"URL": "https://elygpui.com/docs", "PreviewURL": "/assets/sample.svg", "Alt": "Documentation", "Frames": []map[string]any{{"Value": "page", "Label": "Page", "Src": "/assets/sample.svg", "Alt": "Page", "Caption": "Docs", "Active": true}}, "Steps": []map[string]any{{"Label": "Open docs", "State": "working"}}}, []string{"type=\"url\"", "ely-agent-browser-steps", "data-browser-step=\"working\"", "data-ely-browser-frame"}},
		{"agent", "ArtifactPanel", map[string]any{"Title": "Notes", "Content": "Preview", "Source": "# Source", "Options": []map[string]any{{"Value": "v1", "Label": "Version 1", "Content": "Preview 1"}}}, []string{"ely-agent-artifact", "data-ely-artifact-view", "copy-artifact", "download-artifact"}},
		{"agent", "SandboxStatus", map[string]any{"Title": "python", "Status": "ready", "CPU": 0.18, "MemoryUsed": 124, "MemoryLimit": 512}, []string{"ely-agent-sandbox", `data-sandbox-state="ready"`, "<meter"}},
		{"agent", "MemoryPanel", map[string]any{"Items": []map[string]any{{"Value": "memory-1", "Content": "Use plain language."}}, "Checkpoints": []map[string]any{{"Value": "checkpoint-1", "Label": "Before edit", "Current": true}}}, []string{`data-ely-submit="add-memory"`, "forget-memory", "data-ely-checkpoint"}},
		{"agent", "MCPServerList", map[string]any{"Servers": []map[string]any{{"Value": "files", "Label": "Filesystem", "Content": "stdio", "State": "connected", "Tools": 11, "Enabled": true}}}, []string{`data-server-state="connected"`, "ely-agent-server-dot", "11 tools", "data-ely-server-toggle"}},
		{"agent", "InterruptButton", map[string]any{"Status": "working", "Question": "Continue?", "Choices": []map[string]any{{"Value": "Continue", "Label": "Continue"}}}, []string{"ely-agent-interrupt", "data-ely-interrupt", "data-ely-human-input", "data-ely-answer-choice"}},
		{"agent", "TraceViewer", map[string]any{"Duration": 100, "Tracks": []map[string]any{{"Label": "Call", "Spans": []map[string]any{{"Value": "run", "Label": "run_tests", "Start": 0, "End": 90}}}}}, []string{"ely-agent-trace", "data-ely-trace-span", `data-trace-start="0"`, "data-ely-trace-zoom"}},
		{"agent", "EvalResultTable", map[string]any{"Columns": []map[string]any{{"Value": "case", "Label": "Case"}}, "Rows": []map[string]any{{"Cells": []string{"Fix test"}}}}, []string{"ely-agent-evals", "data-ely-eval-sort", "Fix test"}},
		{"chat", "FolderList", map[string]any{"Label": "Projects", "Items": []map[string]any{{"Label": "Component library", "Content": "24 conversations", "Expanded": true, "Children": []map[string]any{{"Value": "northwind", "Label": "Northwind review"}}}}}, []string{"<details open", "24 conversations", `data-ely-action="open-conversation"`, `value="northwind"`, `data-ely-value="northwind"`}},
		{"chat", "SharedConversationView", map[string]any{"Title": "Color and lift", "SharedBy": "Grace Lin", "SharedAt": "3 hours ago", "Items": []map[string]any{{"Role": "assistant", "Author": "Assistant", "Time": "09:30", "Content": "A lift blends toward white."}}}, []string{"ely-chat-shared-message--assistant", "Shared by", "Grace Lin", `data-ely-action="continue-conversation"`, `data-ely-action="export"`}},
		{"chat", "WelcomeScreen", map[string]any{"Greeting": "Good morning,", "UserName": "Ada", "Name": "message", "Suggestions": []map[string]any{{"Value": "Explain a lift", "Label": "Explain a lift"}}, "Capabilities": []map[string]any{{"Value": "Search the web for ", "Label": "Search the web", "Content": "Answers with sources."}}}, []string{"Good morning, Ada", `name="message"`, "ely-chat-welcome-suggestions", "data-ely-welcome-suggestion", "ely-chat-capabilities", `data-ely-action="use-capability"`}},
		{"chat", "ErrorMessage", map[string]any{"Title": "Stopped", "Content": "Connection closed", "Feedback": true, "FeedbackReasons": []map[string]any{{"Value": "wrong", "Label": "Wrong"}}}, []string{"ely-chat-error", "data-ely-feedback-tag", "data-ely-feedback-reasons", "send-feedback"}},
		{"chat", "ThinkingBlock", map[string]any{"State": "working", "Open": true, "Content": "Checking sources"}, []string{"ely-chat-thinking", `data-ely-thinking-state="working"`, "data-ely-thinking-toggle"}},
		{"chat", "CitationBadge", map[string]any{"Number": 2, "SourceTitle": "Palette", "Content": "Reference"}, []string{"ely-chat-citation", "data-ely-sources", ">2<"}},
		{"chat", "CitationBadge", map[string]any{"Citations": []map[string]any{{"Number": 1, "Text": "<claim>", "SourceTitle": "<source>"}, {"Number": 2, "SourceTitle": "Second"}}, "Sources": []map[string]any{{"SourceTitle": "<source>", "Href": "javascript:alert(1)"}}}, []string{"&lt;claim&gt;", "&lt;source&gt;", "structured-chat-cite-0-source", "structured-chat-cite-1-source", "#ZgotmplZ"}},
		{"chat", "SearchProgress", map[string]any{"Results": []map[string]any{{"SourceTitle": "Caller result", "Href": "https://example.test"}}, "Chunks": []map[string]any{{"FileName": "caller.pdf", "Runs": []map[string]any{{"Text": "<match>", "Match": true}}}}}, []string{"Caller result", "caller.pdf", "<mark>&lt;match&gt;</mark>"}},
		{"chat", "SearchProgress", map[string]any{"Items": []map[string]any{{"Label": "Reading", "State": "working", "Citations": 2}}}, []string{"ely-chat-search-progress", `data-search-state="working"`, "2 citations"}},
		{"chat", "PromptInput", map[string]any{"Attachments": []map[string]any{{"Value": "notes", "Name": "notes.pdf", "Content": "42 KB"}}, "Context": []map[string]any{{"Value": "project", "Label": "Project"}}, "Commands": []map[string]any{{"Value": "/summarize", "Label": "/summarize"}}, "Models": []map[string]any{{"Value": "large", "Label": "Ely Large"}}, "Temperature": "0.7"}, []string{"ely-chat-composer", "data-ely-attachment-remove", "data-ely-attachment-input", `data-ely-composer-menu="settings"`}},
		{"chat", "ModelSelector", map[string]any{"Value": "large", "Options": []map[string]any{{"Value": "large", "Label": "Ely Large", "Selected": true}}, "Tools": []map[string]any{{"Value": "web", "Label": "Web search"}}, "Templates": []map[string]any{{"Value": "review", "Label": "Review", "Content": "Review this."}}}, []string{"ely-chat-model-selector", "data-ely-model-menu", "data-ely-model-choice", "data-ely-template-choice"}},
		{"chat", "PromptLibrary", map[string]any{"Title": "Review code", "Content": "Review this code.", "Templates": []map[string]any{{"Value": "review", "Label": "Review code", "Category": "Engineering", "Description": "Find bugs.", "Content": "Review this code."}}, "Categories": []map[string]any{{"Value": "Engineering", "Label": "Engineering"}}}, []string{"data-ely-template-filter", "data-ely-template-category", "data-ely-template-select", "data-ely-template-use"}},
		{"chat", "ChatContainer", map[string]any{"Items": []map[string]any{{"Value": "one", "Role": "assistant", "Avatar": "AL", "Author": "Ana", "Time": "09:00", "Content": "First"}, {"Value": "two", "Role": "assistant", "Time": "09:02", "Content": "Second", "Grouped": true}, {"Value": "three", "Role": "user", "Author": "Ada", "Time": "09:03", "Content": "Reply"}}}, []string{"ely-chat-transcript", "ely-chat-message--grouped", "ely-chat-message--user"}},
		{"chat", "CodeBlock", map[string]any{"Language": "rust", "Lines": []map[string]any{{"Spans": []map[string]any{{"Class": "keyword", "Text": "fn"}}}, {"Hidden": true, "Text": "}"}}, "ShowMoreLabel": "Show more", "Actions": []map[string]any{{"Label": "Run", "Action": "run-code"}}}, []string{"<header>", `data-language="rust"`, "data-ely-code-more", "run-code", `data-ely-action="copy"`}},
		{"chat", "ImageMessage", map[string]any{"URL": "/assets/sample.svg", "Alt": "Atrium", "Width": 960, "Height": 640, "Caption": "Atrium"}, []string{`data-ely-media-width="960"`, `width="960"`, `height="640"`, `data-ely-action="open-media"`}},
		{"chat", "QuoteReply", map[string]any{"QuoteAuthor": "Assistant", "Quote": "A lift blends toward white.", "QuoteValue": "lift", "Name": "message"}, []string{"ely-chat-quote", "Assistant", "remove-quote", "ely-chat-reply-composer", `name="message"`}},
		{"agent", "ArtifactPanel", map[string]any{"Title": "Notes", "Value": "v1", "Content": "Old", "Options": []map[string]any{{"Value": "v1", "Label": "Version 1", "Content": "Old"}, {"Value": "v2", "Label": "Version 2", "Content": "New"}}}, []string{"data-ely-artifact-version", `data-content="New"`}},
	}
	for _, tc := range cases {
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "structured-" + tc.chapter, Props: tc.props}); err != nil {
			t.Fatal(err)
		}
		for _, want := range tc.wants {
			if !strings.Contains(out.String(), want) {
				t.Errorf("%s/%s missing %q", tc.chapter, tc.name, want)
			}
		}
	}
}

func TestCommunicationChatStatusAndComposeAllowEmptyAndDisabledCallerData(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name  string
		props map[string]any
		want  string
	}{
		{"ErrorMessage", map[string]any{"Disabled": true, "Feedback": true}, `data-ely-action="retry"`},
		{"ThinkingBlock", map[string]any{"Disabled": true}, `data-ely-thinking-toggle`},
		{"CitationBadge", map[string]any{"Disabled": true}, `data-ely-citation-number`},
		{"SearchProgress", map[string]any{"Items": []map[string]any{}}, `ely-chat-search-progress`},
		{"PromptInput", map[string]any{"Disabled": true, "Attachments": []map[string]any{}, "Context": []map[string]any{}}, `data-ely-attachment-open`},
		{"ModelSelector", map[string]any{"Disabled": true, "Options": []map[string]any{}}, `data-ely-model-menu`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "chat", Name: tc.name, ID: "empty-chat", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			got := out.String()
			if !strings.Contains(got, tc.want) || (tc.props["Disabled"] == true && !strings.Contains(got, "disabled")) {
				t.Fatalf("empty or disabled caller contract lost: %s", got)
			}
		})
	}
}

func TestCommunicationChatHistoryAndWelcomeStructures(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name  string
		props map[string]any
		wants []string
	}{
		{"TemperatureSlider", map[string]any{"Parameters": []map[string]any{{"Key": "temperature", "Label": "Temperature", "Value": "0.7", "Min": 0, "Max": 2, "Step": 0.1}, {"Key": "top_p", "Label": "Top p", "Value": "0.95", "Min": 0, "Max": 1, "Step": 0.05}}, "SystemPrompt": "Write plainly.", "SystemTokens": 400, "SystemLimit": 400, "TokenUsed": 1200, "TokenLimit": 2000}, []string{"ely-chat-parameters", `name="top_p"`, `name="system_prompt"`, "ely-chat-token-budget"}},
		{"ConversationList", map[string]any{"Items": []map[string]any{{"Value": "lift", "Label": "Color and lift", "Content": "Now"}}}, []string{"ely-chat-conversation-list", "Color and lift"}},
		{"FolderList", map[string]any{"Items": []map[string]any{{"Label": "Library", "Expanded": true}}, "Files": []map[string]any{{"Value": "notes", "Name": "notes.md"}}, "Used": "4 KB", "Capacity": "2 MB"}, []string{"ely-chat-project-workspace", "ely-chat-project-knowledge", "add-project-file"}},
		{"FollowUpSuggestions", map[string]any{"Author": "Assistant", "Content": "A lift blends toward white.", "Items": []map[string]any{{"Value": "one", "Label": "What is a shade?"}}}, []string{"ely-chat-follow-ups", "ely-chat-follow-up-answer"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "chat", Name: tc.name, ID: "history", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.wants {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q", want)
				}
			}
		})
	}
}
