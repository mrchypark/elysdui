package gohtmx

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"github.com/mrchypark/elysdui/internal/httpencoding"
)

func compressedTestRequest(t *testing.T, coding, key string, plain []byte) *http.Request {
	t.Helper()
	encoded, err := httpencoding.Encode(plain, coding)
	if err != nil {
		t.Fatal(err)
	}
	r := httpTestRequest("POST", "/actions", key, "alice", nil)
	r.Body = ioBody(encoded)
	r.ContentLength = int64(len(encoded))
	r.Header.Set("Content-Encoding", coding)
	r.Header.Set("X-SDUI-CSRF", "test-csrf")
	return r
}
func ioBody(b []byte) io.ReadCloser { return io.NopCloser(bytes.NewReader(b)) }

func TestCompressedActionRoundtripReplay(t *testing.T) {
	calls := 0
	h := httpTestHandler(t, func(c *Config) {
		c.RequestCompression = &RequestCompressionOptions{Codecs: []string{"gzip", "zstd", "br"}}
		httpTestRun(c, func(_ context.Context, r Request) (Result, error) {
			calls++
			if r.HTTPRequest.Header.Get("Content-Encoding") != "" {
				t.Error("encoding not normalized")
			}
			return Result{Data: map[string]any{"result": r.Values.Get("text")}}, nil
		})
	})
	values := httpTestValues()
	values.Del("_csrf")
	for _, coding := range []string{"gzip", "zstd", "br"} {
		w := httpTestServe(h, compressedTestRequest(t, coding, "same", []byte(values.Encode())))
		if w.Code != 200 || !strings.Contains(w.Body.String(), "hello") {
			t.Fatalf("%s: %d %s", coding, w.Code, w.Body.String())
		}
	}
	w := httpTestServe(h, httpTestRequest("POST", "/actions", "same", "alice", httpTestValues()))
	if w.Code != 200 || calls != 1 {
		t.Fatalf("replay code=%d calls=%d", w.Code, calls)
	}
}

func TestCompressedActionFailures(t *testing.T) {
	for _, coding := range []string{"gzip", "zstd", "br"} {
		t.Run(coding, func(t *testing.T) {
			vals := httpTestValues()
			vals.Del("_csrf")
			plain := []byte(vals.Encode())
			cases := []struct {
				name string
				code int
				edit func(*http.Request)
			}{
				{"missing csrf", 403, func(r *http.Request) { r.Header.Del("X-SDUI-CSRF") }},
				{"duplicate csrf", 403, func(r *http.Request) { r.Header.Add("X-SDUI-CSRF", "test-csrf") }},
				{"wrong csrf", 403, func(r *http.Request) { r.Header.Set("X-SDUI-CSRF", "wrong") }},
				{"stacked", 415, func(r *http.Request) { r.Header.Set("Content-Encoding", coding+", gzip") }},
				{"multiple headers", 415, func(r *http.Request) { r.Header.Add("Content-Encoding", coding) }},
				{"multipart", 415, func(r *http.Request) { r.Header.Set("Content-Type", "multipart/form-data; boundary=x") }},
				{"json", 415, func(r *http.Request) { r.Header.Set("Content-Type", "application/json") }},
				{"malformed", 400, func(r *http.Request) { r.Body = ioBody([]byte("bad")) }},
				{"truncated", 400, func(r *http.Request) { b, _ := io.ReadAll(r.Body); r.Body = ioBody(b[:len(b)-2]) }},
			}
			h := httpTestHandler(t, func(c *Config) {
				c.RequestCompression = &RequestCompressionOptions{Codecs: []string{"gzip", "zstd", "br"}}
			})
			for _, tc := range cases {
				t.Run(tc.name, func(t *testing.T) {
					r := compressedTestRequest(t, coding, tc.name, plain)
					tc.edit(r)
					w := httpTestServe(h, r)
					if w.Code != tc.code {
						t.Fatalf("%d: %s", w.Code, w.Body.String())
					}
				})
			}
			r := compressedTestRequest(t, coding, "body-csrf", []byte(httpTestValues().Encode()))
			if w := httpTestServe(h, r); w.Code != 403 {
				t.Fatalf("body csrf: %d", w.Code)
			}
			small := httpTestHandler(t, func(c *Config) {
				c.MaxBodyBytes = 128
				c.MaxCompressedBodyBytes = 1024
				c.RequestCompression = &RequestCompressionOptions{Codecs: []string{"gzip", "zstd", "br"}}
			})
			r = compressedTestRequest(t, coding, "bomb", []byte(strings.Repeat("x", 10000)))
			if w := httpTestServe(small, r); w.Code != 413 {
				t.Fatalf("bomb: %d %s", w.Code, w.Body.String())
			}
			wire := httpTestHandler(t, func(c *Config) {
				c.MaxCompressedBodyBytes = 1
				c.RequestCompression = &RequestCompressionOptions{Codecs: []string{"gzip", "zstd", "br"}}
			})
			if w := httpTestServe(wire, compressedTestRequest(t, coding, "wire", plain)); w.Code != 413 {
				t.Fatalf("wire: %d", w.Code)
			}
		})
	}
}
func TestCompressionResponsePolicy(t *testing.T) {
	for _, opt := range []bool{false, true} {
		h := httpTestHandler(t, func(c *Config) { c.CompressResponses = opt })
		r := httpTestRequest("GET", "/", "", "alice", nil)
		r.Header.Set("Accept-Encoding", "gzip")
		w := httpTestServe(h, r)
		if w.Code != 200 || (w.Header().Get("Content-Encoding") == "gzip") != opt {
			t.Fatalf("opt %v: %d %v", opt, w.Code, w.Header())
		}
		if !strings.Contains(w.Header().Get("Cache-Control"), "no-transform") {
			t.Fatal("missing no-transform")
		}
	}
	h := httpTestHandler(t, nil)
	r := httpTestRequest("GET", "/", "", "alice", nil)
	r.Header.Set("Accept-Encoding", "identity;q=0, gzip")
	if w := httpTestServe(h, r); w.Code != 406 {
		t.Fatalf("excluded identity %d", w.Code)
	}
}

func TestCompressionConfiguration(t *testing.T) {
	plan := httpTestPlan(t)
	invalid := []func(*Config){
		func(c *Config) { c.RequestCompression = &RequestCompressionOptions{Codecs: []string{"unknown"}} },
		func(c *Config) { c.RequestCompression = &RequestCompressionOptions{Codecs: []string{"gzip", "gzip"}} },
		func(c *Config) { c.RequestCompression = &RequestCompressionOptions{MinBytes: -1} },
		func(c *Config) { c.RequestCompression = &RequestCompressionOptions{MinSavingsPercent: 101} },
		func(c *Config) { c.ResponseCompression = &ui.CompressionOptions{Codecs: []string{"bad"}} },
		func(c *Config) { c.ResponseCompression = &ui.CompressionOptions{GzipLevel: 10} },
	}
	for i, edit := range invalid {
		c := httpTestConfig()
		edit(&c)
		if _, err := NewHandler(plan, c); err == nil {
			t.Fatalf("config %d accepted", i)
		}
	}
	for _, disabled := range []bool{false, true} {
		options := &RequestCompressionOptions{Disabled: disabled, Codecs: []string{"br"}, MinBytes: 2048, MinSavingsBytes: 100, MinSavingsPercent: 10}
		h := httpTestHandler(t, func(c *Config) { c.RequestCompression = options })
		options.Codecs[0] = "gzip" // constructor owns its independent copy
		vals := httpTestValues()
		vals.Del("_csrf")
		r := compressedTestRequest(t, "br", "config-br", []byte(vals.Encode()))
		w := httpTestServe(h, r)
		want := 200
		if disabled {
			want = 415
		}
		if w.Code != want {
			t.Fatalf("br disabled=%v: %d %s", disabled, w.Code, w.Body.String())
		}
		r = compressedTestRequest(t, "gzip", "config-gzip", []byte(vals.Encode()))
		w = httpTestServe(h, r)
		if w.Code != 415 {
			t.Fatalf("excluded gzip: %d", w.Code)
		}
		w = httpTestServe(h, httpTestRequest("GET", "/", "", "alice", nil))
		if !strings.Contains(w.Body.String(), `data-sdui-request-codecs="br"`) || !strings.Contains(w.Body.String(), `data-sdui-request-min-bytes="2048"`) {
			t.Fatal("browser policy not rendered")
		}
	}
}

func TestResponseCompressionRequiresSecurityOptIn(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		h := httpTestHandler(t, func(c *Config) {
			c.CompressResponses = enabled
			c.ResponseCompression = &ui.CompressionOptions{Codecs: []string{"gzip"}, GzipLevel: 1, MinBytes: 1}
		})
		r := httpTestRequest("GET", "/", "", "alice", nil)
		r.Header.Set("Accept-Encoding", "br, gzip")
		w := httpTestServe(h, r)
		if (w.Header().Get("Content-Encoding") == "gzip") != enabled {
			t.Fatalf("security flag %v: %v", enabled, w.Header())
		}
	}
	h := httpTestHandler(t, func(c *Config) {
		c.CompressResponses = true
		c.ResponseCompression = &ui.CompressionOptions{Codecs: []string{"gzip"}, MinBytes: 64 << 20}
	})
	r := httpTestRequest("GET", "/", "", "alice", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	if w := httpTestServe(h, r); w.Header().Get("Content-Encoding") != "" {
		t.Fatal("threshold ignored")
	}
	r = httpTestRequest("GET", "/", "", "alice", nil)
	r.Header.Set("Accept-Encoding", "gzip, identity;q=0")
	if w := httpTestServe(h, r); w.Code != 200 || w.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("forbidden identity fallback: %d %v", w.Code, w.Header())
	}
}
