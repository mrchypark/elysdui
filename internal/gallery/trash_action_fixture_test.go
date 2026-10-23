package uiexamples

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTrashActionFixturesAreOptInDistinctAndDoNotMutateCanonical(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	get := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		server.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		return w
	}
	canonicalPath := "/components/audit?aliases=1&family=workspace"
	before := get(canonicalPath)
	if before.Code != 200 {
		t.Fatal(before.Code)
	}
	hashes := map[string]bool{}
	for _, fixture := range []string{"default", "empty", "longpath"} {
		w := get(canonicalPath + "&trash-fixture=" + fixture)
		if w.Code != 200 || w.Header().Get("X-Ely-Audit-Fixture") != "documents/TrashBin@"+fixture {
			t.Fatalf("fixture identity/status: %s", fixture)
		}
		hash := w.Header().Get("X-Ely-Audit-Props-SHA256")
		if len(hash) != 64 || hashes[hash] {
			t.Fatalf("distinct fixture props hash missing: %s", fixture)
		}
		hashes[hash] = true
		body := w.Body.String()
		if strings.Count(body, `data-audit-name="documents/TrashBin"`) != 1 || strings.Count(body, `data-ely-component="documents/TrashBin"`) != 2 {
			t.Fatal("exact public identity and independent main/twin required")
		}
		if fixture == "empty" {
			if strings.Contains(body, "data-ws-trash-confirm") || strings.Count(body, "The trash is empty") != 2 {
				t.Fatal("empty fixture exposed destructive controls")
			}
		} else {
			path := "docs/retired.md"
			if fixture == "longpath" {
				path = "docs/" + strings.Repeat("long-unbroken-path", 12) + "/caller-notes.md"
			}
			for _, want := range []string{path, `data-ely-action="restore-file"`, `data-ely-action="delete-file-permanently"`, `data-ely-action="empty-trash"`} {
				if !strings.Contains(body, want) {
					t.Errorf("%s lost %s", fixture, want)
				}
			}
		}
		if again := get(canonicalPath + "&trash-fixture=" + fixture); again.Header().Get("X-Ely-Audit-Props-SHA256") != hash || again.Body.String() != body {
			t.Fatal("fixture preparation is not deterministic")
		}
	}
	after := get(canonicalPath)
	if before.Body.String() != after.Body.String() || after.Header().Get("X-Ely-Audit-Fixture") != "" {
		t.Fatal("opt-in request mutated canonical audit output")
	}
	for _, path := range []string{canonicalPath + "&trash-fixture=unknown", "/components/audit?family=forms&trash-fixture=empty"} {
		if get(path).Code != 400 {
			t.Fatal("invalid fixture must fail closed")
		}
	}
}
