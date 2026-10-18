package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestInteractionOverlayCallerContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name         string
		props        map[string]any
		want, absent []string
	}{
		{"Popover", map[string]any{"Label": "Share", "Title": "Caller panel", "Items": []map[string]any{{"Label": "Public", "Toggle": true, "Selected": true, "Action": "set-public"}, {"Label": "Copy", "Action": "caller-copy", "Value": "url"}}}, []string{`data-interaction-popover hidden`, `role="switch" aria-checked="true"`, `data-ely-action="caller-copy"`, `aria-label="Caller panel"`}, nil},
		{"HoverCard", map[string]any{"Label": "@caller", "Title": "Caller <name>", "Items": []map[string]any{{"Label": "Follow", "Action": "follow-caller"}}}, []string{`data-interaction-hover="500"`, `data-interaction-hover-panel hidden`, `Caller &lt;name&gt;`, `data-ely-action="follow-caller"`}, nil},
		{"Dialog", map[string]any{"Presentation": "alert", "Title": "Acknowledge", "Action": "ack"}, []string{`role="alertdialog"`, `data-interaction-dismissible="false"`, `data-ely-action="ack"`}, []string{`data-interaction-close`}},
		{"Dialog", map[string]any{"Presentation": "prompt", "Name": "rename", "Value": "Report", "TrimRequired": true, "Disallow": "/", "Action": "rename-caller", "Disabled": true}, []string{`data-interaction-dialog-form`, `data-interaction-trim-required`, `data-interaction-disallow="/"`, `name="rename"`, `disabled required`}, nil},
		{"Dialog", map[string]any{"Presentation": "modal", "Dismissible": false, "Fields": []map[string]any{{"Label": "Email", "Name": "email", "Type": "email", "Required": true}}}, []string{`type="email"`, `data-interaction-dismissible="false"`}, []string{`data-interaction-close`}},
		{"Lightbox", map[string]any{"Items": []map[string]any{{"Label": "Photo", "Src": "/caller.jpg", "Alt": "Caller photo"}}}, []string{`data-lightbox-src="/caller.jpg"`, `data-lightbox-alt="Caller photo"`, `data-interaction-lightbox-previous`, `data-interaction-lightbox-next`}, nil},
		{"Spotlight", map[string]any{"Steps": []map[string]any{{"Title": "Caller stop", "Target": "#caller-target", "Content": "Caller instructions"}}}, []string{`data-interaction-tour-target="#caller-target"`, `data-interaction-tour-ring`, `Caller instructions`}, nil},
		{"FloatingToolbar", map[string]any{"Selection": true, "Value": "Caller text", "Items": []map[string]any{{"Label": "Strong", "Action": "format-strong", "Disabled": true}}}, []string{`data-interaction-selection-field`, `value="Caller text"`, `data-ely-action="format-strong" disabled`, `aria-label="Selection tools" hidden`}, nil},
		{"Callout", map[string]any{"Toggle": true, "Open": true, "Label": "Definition", "Title": "caller.go", "Content": "Caller body"}, []string{`aria-expanded="true"`, `data-interaction-peek-close`, `Caller body`}, []string{`class="ely-interaction__callout" hidden`}},
		{"Tooltip", map[string]any{"Label": "Help", "Content": "Caller help", "Delay": 0}, []string{`data-interaction-hover="0"`, `role="tooltip" data-interaction-hover-panel hidden`}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var body bytes.Buffer
			if err := RenderComponent(tpl, &body, Component{Chapter: "overlays", Name: tc.name, ID: "overlay-caller", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(body.String(), want) {
					t.Errorf("missing %s in %s", want, body.String())
				}
			}
			for _, absent := range tc.absent {
				if strings.Contains(body.String(), absent) {
					t.Errorf("unexpected %s in %s", absent, body.String())
				}
			}
		})
	}
}
