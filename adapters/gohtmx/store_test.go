package gohtmx

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func storeScreen(text string) Screen {
	return Screen{Version: Version, ID: "screen", Loader: "load", Root: Node{ID: "result", Type: "region", Children: []Node{
		{ID: "message", Type: "text", Props: map[string]any{"text": text}},
		{ID: "save", Type: "button", Props: map[string]any{"label": "Save"}, Event: &Event{On: "click", Action: "save", Target: "result"}},
	}}}
}
func storeConfig(calls *atomic.Int32) Config {
	return Config{Endpoint: "/action", Authenticate: func(*http.Request) (string, error) { return "owner", nil }, Authorize: func(context.Context, string) error { return nil }, CSRF: func(*http.Request) (string, error) { return "csrf", nil }, Loaders: map[string]Loader{"load": func(context.Context, Request) (map[string]any, error) { return nil, nil }}, Actions: map[string]Action{"save": {Targets: []string{"result"}, Authorize: func(context.Context, Request) error { return nil }, Run: func(context.Context, Request) (Result, error) { calls.Add(1); return Result{}, nil }}}}
}
func newStoreTest(t *testing.T) (*Store, *atomic.Int32) {
	t.Helper()
	r, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	calls := new(atomic.Int32)
	s, err := NewStore(storeScreen("first"), r, storeConfig(calls))
	if err != nil {
		t.Fatal(err)
	}
	return s, calls
}
func storePost(s *Store, revision, key string) *httptest.ResponseRecorder {
	values := url.Values{"_action": {"save"}, "_target": {"result"}, "_csrf": {"csrf"}, "_revision": {revision}}
	r := httptest.NewRequest("POST", "/action", strings.NewReader(values.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	r.Header.Set("Idempotency-Key", key)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}
func TestStoreActivateRejectRollbackAndRevision(t *testing.T) {
	s, calls := newStoreTest(t)
	first := s.Snapshot()
	w := httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `data-sdui-revision="`+first.Revision+`"`) {
		t.Fatal(w.Code, w.Body.String())
	}
	if result, err := s.Activate(storeScreen("first"), first.Revision); err != nil || result.Revision != first.Revision {
		t.Fatal("identical screen must be no-op", err)
	}
	invalid := storeScreen("invalid")
	invalid.Root.Type = "missing"
	if _, err := s.Activate(invalid, first.Revision); err == nil {
		t.Fatal("accepted invalid candidate")
	}
	if s.Snapshot().Revision != first.Revision {
		t.Fatal("invalid candidate changed active plan")
	}
	missing := storeScreen("missing loader")
	missing.Loader = "unknown"
	if _, err := s.Activate(missing, first.Revision); err == nil {
		t.Fatal("accepted unknown loader")
	}
	if got := storePost(s, first.Revision, "same"); got.Code != 200 {
		t.Fatal(got.Code, got.Body.String())
	}
	next, err := s.Activate(storeScreen("second"), first.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if got := storePost(s, first.Revision, "new-key"); got.Code != 409 || got.Header().Get("X-SDUI-Reload") != "required" {
		t.Fatal("stale request not rejected", got.Code)
	}
	if got := storePost(s, next.Revision, "same"); got.Code != 409 {
		t.Fatal("activation cleared prior replay record", got.Code)
	}
	if calls.Load() != 1 {
		t.Fatal("duplicate mutation across revision", calls.Load())
	}
	if _, err = s.Activate(storeScreen("third"), first.Revision); !errors.Is(err, ErrRevisionConflict) {
		t.Fatal(err)
	}
	rolled, err := s.Rollback(first.Revision, next.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if rolled.Revision == first.Revision || rolled.Revision == next.Revision {
		t.Fatal("rollback reused stale revision")
	}
	w = httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if !strings.Contains(w.Body.String(), "first") {
		t.Fatal(w.Body.String())
	}
	if _, err = s.Rollback("unknown", rolled.Revision); !errors.Is(err, ErrUnknownRevision) {
		t.Fatal(err)
	}
	if got := storePost(s, "", "missing-revision"); got.Code != 409 {
		t.Fatal(got.Code)
	}
}
func TestStoreConcurrentCASAndPinnedRequest(t *testing.T) {
	s, _ := newStoreTest(t)
	initial := s.Snapshot()
	var successes atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.Activate(storeScreen("next"), initial.Revision); err == nil {
				successes.Add(1)
			} else if !errors.Is(err, ErrRevisionConflict) {
				t.Errorf("unexpected error: %v", err)
			}
		}()
	}
	wg.Wait()
	if successes.Load() != 1 {
		t.Fatal("CAS successes", successes.Load())
	}
	// Capture a request's snapshot before activation. Its pending action completes
	// against that plan, while every subsequent request sees the new revision.
	r, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	calls := new(atomic.Int32)
	c := storeConfig(calls)
	entered, release := make(chan struct{}), make(chan struct{})
	a := c.Actions["save"]
	a.Run = func(context.Context, Request) (Result, error) {
		close(entered)
		<-release
		calls.Add(1)
		return Result{}, nil
	}
	c.Actions["save"] = a
	pinned, err := NewStore(storeScreen("old-snapshot"), r, c)
	if err != nil {
		t.Fatal(err)
	}
	old := pinned.Snapshot()
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- storePost(pinned, old.Revision, "in-flight") }()
	<-entered
	next, err := pinned.Activate(storeScreen("new-snapshot"), old.Revision)
	if err != nil {
		t.Fatal(err)
	}
	close(release)
	response := <-done
	if response.Code != 200 || !strings.Contains(response.Body.String(), "old-snapshot") {
		t.Fatal(response.Code, response.Body.String())
	}
	if got := storePost(pinned, next.Revision, "in-flight"); got.Code != 409 {
		t.Fatal("inflight replay cache not shared", got.Code)
	}
	if calls.Load() != 1 {
		t.Fatal(calls.Load())
	}
}
func TestStoreHistoryBoundsAndFileActivation(t *testing.T) {
	s, _ := newStoreTest(t)
	first := s.Snapshot()
	for i := 0; i < MaxScreenHistory+2; i++ {
		screen := storeScreen(strings.Repeat("x", i+1))
		if _, err := s.Activate(screen, s.Snapshot().Revision); err != nil {
			t.Fatal(err)
		}
	}
	if len(s.History()) != MaxScreenHistory {
		t.Fatal(len(s.History()))
	}
	if _, err := s.Rollback(first.Revision, s.Snapshot().Revision); !errors.Is(err, ErrUnknownRevision) {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "screen.json")
	data, _ := json.Marshal(storeScreen("from-file"))
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.LoadFile(path, s.Snapshot().Revision); err != nil {
		t.Fatal(err)
	}
	active := s.Snapshot().Revision
	if err := os.WriteFile(path, []byte(`{"version":"unknown"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.LoadFile(path, active); err == nil {
		t.Fatal("invalid file activated")
	}
	if s.Snapshot().Revision != active {
		t.Fatal("invalid file changed active revision")
	}
	if _, err := s.LoadFile(path+"missing", active); err == nil {
		t.Fatal("missing file accepted")
	}
}
func TestStoreWatchValidInvalidAndCancellation(t *testing.T) {
	s, _ := newStoreTest(t)
	path := filepath.Join(t.TempDir(), "screen.json")
	if err := os.WriteFile(path, []byte(`{"version":"wrong"}`), 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	results := make(chan error, 8)
	done := make(chan error, 1)
	go func() {
		done <- s.WatchFile(ctx, path, 100*time.Millisecond, func(_ Snapshot, err error) { results <- err })
	}()
	select {
	case err := <-results:
		if err == nil {
			t.Fatal("invalid file activated")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("watch did not report invalid")
	}
	select {
	case <-results:
		t.Fatal("unchanged invalid candidate reported repeatedly")
	case <-time.After(220 * time.Millisecond):
	}
	payload, _ := json.Marshal(storeScreen("watched"))
	if err := os.WriteFile(path, payload, 0600); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-results:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("watch did not activate valid change")
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if err := s.WatchFile(context.Background(), path, time.Millisecond, nil); err == nil {
		t.Fatal("unsafe tight loop accepted")
	}
}
func TestStoreUninitializedAndBadConfig(t *testing.T) {
	var s *Store
	if s.Snapshot().Plan != nil || s.History() != nil {
		t.Fatal("nil state")
	}
	if _, err := s.Activate(Screen{}, ""); err == nil {
		t.Fatal("nil store activated")
	}
	if _, err := s.Rollback("x", "y"); err == nil {
		t.Fatal("nil store rollback")
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
	r, _ := DefaultRegistry()
	if _, err := NewStore(storeScreen("x"), r, Config{}); err == nil {
		t.Fatal("unsafe config accepted")
	}
}
