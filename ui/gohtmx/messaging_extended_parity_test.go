package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestMessagingExtendedCallerContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name         string
		props        map[string]any
		want, absent []string
	}{
		{"ReadReceipt", map[string]any{"Status": "Read", "Readers": []map[string]any{{"Label": "A"}, {"Label": "B"}, {"Label": "C"}, {"Label": "D"}, {"Label": "E"}}}, []string{"Seen by", "<small>+2</small>"}, nil},
		{"ReadReceipt", map[string]any{"Status": "Sent", "Content": "Legacy receipt"}, []string{"Legacy receipt", ">Sent</output>"}, []string{"Seen by"}},
		{"MemberList", map[string]any{"Value": "custom", "Items": []map[string]any{{"Value": "custom", "Label": "<Caller>", "Presence": "busy", "Role": "Owner", "StatusText": "Drawing", "Zone": "Europe/Paris", "Actions": []map[string]any{{"Action": "custom-message", "Label": "Write"}}}}}, []string{"&lt;Caller&gt;", "data-ely-member", "Owner", "Drawing", `aria-selected="true"`, `data-zone="Europe/Paris"`, `data-ely-action="custom-message"`, `value="custom"`}, []string{"<Caller>"}},
		{"UserProfileCard", map[string]any{"Title": "Caller card", "Presence": "online", "JobTitle": "Engineer", "Content": "Legacy bio", "Zone": "UTC"}, []string{"Caller card", "Engineer", "Legacy bio", `data-zone="UTC"`}, []string{"data-ely-members"}},
		{"OnlineStatus", map[string]any{"Status": "Away"}, []string{">Away</output>"}, nil},
		{"StatusSetter", map[string]any{"Name": "availability", "Value": "Caller status", "Emoji": "🌴", "ClearAfter": "1 hour", "ClearOptions": []string{"Today", "1 hour"}, "SavedStatus": "Saved"}, []string{`name="availability"`, `value="Caller status"`, `name="emoji"`, `name="clear_after"`, "<option selected>1 hour</option>", `data-ely-submit="status"`, "clear-status"}, nil},
		{"CallControls", map[string]any{"Value": "room", "Mic": false, "Camera": false, "Share": true}, []string{`data-ely-call-toggle="mic"`, `data-ely-call-toggle="camera"`, `data-ely-call-toggle="share"`, `data-ely-action="end-call"`, `value="room"`}, nil},
		{"VoiceCallBar", map[string]any{"Title": "Caller room", "Duration": "12:34"}, []string{"Caller room", "12:34", "data-ely-call-toggle"}, []string{`data-ely-call-toggle="camera"`}},
		{"HuddleIndicator", map[string]any{"Count": 7, "Value": "huddle"}, []string{`data-ely-action="join-call"`, "♧ 7", `value="huddle"`}, []string{"data-ely-call-toggle"}},
		{"ParticipantTile", map[string]any{"Title": "Caller tile", "URL": "/frame.jpg", "Alt": "Camera frame", "Status": "Legacy state", "Ratio": 2, "Muted": true, "Speaking": true}, []string{`src="/frame.jpg"`, `alt="Camera frame"`, `data-ely-ratio="2"`, `data-speaking="true"`, "Muted", "Caller tile", "Legacy state"}, nil},
		{"VideoCallGrid", map[string]any{"Items": []map[string]any{{"Label": "Camera off", "Avatar": "CO"}}}, []string{"data-ely-video-grid", "Camera off", "CO"}, []string{"<img"}},
		{"ScreenShareView", map[string]any{"Title": "Presenter", "CanStop": true, "Value": "share", "URL": "/screen.jpg", "Content": "Legacy caption", "Ratio": 1.6}, []string{"You are presenting", "stop-presenting", `value="share"`, "Legacy caption", `data-ely-ratio="1.6"`}, nil},
		{"ScreenShareView", map[string]any{"Presenter": "Ana"}, []string{"Ana is presenting", "Waiting for Ana"}, []string{"stop-presenting", "<img"}},
		{"IncomingCallDialog", map[string]any{"Title": "Caller", "Content": "Voice", "Value": "caller-id", "Disabled": true}, []string{"Caller", "Voice", "accept-call", "decline-call", `value="caller-id"`, "disabled", "data-ely-incoming"}, nil},
		{"StickerPicker", map[string]any{"Disabled": true, "Items": []map[string]any{{"Value": "legacy", "Label": "Legacy sticker", "URL": "/sticker.png"}}}, []string{"Legacy sticker", `value="legacy"`, `src="/sticker.png"`, "data-ely-media-pick", "disabled"}, nil},
		{"GifPicker", map[string]any{"Items": []map[string]any{{"Value": "gif", "Label": "Caller GIF", "URL": "/a.gif", "Ratio": 2.2}}}, []string{`data-local-results="false"`, `data-ely-ratio="2.2"`, "Caller GIF"}, nil},
		{"GifPicker", map[string]any{"Loading": true}, []string{`aria-busy="true"`, "Searching GIFs"}, []string{"No GIFs match", "data-ely-media-pick value"}},
		{"GifPicker", map[string]any{}, []string{"No GIFs match"}, nil},
		{"GifPicker", map[string]any{"Items": []map[string]any{{"Name": "Legacy name", "Content": "Legacy description", "Value": "legacy"}}}, []string{"Legacy name", "Legacy description", `data-ely-value="legacy"`}, nil},
		{"CallControls", map[string]any{"Status": "Caller connection state"}, []string{"Caller connection state"}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "messaging", Name: tc.name, ID: "extended", Props: tc.props}); err != nil {
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
