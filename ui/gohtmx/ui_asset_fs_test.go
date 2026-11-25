package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestBindAssetFSLiteralPaths(t *testing.T) {
	cases := []struct {
		name string
		url  string
	}{
		{"plain.js", "/assets/plain.js"},
		{"{hash}.js", "/assets/%7Bhash%7D.js"},
		{"{any}", "/assets/%7Bany%7D"},
		{"{$}", "/assets/%7B$%7D"},
		{"file%20name.js", "/assets/file%2520name.js"},
		{"with space.css", "/assets/with%20space.css"},
		{"nested/child.js", "/assets/nested/child.js"},
		{"nested/{folder}/file%name.js", "/assets/nested/%7Bfolder%7D/file%25name.js"},
		{"nested/literal%2Fsegment.js", "/assets/nested/literal%252Fsegment.js"},
		{"nested/{rest...}", "/assets/nested/%7Brest...%7D"},
	}
	assets := fstest.MapFS{}
	for _, tc := range cases {
		assets[tc.name] = &fstest.MapFile{Data: []byte(tc.name)}
	}
	mux := http.NewServeMux()
	if err := BindAssetFS(mux, assets, &CompressionOptions{Disabled: true}); err != nil {
		t.Fatal(err)
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, tc.url, nil))
			if response.Code != http.StatusOK || response.Body.String() != tc.name {
				t.Fatalf("GET %s: status=%d body=%q", tc.url, response.Code, response.Body.String())
			}
		})
	}
}

func TestBindAssetFSDoesNotCaptureWildcards(t *testing.T) {
	assets := fstest.MapFS{
		"{any}":           &fstest.MapFile{Data: []byte("literal wildcard")},
		"nested/{all...}": &fstest.MapFile{Data: []byte("literal remainder")},
		"file%20name.js":  &fstest.MapFile{Data: []byte("literal percent")},
	}
	mux := http.NewServeMux()
	if err := BindAssetFS(mux, assets, &CompressionOptions{Disabled: true}); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{
		"/assets/unlisted.js",
		"/assets/nested/unlisted.js",
		"/assets/nested/more/unlisted.js",
		"/assets/file%20name.js",
	} {
		t.Run(path, func(t *testing.T) {
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
			if response.Code != http.StatusNotFound {
				t.Fatalf("unregistered path %s: status=%d body=%q", path, response.Code, response.Body.String())
			}
		})
	}
}

func TestAssetURLAndImmutableCacheHeaders(t *testing.T) {
	url := AssetURL("ely-controls.css")
	if !strings.HasPrefix(url, "/assets/ely-controls.css?v=") || len(url) <= len("/assets/ely-controls.css?v=") {
		t.Fatalf("expected hashed AssetURL, got %q", url)
	}
	mux := http.NewServeMux()
	if err := BindAssets(mux); err != nil {
		t.Fatal(err)
	}
	matched := httptest.NewRecorder()
	mux.ServeHTTP(matched, httptest.NewRequest(http.MethodGet, url, nil))
	if matched.Code != http.StatusOK {
		t.Fatalf("GET %s: status=%d", url, matched.Code)
	}
	if got := matched.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("matched versioned asset Cache-Control = %q", got)
	}
	for _, unversioned := range []string{"/assets/ely-controls.css", "/assets/ely-controls.css?v=stale"} {
		resp := httptest.NewRecorder()
		mux.ServeHTTP(resp, httptest.NewRequest(http.MethodGet, unversioned, nil))
		if resp.Code != http.StatusOK {
			t.Fatalf("GET %s: status=%d", unversioned, resp.Code)
		}
		if got := resp.Header().Get("Cache-Control"); got != "public, no-cache" {
			t.Fatalf("GET %s Cache-Control = %q", unversioned, got)
		}
	}
}
