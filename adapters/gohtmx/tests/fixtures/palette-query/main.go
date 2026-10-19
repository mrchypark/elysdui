// Command palette-query dumps fixtures compiled by the actual SDUI catalogue.
// It never substitutes client behavior or starts a server or browser.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	gohtmx "github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/palettefixture"
)

// These literal wire rows are independent of the standalone PascalCase props.
const primaryRows = `[
 {"label":"Open","value":"open-file","action":"open-command","group":"Commands"},
 {"label":"Option","value":"option-file","action":"option-command","group":"Commands"},
 {"label":"Other place","value":"other-place","action":"other-command","group":"Commands"},
 {"label":"Open disabled","value":"disabled-open","action":"disabled-command","group":"Commands","disabled":true},
 {"label":"Zebra","value":"zebra-file","action":"zebra-command","group":"Commands"}
]`
const peerRows = `[
 {"label":"Open","value":"peer-open","action":"open-command","group":"Commands"},
 {"label":"Option","value":"peer-option","action":"option-command","group":"Commands"},
 {"label":"Other place","value":"peer-other","action":"other-command","group":"Commands"},
 {"label":"Open disabled","value":"peer-disabled","action":"disabled-command","group":"Commands","disabled":true},
 {"label":"Zebra","value":"peer-zebra","action":"zebra-command","group":"Commands"}
]`

func wireScreen(spec palettefixture.Spec) ([]byte, error) {
	events := []map[string]any{}
	for _, sourceAction := range []string{"open-command", "option-command", "other-command", "disabled-command", "zebra-command"} {
		events = append(events, map[string]any{
			"on": "ely:action", "sourceAction": sourceAction, "action": "command-observed", "target": spec.OwnerID + "-result",
			"payload": map[string]any{
				"commandAction": map[string]string{"path": "/action", "type": "string"},
				"commandValue":  map[string]string{"path": "/value", "type": "string"},
				"ownerID":       map[string]string{"path": "/id", "type": "string"},
				"component":     map[string]string{"path": "/component", "type": "string"},
			},
		})
	}
	rows := json.RawMessage(primaryRows)
	if spec.Peer {
		rows = json.RawMessage(peerRows)
	}
	return json.Marshal(map[string]any{
		"version": "1", "id": spec.OwnerID + "-screen",
		"root": map[string]any{"id": spec.OwnerID + "-stack", "type": "stack", "children": []any{
			map[string]any{"id": spec.ComponentID, "type": "navigation/CommandPalette", "props": map[string]any{
				"label": "Command search", "name": spec.QueryName, "value": "", "placeholder": "Type a command", "items": rows,
			}, "events": events},
			map[string]any{"id": spec.OwnerID + "-result", "type": "region", "children": []any{
				map[string]any{"id": spec.OwnerID + "-result-text", "type": "text", "bindings": map[string]string{"text": "/result"}},
			}},
		}},
	})
}

func renderContext(message string) gohtmx.RenderContext {
	return gohtmx.RenderContext{Data: map[string]any{"result": message}, Endpoint: "/sdui-action", CSRF: "palette-query-fixture", RequestCompression: &gohtmx.RequestCompressionOptions{Disabled: true, Codecs: []string{}}}
}

func plans() (map[string]*gohtmx.Plan, error) {
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		return nil, err
	}
	result := map[string]*gohtmx.Plan{}
	for _, spec := range []palettefixture.Spec{palettefixture.Primary("original"), palettefixture.Peer()} {
		raw, err := wireScreen(spec)
		if err != nil {
			return nil, err
		}
		screen, err := gohtmx.Decode(bytes.NewReader(raw))
		if err != nil {
			return nil, err
		}
		plan, err := gohtmx.Compile(screen, registry)
		if err != nil {
			return nil, err
		}
		result[spec.OwnerID] = plan
	}
	return result, nil
}

func main() {
	surface := flag.String("surface", "sdui", "sdui")
	route := flag.String("dump", "/", "render /, /fragment, /manifest.json, or /sdui-response-{primary,peer} to stdout")
	flag.Parse()
	if flag.NArg() != 0 {
		panic("unexpected fixture arguments")
	}
	if err := dump(os.Stdout, *surface, *route); err != nil {
		panic(err)
	}
}

func dump(w io.Writer, surface, route string) error {
	if surface != "sdui" {
		return fmt.Errorf("invalid adapter surface %q", surface)
	}
	compiled, err := plans()
	if err != nil {
		return err
	}
	primary := compiled["palette-primary"]
	render := func(w io.Writer, spec palettefixture.Spec) error {
		return compiled[spec.OwnerID].Render(w, renderContext("No command observed"))
	}
	switch route {
	case "/":
		return palettefixture.WritePage(w, surface, render, primary.RenderAssets)
	case "/fragment":
		return palettefixture.WriteOwner(w, render, palettefixture.Primary("fresh"))
	case "/manifest.json":
		return palettefixture.WriteManifest(w, surface, map[string]any{
			"routes":       []string{"/", "/fragment", "/manifest.json", "/sdui-response-primary", "/sdui-response-peer"},
			"sduiEndpoint": "/sdui-action", "sduiCSRF": "palette-query-fixture", "sduiAction": "command-observed",
			"sduiTargets":       []string{"palette-primary-result", "palette-peer-result"},
			"sduiPayload":       map[string]string{"commandAction": "/action", "commandValue": "/value", "ownerID": "/id", "component": "/component"},
			"identities":        identities(),
			"sduiSourceActions": []string{"open-command", "option-command", "other-command", "disabled-command", "zebra-command"},
			"sduiQueryBinding":  false, "sduiRootIdentity": "generated internal family ID inside the named catalogue node",
		})
	case "/sdui-response-primary":
		return primary.RenderRegion(w, "palette-primary-result", renderContext("Command observed"))
	case "/sdui-response-peer":
		return compiled["palette-peer"].RenderRegion(w, "palette-peer-result", renderContext("Command observed"))
	default:
		return fmt.Errorf("unknown adapter fixture route %q", route)
	}
}

// The generated IDs follow the actual compiler's screen/node identity formula;
// fixture tests compare these manifest identities to production-rendered DOM.
func identities() []palettefixture.Identity {
	result := []palettefixture.Identity{}
	for _, spec := range []palettefixture.Spec{palettefixture.Primary("original"), palettefixture.Peer()} {
		screenID := spec.OwnerID + "-screen"
		familyID := fmt.Sprintf("sdui-internal-%x", sha256.Sum256([]byte(screenID+"\x00"+spec.ComponentID)))
		result = append(result, palettefixture.Identity{OwnerID: spec.OwnerID, ScreenID: screenID, NodeID: spec.ComponentID, FamilyID: familyID, DialogID: familyID + "-palette", ResultID: spec.OwnerID + "-result"})
	}
	return result
}
