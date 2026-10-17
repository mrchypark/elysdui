package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestErrorBoundaryResultContract(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name         string
		props        map[string]any
		want, absent []string
	}{
		{"retry callback defaults", map[string]any{"Error": "failed <safe>", "Action": "retry-owned"}, []string{`data-ely-action="retry-owned"`, `>Try again</button>`, `<code>failed &lt;safe&gt;</code>`, `data-feedback-boundary-content hidden`}, nil},
		{"no callback", map[string]any{"Error": "failed"}, []string{`<code>failed</code>`}, []string{`data-ely-action=`}},
		{"custom retry and chain", map[string]any{"Error": "failed", "Detail": "cause <chain>", "Action": "reload", "ActionLabel": "Reload", "Disabled": true}, []string{`<code>cause &lt;chain&gt;</code>`, ` disabled>Reload</button>`}, []string{`>Try again</button>`}},
		{"recovered caller result", map[string]any{"Content": "healthy <safe>", "Action": "reload"}, []string{`data-feedback-boundary-content>healthy &lt;safe&gt;</div>`, `data-feedback-boundary-error hidden`}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "feedback", Name: "ErrorBoundary", ID: "boundary-contract", Props: tc.props}); err != nil {
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
