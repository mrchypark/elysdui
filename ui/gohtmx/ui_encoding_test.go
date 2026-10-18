package ui

import (
	"bytes"
	"compress/gzip"
	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestSharedAssetRepresentations(t *testing.T) {
	mux := http.NewServeMux()
	if err := BindAssets(mux); err != nil {
		t.Fatal(err)
	}
	original, err := Files.ReadFile("assets/app.css")
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, coding, etag, ranges string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/assets/app.css", nil)
		r.Header.Set("Accept-Encoding", coding)
		r.Header.Set("If-None-Match", etag)
		r.Header.Set("Range", ranges)
		w := httptest.NewRecorder()
		w.Header().Set("Vary", "Origin")
		mux.ServeHTTP(w, r)
		return w
	}
	tags := map[string]bool{}
	for _, coding := range []string{"identity", "gzip", "br", "zstd"} {
		t.Run(coding, func(t *testing.T) {
			w := request("GET", coding, "", "")
			if w.Code != 200 {
				t.Fatal(w.Code, w.Body.String())
			}
			if w.Header().Get("Content-Length") != strconv.Itoa(w.Body.Len()) {
				t.Fatal("wrong length", w.Header())
			}
			if !strings.Contains(strings.Join(w.Header().Values("Vary"), ","), "Origin") || !strings.Contains(strings.Join(w.Header().Values("Vary"), ","), "Accept-Encoding") {
				t.Fatal(w.Header())
			}
			tag := w.Header().Get("ETag")
			if tags[tag] || tag == "" {
				t.Fatal("representation ETag collision")
			}
			tags[tag] = true
			var reader io.Reader = bytes.NewReader(w.Body.Bytes())
			switch coding {
			case "identity":
				if w.Header().Get("Content-Encoding") != "" {
					t.Fatal(w.Header())
				}
			case "gzip":
				r, err := gzip.NewReader(reader)
				if err != nil {
					t.Fatal(err)
				}
				defer r.Close()
				reader = r
			case "br":
				reader = brotli.NewReader(reader)
			case "zstd":
				r, err := zstd.NewReader(reader)
				if err != nil {
					t.Fatal(err)
				}
				defer r.Close()
				reader = r
			}
			decoded, err := io.ReadAll(reader)
			if err != nil || !bytes.Equal(decoded, original) {
				t.Fatal("incorrect body", err)
			}
			head := request("HEAD", coding, "", "bytes=0-3")
			if head.Code != 200 || head.Body.Len() != 0 || head.Header().Get("Content-Length") != w.Header().Get("Content-Length") || head.Header().Get("ETag") != tag {
				t.Fatal("incorrect HEAD", head.Code, head.Header())
			}
			cached := request("GET", coding, tag, "")
			if cached.Code != 304 || cached.Body.Len() != 0 || cached.Header().Get("Content-Length") != "" || cached.Header().Get("ETag") != tag {
				t.Fatal("incorrect 304", cached.Code, cached.Header())
			}
			different := request("GET", coding, `"different"`, "")
			if different.Code != 200 {
				t.Fatal(different.Code)
			}
			ranged := request("GET", coding, "", "bytes=0-3")
			if coding == "identity" {
				if ranged.Code != 206 || ranged.Body.String() != string(original[:4]) {
					t.Fatal("range failed", ranged.Code)
				}
			} else if ranged.Code != 200 || !bytes.Equal(ranged.Body.Bytes(), w.Body.Bytes()) {
				t.Fatal("encoded range failed")
			}
		})
	}
	if w := request("GET", "*;q=0", "", ""); w.Code != 406 {
		t.Fatal(w.Code)
	}
	if w := request("POST", "gzip", "", ""); w.Code != 405 {
		t.Fatal(w.Code)
	}
}

func TestAssetIdentityRangesAndVariantCache(t *testing.T) {
	mux := http.NewServeMux()
	if err := BindAssets(mux); err != nil {
		t.Fatal(err)
	}
	get := func(coding, match, ifRange, ranges string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "/assets/app.css", nil)
		r.Header.Set("Accept-Encoding", coding)
		r.Header.Set("If-None-Match", match)
		r.Header.Set("If-Range", ifRange)
		r.Header.Set("Range", ranges)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	identity := get("identity", "", "", "")
	tag := identity.Header().Get("ETag")
	if w := get("gzip", tag, "", ""); w.Code != 200 {
		t.Fatal("identity validator matched compressed variant")
	}
	if w := get("identity", "", tag, "bytes=0-3"); w.Code != 206 {
		t.Fatal(w.Code)
	}
	if w := get("identity", "", `"stale"`, "bytes=0-3"); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w := get("identity", "", "", "bytes=999999999-"); w.Code != 416 {
		t.Fatal(w.Code)
	}
	if w := get("identity", "W/"+tag, "", ""); w.Code != 304 {
		t.Fatal(w.Code)
	}
	if w := get("identity", "*", "", ""); w.Code != 304 {
		t.Fatal(w.Code)
	}
}

func TestAssetPreconditionsAndBinary(t *testing.T) {
	mux := http.NewServeMux()
	if err := BindAssets(mux); err != nil {
		t.Fatal(err)
	}
	for _, coding := range []string{"identity", "gzip", "br", "zstd"} {
		r := httptest.NewRequest("GET", "/assets/app.css", nil)
		r.Header.Set("Accept-Encoding", coding)
		r.Header.Set("If-Match", `"stale"`)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != 412 || w.Body.Len() != 0 || w.Header().Get("Content-Length") != "" || w.Header().Get("Content-Encoding") != "" {
			t.Fatal(w.Code, w.Header())
		}
	}
	r := httptest.NewRequest("GET", "/assets/geist.woff2", nil)
	r.Header.Set("Accept-Encoding", "zstd, br, gzip")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 200 || w.Header().Get("Content-Encoding") != "" {
		t.Fatal(w.Code, w.Header())
	}
	r.Header.Set("Accept-Encoding", "gzip,identity;q=0")
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 406 {
		t.Fatal(w.Code)
	}
}

func TestAssetEqualQualitySelectsSmallest(t *testing.T) {
	mux := http.NewServeMux()
	if err := BindAssets(mux); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/assets/app.css", "/assets/ely-controls.js", "/assets/ely-api.js"} {
		get := func(header string) *httptest.ResponseRecorder {
			r := httptest.NewRequest("GET", path, nil)
			r.Header.Set("Accept-Encoding", header)
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, r)
			return w
		}
		smallest := int(^uint(0) >> 1)
		for _, coding := range []string{"zstd", "br", "gzip"} {
			w := get(coding)
			if w.Code != 200 {
				t.Fatal(w.Code)
			}
			if w.Body.Len() < smallest {
				smallest = w.Body.Len()
			}
		}
		w := get("gzip, br, zstd")
		if w.Body.Len() != smallest {
			t.Fatalf("%s selected %s (%d bytes), want %d", path, w.Header().Get("Content-Encoding"), w.Body.Len(), smallest)
		}
		w = get("br;q=0.5,zstd;q=0.5,gzip;q=1")
		if w.Header().Get("Content-Encoding") != "gzip" {
			t.Fatal("size overrode client quality")
		}
	}
}

func TestBindAssetsWithOptions(t *testing.T) {
	options := CompressionOptions{Codecs: []string{"gzip", "br"}, Strategy: "preference", GzipLevel: 1}
	mux := http.NewServeMux()
	if err := BindAssetsWithOptions(mux, &options); err != nil {
		t.Fatal(err)
	}
	options.Codecs[0] = "zstd"
	request := func(mux *http.ServeMux, header string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "/assets/app.css", nil)
		r.Header.Set("Accept-Encoding", header)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	if w := request(mux, "gzip,br,zstd"); w.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal("preference or immutable options", w.Header())
	}
	if w := request(mux, "zstd,identity;q=0"); w.Code != 406 {
		t.Fatal("unconfigured codec accepted", w.Code)
	}
	identityMux := http.NewServeMux()
	if err := BindAssetsWithOptions(identityMux, &CompressionOptions{Disabled: true}); err != nil {
		t.Fatal(err)
	}
	if w := request(identityMux, "gzip"); w.Header().Get("Content-Encoding") != "" {
		t.Fatal("disabled", w.Header())
	}
	if w := request(mux, "gzip"); w.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal("cross-handler cache pollution", w.Header())
	}
	thresholdMux := http.NewServeMux()
	if err := BindAssetsWithOptions(thresholdMux, &CompressionOptions{Codecs: []string{"gzip"}, MinBytes: 10000000}); err != nil {
		t.Fatal(err)
	}
	if w := request(thresholdMux, "gzip"); w.Header().Get("Content-Encoding") != "" {
		t.Fatal("threshold", w.Header())
	}
	if w := request(thresholdMux, "gzip,identity;q=0"); w.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal("identity exclusion", w.Header())
	}
	if err := BindAssetsWithOptions(http.NewServeMux(), &CompressionOptions{GzipLevel: 20}); err == nil {
		t.Fatal("invalid settings accepted")
	}
}
