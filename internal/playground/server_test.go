package playground

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/internal/httpencoding"
)

func setup(t *testing.T) *server {
	t.Helper()
	h, e := NewHandler()
	if e != nil {
		t.Fatal(e)
	}
	return h.(*server)
}
func request(t *testing.T, s *server, method, path string, body []byte, auth bool) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, "http://localhost"+path, bytes.NewReader(body))
	if auth {
		r.AddCookie(&http.Cookie{Name: cookieName, Value: s.token})
		r.Header.Set("X-CSRF-Token", s.token)
	}
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}
func TestExamplesCompileAndRender(t *testing.T) {
	s := setup(t)
	for _, ex := range examples() {
		t.Run(ex.ID, func(t *testing.T) {
			b, e := json.Marshal(map[string]any{"screen": ex.Screen, "data": ex.Data, "profile": "dynamic", "strategy": "smallest", "minBytes": 256, "minSavingsBytes": 32, "minSavingsPercent": 5})
			if e != nil {
				t.Fatal(e)
			}
			w := request(t, s, "POST", "/api/preview", b, true)
			if w.Code != 200 {
				t.Fatalf("%d %s", w.Code, w.Body)
			}
			var out struct {
				HTML  string                    `json:"html"`
				Sizes map[string]map[string]any `json:"sizes"`
			}
			json.Unmarshal(w.Body.Bytes(), &out)
			if !strings.Contains(out.HTML, "Content-Security-Policy") || !strings.Contains(out.HTML, "<style>") {
				t.Fatal("missing preview isolation or renderer assets")
			}
			if len(out.Sizes) != 2 || out.Sizes["json"]["gzip"].(float64) <= 0 {
				t.Fatal("missing measurements")
			}
		})
	}
}
func TestSecurityAndBounds(t *testing.T) {
	s := setup(t)
	good, _ := json.Marshal(map[string]any{"screen": examples()[0].Screen, "data": map[string]any{}})
	for _, tc := range []struct {
		name, method, path string
		body               []byte
		auth               bool
		status             int
	}{
		{"unauthenticated", "POST", "/api/preview", good, false, 403},
		{"private catalogue", "GET", "/api/catalogue", nil, false, 403},
		{"invalid JSON", "POST", "/api/preview", []byte(`{"screen":`), true, 422},
		{"duplicate screen key", "POST", "/api/preview", []byte(`{"screen":{"version":"1","version":"1","id":"a","root":{"id":"b","type":"text","props":{"text":"x"}}}}`), true, 422},
		{"unknown type", "POST", "/api/preview", []byte(`{"screen":{"version":"1","id":"a","root":{"id":"b","type":"nope"}}}`), true, 422},
		{"oversized trailing whitespace", "POST", "/api/preview", append(append([]byte{}, good...), bytes.Repeat([]byte(" "), maxBody)...), true, 413},
		{"unknown envelope", "POST", "/api/preview", []byte(`{"screen":{},"execute":true}`), true, 422},
		{"unknown contract", "GET", "/api/component?name=nope", nil, true, 404},
		{"oversized", "POST", "/api/preview", []byte(`{"data":{"x":"` + strings.Repeat("x", maxBody) + `"}}`), true, 413},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := request(t, s, tc.method, tc.path, tc.body, tc.auth)
			if w.Code != tc.status {
				t.Fatalf("%d %s", w.Code, w.Body)
			}
		})
	}
	for _, kind := range []string{"csrf", "origin", "host"} {
		r := httptest.NewRequest("POST", "http://localhost/api/preview", bytes.NewReader(good))
		r.AddCookie(&http.Cookie{Name: cookieName, Value: s.token})
		r.Header.Set("X-CSRF-Token", s.token)
		r.Header.Set("Content-Type", "application/json")
		switch kind {
		case "csrf":
			r.Header.Del("X-CSRF-Token")
		case "origin":
			r.Header.Set("Origin", "http://evil.invalid")
		case "host":
			r.Host = "evil.invalid"
		}
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatalf("%s: %d", kind, w.Code)
		}
	}
}
func TestCatalogueLazy(t *testing.T) {
	s := setup(t)
	w := request(t, s, "GET", "/api/catalogue?q=", nil, true)
	var result struct {
		Items []map[string]string
		Total int
	}
	if e := json.Unmarshal(w.Body.Bytes(), &result); e != nil {
		t.Fatal(e)
	}
	if len(result.Items) != 40 || result.Total < 1361 || w.Body.Len() > 16384 {
		t.Fatalf("unexpected catalogue result %d/%d bytes%d", len(result.Items), result.Total, w.Body.Len())
	}
	if strings.Contains(w.Body.String(), "properties") {
		t.Fatal("search ships full contracts")
	}
	exact := request(t, s, "GET", "/api/catalogue?q=text", nil, true)
	var exactResult struct{ Items []map[string]string }
	json.Unmarshal(exact.Body.Bytes(), &exactResult)
	if len(exactResult.Items) == 0 || exactResult.Items[0]["name"] != "text" {
		t.Fatal("exact type match must be first")
	}
	w = request(t, s, "GET", "/api/component?name=button", nil, true)
	if !strings.Contains(w.Body.String(), `"properties"`) {
		t.Fatal("missing lazy contract")
	}
}
func TestInertPreviewSanitization(t *testing.T) {
	source := `<div onclick="bad()" style="background:url(/leak)"><script>alert(1)</script><iframe src="/private"></iframe><a href="/delete" target="_top">link</a><img src="https://evil.invalid/a" srcset="/b 2x"><form action="/action"><input autofocus formaction="/action"></form><svg><image href="/secret"/><a><set attributeName="href" to="https://evil.invalid/nav"/></a></svg></div>`
	out, e := previewDocument(source, `<link rel="stylesheet" href="/assets/app.css"><script src="/assets/sdui.js"></script>`)
	if e != nil {
		t.Fatal(e)
	}
	for _, bad := range []string{"onclick", "<script", "<iframe", "/delete", "/private", "/leak", "/secret", "evil.invalid", "autofocus", "formaction"} {
		if strings.Contains(out, bad) {
			t.Errorf("unsafe %s in %s", bad, out)
		}
	}
	if !strings.Contains(out, `form-action 'none'`) {
		t.Fatal("missing form restriction")
	}
}
func TestMeasurementsUseSharedEncoders(t *testing.T) {
	opts, e := httpencoding.Normalize(nil, "static")
	if e != nil {
		t.Fatal(e)
	}
	source := bytes.Repeat([]byte("actual source text"), 100)
	got, e := measure(source, opts)
	if e != nil {
		t.Fatal(e)
	}
	enc := httpencoding.NewEncoderSet(opts)
	defer enc.Close()
	for _, coding := range []string{"gzip", "br", "zstd"} {
		b, e := enc.Encode(source, coding)
		if e != nil || got[coding] != len(b) {
			t.Fatalf("wrong %s measurement", coding)
		}
	}
	opts.MinBytes = len(source) + 1
	got, e = measure(source, opts)
	if e != nil || got["selected"] != "identity" {
		t.Fatal("threshold selection mismatch")
	}
}
func TestSchemaAndRenderBoundaries(t *testing.T) {
	s := setup(t)
	ex := examples()[0]
	ex.Screen.Root.Children = []sdui.Node{{ID: "bad", Type: "text", Props: map[string]any{"text": strings.Repeat("x", sdui.MaxStringBytes+1)}}}
	b, _ := json.Marshal(map[string]any{"screen": ex.Screen})
	if w := request(t, s, "POST", "/api/preview", b, true); w.Code != 422 {
		t.Fatalf("large string accepted: %d", w.Code)
	}
	for _, profile := range []string{"unknown", "request"} {
		b, _ = json.Marshal(map[string]any{"screen": examples()[0].Screen, "profile": profile})
		if w := request(t, s, "POST", "/api/preview", b, true); w.Code != 422 {
			t.Fatal("unknown profile accepted")
		}
	}
}

func TestPageAndPreviewPolicies(t *testing.T) {
	s := setup(t)
	w := request(t, s, "GET", "/", nil, false)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `name="csrf-token"`) {
		t.Fatalf("page unavailable: %d %s", w.Code, w.Body)
	}
	if !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing page security headers")
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		t.Fatal("session cookie is not private/strict")
	}
	out, e := previewDocument(`<p>Hello</p>`, `<link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/sdui.css">`)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(out, "style-src 'sha256-") || !strings.Contains(out, ".sdui-stack") || strings.Contains(out, `<link `) {
		t.Fatal("preview must inline hash-authorized trusted CSS without resource requests")
	}
}
