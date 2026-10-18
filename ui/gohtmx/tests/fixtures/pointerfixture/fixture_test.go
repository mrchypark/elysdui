package pointerfixture

import (
	"bytes"
	"errors"
	"io"
	"testing"
)

func TestRowsRetainAllocatedEmptyChildren(t *testing.T) {
	if rows := GoRows("empty"); rows == nil || len(rows) != 0 {
		t.Fatal("empty panel must be allocated, not nil")
	}
	found := false
	for _, row := range GoRows("") {
		if row["Value"] == "empty-child" {
			found = true
			items, ok := row["Items"].([]map[string]any)
			if !ok || items == nil || len(items) != 0 {
				t.Fatal("empty child must carry allocated Items")
			}
		}
	}
	if !found {
		t.Fatal("empty child fixture is missing")
	}
}

func TestExpectedRolesRetainAliasAndPanelBoundaries(t *testing.T) {
	for _, alias := range Aliases() {
		want := "menuitem"
		if alias == "CheckboxMenuItem" || alias == "RadioMenuItem" {
			want = "menuitemcheckbox"
		}
		for _, value := range []string{"first", "plain", "off", "last"} {
			if got := ExpectedRole(alias, value); got != want {
				t.Errorf("%s/%s role=%s want %s", alias, value, got, want)
			}
		}
		for _, value := range []string{"branch", "empty-child", "alloff-child", "child-first", "child-plain", "off-child"} {
			if got := ExpectedRole(alias, value); got != "menuitem" {
				t.Errorf("%s/%s inherited a root-only selection role", alias, value)
			}
		}
		if ExpectedRole(alias, "check") != "menuitemcheckbox" || ExpectedRole(alias, "radio-a") != "menuitemradio" || ExpectedRole(alias, "child-radio-a") != "menuitemradio" {
			t.Errorf("%s lost explicit selection semantics", alias)
		}
	}
}

func TestWritePropagatesRendererAndWriterErrors(t *testing.T) {
	sentinel := errors.New("fixture failure")
	render := func(io.Writer, Spec) error { return sentinel }
	spec := Spec{ID: "primary", Component: "Menu"}
	for _, full := range []bool{false, true} {
		if err := Write(&bytes.Buffer{}, render, full, spec); !errors.Is(err, sentinel) {
			t.Fatalf("renderer error=%v", err)
		}
	}
	if err := Write(failingWriter{sentinel}, render, true, spec); !errors.Is(err, sentinel) {
		t.Fatalf("writer error=%v", err)
	}
}

type failingWriter struct{ err error }

func (w failingWriter) Write([]byte) (int, error) { return 0, w.err }
