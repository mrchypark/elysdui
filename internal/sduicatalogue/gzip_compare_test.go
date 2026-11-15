package sduicatalogue

import (
	"bytes"
	"compress/gzip"
	"testing"
)

func TestEqualGzip(t *testing.T) {
	encode := func(value string, level int) []byte {
		var buf bytes.Buffer
		w, err := gzip.NewWriterLevel(&buf, level)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(value)); err != nil {
			t.Fatal(err)
		}
		if err := w.Close(); err != nil {
			t.Fatal(err)
		}
		return buf.Bytes()
	}
	a := encode("catalogue", gzip.BestSpeed)
	b := encode("catalogue", gzip.BestCompression)
	if bytes.Equal(a, b) {
		t.Fatal("test needs different gzip encodings")
	}
	if equal, err := EqualGzip(a, b); err != nil || !equal {
		t.Fatalf("equal content: %v, %v", equal, err)
	}
	if equal, err := EqualGzip(a, encode("stale", gzip.BestSpeed)); err != nil || equal {
		t.Fatalf("stale content: %v, %v", equal, err)
	}
	if _, err := EqualGzip(a, []byte("corrupt")); err == nil {
		t.Fatal("corrupt gzip accepted")
	}
}
