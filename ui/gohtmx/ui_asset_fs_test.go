package ui

import (
	"net/http"
	"net/http/httptest"
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
