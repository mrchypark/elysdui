// Run with go run ./examples/gohtmx/timeseries.
package main

import (
	_ "embed"
	"flag"
	"log"
	"net/http"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

//go:embed index.html
var page []byte

func newHandler() (http.Handler, error) {
	mux := http.NewServeMux()
	if err := ui.BindAssets(mux); err != nil {
		return nil, err
	}
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(page)
	})
	return mux, nil
}

func main() {
	address := flag.String("addr", "127.0.0.1:8097", "HTTP listen address")
	flag.Parse()
	handler, err := newHandler()
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("Listening on %s", *address)
	log.Fatal(http.ListenAndServe(*address, handler))
}
