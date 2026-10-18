package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestMailCallerParity(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name         string
		props        map[string]any
		want, absent []string
	}{
		{"MailboxList", map[string]any{"Value": "box", "Sections": []map[string]any{{"Label": "Folders", "Items": []map[string]any{{"Value": "box", "Label": "Caller box", "Unread": 12}}}}}, []string{"Folders", "Caller box", "<b>12</b>", `aria-selected="true"`, `value="box"`}, nil},
		{"FolderList", map[string]any{"Disabled": true, "Items": []map[string]any{{"Value": "legacy", "Name": "Legacy box", "Content": "9"}}}, []string{"Legacy box", "<small>9</small>", "disabled"}, nil},
		{"MailItem", map[string]any{"Items": []map[string]any{{"Value": "mail", "Label": "Author", "Title": "Subject", "Content": "Snippet", "Time": "09:30", "Unread": true, "Selected": true, "Attachments": 3, "Starred": true}}}, []string{"data-unread", `aria-selected="true"`, `aria-pressed="true"`, "3 attachments", "09:30"}, nil},
		{"InboxZeroState", map[string]any{"Title": "Empty", "Content": "Nothing here"}, []string{"Empty", "Nothing here", `data-ely-action="refresh"`}, nil},
		{"InboxZeroState", map[string]any{"Action": "open-mailbox", "ActionLabel": "Archive", "Value": "archive"}, []string{`data-ely-action="open-mailbox"`, `value="archive"`}, nil},
		{"MailReader", map[string]any{"Subject": "Caller subject", "From": "from@test.example", "Content": "<script>body</script>", "Quote": "Quoted", "Value": "message", "Files": []map[string]any{{"Value": "file", "Name": "notes.pdf", "Size": "2 MB"}}}, []string{"Caller subject", "from@test.example", "&lt;script&gt;body&lt;/script&gt;", "<details", "Quoted", `value="message"`, `data-file-id="file"`, "notes.pdf"}, []string{"<script>"}},
		{"QuotedText", map[string]any{"QuoteParagraphs": []string{"Earlier author", "Earlier body"}}, []string{"<details", "Earlier author", "Earlier body"}, []string{`data-ely-action="reply"`}},
		{"MailThreadView", map[string]any{"Subject": "Thread", "Items": []map[string]any{{"Value": "a", "Label": "A", "Content": "First"}, {"Value": "b", "Label": "B", "Content": "Last"}}}, []string{"Thread", `data-mail-message="a"`, `data-mail-message="b"`, "data-ely-mail-thread-message open", "data-ely-mail-thread-close"}, nil},
		{"MailComposer", map[string]any{"To": "ana@test.example", "Cc": "ben@test.example", "Bcc": "dev@test.example", "Subject": "Caller subject", "Value": "Caller body", "Signature": "Caller signature", "Contacts": []map[string]any{{"Label": "Ana", "Email": "ana@test.example"}}, "Files": []map[string]any{{"Value": "file", "Name": "notes.pdf", "Size": "2 MB"}}}, []string{`data-ely-submit="send"`, `type="email" multiple name="to" value="ana@test.example"`, `name="cc" value="ben@test.example"`, `name="bcc" value="dev@test.example"`, "Caller subject", "Caller body", "Caller signature", `name="attachment" value="file"`, "attach-file", "discard"}, nil},
		{"RecipientInput", map[string]any{"Disabled": true, "To": "caller@test.example"}, []string{"fieldset disabled", `value="caller@test.example"`, "data-ely-mail-address"}, nil},
		{"RecipientInput", map[string]any{"Contacts": []map[string]any{{"Email": "contact@test.example", "Label": "Contact"}}}, []string{"<datalist", `value="contact@test.example"`}, nil},
		{"SignatureEditor", map[string]any{"Name": "signoff", "Value": "One\nTwo"}, []string{`name="signoff"`, "One\nTwo", "Under each message", "data-ely-preview"}, nil},
		{"LabelPicker", map[string]any{"Items": []map[string]any{{"Value": "label", "Label": "<Label>", "Selected": true, "Hue": 3}}}, []string{"&lt;Label&gt;", `aria-pressed="true"`, `data-mail-hue="3"`, "data-ely-mail-label-create"}, []string{"<Label>"}},
		{"SnoozePicker", map[string]any{"Until": "2027-10-13T12:00", "Presets": []map[string]any{{"Label": "Caller time", "Value": "2027-10-14T08:00"}}}, []string{`data-ely-submit="snooze"`, `name="until" value="2027-10-13T12:00"`, "Caller time", "Pick a time…", `name="instant"`}, nil},
		{"ScheduleSend", map[string]any{"SendAt": "2027-10-13T13:00", "Disabled": true}, []string{`data-ely-submit="schedule-send"`, `name="send_at" value="2027-10-13T13:00"`, `data-ely-action="send"`, "disabled"}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "mail", Name: tc.name, ID: "mail-caller", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q in %s", want, out.String())
				}
			}
			for _, absent := range tc.absent {
				if strings.Contains(out.String(), absent) {
					t.Errorf("unexpected %q", absent)
				}
			}
		})
	}
}
