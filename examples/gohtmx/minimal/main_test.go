package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestConsumer(t *testing.T) {
	handler, err := newHandler()
	if err != nil {
		t.Fatal(err)
	}
	for _, partial := range []bool{false, true} {
		request := httptest.NewRequest("GET", "/?name=%3Cscript%3E", nil)
		if partial {
			request.Header.Set("HX-Request", "true")
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		body := response.Body.String()
		if response.Code != 200 || !strings.Contains(body, "Hello, &lt;script&gt;!") {
			t.Fatalf("unexpected response: %d %s", response.Code, body)
		}
		if strings.Contains(body, "<!doctype html>") == partial {
			t.Fatal("incorrect full-page/fragment response")
		}
		if !strings.Contains(body, `id="greeting"`) || response.Header().Get("Vary") != "HX-Request" {
			t.Fatal("missing fragment/cache contract")
		}
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("GET", "/assets/app.css", nil))
	if response.Code != 200 || !strings.Contains(response.Header().Get("Content-Type"), "text/css") {
		t.Fatal("CSS asset unavailable")
	}
}
