// Package playground implements a loopback-only, data-only SDUI authoring tool.
package playground

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strings"

	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/internal/httpencoding"
	"golang.org/x/net/html"
)

//go:embed web/*
var web embed.FS

const maxBody = 2 * sdui.MaxSchemaBytes
const cookieName = "ely-playground"

type server struct {
	registry    *sdui.Registry
	definitions []sdui.Definition
	token       string
	mux         *http.ServeMux
	busy        chan struct{}
	readAsset   func(string) ([]byte, error)
}

func newRegistry() (*sdui.Registry, error) {
	r, err := sdui.CatalogueRegistry()
	if err != nil {
		return nil, err
	}
	if err = r.Register(sdui.Definition{Name: "playground/card", Template: "card", Properties: map[string]sdui.Property{"title": {Type: sdui.String, Target: "Title", Required: true}}, Slots: map[string]sdui.SlotDefinition{"content": {Target: "Content", AllowedTypes: []string{"text", "button", "stack"}, MaxNodes: 16}}}); err != nil {
		return nil, err
	}
	return r, nil
}

// NewHandler creates a local development tool, not production authentication.
// Its per-process session expires on restart. No screen or data is persisted server-side.
func NewHandler() (http.Handler, error) {
	r, err := newRegistry()
	if err != nil {
		return nil, err
	}
	token := make([]byte, 32)
	if _, err = rand.Read(token); err != nil {
		return nil, err
	}
	s := &server{registry: r, definitions: r.Definitions(), token: hex.EncodeToString(token), mux: http.NewServeMux(), busy: make(chan struct{}, 2)}
	s.mux.HandleFunc("GET /{$}", s.index)
	for _, name := range []string{"app.js", "style.css"} {
		s.mux.HandleFunc("GET /"+name, func(w http.ResponseWriter, r *http.Request) {
			b, e := web.ReadFile("web/" + strings.TrimPrefix(r.URL.Path, "/"))
			if e != nil {
				http.NotFound(w, r)
				return
			}
			if strings.HasSuffix(r.URL.Path, ".js") {
				w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
			} else {
				w.Header().Set("Content-Type", "text/css; charset=utf-8")
			}
			w.Write(b)
		})
	}
	// Serve the same chrome, typography and theme behavior as the gallery.
	s.mux.Handle("GET /assets/", http.FileServer(http.FS(sdui.Files)))
	s.mux.HandleFunc("GET /api/catalogue", s.catalogue)
	s.mux.HandleFunc("GET /api/component", s.component)
	s.mux.HandleFunc("GET /api/examples", func(w http.ResponseWriter, r *http.Request) { respond(w, 200, examples()) })
	s.mux.HandleFunc("POST /api/preview", s.preview)
	return s, nil
}
func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	if h, _, e := net.SplitHostPort(host); e == nil {
		host = h
	}
	if host != "localhost" && host != "127.0.0.1" && host != "::1" {
		http.Error(w, "loopback Host required", 403)
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
	if strings.HasPrefix(r.URL.Path, "/api/") {
		c, e := r.Cookie(cookieName)
		if e != nil || subtle.ConstantTimeCompare([]byte(c.Value), []byte(s.token)) != 1 {
			respond(w, 403, map[string]string{"error": "Open the playground page first"})
			return
		}
	}
	if r.Method == "POST" {
		origin := r.Header.Get("Origin")
		u, e := url.Parse(origin)
		if origin != "" && (e != nil || u.Scheme != "http" || u.Host != r.Host) {
			respond(w, 403, map[string]string{"error": "Same-origin requests required"})
			return
		}
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(s.token)) != 1 {
			respond(w, 403, map[string]string{"error": "Session expired; reload the page (your draft stays in this browser)"})
			return
		}
	}
	s.mux.ServeHTTP(w, r)
}
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func (s *server) index(w http.ResponseWriter, r *http.Request) {
	t, e := template.ParseFS(web, "web/index.html")
	if e != nil {
		http.Error(w, "editor unavailable", 500)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: s.token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	t.Execute(w, map[string]string{"Token": s.token})
}
func (s *server) catalogue(w http.ResponseWriter, r *http.Request) {
	q := strings.ToLower(r.URL.Query().Get("q"))
	if len(q) > 192 {
		respond(w, 400, map[string]string{"error": "Search is too long"})
		return
	}
	items := []map[string]string{}
	matches := 0
	// An exact type name must remain reachable even when a broad query has
	// more than the bounded page of matches.
	for pass := 0; pass < 2; pass++ {
		for _, d := range s.definitions {
			exact := strings.EqualFold(d.Name, q)
			if (pass == 0) != exact {
				continue
			}
			if strings.Contains(strings.ToLower(d.Name+" "+d.Family), q) {
				matches++
				if len(items) < 40 {
					items = append(items, map[string]string{"name": d.Name, "family": d.Family})
				}
			}
		}
	}
	respond(w, 200, map[string]any{"items": items, "total": len(s.definitions), "matches": matches})
}
func (s *server) component(w http.ResponseWriter, r *http.Request) {
	for _, d := range s.definitions {
		if d.Name == r.URL.Query().Get("name") {
			respond(w, 200, d)
			return
		}
	}
	respond(w, 404, map[string]string{"error": "Unknown component"})
}

type previewRequest struct {
	Theme             *previewTheme   `json:"theme,omitempty"`
	Screen            json.RawMessage `json:"screen"`
	Data              map[string]any  `json:"data"`
	Profile           string          `json:"profile"`
	Strategy          string          `json:"strategy"`
	MinBytes          int             `json:"minBytes"`
	MinSavingsBytes   int             `json:"minSavingsBytes"`
	MinSavingsPercent int             `json:"minSavingsPercent"`
}

func (s *server) preview(w http.ResponseWriter, r *http.Request) {
	select {
	case s.busy <- struct{}{}:
		defer func() { <-s.busy }()
	default:
		respond(w, 429, map[string]string{"error": "Preview is busy; try again"})
		return
	}
	fail := func(e error) {
		var limit *http.MaxBytesError
		if errors.As(e, &limit) {
			respond(w, 413, map[string]string{"error": "Preview request exceeds the 2 MiB limit"})
			return
		}
		respond(w, 422, map[string]string{"error": e.Error()})
	}
	mediaType, _, mediaErr := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaErr != nil || mediaType != "application/json" {
		respond(w, 415, map[string]string{"error": "JSON required"})
		return
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	dec.DisallowUnknownFields()
	dec.UseNumber()
	var input previewRequest
	if e := dec.Decode(&input); e != nil {
		fail(e)
		return
	}
	if e := dec.Decode(new(any)); e != io.EOF {
		if e != nil {
			fail(e)
		} else {
			fail(fmt.Errorf("expected one JSON request"))
		}
		return
	}
	screen, e := sdui.Decode(bytes.NewReader(input.Screen))
	if e != nil {
		fail(e)
		return
	}
	plan, e := sdui.Compile(screen, s.registry)
	if e != nil {
		fail(e)
		return
	}
	var rendered bytes.Buffer
	if e = plan.Render(&rendered, sdui.RenderContext{Data: input.Data, Endpoint: "/preview-actions-disabled"}); e != nil {
		fail(e)
		return
	}
	profile := input.Profile
	if profile == "" {
		profile = "dynamic"
	}
	if profile != "dynamic" && profile != "static" {
		fail(fmt.Errorf("unknown compression profile"))
		return
	}
	base, _ := httpencoding.Normalize(nil, profile)
	base.Disabled = false
	base.Strategy = input.Strategy
	base.MinBytes = input.MinBytes
	base.MinSavingsBytes = input.MinSavingsBytes
	base.MinSavingsPercent = input.MinSavingsPercent
	options, e := httpencoding.Normalize(&base, profile)
	if e != nil {
		fail(e)
		return
	}
	// Measure submitted screen JSON (including authored whitespace) and renderer markup,
	// API envelope, HTTP headers, assets, or browser-native request compression.
	sizes := map[string]any{}
	for name, source := range map[string][]byte{"json": input.Screen, "html": rendered.Bytes()} {
		result, e := measure(source, options)
		if e != nil {
			fail(e)
			return
		}
		sizes[name] = result
	}
	var assets bytes.Buffer
	if e := plan.RenderAssets(&assets); e != nil {
		fail(e)
		return
	}
	readAsset := s.readAsset
	if readAsset == nil {
		readAsset = sdui.Files.ReadFile
	}
	safe, e := previewDocumentWithTheme(rendered.String(), assets.String(), readAsset, input.Theme)
	if e != nil {
		fail(e)
		return
	}
	respond(w, 200, map[string]any{"html": safe, "sizes": sizes, "events": plan.Events(), "assets": stylesheetPaths(assets.String())})
}
func measure(source []byte, options httpencoding.Options) (map[string]any, error) {
	enc := httpencoding.NewEncoderSet(options)
	defer enc.Close()
	variants := map[string][]byte{"identity": source}
	result := map[string]any{"identity": len(source)}
	for _, coding := range []string{"gzip", "br", "zstd"} {
		b, e := enc.Encode(source, coding)
		if e != nil {
			return nil, e
		}
		variants[coding] = b
		result[coding] = len(b)
	}
	selected, _ := httpencoding.Select("gzip, br, zstd", variants, options)
	result["selected"] = selected
	return result, nil
}
func stylesheetPaths(source string) []string {
	out := []string{}
	z := html.NewTokenizer(strings.NewReader(source))
	for {
		tt := z.Next()
		if tt == html.ErrorToken {
			break
		}
		if tt != html.StartTagToken && tt != html.SelfClosingTagToken {
			continue
		}
		t := z.Token()
		if t.Data != "link" {
			continue
		}
		for _, a := range t.Attr {
			if a.Key == "href" && strings.HasPrefix(a.Val, "/assets/") && strings.HasSuffix(a.Val, ".css") && !strings.Contains(a.Val, "..") {
				out = append(out, a.Val)
			}
		}
	}
	return out
}

// Defense in depth: the opaque sandbox has no scripts/forms/popups/navigation.
// Strip all markup capable of navigation or resource loads, including local URLs.
func previewDocument(source, assets string) (string, error) {
	return previewDocumentWithAssets(source, assets, sdui.Files.ReadFile)
}

func previewDocumentWithAssets(source, assets string, readAsset func(string) ([]byte, error)) (string, error) {
	return previewDocumentWithTheme(source, assets, readAsset, nil)
}

func previewDocumentWithTheme(source, assets string, readAsset func(string) ([]byte, error), theme *previewTheme) (string, error) {
	mode, themeCSS, err := theme.styles()
	if err != nil {
		return "", err
	}
	doc, e := html.Parse(strings.NewReader(source))
	if e != nil {
		return "", e
	}
	var clean func(*html.Node)
	clean = func(n *html.Node) {
		for c := n.FirstChild; c != nil; {
			next := c.NextSibling
			if c.Type == html.ElementNode && (c.Data == "script" || c.Data == "iframe" || c.Data == "object" || c.Data == "embed" || c.Data == "link" || c.Data == "meta" || c.Data == "base" || c.Data == "style" || c.Data == "animate" || c.Data == "animateMotion" || c.Data == "animateTransform" || c.Data == "set") {
				n.RemoveChild(c)
			} else {
				attrs := c.Attr[:0]
				for _, a := range c.Attr {
					k := strings.ToLower(a.Key)
					if strings.HasPrefix(k, "on") || k == "href" || k == "src" || k == "srcset" || k == "action" || k == "formaction" || k == "poster" || k == "ping" || k == "target" || k == "autofocus" || k == "style" {
						continue
					}
					attrs = append(attrs, a)
				}
				c.Attr = attrs
				clean(c)
			}
			c = next
		}
	}
	clean(doc)
	// Inline only the renderer's fixed trusted CSS assets. A hash permits these
	// bytes inside an opaque-origin iframe without granting any resource network.
	var css bytes.Buffer
	for _, path := range stylesheetPaths(assets) {
		value, err := readAsset(strings.TrimPrefix(path, "/"))
		if err != nil {
			return "", err
		}
		css.Write(value)
		css.WriteByte('\n')
	}
	css.WriteString(themeCSS)
	sum := sha256.Sum256(css.Bytes())
	var b bytes.Buffer
	fmt.Fprintf(&b, `<!doctype html><html lang="en" data-theme="%s"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-%s'; img-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>%s</style></head><body>`, mode, base64.StdEncoding.EncodeToString(sum[:]), css.String())
	var body *html.Node
	var find func(*html.Node)
	find = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "body" {
			body = n
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			find(c)
		}
	}
	find(doc)
	if body != nil {
		for c := body.FirstChild; c != nil; c = c.NextSibling {
			html.Render(&b, c)
		}
	}
	b.WriteString(`</body></html>`)
	return b.String(), nil
}
