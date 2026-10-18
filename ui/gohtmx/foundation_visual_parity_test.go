package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestFoundationVisualRepairKeepsCallerContent(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		chapter, kind string
		props         map[string]any
		wants         []string
	}{
		{"primitives", "Fragment", map[string]any{"Before": "caller before", "Value": "caller middle", "After": "caller after"}, []string{`<span>caller before</span>`, `<span data-foundation-fragment-value>caller middle</span>`, `<code>caller after</code>`}},
		{"layout", "Container", map[string]any{"Value": "caller container"}, []string{"caller container"}},
		{"primitives", "Clipboard", map[string]any{"Value": "caller secret", "Label": "Copy caller", "PasteLabel": "Paste caller", "Disabled": true}, []string{`data-foundation-copy>caller secret`, `data-foundation-copy-button disabled`, `data-foundation-paste-button disabled`, `aria-live="polite"`}},
		{"primitives", "Icon", map[string]any{"IconSamples": []map[string]any{{"Name": "star", "Size": 20, "Label": "caller star"}}}, []string{`data-foundation-icon="star"`, `data-foundation-icon-size="20"`, `caller star`}},
	} {
		t.Run(tc.kind, func(t *testing.T) {
			tc.props["Kind"] = tc.kind
			var out bytes.Buffer
			if err := tpl.ExecuteTemplate(&out, "ely-api-"+tc.chapter, tc.props); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.wants {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q: %s", want, out.String())
				}
			}
		})
	}
}

func TestNativeShellCrashReportToolbar(t *testing.T) {
	tpl := nativeTemplates(t)
	var out bytes.Buffer
	err := tpl.ExecuteTemplate(&out, "native-component", map[string]any{"Kind": "CrashReporter", "Value": "caller report", "Details": true, "CopyAction": "caller-copy"})
	if err != nil {
		t.Fatal(err)
	}
	body := out.String()
	copyAt := strings.Index(body, `data-shell-copy`)
	detailsAt := strings.Index(body, `<details open`)
	if copyAt < 0 || detailsAt < copyAt || !strings.Contains(body, `data-action="caller-copy"`) || !strings.Contains(body, `<pre>caller report</pre>`) {
		t.Fatal("copy must precede details without narrowing caller report: " + body)
	}
}
