package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestNativeMessagingContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}

	t.Run("ChatMessage renders is-cont, data-sender-id, CanDelete, and two-tier delete dialog", func(t *testing.T) {
		var out bytes.Buffer
		err := RenderComponent(tpl, &out, Component{
			Chapter: "messaging",
			Name:    "ChatMessage",
			ID:      "chat-msg-test",
			Props: map[string]any{
				"DeleteTitle":            "메시지 삭제",
				"DeleteForMeLabel":       "나에게만 삭제",
				"DeleteForEveryoneLabel": "모두에게 삭제",
				"CancelLabel":            "취소",
				"CanReply":               true,
				"ReplyLabel":             "Reply to message",
				"ProfileURL":             "/api/profiles",
				"ComposerID":             "chat-prompt",
				"DeleteForMeURL":         "/api/messages/{id}/for-me",
				"DeleteForEveryoneURL":   "/api/messages/{id}/for-everyone",
				"Messages": []map[string]any{
					{"Value": "m1", "SenderID": "u1", "Author": "Kim", "Content": "Hello @lee", "Time": "10:00", "CanDelete": true},
					{"Value": "m2", "SenderID": "u1", "Author": "Kim", "Content": "Follow up", "Time": "10:01", "Continuous": true},
				},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		html := out.String()
		for _, want := range []string{
			`id="chat-msg-test-transcript"`,
			`data-sender-id="u1"`,
			`is-cont`,
			`data-ely-message-body`,
			`data-ely-delete-open="m1"`,
			`data-ely-delete-dialog`,
			`data-ely-delete-choice="me"`,
			`data-ely-delete-choice="everyone"`,
			`data-ely-delete-url="/api/messages/%7bid%7d/for-me"`,
			`data-ely-delete-url="/api/messages/%7bid%7d/for-everyone"`,
			`data-sender-name="Kim"`,
			`data-ely-reply-open="m1"`,
			`Reply to message`,
			`data-ely-profile-url="/api/profiles"`,
			`data-ely-profile-role`,
			`data-ely-profile-account`,
			`data-ely-profile-joined`,
			`data-ely-profile-mention`,
			`data-ely-composer-target="chat-prompt"`,
			`data-ely-delete-status role="status"`,
			`나에게만 삭제`,
			`모두에게 삭제`,
			`id="chat-msg-test-mention-popover"`,
			`aria-labelledby="chat-msg-test-mention-popover-title"`,
		} {
			if !strings.Contains(html, want) {
				t.Errorf("expected %q in rendered ChatMessage HTML:\n%s", want, html)
			}
		}
	})

	t.Run("PromptInput renders Participants autocomplete listbox and reply quote slot", func(t *testing.T) {
		var out bytes.Buffer
		err := RenderComponent(tpl, &out, Component{
			Chapter: "chat",
			Name:    "PromptInput",
			ID:      "prompt-mentions",
			Props: map[string]any{
				"Quote":        "Original text",
				"QuoteAuthor":  "Lee",
				"ReplyTo":      "m1",
				"MentionSrc":   "/api/mentions",
				"TypingURL":    "/api/typing",
				"TypingExpiry": 2500,
				"Floating":     true,
				"Participants": []map[string]any{
					{"Handle": "김대리", "Label": "Kim", "Avatar": "K", "Role": "Lead"},
					{"Handle": "이과장", "Label": "Lee", "Avatar": "L", "Role": "Ops"},
				},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		html := out.String()
		for _, want := range []string{
			`id="prompt-mentions"`,
			`data-has-quote="true"`,
			`data-ely-mention-src="/api/mentions"`,
			`id="prompt-mentions-mentions"`,
			`id="prompt-mentions-mentions-option-0"`,
			`data-ely-mention-option="김대리"`,
			`role="combobox"`,
			`aria-autocomplete="list"`,
			`aria-controls="prompt-mentions-mentions"`,
			`aria-expanded="false"`,
			`data-ely-typing-url="/api/typing"`,
			`data-ely-typing-expiry="2500"`,
			`data-ely-floating="true"`,
			`data-ely-reply-quote`,
			`data-ely-reply-to`,
			`value="m1"`,
			`data-ely-quote-clear`,
		} {
			if !strings.Contains(html, want) {
				t.Errorf("expected %q in rendered PromptInput HTML:\n%s", want, html)
			}
		}
	})

	t.Run("PromptInput renders a dynamic mention target without SSR participants", func(t *testing.T) {
		var out bytes.Buffer
		err := RenderComponent(tpl, &out, Component{
			Chapter: "chat",
			Name:    "PromptInput",
			ID:      "prompt-dynamic-mentions",
			Props: map[string]any{
				"MentionSrc": "/api/mentions",
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		html := out.String()
		for _, want := range []string{
			`data-ely-mention-src="/api/mentions"`,
			`id="prompt-dynamic-mentions-mentions"`,
		} {
			if !strings.Contains(html, want) {
				t.Errorf("expected %q in rendered PromptInput HTML:\n%s", want, html)
			}
		}
	})

	t.Run("PromptInput renders a semantic single-line combobox", func(t *testing.T) {
		var out bytes.Buffer
		err := RenderComponent(tpl, &out, Component{
			Chapter: "chat",
			Name:    "PromptInput",
			ID:      "prompt-single",
			Props: map[string]any{
				"SingleLine":   true,
				"Name":         "body",
				"Value":        "Hello",
				"Required":     true,
				"Participants": []map[string]any{{"Handle": "lee"}},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		html := out.String()
		for _, want := range []string{
			`<input`,
			`type="text"`,
			`id="prompt-single-message"`,
			`name="body"`,
			`value="Hello"`,
			`required`,
			`data-ely-prompt-editor="true"`,
			`role="combobox"`,
			`aria-controls="prompt-single-mentions"`,
			`aria-expanded="false"`,
		} {
			if !strings.Contains(html, want) {
				t.Errorf("expected %q in rendered PromptInput HTML:\n%s", want, html)
			}
		}
		if strings.Contains(html, "<textarea") {
			t.Fatalf("SingleLine must render an input instead of a textarea:\n%s", html)
		}
	})
}
