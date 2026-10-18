package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestSubmitHTMXFragment(t *testing.T) {
	s, err := newServer()
	if err != nil {
		t.Fatal(err)
	}
	form := url.Values{"name": {"Ada"}, "tags": {"go,htmx"}}
	r := httptest.NewRequest(http.MethodPost, "/submit", strings.NewReader(form.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	r.Header.Set("HX-Request", "true")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	body := w.Body.String()
	for _, want := range []string{`<section id="result"`, "Hello, Ada.", `data-ui-component="tag-input"`, `id="result-tags"`} {
		if !strings.Contains(body, want) {
			t.Errorf("fragment missing %q: %s", want, body)
		}
	}
	if strings.Contains(body, "<!doctype html>") {
		t.Error("HTMX request returned a full page")
	}
}

func TestSubmitValidationAndEscaping(t *testing.T) {
	s, err := newServer()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, value string
		hx          bool
		status      int
		want        string
	}{
		{"HTMX validation", "   ", true, http.StatusOK, "Enter a name."},
		{"full-page validation", "   ", false, http.StatusBadRequest, "<!doctype html>"},
		{"escaped full page", `<script>alert(1)</script>`, false, http.StatusOK, `&lt;script&gt;alert(1)&lt;/script&gt;`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			form := url.Values{"name": {tc.value}, "tags": {`<script>tags</script>`}}
			r := httptest.NewRequest(http.MethodPost, "/submit", strings.NewReader(form.Encode()))
			r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			if tc.hx {
				r.Header.Set("HX-Request", "true")
			}
			w := httptest.NewRecorder()
			s.ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("status = %d, want %d", w.Code, tc.status)
			}
			if !strings.Contains(w.Body.String(), tc.want) {
				t.Errorf("body missing %q: %s", tc.want, w.Body.String())
			}
			if strings.Contains(w.Body.String(), "<script>alert(1)</script>") || strings.Contains(w.Body.String(), "<script>tags</script>") {
				t.Error("untrusted form text was not escaped")
			}
		})
	}
}

func TestLoopbackAddress(t *testing.T) {
	for _, addr := range []string{"127.0.0.1:8092", "[::1]:8092", "localhost:8092"} {
		if err := loopbackAddress(addr); err != nil {
			t.Fatalf("%s rejected: %v", addr, err)
		}
	}
	if err := loopbackAddress("0.0.0.0:8092"); err == nil {
		t.Fatal("accepted non-loopback address")
	}
}
