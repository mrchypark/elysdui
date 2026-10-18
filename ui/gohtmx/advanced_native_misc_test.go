package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestNativeMiscCallerContracts(t *testing.T) {
	tpl := nativeTemplates(t)
	cases := []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"Clock", map[string]any{"Label": "Caller home", "Moment": "2026-01-02T03:04:05Z", "TimeZone": "UTC"}, []string{`data-moment="2026-01-02T03:04:05Z"`, `data-time-zone="UTC"`, `Caller home`, `data-hand="second"`}},
		{"Stopwatch", map[string]any{"Elapsed": 123456.789}, []string{`data-elapsed="123456.789"`, `data-misc-laps`, `data-native-reset disabled>Lap`}},
		{"Calculator", map[string]any{"Value": "1234567.89123"}, []string{`data-value="1234567.89123"`, `data-native-calculator-key="AC"`, `data-native-calculator-key="±"`}},
		{"UnitConverter", map[string]any{"Value": "1234567.89123", "Categories": `[{"Value":"custom","Units":[{"Value":"a","Scale":2}]}]`, "From": "a", "To": "b"}, []string{`value="1234567.89123"`, `data-from="a"`, `data-to="b"`, `data-slot="select"`, `custom`}},
		{"QRCodeScanner", map[string]any{"URL": "/caller-frame.png", "Result": "caller:code"}, []string{`src="/caller-frame.png"`, `caller:code`}},
		{"Captcha", map[string]any{"URL": "/caller-captcha.png", "Ratio": 4, "Action": "caller-verify", "RefreshAction": "caller-refresh", "Name": "challenge", "State": "wrong"}, []string{`data-action="caller-verify"`, `data-refresh-action="caller-refresh"`, `name="challenge"`, `data-state="wrong"`, `data-ratio="4"`}},
		{"Poll", map[string]any{"Label": "Caller question", "Voted": "custom", "Options": []map[string]any{{"Value": "custom", "Label": "Caller option", "Count": 19}}, "Action": "caller-vote"}, []string{`data-voted="custom"`, `data-count="19"`, `data-action="caller-vote"`, `data-local="false"`}},
		{"Survey", map[string]any{"Action": "caller-submit", "Questions": []map[string]any{{"Value": "free", "Type": "text", "Label": "Caller question"}}}, []string{`data-action="caller-submit"`, `data-question="free"`, `<textarea`}},
		{"Quiz", map[string]any{"CorrectValue": "custom", "Options": []map[string]any{{"Value": "custom", "Label": "Caller answer"}}}, []string{`data-correct-answer="custom"`, `Caller answer`}},
		{"Flashcard", map[string]any{"Items": []map[string]any{{"Label": "Caller front", "Content": "Caller back"}}}, []string{`data-front="Caller front"`, `data-back="Caller back"`}},
		{"LicenseViewer", map[string]any{"Items": []map[string]any{{"Label": "Caller package", "Version": "9.2", "License": "Custom", "Content": "<plain license>"}}}, []string{`data-title="Caller package"`, `data-version="9.2"`, `data-content="&lt;plain license&gt;"`}},
		{"Terms", map[string]any{"Value": "Caller terms", "Action": "caller-accept", "DeclineAction": "caller-decline"}, []string{`Caller terms`, `data-action="caller-accept"`, `data-cancel-action="caller-decline"`}},
		{"CookieBanner", map[string]any{"CookieAction": "caller-cookies", "CookieKinds": []map[string]any{{"Value": "custom", "Label": "Caller cookies"}}}, []string{`data-action="caller-cookies"`, `value="custom"`, `checked disabled`}},
		{"ExportDialog", map[string]any{"Action": "caller-export", "Options": []map[string]any{{"Value": "custom", "Label": "Caller format"}}}, []string{`data-ely-submit="caller-export"`, `type="radio" name="format" value="custom"`}},
		{"ImportDialog", map[string]any{"Action": "caller-import", "Headers": []string{"Caller column"}, "Fields": []map[string]any{{"Value": "custom", "Required": true}}}, []string{`data-ely-submit="caller-import"`, `data-import-field="custom" data-required="true"`, `Caller column`}},
		{"CSVImporter", map[string]any{"CSV": "Name,Amount\nCaller,1234567.89123", "Fields": []map[string]any{{"Value": "Amount", "Required": true}}}, []string{`data-ely-submit="import-csv"`, `1234567.89123`, `data-csv-headed`}},
		{"HTMLPreview", map[string]any{"HTML": "<h1>Caller <script>bad()</script></h1>"}, []string{`sandbox=""`, `srcdoc="&lt;h1&gt;Caller`}},
		{"IframeEmbed", map[string]any{"URL": "https://example.org/caller", "Action": "caller-open"}, []string{`sandbox="" src="https://example.org/caller"`, `data-ely-action="caller-open"`}},
		{"PrintButton", map[string]any{"Action": "caller-print", "Label": "Caller print"}, []string{`data-ely-action="caller-print"`, `Caller print`}},
		{"ShareSheet", map[string]any{}, []string{`data-ely-action="share"`}},
		{"ChangeLog Viewer", map[string]any{"Value": "Caller release"}, []string{`Caller release`}},
		{"BarcodeDisplay", map[string]any{"Value": "12345678"}, []string{`<svg`, `12345678`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "misc", Name: tc.name, ID: "caller-misc", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(out.String(), want) {
					t.Fatalf("missing %q in %s", want, out.String())
				}
			}
		})
	}
}
