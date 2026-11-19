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
			`data-sender-id="u1"`,
			`is-cont`,
			`data-ely-message-body`,
			`data-ely-delete-open="m1"`,
			`data-ely-delete-dialog`,
			`data-ely-delete-choice="me"`,
			`data-ely-delete-choice="everyone"`,
			`나에게만 삭제`,
			`모두에게 삭제`,
			`data-ely-profile-popover`,
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
				"Quote":       "Original text",
				"QuoteAuthor": "Lee",
				"ReplyTo":     "m1",
				"Participants": []map[string]any{
					{"Handle": "kim", "Label": "Kim", "Avatar": "K", "Role": "Lead"},
					{"Handle": "lee", "Label": "Lee", "Avatar": "L", "Role": "Ops"},
				},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		html := out.String()
		for _, want := range []string{
			`data-has-quote="true"`,
			`data-ely-mention-list`,
			`data-ely-mention-option="kim"`,
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
}
