// Command sdui-transport-bench compares fresh, single-shot transport codecs.
package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"embed"
	"encoding/csv"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"
	"github.com/mrchypark/elysdui/internal/httpencoding"
)

//go:embed fixtures/*
var fixtures embed.FS

type dataset struct {
	name string
	data []byte
}
type profile struct {
	name, coding string
	level        int
}

var profiles = []profile{{"gzip1", "gzip", 1}, {"gzip6", "gzip", 6}, {"gzip9", "gzip", 9}, {"br1", "br", 1}, {"br4", "br", 4}, {"br5", "br", 5}, {"br9", "br", 9}, {"br11", "br", 11}, {"zstd1", "zstd", 1}, {"zstd3", "zstd", 3}, {"zstd7", "zstd", 7}, {"zstd15", "zstd", 15}}

func datasets() []dataset {
	read := func(name string) []byte {
		b, e := fixtures.ReadFile("fixtures/" + name)
		if e != nil {
			panic(e)
		}
		return b
	}
	css, js := read("app.css"), read("controls.js")
	form := func(n int) []byte {
		v := url.Values{"action": {"save"}, "_csrf": {"public-benchmark-placeholder"}}
		for i := 0; i < n; i++ {
			v.Set(fmt.Sprintf("field_%03d", i), fmt.Sprintf("Project %03d: Review transport & browser compatibility", i))
		}
		return []byte(v.Encode())
	}
	// Fixed xorshift32 stream: intentionally incompressible, never crypto material.
	random := make([]byte, 64*1024)
	state := uint32(0x12345678)
	for i := range random {
		state ^= state << 13
		state ^= state >> 17
		state ^= state << 5
		random[i] = byte(state)
	}
	return []dataset{{"html-small", read("html-1.html")}, {"html-large", read("html-100.html")}, {"css-small", css[:1024]}, {"css-large", css}, {"js-small", js[:1024]}, {"js-large", js}, {"form-small", form(2)}, {"form-large", form(200)}, {"random-small", random[:256]}, {"random-large", random}}
}

func encode(data []byte, p profile) ([]byte, error) {
	o := httpencoding.Options{GzipLevel: 6, BrotliLevel: 5, ZstdLevel: 3}
	switch p.coding {
	case "gzip":
		o.GzipLevel = p.level
	case "br":
		o.BrotliLevel = p.level
	case "zstd":
		o.ZstdLevel = p.level
	}
	return httpencoding.EncodeWithOptions(data, p.coding, o)
}
func decode(data []byte, coding string) ([]byte, error) {
	switch coding {
	case "gzip":
		r, e := gzip.NewReader(bytes.NewReader(data))
		if e != nil {
			return nil, e
		}
		defer r.Close()
		return io.ReadAll(r)
	case "br":
		return io.ReadAll(brotli.NewReader(bytes.NewReader(data)))
	case "zstd":
		r, e := zstd.NewReader(nil, zstd.WithDecoderConcurrency(1))
		if e != nil {
			return nil, e
		}
		defer r.Close()
		return r.DecodeAll(data, nil)
	}
	return nil, fmt.Errorf("unsupported coding %s", coding)
}

type measurement struct {
	ns, bytes, allocs uint64
	n                 int
}

var sink []byte

// A duration is a target, not a hard timeout: finish at least one operation.
// Fresh constructors and finalization are included; no encoder pooling is used.
func measure(target time.Duration, fn func() ([]byte, error)) measurement {
	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	start := time.Now()
	n := 0
	for {
		b, e := fn()
		if e != nil {
			panic(e)
		}
		sink = b
		n++
		if time.Since(start) >= target {
			break
		}
	}
	elapsed := time.Since(start)
	runtime.ReadMemStats(&after)
	return measurement{uint64(elapsed.Nanoseconds()) / uint64(n), (after.TotalAlloc - before.TotalAlloc) / uint64(n), (after.Mallocs - before.Mallocs) / uint64(n), n}
}
func main() {
	httpMode := flag.Bool("http", false, "measure cold/warm asset binding, cached GET/304 and dynamic selection instead of codec sweep; output to stderr")
	duration := flag.Duration("duration", 50*time.Millisecond, "target per encode/decode row; expensive operations may exceed it")
	datasetFilter := flag.String("dataset", "", "substring filter for dataset name")
	profileFilter := flag.String("profile", "", "exact profile name filter")
	flag.Parse()
	if *duration <= 0 {
		panic("duration must be positive")
	}
	runtime.GOMAXPROCS(1)
	fmt.Fprintf(os.Stderr, "go=%s os=%s arch=%s GOMAXPROCS=1 target=%s\n", runtime.Version(), runtime.GOOS, runtime.GOARCH, *duration)
	if *httpMode {
		runHTTP(*duration)
		return
	}
	out := csv.NewWriter(os.Stdout)
	defer out.Flush()
	out.Write([]string{"dataset", "profile", "input_bytes", "encoded_bytes", "saved_pct", "encode_ns_op", "decode_ns_op", "encode_B_op", "decode_B_op", "encode_allocs_op", "decode_allocs_op", "encode_n", "decode_n"})
	for _, d := range datasets() {
		if !strings.Contains(d.name, *datasetFilter) {
			continue
		}
		fmt.Fprintf(os.Stderr, "fixture=%s bytes=%d sha256=%x\n", d.name, len(d.data), sha256.Sum256(d.data))
		for _, p := range profiles {
			if *profileFilter != "" && p.name != *profileFilter {
				continue
			}
			encoded, e := encode(d.data, p)
			if e != nil {
				panic(e)
			}
			decoded, e := decode(encoded, p.coding)
			if e != nil || !bytes.Equal(decoded, d.data) {
				panic(fmt.Sprintf("round trip failed %s/%s: %v", d.name, p.name, e))
			}
			enc := measure(*duration, func() ([]byte, error) { return encode(d.data, p) })
			dec := measure(*duration, func() ([]byte, error) { return decode(encoded, p.coding) })
			out.Write([]string{d.name, p.name, fmt.Sprint(len(d.data)), fmt.Sprint(len(encoded)), fmt.Sprintf("%.2f", 100*(1-float64(len(encoded))/float64(len(d.data)))), fmt.Sprint(enc.ns), fmt.Sprint(dec.ns), fmt.Sprint(enc.bytes), fmt.Sprint(dec.bytes), fmt.Sprint(enc.allocs), fmt.Sprint(dec.allocs), fmt.Sprint(enc.n), fmt.Sprint(dec.n)})
			out.Flush()
			if e := out.Error(); e != nil {
				panic(e)
			}
		}
	}
}
