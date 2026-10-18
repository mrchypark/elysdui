package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLocalTilesExample(t *testing.T) {
	handler, err := newHandler()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ path, contentType, contains string }{
		{"/", "text/html", `data-map-tile-provider="natural-earth"`},
		{"/host.js", "text/javascript", "registerTileProvider"},
		{"/assets/ely/tiles/0/0/0.png", "image/png", "PNG"},
		{"/assets/ely/tiles/3/7/7.png", "image/png", "PNG"},
		{"/assets/ely/tiles/provenance.json", "application/json", "da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721"},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", tc.path, nil))
		if response.Code != 200 || !strings.Contains(response.Header().Get("Content-Type"), tc.contentType) || !strings.Contains(response.Body.String(), tc.contains) {
			t.Fatalf("%s: %d %s", tc.path, response.Code, response.Body.String())
		}
	}
}
