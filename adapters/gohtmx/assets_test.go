package gohtmx

import (
	"bytes"
	"compress/gzip"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestAdapterAssetsOwnBridge(t *testing.T) {
	if _, err := ui.Files.ReadFile("assets/sdui.js"); err == nil {
		t.Fatal("standalone UI embeds SDUI bridge")
	}
	mux := http.NewServeMux()
	if err := BindAssets(mux); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"assets/app.css", "assets/sdui.css", "assets/sdui.js"} {
		want, err := Files.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		request := httptest.NewRequest("GET", "/"+name, nil)
		request.Header.Set("Accept-Encoding", "gzip, identity;q=0")
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, request)
		if response.Code != 200 || response.Header().Get("Content-Encoding") != "gzip" {
			t.Fatalf("%s: %d %v", name, response.Code, response.Header())
		}
		reader, err := gzip.NewReader(response.Body)
		if err != nil {
			t.Fatal(err)
		}
		got, err := io.ReadAll(reader)
		reader.Close()
		if err != nil || !bytes.Equal(got, want) {
			t.Fatalf("%s changed bytes: %v", name, err)
		}
	}
	seen := map[string]bool{}
	if err := fs.WalkDir(Files, "assets", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		seen[path] = true
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"assets/app.css", "assets/sdui.css", "assets/sdui.js"} {
		if !seen[name] {
			t.Errorf("aggregate export omits %s", name)
		}
	}
}

func TestAggregateFilesystemConformance(t *testing.T) {
	if err := fstest.TestFS(Files, "assets/sdui.js", "assets/app.css", "templates/shadcn-input.html", "LICENSE"); err != nil {
		t.Fatal(err)
	}
}
