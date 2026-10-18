package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestInteractionFeedbackCallerContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"Toast", map[string]any{"Items": []map[string]any{{"Label": "Caller toast <saved>", "Value": "custom", "Stay": 0, "Undo": true, "ActionLabel": "Restore", "Action": "restore-item", "Severity": "warning"}}}, []string{`Caller toast &lt;saved&gt;`, `data-feedback-stay="0"`, `role="alert"`, `data-ely-action="restore-item"`, `ely-interaction__toast-countdown`}},
		{"Notification", map[string]any{"Title": "Caller inbox", "Items": []map[string]any{{"Label": "Row", "Unread": true, "Dismissible": false, "Actions": []map[string]any{{"Label": "Review", "Action": "review-custom"}, {"Label": "Later", "Action": "later-custom"}}}}}, []string{`Caller inbox`, `data-interaction-unread`, `data-ely-action="review-custom"`, `data-ely-action="later-custom"`, `data-feedback-notification-empty`}},
		{"Alert", map[string]any{"Items": []map[string]any{{"Title": "Alert", "Dismissible": true, "RestoreLabel": "Restore alert", "Severity": "danger"}}}, []string{`is-danger`, `data-interaction-alert-dismiss`, `data-interaction-alert-show`}},
		{"Banner", map[string]any{"Title": "Caller banner", "Severity": "success", "Dismissible": false, "ActionLabel": "Continue", "Action": "continue-custom"}, []string{`role="status"`, `Caller banner`, `data-ely-action="continue-custom"`}},
		{"Callout", map[string]any{"Items": []map[string]any{{"Content": "One", "Severity": "info"}, {"Content": "Two", "Severity": "success"}, {"Content": "Three", "Severity": "warning"}, {"Content": "Four", "Severity": "danger"}}}, []string{`>Note</strong>`, `>Tip</strong>`, `>Warning</strong>`, `>Danger</strong>`, `<p>Four</p>`}},
		{"InlineMessage", map[string]any{"Label": "Caller status", "Severity": "error"}, []string{`is-error`, `Caller status`}},
		{"EmptyState", map[string]any{"Title": "Nothing here", "Icon": "inbox", "Content": "Caller content", "Actions": []map[string]any{{"Label": "Add", "Action": "add-custom"}}}, []string{`Nothing here`, `data-interaction-icon="inbox"`, `Caller content`, `data-ely-action="add-custom"`}},
		{"ErrorView", map[string]any{"Title": "Caller failure", "Code": "503", "Detail": "<error>", "ActionLabel": "Retry", "Action": "retry-custom"}, []string{`>503</span>`, `&lt;error&gt;`, `data-ely-action="retry-custom"`}},
		{"ErrorBoundary", map[string]any{"Content": "Healthy", "Error": "Caller error", "Detail": "Caller chain", "ActionLabel": "Retry", "Action": "retry-boundary"}, []string{`data-feedback-boundary-content hidden`, `data-feedback-boundary-error>`, `<p>Caller error</p>`, `Caller chain`, `data-ely-action="retry-boundary"`}},
		{"Result", map[string]any{"Title": "Done", "Severity": "error", "ActionLabel": "Retry", "Action": "result-retry"}, []string{`ely-interaction__result-mark`, `M23 23L41 41M41 23L23 41`, `data-ely-action="result-retry"`}},
		{"ConfirmationCard", map[string]any{"Title": "Delete?", "Destructive": true, "Value": "record-4", "Action": "delete-custom", "CancelAction": "keep-custom", "ConfirmMessage": "Deleted record", "Disabled": true}, []string{`value="record-4"`, `data-ely-action="delete-custom"`, `data-ely-action="keep-custom"`, `data-feedback-message="Deleted record"`, `data-feedback-button="danger" disabled`}},
		{"SavingIndicator", map[string]any{"Name": "sync", "Index": 1, "States": []map[string]any{{"State": "syncing", "Label": "Syncing 8 items", "Icon": "refresh-cw"}, {"State": "failed", "Label": "Sync failed", "Retry": true}}, "RetryAction": "sync-retry"}, []string{`data-feedback-status="sync"`, `data-interaction-saving-index="1"`, `Syncing 8 items`, `data-state="failed"`, `data-ely-action="sync-retry"`}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var body bytes.Buffer
			if err := RenderComponent(tpl, &body, Component{Chapter: "feedback", Name: tc.name, ID: "feedback-caller", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(body.String(), want) {
					t.Errorf("missing %s in %s", want, body.String())
				}
			}
		})
	}
}

func TestInteractionFeedbackOptionalControls(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name   string
		props  map[string]any
		absent string
	}{
		{"Banner", map[string]any{"Dismissible": false}, `data-interaction-banner-dismiss`},
		{"Notification", map[string]any{"Items": []map[string]any{{"Label": "Read only", "Dismissible": false}}}, `data-interaction-notification-dismiss`},
		{"ErrorBoundary", map[string]any{"Content": "Healthy"}, `data-feedback-boundary-toggle`},
		{"SavingIndicator", map[string]any{"State": "saved", "Value": "Saved"}, `data-interaction-saving-next`},
	} {
		var body bytes.Buffer
		if err := RenderComponent(tpl, &body, Component{Chapter: "feedback", Name: tc.name, ID: "feedback-static", Props: tc.props}); err != nil {
			t.Fatal(err)
		}
		if strings.Contains(body.String(), tc.absent) {
			t.Errorf("%s unexpectedly has %s", tc.name, tc.absent)
		}
	}
}
