//go:build !js || !wasm

package ui

import "embed"

// Files contains shared templates and catalogue data. Native builds also include browser assets.
//
//go:embed templates/*.html assets/* components.json LICENSE THIRD_PARTY_UI.md
var Files embed.FS
