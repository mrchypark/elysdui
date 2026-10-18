package searchablefixture

import (
	"bytes"
	"errors"
	"io"
	"testing"
)

func TestDataKeepsRootQueryAndLeafValuesSeparate(t *testing.T) {
	for _, spec := range Specs() {
		props := GoProps(spec)
		if props["Value"] != "root-query" || props["Placeholder"] != "Find commands <safe>" {
			t.Fatalf("%s: incorrect root query/placeholder", spec.ID)
		}
		rows := props["Items"].([]map[string]any)
		if spec.Rows == "empty" && (rows == nil || len(rows) != 0) {
			t.Fatal("empty rows must be an allocated empty array")
		}
		for _, row := range rows {
			if row["Value"] == props["Value"] {
				t.Fatalf("%s: leaf value aliases root query", spec.ID)
			}
		}
	}
}

func TestWritePropagatesErrorsAndRejectsUnknownRowKinds(t *testing.T) {
	sentinel := errors.New("fixture failure")
	render := func(io.Writer, Spec) error { return sentinel }
	for _, full := range []bool{false, true} {
		if err := Write(&bytes.Buffer{}, render, full, Spec{ID: "primary"}); !errors.Is(err, sentinel) {
			t.Fatalf("renderer error=%v", err)
		}
		if err := Write(&bytes.Buffer{}, render, full, Spec{ID: "primary", Rows: "unknown"}); err == nil || errors.Is(err, sentinel) {
			t.Fatalf("invalid row kind was not rejected: %v", err)
		}
	}
	if err := Write(failingWriter{sentinel}, render, true, Spec{ID: "primary"}); !errors.Is(err, sentinel) {
		t.Fatalf("writer error=%v", err)
	}
}

type failingWriter struct{ err error }

func (w failingWriter) Write([]byte) (int, error) { return 0, w.err }
