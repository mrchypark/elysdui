package main

import (
	"crypto/sha256"
	"fmt"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"time"

	"github.com/mrchypark/elysdui/internal/httpencoding"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

// runHTTP runs instead of the codec sweep. Each invocation must be a new process
// so the sync.Once default asset cache is cold for its first BindAssets call.
func runHTTP(target time.Duration) {
	report := func(name string, m measurement) {
		fmt.Fprintf(os.Stderr, "http_primitive=%s ns_op=%d B_op=%d allocs_op=%d n=%d\n", name, m.ns, m.bytes, m.allocs, m.n)
	}
	runtime.GC()
	var before, after, retained runtime.MemStats
	runtime.ReadMemStats(&before)
	start := time.Now()
	mux := http.NewServeMux()
	if e := ui.BindAssets(mux); e != nil {
		panic(e)
	}
	elapsed := time.Since(start)
	runtime.ReadMemStats(&after)
	report("cold_default_BindAssets_new_mux", measurement{uint64(elapsed.Nanoseconds()), after.TotalAlloc - before.TotalAlloc, after.Mallocs - before.Mallocs, 1})
	runtime.GC()
	runtime.ReadMemStats(&retained)
	fmt.Fprintf(os.Stderr, "http_cold_retained_heap_delta_B=%d\n", int64(retained.HeapAlloc)-int64(before.HeapAlloc))
	report("warm_default_BindAssets_new_mux", measure(target, func() ([]byte, error) {
		m := http.NewServeMux()
		e := ui.BindAssets(m)
		runtime.KeepAlive(m)
		return nil, e
	}))
	const accept = "zstd, br, gzip"
	request := func(etag string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/assets/app.css", nil)
		r.Header.Set("Accept-Encoding", accept)
		if etag != "" {
			r.Header.Set("If-None-Match", etag)
		}
		return r
	}
	first := httptest.NewRecorder()
	mux.ServeHTTP(first, request(""))
	if first.Code != http.StatusOK || first.Header().Get("ETag") == "" {
		panic("asset GET validation failed")
	}
	etag := first.Header().Get("ETag")
	fmt.Fprintf(os.Stderr, "http_asset=/assets/app.css coding=%s encoded_bytes=%d\n", first.Header().Get("Content-Encoding"), first.Body.Len())
	for _, entry := range []struct {
		name, etag string
		status     int
	}{{"cached_asset_GET_200", "", http.StatusOK}, {"cached_asset_GET_304", etag, http.StatusNotModified}} {
		// Requests are prepared outside timing; each operation includes recorder,
		// headers, ServeMux dispatch, negotiation, conditional handling and body copy.
		req := request(entry.etag)
		report(entry.name, measure(target, func() ([]byte, error) {
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, req)
			if w.Code != entry.status {
				return nil, fmt.Errorf("unexpected status %d", w.Code)
			}
			if w.Code == 304 && w.Body.Len() != 0 {
				return nil, fmt.Errorf("304 had a body")
			}
			return w.Body.Bytes(), nil
		}))
	}
	options := httpencoding.Options{Codecs: []string{"zstd", "br", "gzip"}, Strategy: "preference", MinBytes: 256, MinSavingsBytes: 32, MinSavingsPercent: 5, GzipLevel: 1, BrotliLevel: 1, ZstdLevel: 1}
	for _, d := range datasets() {
		if d.name != "html-large" && d.name != "form-large" {
			continue
		}
		body, coding, ok, e := httpencoding.SelectEncoded(d.data, accept, options)
		if e != nil || !ok {
			panic(fmt.Sprintf("dynamic selection: %v", e))
		}
		fmt.Fprintf(os.Stderr, "http_dynamic_dataset=%s coding=%s input_bytes=%d encoded_bytes=%d\n", d.name, coding, len(d.data), len(body))
		report("dynamic_SelectEncoded_"+d.name, measure(target, func() ([]byte, error) {
			b, _, ok, e := httpencoding.SelectEncoded(d.data, accept, options)
			if !ok && e == nil {
				e = fmt.Errorf("no acceptable representation")
			}
			return b, e
		}))
	}
	h := sha256.New()
	count, total := 0, 0
	if e := fs.WalkDir(ui.Files, "assets", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		b, err := ui.Files.ReadFile(path)
		if err != nil {
			return err
		}
		fmt.Fprintf(h, "%s\x00%d\x00", path, len(b))
		h.Write(b)
		count++
		total += len(b)
		return nil
	}); e != nil {
		panic(e)
	}
	fmt.Fprintf(os.Stderr, "http_embedded_assets_count=%d bytes=%d sha256=%x\n", count, total, h.Sum(nil))
	fmt.Fprintf(os.Stderr, "http_static_options=%+v\n", ui.DefaultCompressionOptions())
	runtime.KeepAlive(mux)
}
