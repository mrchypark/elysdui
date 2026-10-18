package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestMessagingCallerParity(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name         string
		props        map[string]any
		want, absent []string
	}{
		{"ChannelList", map[string]any{"Value": "general", "Items": []map[string]any{{"Value": "general", "Label": "General", "Unread": 12}}}, []string{`value="general"`, `aria-selected="true"`, `data-ely-unread>12`}, nil},
		{"ChatList", map[string]any{"Items": []map[string]any{{"Value": "quiet", "Label": "Quiet", "Muted": true, "Unread": 31}}}, []string{"Quiet", "Muted"}, []string{"data-ely-unread"}},
		{"DirectMessageItem", map[string]any{"Value": "ana", "Label": "Ana", "Avatar": "AL", "Presence": "online"}, []string{`value="ana"`, `data-presence="online"`, `>AL</span>`}, nil},
		{"ChannelHeader", map[string]any{"Title": "Private team", "Actions": []map[string]any{{"Value": "team", "Label": "Members", "Action": "members"}}}, []string{`data-ely-action="members"`, `value="team"`}, nil},
		{"PinnedMessages", map[string]any{"Items": []map[string]any{{"Value": "pin", "Label": "Pinned text", "Author": "Ana", "Time": "3 hours ago"}}}, []string{`data-ely-pin-count>1`, `Ana · 3 hours ago`, `value="pin"`, `data-ely-unpin`}, nil},
		{"PinnedMessages", map[string]any{}, []string{`data-ely-pin-count>0`, `data-ely-pins-empty>Nothing pinned yet.`}, nil},
		{"ChatMessage", map[string]any{"Messages": []map[string]any{{"Value": "m1", "Content": "<script>unsafe</script>", "Grouped": true, "Time": "09:03", "Unread": true, "Reactions": []map[string]any{{"Value": "👍", "Count": 3, "Selected": true}}}}}, []string{`role="separator">New`, `ely-messaging-run-time">09:03`, `aria-pressed="true"`, `value="m1"`, `&lt;script&gt;`}, []string{`<header>`, `<script>`}},
		{"UnreadDivider", map[string]any{}, []string{`role="separator"`}, []string{`data-message-id`}},
		{"TypingIndicator", map[string]any{"TypingLabel": "Ana is typing"}, []string{`aria-live="polite">Ana is typing`}, []string{`data-message-id`}},
		{"MessageReactions", map[string]any{"Value": "m1", "Reaction": "♥", "Count": 2}, []string{`data-ely-react`, `value="m1"`}, nil},
		{"ThreadPanel", map[string]any{"Open": false, "Chat": "# design", "Root": map[string]any{"Author": "Ana", "Content": "Original"}, "Items": []map[string]any{{"Author": "Ben", "Content": "Reply"}}}, []string{`data-ely-thread-panel hidden`, `Original`, `Reply`, `1 replies`, `data-ely-submit="send-message"`}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "messaging", Name: tc.name, ID: "caller", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q in %s", want, out.String())
				}
			}
			for _, absent := range tc.absent {
				if strings.Contains(out.String(), absent) {
					t.Errorf("unexpected %q in %s", absent, out.String())
				}
			}
		})
	}
}
