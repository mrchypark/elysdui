// A read-only, no-key map tile consumer. Run: go run ./examples/map-tiles.
package main

import (
	"bytes"
	_ "embed"
	"flag"
	"log"
	"net/http"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

//go:embed host.js
var hostScript []byte

const page = `{{define "page"}}<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Host-owned map tiles</title><link rel="stylesheet" href="/assets/app.css">
{{template "ui-component-assets"}}{{template "ui-map-assets"}}<script src="/host.js" defer></script>
</head><body><main><h1>Host-owned raster tiles</h1>
<p>Bundled Natural Earth tiles, zooms 0–3. No account, API key, or tile service.</p>
{{template "map-view" (dict "ID" "raster-map" "TileProvider" "natural-earth" "Label" "Local raster map" "Center" (dict "Latitude" 0 "Longitude" 0) "Zoom" 1 "Width" 800 "Height" 600 "ShowReset" true "HideCoordinates" true "Points" (list (dict "Latitude" 0 "Longitude" 0 "Label" "Origin" "Value" "Local marker")) "Routes" (list (dict "Points" (list (dict "Latitude" 0 "Longitude" -40) (dict "Latitude" 30 "Longitude" 40)))))}}
<h2>Default SVG map</h2><p>Omitting TileProvider preserves the original local geometry renderer.</p>
{{template "map-view" (dict "ID" "svg-map" "Label" "Default local SVG map" "Width" 800 "Height" 240 "Zoom" 1 "Attribution" "Land: Natural Earth" "HideCoordinates" true)}}
</main></body></html>{{end}}`

func newHandler() (http.Handler, error) {
	templates, err := ui.NewTemplates()
	if err != nil {
		return nil, err
	}
	if _, err = templates.Parse(page); err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	if err = ui.BindAssets(mux); err != nil {
		return nil, err
	}
	mux.HandleFunc("GET /host.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		_, _ = w.Write(hostScript)
	})
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		var output bytes.Buffer
		if err := templates.ExecuteTemplate(&output, "page", nil); err != nil {
			http.Error(w, "render failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(output.Bytes())
	})
	return mux, nil
}
func main() {
	address := flag.String("addr", "127.0.0.1:8096", "listen address")
	flag.Parse()
	handler, err := newHandler()
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("Open http://%s", *address)
	log.Fatal(http.ListenAndServe(*address, handler))
}
