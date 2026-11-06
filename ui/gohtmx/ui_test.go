package ui

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSharedAssetsRevalidateCachedContent(t *testing.T) {
	mux := http.NewServeMux()
	if err := BindAssets(mux); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/assets/pretendard.woff2", "/assets/geist.woff2", "/assets/app.css", "/assets/ely/LICENSE.txt", "/assets/ui-controls.js", "/assets/ely-api.js", "/assets/ely-map.js"} {
		w := httptest.NewRecorder()
		// Service pages disable caching; shared assets must override that header.
		w.Header().Set("Cache-Control", "no-store")
		mux.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		etag := w.Header().Get("ETag")
		if w.Code != 200 || w.Body.Len() == 0 || etag == "" || w.Header().Get("Cache-Control") != "public, no-cache" {
			t.Fatalf("uncached asset %s: %d %v", path, w.Code, w.Header())
		}
		if path == "/assets/ely-map.js" {
			want, err := Files.ReadFile("assets/ely-map.js")
			if err != nil || w.Body.Len() != len(want) || w.Body.String() != string(want) {
				t.Fatalf("served map asset differs from embedded bytes: err=%v", err)
			}
			if hash := sha256.Sum256(want); etag != fmt.Sprintf(`"%x"`, hash) {
				t.Fatalf("map asset ETag %q does not match embedded-byte SHA-256 %x", etag, hash)
			}
		}
		for _, match := range []bool{true, false} {
			r := httptest.NewRequest("GET", path, nil)
			if match {
				r.Header.Set("If-None-Match", etag)
			} else {
				r.Header.Set("If-None-Match", `"old-content"`)
			}
			cached := httptest.NewRecorder()
			mux.ServeHTTP(cached, r)
			if match && (cached.Code != 304 || cached.Body.Len() != 0) {
				t.Fatalf("cached %s retransmitted: %d, %d bytes", path, cached.Code, cached.Body.Len())
			}
			if !match && (cached.Code != 200 || cached.Body.String() != w.Body.String()) {
				t.Fatalf("changed asset %s not refreshed", path)
			}
		}
	}
}
