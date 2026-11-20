package main

import (
	"fmt"
	"os"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func main() {
	tpl, err := ui.NewTemplates()
	if err != nil {
		panic(err)
	}
	scenario := "full"
	if len(os.Args) > 1 {
		scenario = os.Args[1]
	}
	var components []ui.Component
	switch scenario {
	case "two-transcripts":
		components = []ui.Component{
			{Chapter: "messaging", Name: "ChatMessage", ID: "two-a", Props: map[string]any{
				"CanReply": true, "Messages": []map[string]any{{"Value": "reply", "SenderID": "a", "Author": "A", "Content": "A"}},
			}},
			{Chapter: "messaging", Name: "ChatMessage", ID: "two-b", Props: map[string]any{
				"CanReply": true, "Messages": []map[string]any{{"Value": "reply", "SenderID": "b", "Author": "B", "Content": "B"}},
			}},
			{Chapter: "chat", Name: "PromptInput", ID: "only-comp", Props: map[string]any{"Name": "body", "Label": "Only", "SingleLine": true}},
		}
	case "invalid-composer":
		components = []ui.Component{
			{Chapter: "messaging", Name: "ChatMessage", ID: "invalid-chat", Props: map[string]any{
				"CanReply": true, "ComposerID": "missing-composer", "Messages": []map[string]any{{"Value": "reply", "SenderID": "a", "Author": "A", "Content": "A"}},
			}},
			{Chapter: "chat", Name: "PromptInput", ID: "shared-comp", Props: map[string]any{"Name": "body", "Label": "Shared", "SingleLine": true}},
		}
	default:
		longParticipants := make([]map[string]any, 0, 14)
		for i := 0; i < 14; i++ {
			longParticipants = append(longParticipants, map[string]any{"Handle": fmt.Sprintf("person-%02d", i), "Label": fmt.Sprintf("Person %02d", i)})
		}
		components = []ui.Component{
			{Chapter: "messaging", Name: "ChatMessage", ID: "msg-root", Props: map[string]any{
				"ProfileURL": "/api/profile", "ComposerID": "comp-root", "CanReply": true, "ReplyLabel": "Reply to message",
				"DeleteForMeURL": "/api/messages/{id}/for-me", "DeleteForEveryoneURL": "/api/messages/{id}/for-everyone",
				"Messages": []map[string]any{
					{"Value": "m1", "SenderID": "u1", "Author": "Kim", "Content": "Hi @lee and @김대리 and @e\u0301", "Time": "10:00", "CanDelete": true},
					{"Value": "m2", "SenderID": "u1", "Content": "Second line", "Time": "10:01"},
					{"Value": "f0", "SenderID": "fill0", "Author": "Fill", "Content": "Filler 0"},
					{"Value": "f1", "SenderID": "fill1", "Author": "Fill", "Content": "Filler 1"},
					{"Value": "f2", "SenderID": "fill2", "Author": "Fill", "Content": "Filler 2"},
					{"Value": "f3", "SenderID": "fill3", "Author": "Fill", "Content": "Filler 3"},
					{"Value": "f4", "SenderID": "fill4", "Author": "Fill", "Content": "Filler 4"},
					{"Value": "f5", "SenderID": "fill5", "Author": "Fill", "Content": "Filler 5"},
				},
			}},
			{Chapter: "chat", Name: "PromptInput", ID: "comp-root", Props: map[string]any{
				"Name": "body", "Label": "Message", "SingleLine": true, "MentionSrc": "/api/mentions", "TypingURL": "/api/typing", "TypingExpiry": 250, "Floating": true,
				"Participants": []map[string]any{{"Handle": "kim", "Label": "SSR Kim"}},
			}},
			{Chapter: "messaging", Name: "ChatMessage", ID: "other-root", Props: map[string]any{
				"CanReply": true, "Messages": []map[string]any{{"Value": "m1", "SenderID": "x", "Author": "Other", "Content": "Other conversation"}},
			}},
			{Chapter: "chat", Name: "PromptInput", ID: "other-comp", Props: map[string]any{"Name": "body", "SingleLine": true, "Label": "Other message"}},
			{Chapter: "chat", Name: "PromptInput", ID: "ssr-root", Props: map[string]any{
				"Name": "body", "SingleLine": true, "Label": "SSR message", "Participants": []map[string]any{{"Handle": "old", "Label": "Old"}},
			}},
			{Chapter: "chat", Name: "PromptInput", ID: "race-root", Props: map[string]any{
				"Name": "body", "SingleLine": true, "Label": "Race message", "MentionSrc": "/api/mentions-race", "Participants": []map[string]any{{"Handle": "ssr", "Label": "SSR"}},
			}},
			{Chapter: "chat", Name: "PromptInput", ID: "long-root", Props: map[string]any{
				"Name": "body", "SingleLine": true, "Label": "Long mentions", "Participants": longParticipants,
			}},
			{Chapter: "chat", Name: "PromptInput", ID: "mixed-root", Props: map[string]any{
				"Name": "body", "SingleLine": true, "Label": "Mixed mentions", "Participants": []map[string]any{
					{"Handle": "blocked-first", "Label": "Blocked first", "Disabled": true},
					{"Handle": "available", "Label": "Available"},
					{"Handle": "blocked-last", "Label": "Blocked last", "Disabled": true},
				},
			}},
			{Chapter: "chat", Name: "PromptInput", ID: "blocked-root", Props: map[string]any{
				"Name": "body", "SingleLine": true, "Label": "Blocked mentions", "Participants": []map[string]any{
					{"Handle": "blocked-a", "Label": "Blocked A", "Disabled": true},
					{"Handle": "blocked-b", "Label": "Blocked B", "Disabled": true},
				},
			}},
			{Chapter: "chat", Name: "CitationBadge", ID: "citation-root", Props: map[string]any{"Number": 1, "SourceTitle": "Source details", "Content": "Source details"}},
			{Chapter: "chat", Name: "ModelSelector", ID: "model-root", Props: map[string]any{"Value": "large", "CurrentLabel": "Large", "Options": []map[string]any{{"Value": "large", "Label": "Large", "Selected": true}}}},
		}
	}
	for _, component := range components {
		if err := ui.RenderComponent(tpl, os.Stdout, component); err != nil {
			panic(err)
		}
	}
	if scenario == "full" {
		fmt.Print("<section id=\"escape-root\" data-ely-family=\"communication\" data-ely-component=\"messaging/ChatMessage\"><button id=\"escape-control\" type=\"button\">Escape control</button></section><iframe id=\"two-frame\" src=\"/scenario-two\"></iframe><iframe id=\"invalid-frame\" src=\"/scenario-invalid\"></iframe><div style=\"height:800px\"></div>")
	}
}
