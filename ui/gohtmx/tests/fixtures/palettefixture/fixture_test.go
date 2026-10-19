package palettefixture

import (
	"bytes"
	"errors"
	"io"
	"testing"
)

func TestQueryAndCommandValuesRemainDistinct(t *testing.T) {
	for _, spec := range []Spec{Primary("original"), Peer()} {
		props := GoProps(spec)
		if props["Name"] != spec.QueryName || props["Value"] != "" || props["Label"] != "Command search" {
			t.Fatal(props)
		}
		rows := props["Items"].([]map[string]any)
		if len(rows) != 5 {
			t.Fatalf("row count %d", len(rows))
		}
		for _, row := range rows {
			if row["Value"] == props["Value"] || row["Group"] != "Commands" {
				t.Fatalf("invalid query/row/group %v", row)
			}
		}
	}
}

func TestShellPropagatesErrorsAndRejectsUnknownSpec(t *testing.T) {
	sentinel := errors.New("fixture writer failed")
	render := func(io.Writer, Spec) error { return sentinel }
	if err := WriteOwner(&bytes.Buffer{}, render, Primary("fresh")); !errors.Is(err, sentinel) {
		t.Fatal(err)
	}
	if err := WritePage(&bytes.Buffer{}, "go-qualified", render, func(io.Writer) error { return sentinel }); !errors.Is(err, sentinel) {
		t.Fatal(err)
	}
	invalid := Primary("original")
	invalid.OwnerID = `unknown" onclick="alert(1)`
	if err := WriteOwner(&bytes.Buffer{}, render, invalid); err == nil || errors.Is(err, sentinel) {
		t.Fatal("unrecognized fixture owner was rendered")
	}
	if err := WriteOwner(&bytes.Buffer{}, render, Primary("unknown")); err == nil || errors.Is(err, sentinel) {
		t.Fatal("unrecognized generation was rendered")
	}
	if err := WritePage(&bytes.Buffer{}, "unknown", render, func(io.Writer) error { return nil }); err == nil {
		t.Fatal("unrecognized surface was rendered")
	}
}
