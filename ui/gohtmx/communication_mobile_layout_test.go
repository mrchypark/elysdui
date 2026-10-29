package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestCommunicationMobileUserTrackOverridesGenericMessage(t *testing.T) {
	data, err := Files.ReadFile("assets/ely-api-communication.css")
	if err != nil {
		t.Fatal(err)
	}
	css := string(data)
	start := strings.Index(css, "@media(max-width:560px){[data-ely-family='communication'] .ely-chat-message{")
	if start < 0 {
		t.Fatal("missing mobile message layout")
	}
	mobile := css[start:]
	generic := "[data-ely-family='communication'] .ely-chat-message{grid-template-columns:1.8rem minmax(0,1fr)}"
	user := "[data-ely-family='communication'] .ely-chat-message--user{grid-template-columns:minmax(0,1fr) 1.8rem}"
	// Both selectors need equal specificity: otherwise the user article gets the avatar-sized track.
	if strings.Index(mobile, generic) < 0 || strings.Index(mobile, user) <= strings.Index(mobile, generic) {
		t.Fatal("mobile user message must override the generic tracks with the same family scope")
	}
	if !strings.Contains(css[:start], ".ely-chat-message--user{grid-template-columns:minmax(0,1fr) 2.25rem}") {
		t.Fatal("desktop user/avatar tracks changed")
	}
}

func TestCommunicationTranscriptAliasesShareUserBubbleLayout(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"ChatContainer", "MessageList", "MessageBubble", "MessageAvatar", "MessageHeader", "MessageFooter", "DateSeparator", "ScrollToBottomButton"} {
		t.Run(name, func(t *testing.T) {
			for _, grouped := range []bool{false, true} {
				var out bytes.Buffer
				err := RenderComponent(tpl, &out, Component{Chapter: "chat", Name: name, ID: "mobile-transcript", Props: map[string]any{
					"Items": []map[string]any{
						{"Value": "question", "Role": "user", "Avatar": "AP", "Content": "What does a lift do to a color?", "Grouped": grouped},
						{"Value": "answer", "Role": "assistant", "Avatar": "AI", "Content": "It blends toward white."},
					},
				}})
				if err != nil {
					t.Fatal(err)
				}
				for _, want := range []string{"ely-chat-message--user", "ely-chat-message--assistant", "What does a lift do to a color?", "It blends toward white.", "data-ely-scroll-bottom"} {
					if !strings.Contains(out.String(), want) {
						t.Errorf("grouped=%t: missing %q", grouped, want)
					}
				}
			}
		})
	}
}
