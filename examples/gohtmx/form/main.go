// Command app runs a small elysdui form example.
package main

import (
	"bytes"
	"embed"
	"flag"
	"fmt"
	"html/template"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

//go:embed templates/*.html
var files embed.FS

//go:embed assets/example.css
var exampleCSS []byte

type values struct {
	Name, Tags string
	Submitted  bool
	Error      string
}

type pageData struct {
	values
	TagInput template.HTML
}

type server struct {
	templates *template.Template
	mux       *http.ServeMux
}

func newServer() (*server, error) {
	templates, err := ui.NewTemplates()
	if err != nil {
		return nil, err
	}
	if _, err := templates.ParseFS(files, "templates/*.html"); err != nil {
		return nil, err
	}
	s := &server{templates: templates, mux: http.NewServeMux()}
	if err := ui.BindAssets(s.mux); err != nil {
		return nil, err
	}
	s.mux.HandleFunc("GET /example.css", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		_, _ = w.Write(exampleCSS)
	})
	s.mux.HandleFunc("GET /{$}", s.page)
	s.mux.HandleFunc("POST /submit", s.submit)
	return s, nil
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	s.mux.ServeHTTP(w, r)
}

func (s *server) page(w http.ResponseWriter, r *http.Request) {
	s.renderPage(w, http.StatusOK, values{})
}

func (s *server) submit(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "form input is invalid", http.StatusBadRequest)
		return
	}
	v := values{Name: strings.TrimSpace(r.PostForm.Get("name")), Tags: strings.TrimSpace(r.PostForm.Get("tags")), Submitted: true}
	if v.Name == "" {
		v.Error = "Enter a name."
	} else if len(v.Name) > 100 {
		v.Error = "Name must be 100 bytes or less."
	}
	if r.Header.Get("HX-Request") == "true" {
		s.renderResult(w, http.StatusOK, v)
		return
	}
	status := http.StatusOK
	if v.Error != "" {
		status = http.StatusBadRequest
	}
	s.renderPage(w, status, v)
}

func (s *server) data(v values) (pageData, error) {
	d := pageData{values: v}
	if !v.Submitted || v.Error != "" {
		return d, nil
	}
	var output bytes.Buffer
	if err := ui.RenderComponent(s.templates, &output, ui.Component{
		Chapter: "forms", Name: "TagInput", ID: "result-tags",
		Props: map[string]any{"Label": "Tags returned by the server", "Name": "tags", "Value": v.Tags, "Placeholder": "Add a tag"},
	}); err != nil {
		return pageData{}, err
	}
	// RenderComponent escapes caller strings before returning trusted template output.
	d.TagInput = template.HTML(output.String())
	return d, nil
}

func (s *server) renderPage(w http.ResponseWriter, status int, v values) {
	d, err := s.data(v)
	if err != nil {
		http.Error(w, "page unavailable", http.StatusInternalServerError)
		return
	}
	s.render(w, status, "page", d)
}

func (s *server) renderResult(w http.ResponseWriter, status int, v values) {
	d, err := s.data(v)
	if err != nil {
		http.Error(w, "result unavailable", http.StatusInternalServerError)
		return
	}
	s.render(w, status, "result", d)
}

func (s *server) render(w http.ResponseWriter, status int, name string, data pageData) {
	var output bytes.Buffer
	if err := s.templates.ExecuteTemplate(&output, name, data); err != nil {
		http.Error(w, "template unavailable", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(output.Bytes())
}

func loopbackAddress(addr string) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil || host == "" {
		return fmt.Errorf("-addr must be a loopback host and port: %q", addr)
	}
	if host == "localhost" {
		return nil
	}
	if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
		return fmt.Errorf("-addr must be a loopback host and port: %q", addr)
	}
	return nil
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8092", "loopback listen address")
	flag.Parse()
	if err := loopbackAddress(*addr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	handler, err := newServer()
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{Addr: *addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	log.Printf("elysdui app example: http://%s", *addr)
	log.Fatal(server.ListenAndServe())
}
