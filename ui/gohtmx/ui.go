// Package ui provides shared Go templates, theme styles, and browser assets.
package ui

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"html/template"
	"io/fs"
	"mime"
	"net/http"
	"net/url"
	"path"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/mrchypark/elysdui/internal/httpencoding"
)

// Option supplies a submitted value, a label, and optional choice icons.
type Option struct {
	Value    string
	Label    string
	Selected bool
	Disabled bool
	Icon     string
	Glyph    string
	Note     string
	Keywords string
	Group    string
}

var extraAttributeName = regexp.MustCompile(`^(data|aria|hx)-[a-z0-9]+(-[a-z0-9]+)*$`)

// htmxEventAttributeName matches the htmx event handler family. htmx runs the
// attribute value as JavaScript, so these names are never allowed.
var htmxEventAttributeName = regexp.MustCompile(`^hx-on(?::|-|$)`)

// htmxScriptValueAttributes are the htmx attributes whose value htmx evaluates
// as JavaScript source when it starts with "js:" or "javascript:".
var htmxScriptValueAttributes = map[string]bool{
	"hx-get":     true,
	"hx-post":    true,
	"hx-put":     true,
	"hx-patch":   true,
	"hx-delete":  true,
	"hx-query":   true,
	"hx-action":  true,
	"hx-confirm": true,
	"hx-vals":    true,
	"hx-headers": true,
}

func attrName(name string) (template.HTMLAttr, error) {
	if !extraAttributeName.MatchString(name) {
		return "", fmt.Errorf("unsupported component attribute %q", name)
	}
	// hx-config can override request.action with executable JavaScript after
	// the individual request attributes have been validated.
	if htmx := htmxAttributeName(name); htmxEventAttributeName.MatchString(htmx) || htmx == "hx-config" {
		return "", fmt.Errorf("unsupported component attribute %q", name)
	}
	// Only the validated name bypasses escaping. Attribute values remain escaped.
	return template.HTMLAttr(name), nil
}

// htmxAttributeName strips the optional "data-" prefix so the htmx prefixed
// and unprefixed spellings share one rule.
func htmxAttributeName(name string) string {
	return strings.TrimPrefix(name, "data-")
}

// attrValue rejects values htmx would execute and returns the value as plain
// text so html/template keeps escaping it.
func attrValue(name string, value any) (string, error) {
	text := attrValueText(value)
	htmx := htmxAttributeName(name)
	if htmxScriptValueAttributes[htmx] && isScriptPrefix(scriptValue(text)) {
		return "", fmt.Errorf("unsupported component attribute value for %q", name)
	}
	if htmx == "hx-trigger" && strings.Contains(text, "[") {
		return "", fmt.Errorf("unsupported component attribute value for %q", name)
	}
	return text, nil
}

// attrValueText renders a caller supplied attribute value as plain text.
// Trusted markup types are flattened to text so they stay escaped in the
// output instead of bypassing it.
func attrValueText(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case fmt.Stringer:
		return v.String()
	default:
		return fmt.Sprint(value)
	}
}

// scriptValue drops whitespace and control characters and lowercases the value
// so "JS:", " js:" and "java\tscript:" cannot hide a script prefix.
func scriptValue(value string) string {
	var b strings.Builder
	for _, r := range value {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			continue
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}

func isScriptPrefix(value string) bool {
	return strings.HasPrefix(value, "js:") || strings.HasPrefix(value, "javascript:")
}

func NewTemplates() (*template.Template, error) {
	tpl := template.New("").Funcs(Funcs())
	tpl.Funcs(template.FuncMap{"component": func(value any) (template.HTML, error) {
		c, err := componentFrom(value)
		if err != nil {
			return "", err
		}
		var output bytes.Buffer
		if err := RenderComponent(tpl, &output, c); err != nil {
			return "", err
		}
		return template.HTML(output.String()), nil
	}})
	return tpl.ParseFS(Files, "templates/*.html")
}

// CompressionOptions configures encoding of explicitly public assets.
type CompressionOptions = httpencoding.Options

// DefaultCompressionOptions returns a fresh copy of the static asset defaults.
func DefaultCompressionOptions() CompressionOptions {
	options, _ := httpencoding.Normalize(nil, "static")
	return options
}

// DefaultDynamicCompressionOptions returns fast settings for explicitly public
// dynamic data. Applications must separately opt in to compressing that data.
func DefaultDynamicCompressionOptions() CompressionOptions {
	return httpencoding.DefaultDynamicCompressionOptions()
}

// Shared immutable assets are prepared once, even when several muxes bind them.
var preparedAssets = sync.OnceValues(prepareAssets)

// BindAssets registers shared asset paths without taking over application assets.
// Public text assets negotiate zstd, Brotli or gzip; dynamic pages are untouched.
func BindAssets(mux *http.ServeMux) error {
	return BindAssetsWithOptions(mux, nil)
}

// BindAssetsWithOptions registers assets using a private immutable encoding cache.
// A nil options pointer uses the shared default cache.
func BindAssetsWithOptions(mux *http.ServeMux, options *CompressionOptions) error {
	if mux == nil {
		return fmt.Errorf("asset binding requires a mux")
	}
	normalized, err := httpencoding.Normalize(options, "static")
	if err != nil {
		return err
	}
	var handlers map[string]http.Handler
	if options == nil {
		handlers, err = preparedAssets()
	} else {
		handlers, err = prepareAssetsWithOptions(normalized)
	}
	if err != nil {
		return err
	}
	for name, handler := range handlers {
		mux.Handle(assetRoutePattern(name), handler)
	}
	return nil
}

func prepareAssets() (map[string]http.Handler, error) {
	return prepareAssetsWithOptions(DefaultCompressionOptions())
}

func prepareAssetsWithOptions(options CompressionOptions) (map[string]http.Handler, error) {
	assets, err := fs.Sub(Files, "assets")
	if err != nil {
		return nil, err
	}
	return prepareAssetFS(assets, options)
}

// BindAssetFS registers caller-owned public assets under /assets/ using the same
// content negotiation and conditional response behavior as the UI assets.
// The filesystem must be rooted at its asset directory; paths must not overlap
// routes already registered on mux. It does not register the UI assets itself.
func BindAssetFS(mux *http.ServeMux, assets fs.FS, options *CompressionOptions) error {
	if mux == nil {
		return fmt.Errorf("asset binding requires a mux")
	}
	if assets == nil {
		return fmt.Errorf("asset binding requires a filesystem")
	}
	normalized, err := httpencoding.Normalize(options, "static")
	if err != nil {
		return err
	}
	handlers, err := prepareAssetFS(assets, normalized)
	if err != nil {
		return err
	}
	for name, handler := range handlers {
		mux.Handle(assetRoutePattern(name), handler)
	}
	return nil
}

func assetRoutePattern(name string) string {
	// Escape filesystem names before ServeMux interprets wildcard syntax and
	// percent-encoded path segments. Directory separators remain separators.
	segments := strings.Split(name, "/")
	for i, segment := range segments {
		segments[i] = url.PathEscape(segment)
	}
	return "GET /assets/" + strings.Join(segments, "/")
}

func prepareAssetFS(assets fs.FS, options CompressionOptions) (map[string]http.Handler, error) {
	encoders := httpencoding.NewEncoderSet(options)
	defer encoders.Close()
	handlers := make(map[string]http.Handler)
	err := fs.WalkDir(assets, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		data, err := fs.ReadFile(assets, name)
		if err != nil {
			return err
		}
		contentType := mime.TypeByExtension(path.Ext(name))
		if contentType == "" {
			contentType = http.DetectContentType(data)
		}
		codings := []string{"identity"}
		if !options.Disabled && (strings.HasPrefix(contentType, "text/") || strings.Contains(contentType, "javascript") || strings.Contains(contentType, "json") || strings.Contains(contentType, "svg")) {
			codings = append(append([]string{}, options.Codecs...), "identity")
		}
		type representation struct {
			body []byte
			etag string
		}
		variants := make(map[string]representation)
		bodies := make(map[string][]byte)
		for _, coding := range codings {
			body, err := encoders.Encode(data, coding)
			if err != nil {
				return fmt.Errorf("encode asset %s: %w", name, err)
			}
			variants[coding] = representation{body, fmt.Sprintf(`"%x"`, sha256.Sum256(body))}
			bodies[coding] = body
		}

		handlers[name] = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			httpencoding.AddVary(w.Header(), "Accept-Encoding")
			coding, ok := httpencoding.Select(strings.Join(r.Header.Values("Accept-Encoding"), ","), bodies, options)
			if !ok {
				http.Error(w, "no acceptable content coding", http.StatusNotAcceptable)
				return
			}
			variant := variants[coding]
			w.Header().Set("Cache-Control", "public, no-cache")
			w.Header().Set("ETag", variant.etag)
			w.Header().Set("Content-Type", contentType)
			w.Header().Del("Content-Encoding")
			if coding != "identity" {
				w.Header().Set("Content-Encoding", coding)
			}
			// Ranges are optional. Ignore them for encoded representations rather than
			// producing multipart framing that is not itself content-encoded. Identity
			// retains ServeContent's full range and If-Range handling.
			if coding != "identity" || r.Method == http.MethodHead {
				r = r.Clone(r.Context())
				r.Header.Del("Range")
				r.Header.Del("If-Range")
			}
			http.ServeContent(assetResponseWriter{w, len(variant.body)}, r, name, time.Time{}, bytes.NewReader(variant.body))
		})
		return nil
	})
	return handlers, err
}

// ServeContent cannot infer encoded length and intentionally leaves it unset.
// Add it only for successful full responses, never a 304 or failed precondition.
type assetResponseWriter struct {
	http.ResponseWriter
	length int
}

func (w assetResponseWriter) WriteHeader(status int) {
	if status == http.StatusOK {
		w.Header().Set("Content-Length", strconv.Itoa(w.length))
	}
	if status == http.StatusPreconditionFailed {
		w.Header().Del("Content-Encoding")
		w.Header().Del("Content-Length")
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w assetResponseWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func Funcs() template.FuncMap {
	return template.FuncMap{
		"qrSVG": qrSVG, "barcodeSVG": barcodeSVG, "markdownHTML": markdownHTML,
		"withProps": func(source map[string]any, values ...any) (map[string]any, error) {
			if len(values)%2 != 0 {
				return nil, fmt.Errorf("withProps requires key/value pairs")
			}
			out := make(map[string]any, len(source)+len(values)/2)
			for key, value := range source {
				out[key] = value
			}
			for i := 0; i < len(values); i += 2 {
				key, ok := values[i].(string)
				if !ok {
					return nil, fmt.Errorf("withProps key must be string")
				}
				out[key] = values[i+1]
			}
			return out, nil
		},
		"seq": func(count int) ([]int, error) {
			if count < 0 || count > 1000 {
				return nil, fmt.Errorf("sequence length must be between 0 and 1000")
			}
			items := make([]int, count)
			for i := range items {
				items[i] = i + 1
			}
			return items, nil
		},
		"dict": func(values ...any) (map[string]any, error) {
			if len(values)%2 != 0 {
				return nil, fmt.Errorf("dict requires key/value pairs")
			}
			result := map[string]any{}
			for i := 0; i < len(values); i += 2 {
				key, ok := values[i].(string)
				if !ok {
					return nil, fmt.Errorf("dict key must be string")
				}
				result[key] = values[i+1]
			}
			return result, nil
		},
		"list":              func(v ...any) []any { return v },
		"add":               func(a, b int) int { return a + b },
		"join":              joinStrings,
		"menuHasItems":      menuHasItems,
		"menuContextConfig": menuContextConfig,
		"attrName":          attrName,
		"attrValue":         attrValue,
		"contains":          strings.Contains,
		"hasPrefix":         strings.HasPrefix,
		"deref": func(v any) any {
			r := reflect.ValueOf(v)
			if r.IsValid() && r.Kind() == reflect.Pointer {
				if r.IsNil() {
					return nil
				}
				return r.Elem().Interface()
			}
			return v
		},
	}
}

// joinStrings accepts native Go string slices and JSON-decoded string arrays.
// It deliberately rejects mixed values instead of formatting them as strings.
func joinStrings(value any, separator string) (string, error) {
	switch items := value.(type) {
	case []string:
		return strings.Join(items, separator), nil
	case []any:
		stringsOnly := make([]string, len(items))
		for i, value := range items {
			text, ok := value.(string)
			if !ok {
				return "", fmt.Errorf("join item %d must be a string", i)
			}
			stringsOnly[i] = text
		}
		return strings.Join(stringsOnly, separator), nil
	default:
		return "", fmt.Errorf("join expects an array of strings")
	}
}
