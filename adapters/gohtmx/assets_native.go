//go:build !js || !wasm

package gohtmx

import "embed"

//go:embed assets/*
var bridgeFiles embed.FS
