package sdui_test

import (
	"bytes"
	"github.com/mrchypark/ely-htmx/sdui"
	"strings"
	"testing"
)

func TestErrorBoundarySDUIRetryContract(t *testing.T) {
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	plan, err := sdui.Compile(sdui.Screen{Version: sdui.Version, ID: "boundary-screen", Root: sdui.Node{ID: "result", Type: "region", Children: []sdui.Node{{ID: "boundary", Type: "feedback/ErrorBoundary", Props: map[string]any{"error": "safe <failure>", "action": "retry-owned"}, Event: &sdui.Event{On: "ely:action", Action: "reload", Target: "result"}}}}}, registry)
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := plan.Render(&out, sdui.RenderContext{Endpoint: "/sdui/action", CSRF: "test"}); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`data-sdui-on="ely:action"`, `data-sdui-action="reload"`, `data-ely-action="retry-owned"`, `>Try again</button>`, `<code>safe &lt;failure&gt;</code>`} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("missing %q in %s", want, out.String())
		}
	}
}
