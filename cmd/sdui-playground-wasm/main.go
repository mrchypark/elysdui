//go:build js && wasm

// The browser worker loads this renderer and calls the synchronous string-only
// bridge. No network requests, DOM access, or server listener are used by Go.
package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"syscall/js"

	"github.com/mrchypark/elysdui/internal/playground"
)

func main() {
	var renderer *playground.BrowserRenderer
	init := js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) != 1 || args[0].Type() != js.TypeString {
			return `{"error":"stylesheet JSON string required"}`
		}
		var assets map[string]string
		if err := json.Unmarshal([]byte(args[0].String()), &assets); err != nil {
			return errorJSON(err)
		}
		for name, css := range assets {
			if !strings.HasPrefix(name, "assets/") || !strings.HasSuffix(name, ".css") || strings.Contains(name, "..") || strings.Contains(strings.ToLower(css), "</style") {
				return errorJSON(fmt.Errorf("invalid trusted stylesheet %q", name))
			}
		}
		next, err := playground.NewBrowserRenderer(func(name string) ([]byte, error) {
			css, ok := assets[name]
			if !ok {
				return nil, fmt.Errorf("stylesheet %q not loaded", name)
			}
			return []byte(css), nil
		})
		if err != nil {
			return errorJSON(err)
		}
		renderer = next
		return `{"ok":true}`
	})
	request := js.FuncOf(func(this js.Value, args []js.Value) any {
		if renderer == nil {
			return `{"status":503,"body":"{\"error\":\"Renderer is not initialized\"}"}`
		}
		if len(args) != 3 || args[0].Type() != js.TypeString || args[1].Type() != js.TypeString || args[2].Type() != js.TypeString {
			return `{"status":400,"body":"{\"error\":\"String request arguments required\"}"}`
		}
		return renderer.Request(args[0].String(), args[1].String(), args[2].String())
	})
	js.Global().Set("elyPlaygroundInit", init)
	js.Global().Set("elyPlaygroundRequest", request)
	select {}
}
func errorJSON(err error) string {
	b, _ := json.Marshal(map[string]string{"error": err.Error()})
	return string(b)
}
