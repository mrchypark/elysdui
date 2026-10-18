package main

import (
	"bytes"
	"testing"

	"github.com/mrchypark/elysdui/sdui"
)

// Native resolution deliberately uses the semantic registry, not the HTML
// adapter's registry or compiled plan. Both clients consume this same contract.
func TestNativeScreensCompileWithSemanticRegistry(t *testing.T) {
	for name, source := range map[string][]byte{"profile": screenJSON, "controls": controlsJSON} {
		t.Run(name, func(t *testing.T) {
			screen, err := sdui.Decode(bytes.NewReader(source))
			if err != nil {
				t.Fatal(err)
			}
			registry, err := sdui.DefaultRegistry()
			if err != nil {
				t.Fatal(err)
			}
			plan, err := sdui.Compile(screen, registry)
			if err != nil {
				t.Fatal(err)
			}
			data := screenData("Ada", "", "")
			data["company"] = "Analytical Engines"
			data["notifications"] = true
			data["digestConsent"] = false
			data["colorTheme"] = "system"
			region, err := plan.ResolveNative(profileRegion, sdui.ResolveContext{Data: data}, sdui.NativeCapabilities())
			if err != nil {
				t.Fatal(err)
			}
			if region.ID != profileRegion || nodeByID(region, "display-name") == nil {
				t.Fatalf("missing native profile structure: %#v", region)
			}
		})
	}
}
