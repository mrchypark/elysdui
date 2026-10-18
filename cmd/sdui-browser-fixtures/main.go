// Command sdui-browser-fixtures is a test-only loopback server. It reads caller
// fixtures from the working tree; production sdui never imports this data.
package main

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
)

type fixture struct {
	Name  string         `json:"name"`
	Props map[string]any `json:"props"`
}

func main() {
	raw, err := os.ReadFile("adapters/gohtmx/testdata/catalogue_fixtures.json.gz")
	if err != nil {
		log.Fatal(err)
	}
	compressed, err := gzip.NewReader(bytes.NewReader(raw))
	if err != nil {
		log.Fatal(err)
	}
	raw, err = io.ReadAll(io.LimitReader(compressed, 32<<20))
	compressed.Close()
	if err != nil {
		log.Fatal(err)
	}
	var all []fixture
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&all); err != nil {
		log.Fatal(err)
	}
	fixtures := []fixture{}
	seen := map[string]bool{}
	for _, f := range all {
		if !seen[f.Name] {
			seen[f.Name] = true
			fixtures = append(fixtures, f)
		}
	}
	// Tests explicitly authorize external URLs, then intercept every such request
	// in Chromium. No external provider, permission, or account is required.
	registry, err := sdui.CatalogueRegistry(sdui.WithURLPolicy(func(string, string) bool { return true }))
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	if err := sdui.BindAssets(mux); err != nil {
		log.Fatal(err)
	}
	mux.HandleFunc("GET /manifest", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		names := []string{}
		for _, f := range fixtures {
			names = append(names, f.Name)
		}
		json.NewEncoder(w).Encode(names)
	})
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		q, err := url.ParseQuery(r.URL.RawQuery)
		if err != nil {
			http.Error(w, "invalid query", 400)
			return
		}
		for key := range q {
			if key != "page" {
				http.Error(w, "unknown query", 400)
				return
			}
		}
		if values, exists := q["page"]; exists && (len(values) != 1 || values[0] == "") {
			http.Error(w, "invalid page", 400)
			return
		}
		page := 0
		if text := q.Get("page"); text != "" {
			n, err := strconv.Atoi(text)
			if err != nil || n < 0 || strconv.Itoa(n) != text || len(q["page"]) != 1 {
				http.Error(w, "invalid page", 400)
				return
			}
			page = n
		}
		if page > (len(fixtures)-1)/12 {
			http.NotFound(w, r)
			return
		}
		start := page * 12
		if start >= len(fixtures) {
			http.NotFound(w, r)
			return
		}
		end := start + 12
		if end > len(fixtures) {
			end = len(fixtures)
		}
		nodes := []sdui.Node{}
		for i, f := range fixtures[start:end] {
			nodes = append(nodes, sdui.Node{ID: fmt.Sprintf("fixture-%d", start+i), Type: f.Name, Props: f.Props})
		}
		plan, err := sdui.Compile(sdui.Screen{Version: sdui.Version, ID: "catalogue-screen", Root: sdui.Node{ID: "fixtures", Type: "stack", Children: nodes}}, registry)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		var output bytes.Buffer
		output.WriteString("<!doctype html><html><head><meta charset=\"utf-8\">")
		if err = plan.RenderAssets(&output); err == nil {
			output.WriteString("</head><body>")
			err = plan.Render(&output, sdui.RenderContext{Endpoint: "/", CSRF: "test-only"})
		}
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		output.WriteString("</body></html>")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(output.Bytes())
	})
	port := os.Getenv("PORT")
	if port == "" {
		port = "8094"
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		log.Fatal("invalid PORT")
	}
	log.Fatal(http.ListenAndServe("127.0.0.1:"+strconv.Itoa(n), mux))
}
