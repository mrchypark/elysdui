package gohtmx_test

import (
	"bytes"
	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
	"strings"
	"testing"
)

func TestNavigationSelectionTypedContracts(t *testing.T) {
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ kind, props, want string }{
		{"navigation/Tabs", `{"value":"b","contextAction":"tab-menu","items":[{"value":"a","selected":true},{"value":"b"}]}`, `data-interaction-tab-context="tab-menu"`},
		{"buttons/SegmentedControl", `{"value":"b","name":"view","items":[{"value":"a"},{"value":"b"}]}`, `name="view"`},
		{"buttons/ToggleGroup", `{"name":"format","size":"sm","items":[{"value":"bold","icon":"bold","ariaLabel":"Bold"}]}`, `data-interaction-button-icon="bold"`},
	} {
		t.Run(tc.kind, func(t *testing.T) {
			raw := `{"version":"1","id":"screen","root":{"id":"selection","type":"` + tc.kind + `","props":` + tc.props + `}}`
			screen, err := sdui.Decode(strings.NewReader(raw))
			if err != nil {
				t.Fatal(err)
			}
			plan, err := sdui.Compile(screen, registry)
			if err != nil {
				t.Fatal(err)
			}
			var out bytes.Buffer
			if err := plan.Render(&out, sdui.RenderContext{Endpoint: "/sdui", CSRF: "test"}); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(out.String(), tc.want) {
				t.Fatalf("missing %s in %s", tc.want, out.String())
			}
		})
	}
}
