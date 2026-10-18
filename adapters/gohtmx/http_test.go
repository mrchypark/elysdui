package gohtmx

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func httpTestPlan(t *testing.T) *Plan {
	t.Helper()
	registry, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	screen := Screen{Version: Version, ID: "test-screen", Loader: "load", Root: Node{ID: "root", Type: "stack", Children: []Node{
		{ID: "save-form", Type: "form", Event: &Event{On: "submit", Action: "save", Target: "result"}, Children: []Node{{ID: "save-button", Type: "button", Props: map[string]any{"label": "Save", "type": "submit"}}}},
		{ID: "other-form", Type: "form", Event: &Event{On: "submit", Action: "other", Target: "result"}},
		{ID: "result", Type: "region", Children: []Node{{ID: "result-text", Type: "text", Bindings: map[string]string{"text": "result"}}}},
	}}}
	plan, err := Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	return plan
}

func httpTestConfig() Config {
	return Config{
		Endpoint:     "/actions",
		Authenticate: func(r *http.Request) (string, error) { return r.Header.Get("X-Test-Principal"), nil },
		Authorize:    func(context.Context, string) error { return nil },
		CSRF:         func(*http.Request) (string, error) { return "test-csrf", nil },
		Loaders: map[string]Loader{"load": func(_ context.Context, r Request) (map[string]any, error) {
			return map[string]any{"result": r.Principal}, nil
		}},
		Actions: map[string]Action{
			"save": {Targets: []string{"result"}, Authorize: func(context.Context, Request) error { return nil }, Run: func(_ context.Context, r Request) (Result, error) {
				return Result{Data: map[string]any{"result": r.Principal + ":" + r.Values.Get("text")}}, nil
			}},
			"other": {Targets: []string{"result"}, Authorize: func(context.Context, Request) error { return nil }, Run: func(_ context.Context, r Request) (Result, error) {
				return Result{Data: map[string]any{"result": "other:" + r.Principal}}, nil
			}},
		},
	}
}

func httpTestHandler(t *testing.T, edit func(*Config)) *Handler {
	t.Helper()
	c := httpTestConfig()
	if edit != nil {
		edit(&c)
	}
	h, err := NewHandler(httpTestPlan(t), c)
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func httpTestValues() url.Values {
	return url.Values{"_csrf": {"test-csrf"}, "_action": {"save"}, "_target": {"result"}, "text": {"hello"}}
}

func httpTestRequest(method, target, key, principal string, values url.Values) *http.Request {
	r := httptest.NewRequest(method, target, strings.NewReader(values.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	r.Header.Set("X-Test-Principal", principal)
	if key != "" {
		r.Header.Set("Idempotency-Key", key)
	}
	return r
}

func httpTestServe(h *Handler, r *http.Request) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func httpTestRun(c *Config, run func(context.Context, Request) (Result, error)) {
	a := c.Actions["save"]
	a.Run = run
	c.Actions["save"] = a
}

func TestHandlerInvalidConfiguration(t *testing.T) {
	plan := httpTestPlan(t)
	cases := []struct {
		name string
		edit func(*Config)
	}{
		{"authenticate", func(c *Config) { c.Authenticate = nil }},
		{"authorize", func(c *Config) { c.Authorize = nil }},
		{"csrf", func(c *Config) { c.CSRF = nil }},
		{"relative endpoint", func(c *Config) { c.Endpoint = "actions" }},
		{"double slash endpoint", func(c *Config) { c.Endpoint = "/a//b" }},
		{"space endpoint", func(c *Config) { c.Endpoint = "/a b" }},
		{"remote endpoint", func(c *Config) { c.Endpoint = "https://evil.example/actions" }},
		{"protocol relative endpoint", func(c *Config) { c.Endpoint = "//evil.example/actions" }},
		{"query endpoint", func(c *Config) { c.Endpoint = "/actions?x=1" }},
		{"fragment endpoint", func(c *Config) { c.Endpoint = "/actions#x" }},
		{"backslash endpoint", func(c *Config) { c.Endpoint = "/\\evil" }},
		{"newline endpoint", func(c *Config) { c.Endpoint = "/actions\n" }},
		{"encoded endpoint", func(c *Config) { c.Endpoint = "/%2factions" }},
		{"negative body limit", func(c *Config) { c.MaxBodyBytes = -1 }},
		{"excessive body limit", func(c *Config) { c.MaxBodyBytes = (64 << 20) + 1 }},
		{"short ttl", func(c *Config) { c.IdempotencyTTL = time.Millisecond }},
		{"long ttl", func(c *Config) { c.IdempotencyTTL = 25 * time.Hour }},
		{"negative capacity", func(c *Config) { c.MaxIdempotencyEntries = -1 }},
		{"excessive capacity", func(c *Config) { c.MaxIdempotencyEntries = 100001 }},
		{"missing loader", func(c *Config) { delete(c.Loaders, "load") }},
		{"nil loader", func(c *Config) { c.Loaders["load"] = nil }},
		{"missing action", func(c *Config) { delete(c.Actions, "save") }},
		{"nil action callback", func(c *Config) { a := c.Actions["save"]; a.Run = nil; c.Actions["save"] = a }},
		{"nil action authorization", func(c *Config) { a := c.Actions["save"]; a.Authorize = nil; c.Actions["save"] = a }},
		{"unauthorized target", func(c *Config) { a := c.Actions["save"]; a.Targets = []string{"other"}; c.Actions["save"] = a }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := httpTestConfig()
			tc.edit(&c)
			if _, err := NewHandler(plan, c); err == nil {
				t.Fatal("invalid configuration accepted")
			}
		})
	}
	if _, err := NewHandler(nil, httpTestConfig()); err == nil {
		t.Fatal("nil plan accepted")
	}
	if _, err := NewHandler(&Plan{}, httpTestConfig()); err == nil {
		t.Fatal("uncompiled zero-value plan accepted")
	}
}

func TestHandlerCopiesConfigurationMaps(t *testing.T) {
	c := httpTestConfig()
	h, err := NewHandler(httpTestPlan(t), c)
	if err != nil {
		t.Fatal(err)
	}
	delete(c.Loaders, "load")
	delete(c.Actions, "save")
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		w := httpTestServe(h, httpTestRequest(method, "/actions", "copy-config", "alice", httpTestValues()))
		if w.Code != 200 {
			t.Fatalf("%s after caller map mutation: %d %s", method, w.Code, w.Body.String())
		}
	}
}

func TestHandlerAuthenticationAndAuthorization(t *testing.T) {
	cases := []struct {
		name      string
		edit      func(*Config)
		principal string
		want      int
	}{
		{"empty principal", nil, "", 401},
		{"authentication error", func(c *Config) {
			c.Authenticate = func(*http.Request) (string, error) { return "alice", errors.New("private auth detail") }
		}, "alice", 401},
		{"global authorization", func(c *Config) {
			c.Authorize = func(context.Context, string) error { return errors.New("private access detail") }
		}, "alice", 403},
		{"csrf issuance error", func(c *Config) {
			c.CSRF = func(*http.Request) (string, error) { return "", errors.New("private token detail") }
		}, "alice", 403},
		{"empty csrf token", func(c *Config) { c.CSRF = func(*http.Request) (string, error) { return "", nil } }, "alice", 403},
		{"action authorization", func(c *Config) {
			a := c.Actions["save"]
			a.Authorize = func(context.Context, Request) error { return errors.New("private action detail") }
			c.Actions["save"] = a
		}, "alice", 403},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int32
			h := httpTestHandler(t, func(c *Config) {
				httpTestRun(c, func(context.Context, Request) (Result, error) { calls.Add(1); return Result{}, nil })
				if tc.edit != nil {
					tc.edit(c)
				}
			})
			w := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "auth", ""+tc.principal, httpTestValues()))
			if w.Code != tc.want {
				t.Fatalf("got %d, want %d: %s", w.Code, tc.want, w.Body.String())
			}
			if calls.Load() != 0 {
				t.Fatal("unauthorized action executed")
			}
			if strings.Contains(w.Body.String(), "private") {
				t.Fatal("internal error exposed")
			}
			if w.Header().Get("Cache-Control") != "no-store, no-transform" || w.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatal("missing security headers")
			}
		})
	}
}

func TestHandlerAuthorizationRecheckedBeforeReplay(t *testing.T) {
	var denyGlobal, denyAction atomic.Bool
	var calls, globalChecks, actionChecks atomic.Int32
	h := httpTestHandler(t, func(c *Config) {
		c.Authorize = func(context.Context, string) error {
			globalChecks.Add(1)
			if denyGlobal.Load() {
				return errors.New("revoked")
			}
			return nil
		}
		a := c.Actions["save"]
		a.Authorize = func(context.Context, Request) error {
			actionChecks.Add(1)
			if denyAction.Load() {
				return errors.New("revoked")
			}
			return nil
		}
		c.Actions["save"] = a
		httpTestRun(c, func(context.Context, Request) (Result, error) {
			calls.Add(1)
			return Result{Data: map[string]any{"result": "private result"}}, nil
		})
	})
	request := func() *httptest.ResponseRecorder {
		return httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "same", "alice", httpTestValues()))
	}
	if w := request(); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	denyGlobal.Store(true)
	if w := request(); w.Code != 403 || strings.Contains(w.Body.String(), "private result") {
		t.Fatalf("global revocation bypassed: %d %s", w.Code, w.Body.String())
	}
	denyGlobal.Store(false)
	denyAction.Store(true)
	if w := request(); w.Code != 403 || strings.Contains(w.Body.String(), "private result") {
		t.Fatalf("action revocation bypassed: %d %s", w.Code, w.Body.String())
	}
	denyAction.Store(false)
	if w := request(); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if calls.Load() != 1 || globalChecks.Load() != 4 || actionChecks.Load() != 3 {
		t.Fatalf("unexpected calls: action=%d global=%d authorization=%d", calls.Load(), globalChecks.Load(), actionChecks.Load())
	}
}

func TestHandlerRejectsInvalidForms(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(url.Values)
		query  string
		key    string
		want   int
	}{
		{"missing csrf", func(v url.Values) { v.Del("_csrf") }, "", "key", 403},
		{"wrong csrf", func(v url.Values) { v.Set("_csrf", "wrong") }, "", "key", 403},
		{"duplicate csrf", func(v url.Values) { v.Add("_csrf", "test-csrf") }, "", "key", 403},
		{"query csrf injection", func(v url.Values) { v.Del("_csrf") }, "?_csrf=test-csrf", "key", 403},
		{"query csrf ignored", nil, "?_csrf=wrong", "key", 200},
		{"missing action", func(v url.Values) { v.Del("_action") }, "", "key", 400},
		{"unknown action", func(v url.Values) { v.Set("_action", "erase") }, "", "key", 400},
		{"duplicate action", func(v url.Values) { v.Add("_action", "save") }, "", "key", 400},
		{"query action injection", func(v url.Values) { v.Del("_action") }, "?_action=save", "key", 400},
		{"query action ignored", nil, "?_action=erase", "key", 200},
		{"unknown region", func(v url.Values) { v.Set("_target", "elsewhere") }, "", "key", 400},
		{"non-region target", func(v url.Values) { v.Set("_target", "save-form") }, "", "key", 400},
		{"duplicate target", func(v url.Values) { v.Add("_target", "result") }, "", "key", 400},
		{"query target injection", func(v url.Values) { v.Del("_target") }, "?_target=result", "key", 400},
		{"missing key", nil, "", "", 400},
		{"punctuation key", nil, "", "bad.key", 400},
		{"overlong key", nil, "", strings.Repeat("x", 129), 400},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := httpTestHandler(t, nil)
			v := httpTestValues()
			if tc.mutate != nil {
				tc.mutate(v)
			}
			w := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions"+tc.query, tc.key, "alice", v))
			if w.Code != tc.want {
				t.Fatalf("got %d, want %d: %s", w.Code, tc.want, w.Body.String())
			}
		})
	}
	t.Run("duplicate header", func(t *testing.T) {
		h := httpTestHandler(t, nil)
		r := httpTestRequest(http.MethodPost, "/actions", "key", "alice", httpTestValues())
		r.Header.Add("Idempotency-Key", "other")
		if w := httpTestServe(h, r); w.Code != 400 {
			t.Fatalf("duplicate key header accepted: %d", w.Code)
		}
	})
}

func TestHandlerMethodPathAndMalformedBody(t *testing.T) {
	h := httpTestHandler(t, nil)
	w := httpTestServe(h, httpTestRequest(http.MethodDelete, "/actions", "key", "alice", nil))
	if w.Code != 405 || w.Header().Get("Allow") != "GET, POST" {
		t.Fatalf("method response: %d %v", w.Code, w.Header())
	}
	w = httpTestServe(h, httpTestRequest(http.MethodPost, "/elsewhere", "key", "alice", httpTestValues()))
	if w.Code != 404 {
		t.Fatalf("wrong action endpoint: %d", w.Code)
	}
	for _, tc := range []struct{ name, contentType, body string }{
		{"invalid url encoding", "application/x-www-form-urlencoded", "_csrf=%zz"},
		{"missing multipart boundary", "multipart/form-data", "nonsense"},
		{"truncated multipart", "multipart/form-data; boundary=sample", "--sample\r\nContent-Disposition: form-data; name=\"_csrf\"\r\n\r\ntest-csrf"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httpTestRequest(http.MethodPost, "/actions", "malformed", "alice", nil)
			r.Body = io.NopCloser(strings.NewReader(tc.body))
			r.Header.Set("Content-Type", tc.contentType)
			if w := httpTestServe(h, r); w.Code != 400 {
				t.Fatalf("malformed form: %d %s", w.Code, w.Body.String())
			}
		})
	}
	t.Run("body too large", func(t *testing.T) {
		h := httpTestHandler(t, func(c *Config) { c.MaxBodyBytes = 64 })
		v := httpTestValues()
		v.Set("text", strings.Repeat("x", 100))
		w := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "large", "alice", v))
		if w.Code != 413 {
			t.Fatalf("oversized body: %d", w.Code)
		}
	})
}

func TestHandlerIdempotencyRepeatedAndConflictingInput(t *testing.T) {
	var calls atomic.Int32
	h := httpTestHandler(t, func(c *Config) {
		httpTestRun(c, func(_ context.Context, r Request) (Result, error) {
			calls.Add(1)
			return Result{Status: 422, Data: map[string]any{"result": "check " + r.Values.Get("text")}}, nil
		})
	})
	first := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "repeat", "alice", httpTestValues()))
	for i := 0; i < 3; i++ {
		w := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "repeat", "alice", httpTestValues()))
		if w.Code != 422 || w.Body.String() != first.Body.String() {
			t.Fatalf("replay differed: %d %s", w.Code, w.Body.String())
		}
	}
	changed := httpTestValues()
	changed.Set("text", "different")
	if w := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "repeat", "alice", changed)); w.Code != 409 {
		t.Fatalf("mismatching input: %d", w.Code)
	}
	if w := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions?business=input", "repeat", "alice", httpTestValues())); w.Code != 409 {
		t.Fatalf("mismatching query: %d", w.Code)
	}
	if calls.Load() != 1 {
		t.Fatalf("action ran %d times", calls.Load())
	}
}

func TestHandlerIdempotencyScope(t *testing.T) {
	var calls atomic.Int32
	h := httpTestHandler(t, func(c *Config) {
		for name, a := range c.Actions {
			actionName := name
			a.Run = func(_ context.Context, r Request) (Result, error) {
				calls.Add(1)
				return Result{Data: map[string]any{"result": actionName + ":" + r.Principal}}, nil
			}
			c.Actions[name] = a
		}
	})
	for _, principal := range []string{"alice", "bob"} {
		for _, action := range []string{"save", "other"} {
			v := httpTestValues()
			v.Set("_action", action)
			w := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "shared-key", principal, v))
			if w.Code != 200 || !strings.Contains(w.Body.String(), action+":"+principal) {
				t.Fatalf("scope leak: %d %s", w.Code, w.Body.String())
			}
		}
	}
	if calls.Load() != 4 {
		t.Fatalf("expected separate principal/action entries, got %d", calls.Load())
	}
}

func TestHandlerIdempotencyConcurrentExactlyOnce(t *testing.T) {
	const clients = 32
	var calls atomic.Int32
	entered := make(chan struct{})
	release := make(chan struct{})
	h := httpTestHandler(t, func(c *Config) {
		httpTestRun(c, func(context.Context, Request) (Result, error) {
			if calls.Add(1) == 1 {
				close(entered)
			}
			<-release
			return Result{Data: map[string]any{"result": "single result"}}, nil
		})
	})
	responses := make(chan *httptest.ResponseRecorder, clients)
	go func() {
		responses <- httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "concurrent", "alice", httpTestValues()))
	}()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("action never started")
	}
	var started sync.WaitGroup
	started.Add(clients - 1)
	for i := 1; i < clients; i++ {
		go func() {
			started.Done()
			responses <- httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "concurrent", "alice", httpTestValues()))
		}()
	}
	started.Wait()
	close(release)
	var expected string
	for i := 0; i < clients; i++ {
		select {
		case w := <-responses:
			if w.Code != 200 {
				t.Fatalf("concurrent request: %d %s", w.Code, w.Body.String())
			}
			if i == 0 {
				expected = w.Body.String()
			} else if w.Body.String() != expected {
				t.Fatal("replay body differs")
			}
		case <-time.After(5 * time.Second):
			t.Fatal("concurrent request deadlocked")
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("concurrent action ran %d times", calls.Load())
	}
}

func TestHandlerCapacityNeverEvictsPendingRequest(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	firstDone := make(chan *httptest.ResponseRecorder, 1)
	var calls atomic.Int32
	h := httpTestHandler(t, func(c *Config) {
		c.MaxIdempotencyEntries = 1
		httpTestRun(c, func(context.Context, Request) (Result, error) {
			calls.Add(1)
			close(entered)
			<-release
			return Result{Data: map[string]any{"result": "done"}}, nil
		})
	})
	go func() {
		firstDone <- httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "pending", "alice", httpTestValues()))
	}()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("action never started")
	}
	// A pending entry is retained even when its nominal expiry is in the past.
	h.mu.Lock()
	for _, entry := range h.replays {
		entry.expires = time.Now().Add(-time.Hour)
	}
	h.mu.Unlock()
	w := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "new-key", "alice", httpTestValues()))
	if w.Code != 503 {
		t.Errorf("capacity response: %d %s", w.Code, w.Body.String())
	}
	changed := httpTestValues()
	changed.Set("text", "changed")
	w = httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "pending", "alice", changed))
	if w.Code != 409 {
		t.Errorf("pending entry was lost: %d", w.Code)
	}
	close(release)
	select {
	case w := <-firstDone:
		if w.Code != 200 {
			t.Errorf("first action failed: %d", w.Code)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("first action deadlocked")
	}
	w = httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "pending", "alice", httpTestValues()))
	if w.Code != 200 || calls.Load() != 1 {
		t.Fatalf("existing replay should work at capacity: status=%d calls=%d", w.Code, calls.Load())
	}
	w = httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "new-key", "alice", httpTestValues()))
	if w.Code != 503 {
		t.Fatalf("unexpired entry unexpectedly evicted: %d", w.Code)
	}
}

func TestHandlerCompletedEntryTTLExpires(t *testing.T) {
	var calls atomic.Int32
	h := httpTestHandler(t, func(c *Config) {
		c.MaxIdempotencyEntries = 1
		c.IdempotencyTTL = time.Second
		httpTestRun(c, func(context.Context, Request) (Result, error) {
			return Result{Data: map[string]any{"result": fmt.Sprint(calls.Add(1))}}, nil
		})
	})
	first := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "expiry", "alice", httpTestValues()))
	if first.Code != 200 {
		t.Fatal(first.Code)
	}
	time.Sleep(1100 * time.Millisecond)
	second := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "expiry", "alice", httpTestValues()))
	if second.Code != 200 || calls.Load() != 2 || first.Body.String() == second.Body.String() {
		t.Fatalf("completed replay did not expire: %d calls=%d body=%s", second.Code, calls.Load(), second.Body.String())
	}
}

func TestHandlerCanceledWaiterDoesNotCancelOwner(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	owner := make(chan *httptest.ResponseRecorder, 1)
	var calls atomic.Int32
	h := httpTestHandler(t, func(c *Config) {
		httpTestRun(c, func(context.Context, Request) (Result, error) {
			calls.Add(1)
			close(entered)
			<-release
			return Result{Data: map[string]any{"result": "owner completed"}}, nil
		})
	})
	go func() {
		owner <- httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "waiter", "alice", httpTestValues()))
	}()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("owner never started")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	waiter := make(chan struct{})
	go func() {
		httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "waiter", "alice", httpTestValues()).WithContext(ctx))
		close(waiter)
	}()
	select {
	case <-waiter:
	case <-time.After(5 * time.Second):
		close(release)
		t.Fatal("canceled waiter blocked")
	}
	close(release)
	select {
	case w := <-owner:
		if w.Code != 200 {
			t.Fatal(w.Code)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("owner blocked")
	}
	w := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "waiter", "alice", httpTestValues()))
	if w.Code != 200 || calls.Load() != 1 {
		t.Fatalf("waiter affected owner: status=%d calls=%d", w.Code, calls.Load())
	}
}

func TestHandlerPanicReleasesConcurrentWaiters(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	responses := make(chan *httptest.ResponseRecorder, 2)
	var calls atomic.Int32
	h := httpTestHandler(t, func(c *Config) {
		httpTestRun(c, func(context.Context, Request) (Result, error) {
			calls.Add(1)
			close(entered)
			<-release
			panic("private panic detail")
		})
	})
	go func() {
		responses <- httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "panic", "alice", httpTestValues()))
	}()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("action never started")
	}
	go func() {
		responses <- httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "panic", "alice", httpTestValues()))
	}()
	close(release)
	for i := 0; i < 2; i++ {
		select {
		case w := <-responses:
			if w.Code != 500 || strings.Contains(w.Body.String(), "private") {
				t.Fatalf("panic result: %d %s", w.Code, w.Body.String())
			}
		case <-time.After(5 * time.Second):
			t.Fatal("panic stranded waiter")
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("panicking action reran %d times", calls.Load())
	}
	h.mu.Lock()
	reserved := h.replayBytes
	h.mu.Unlock()
	if reserved != int64(len("action failed\n")) {
		t.Fatalf("panic leaked replay reservation: %d", reserved)
	}
}

func TestHandlerRenderFailuresNeverWritePartialHTML(t *testing.T) {
	cases := []struct {
		name string
		run  func(context.Context, Request) (Result, error)
	}{
		{"missing binding", func(context.Context, Request) (Result, error) { return Result{Data: map[string]any{}}, nil }},
		{"wrong binding type", func(context.Context, Request) (Result, error) {
			return Result{Data: map[string]any{"result": 123}}, nil
		}},
		{"action error", func(context.Context, Request) (Result, error) { return Result{}, errors.New("private database error") }},
		{"invalid action status", func(context.Context, Request) (Result, error) {
			return Result{Status: 302, Data: map[string]any{"result": "private output"}}, nil
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := httpTestHandler(t, func(c *Config) { httpTestRun(c, tc.run) })
			for i := 0; i < 2; i++ {
				w := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "failure", "alice", httpTestValues()))
				if w.Code != 500 || strings.Contains(w.Body.String(), "<") || strings.Contains(w.Body.String(), "private") {
					t.Fatalf("partial/error data exposed: %d %s", w.Code, w.Body.String())
				}
			}
		})
	}
	t.Run("page render failure", func(t *testing.T) {
		h := httpTestHandler(t, func(c *Config) {
			c.Loaders["load"] = func(context.Context, Request) (map[string]any, error) { return map[string]any{}, nil }
		})
		w := httpTestServe(h, httpTestRequest(http.MethodGet, "/page", "", "alice", nil))
		if w.Code != 500 || strings.Contains(w.Body.String(), "<") {
			t.Fatalf("partial page: %d %s", w.Code, w.Body.String())
		}
	})
	t.Run("loader error", func(t *testing.T) {
		h := httpTestHandler(t, func(c *Config) {
			c.Loaders["load"] = func(context.Context, Request) (map[string]any, error) { return nil, errors.New("private loader error") }
		})
		w := httpTestServe(h, httpTestRequest(http.MethodGet, "/page", "", "alice", nil))
		if w.Code != 400 || strings.Contains(w.Body.String(), "private") {
			t.Fatalf("loader error: %d %s", w.Code, w.Body.String())
		}
	})
}

func TestHandlerPageEscapesBindingsAndIsolatesUsers(t *testing.T) {
	h := httpTestHandler(t, func(c *Config) {
		c.Loaders["load"] = func(_ context.Context, r Request) (map[string]any, error) {
			return map[string]any{"result": r.Principal + r.Values.Get("suffix")}, nil
		}
	})
	const clients = 16
	results := make(chan error, clients)
	for i := 0; i < clients; i++ {
		go func(i int) {
			principal := fmt.Sprintf("user-%02d", i)
			w := httpTestServe(h, httpTestRequest(http.MethodGet, "/page?suffix=%3Cscript%3Ealert(1)%3C/script%3E", "", principal, nil))
			body := w.Body.String()
			if w.Code != 200 || !strings.HasPrefix(body, "<!doctype html>") || !strings.Contains(body, principal+"&lt;script&gt;") || strings.Contains(body, "<script>alert(1)") {
				results <- fmt.Errorf("page %s: %d %s", principal, w.Code, body)
				return
			}
			for j := 0; j < clients; j++ {
				if j != i && strings.Contains(body, fmt.Sprintf("user-%02d", j)) {
					results <- fmt.Errorf("user %d saw user %d", i, j)
					return
				}
			}
			if w.Header().Get("Content-Type") != "text/html; charset=utf-8" || w.Header().Get("Cache-Control") != "no-store, no-transform" || w.Header().Get("Vary") != "Cookie, Authorization, Accept-Encoding" {
				results <- fmt.Errorf("missing page security headers: %v", w.Header())
				return
			}
			results <- nil
		}(i)
	}
	for i := 0; i < clients; i++ {
		if err := <-results; err != nil {
			t.Error(err)
		}
	}
}

func httpTestMultipart(t *testing.T, key, boundary, filename, contentType, content string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.SetBoundary(boundary); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"_csrf", "_action", "_target", "text"} {
		if err := writer.WriteField(name, httpTestValues().Get(name)); err != nil {
			t.Fatal(err)
		}
	}
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="upload"; filename="%s"`, filename))
	header.Set("Content-Type", contentType)
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = io.WriteString(part, content); err != nil {
		t.Fatal(err)
	}
	if err = writer.Close(); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, "/actions", &body)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	r.Header.Set("Idempotency-Key", key)
	r.Header.Set("X-Test-Principal", "alice")
	return r
}

func TestHandlerMultipartCanonicalReplayAndFingerprint(t *testing.T) {
	var calls atomic.Int32
	h := httpTestHandler(t, func(c *Config) {
		httpTestRun(c, func(_ context.Context, r Request) (Result, error) {
			calls.Add(1)
			files := r.Files["upload"]
			if len(files) != 1 {
				return Result{}, errors.New("missing upload")
			}
			file, err := files[0].Open()
			if err != nil {
				return Result{}, err
			}
			defer file.Close()
			content, err := io.ReadAll(file)
			if err != nil {
				return Result{}, err
			}
			return Result{Data: map[string]any{"result": string(content)}}, nil
		})
	})
	first := httpTestServe(h, httpTestMultipart(t, "upload-key", "first-boundary", "note.txt", "text/plain", "hello"))
	second := httpTestServe(h, httpTestMultipart(t, "upload-key", "different-boundary", "note.txt", "text/plain", "hello"))
	if first.Code != 200 || second.Code != 200 || first.Body.String() != second.Body.String() || calls.Load() != 1 {
		t.Fatalf("multipart boundary changed replay: first=%d second=%d calls=%d", first.Code, second.Code, calls.Load())
	}
	for _, tc := range []struct{ name, filename, contentType, content string }{
		{"different same-size bytes", "note.txt", "text/plain", "world"},
		{"different filename", "new.txt", "text/plain", "hello"},
		{"different mime metadata", "note.txt", "text/html", "hello"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httpTestServe(h, httpTestMultipart(t, "upload-key", "third-boundary", tc.filename, tc.contentType, tc.content))
			if w.Code != 409 {
				t.Fatalf("changed multipart input: %d %s", w.Code, w.Body.String())
			}
		})
	}
	if calls.Load() != 1 {
		t.Fatalf("changed multipart input executed: %d", calls.Load())
	}
}

func TestHandlerReplayByteBudgetReservationAndRelease(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	owner := make(chan *httptest.ResponseRecorder, 1)
	var calls atomic.Int32
	h := httpTestHandler(t, func(c *Config) {
		c.MaxReplayBytes = MaxRenderBytes + 1024
		httpTestRun(c, func(context.Context, Request) (Result, error) {
			if calls.Add(1) == 1 {
				close(entered)
				<-release
			}
			return Result{Data: map[string]any{"result": "small result"}}, nil
		})
	})
	go func() {
		owner <- httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "budget-first", "alice", httpTestValues()))
	}()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("owner never started")
	}
	h.mu.Lock()
	reserved := h.replayBytes
	h.mu.Unlock()
	if reserved != MaxRenderBytes {
		t.Errorf("pending reservation = %d, want %d", reserved, MaxRenderBytes)
	}
	w := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "budget-second", "alice", httpTestValues()))
	if w.Code != 503 || calls.Load() != 1 {
		t.Errorf("byte budget must reject before Run: status=%d calls=%d", w.Code, calls.Load())
	}
	close(release)
	var first *httptest.ResponseRecorder
	select {
	case first = <-owner:
	case <-time.After(5 * time.Second):
		t.Fatal("owner blocked")
	}
	if first.Code != 200 {
		t.Fatal(first.Code, first.Body.String())
	}
	h.mu.Lock()
	reserved = h.replayBytes
	h.mu.Unlock()
	if reserved != int64(first.Body.Len()) {
		t.Fatalf("unused reservation retained: %d, want %d", reserved, first.Body.Len())
	}
	second := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "budget-second", "alice", httpTestValues()))
	if second.Code != 200 || calls.Load() != 2 {
		t.Fatalf("released reservation unavailable: status=%d calls=%d", second.Code, calls.Load())
	}
	h.mu.Lock()
	reserved = h.replayBytes
	for _, entry := range h.replays {
		entry.expires = time.Now().Add(-time.Second)
	}
	h.mu.Unlock()
	if reserved != int64(first.Body.Len()+second.Body.Len()) {
		t.Fatalf("completed byte accounting: %d", reserved)
	}
	third := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "budget-third", "alice", httpTestValues()))
	if third.Code != 200 {
		t.Fatal(third.Code, third.Body.String())
	}
	h.mu.Lock()
	reserved, count := h.replayBytes, len(h.replays)
	h.mu.Unlock()
	if count != 1 || reserved != int64(third.Body.Len()) {
		t.Fatalf("expiry failed to release cache bytes: entries=%d bytes=%d", count, reserved)
	}
}

func TestHandlerInvalidReplayByteBudget(t *testing.T) {
	plan := httpTestPlan(t)
	for _, budget := range []int64{-1, MaxRenderBytes - 1, (512 << 20) + 1} {
		c := httpTestConfig()
		c.MaxReplayBytes = budget
		if _, err := NewHandler(plan, c); err == nil {
			t.Fatalf("invalid replay budget %d accepted", budget)
		}
	}
}

func TestHandlerOversizedRenderFailsAtomicallyAndReplays(t *testing.T) {
	registry, err := DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	children := make([]Node, 0, MaxRenderBytes/MaxStringBytes+1)
	for i := 0; i < MaxRenderBytes/MaxStringBytes+1; i++ {
		children = append(children, Node{ID: fmt.Sprintf("large-text-%d", i), Type: "text", Bindings: map[string]string{"text": "result"}})
	}
	screen := Screen{Version: Version, ID: "oversized-screen", Loader: "load", Root: Node{ID: "oversized-root", Type: "stack", Children: []Node{
		{ID: "save-form", Type: "form", Event: &Event{On: "submit", Action: "save", Target: "result"}},
		{ID: "result", Type: "region", Children: children},
	}}}
	plan, err := Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	c := httpTestConfig()
	data := map[string]any{"result": strings.Repeat("x", MaxStringBytes)}
	c.Loaders["load"] = func(context.Context, Request) (map[string]any, error) { return data, nil }
	var calls atomic.Int32
	httpTestRun(&c, func(context.Context, Request) (Result, error) { calls.Add(1); return Result{Data: data}, nil })
	h, err := NewHandler(plan, c)
	if err != nil {
		t.Fatal(err)
	}
	page := httpTestServe(h, httpTestRequest(http.MethodGet, "/page", "", "alice", nil))
	if page.Code != 500 || strings.Contains(page.Body.String(), "<") {
		t.Fatalf("oversized page escaped buffering: status=%d size=%d", page.Code, page.Body.Len())
	}
	for i := 0; i < 2; i++ {
		w := httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "oversized", "alice", httpTestValues()))
		if w.Code != 500 || strings.Contains(w.Body.String(), "<") || w.Body.Len() > 1024 {
			t.Fatalf("oversized fragment escaped buffering: status=%d size=%d", w.Code, w.Body.Len())
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("oversized render re-executed action %d times", calls.Load())
	}
	h.mu.Lock()
	bytesUsed := h.replayBytes
	h.mu.Unlock()
	if bytesUsed > 1024 {
		t.Fatalf("failed oversized output retained %d bytes", bytesUsed)
	}
}

func TestHandlerActionAuthorizationUsesParsedRequestBeforeReplay(t *testing.T) {
	var revoked atomic.Bool
	var runs, checks atomic.Int32
	h := httpTestHandler(t, func(c *Config) {
		a := c.Actions["save"]
		a.Authorize = func(_ context.Context, r Request) error {
			checks.Add(1)
			if revoked.Load() || r.Principal != "alice" || r.Values.Get("resource") != "owned-record" || r.HTTPRequest == nil {
				return errors.New("not authorized for this resource")
			}
			return nil
		}
		a.Run = func(context.Context, Request) (Result, error) {
			runs.Add(1)
			return Result{Data: map[string]any{"result": "private record content"}}, nil
		}
		c.Actions["save"] = a
	})
	values := httpTestValues()
	values.Set("resource", "owned-record")
	request := func() *httptest.ResponseRecorder {
		return httpTestServe(h, httpTestRequest(http.MethodPost, "/actions", "resource-key", "alice", values))
	}
	if w := request(); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	revoked.Store(true)
	if w := request(); w.Code != 403 || strings.Contains(w.Body.String(), "private record") {
		t.Fatalf("resource revocation bypassed on replay: %d %s", w.Code, w.Body.String())
	}
	revoked.Store(false)
	values.Set("resource", "other-users-record")
	if w := request(); w.Code != 403 {
		t.Fatalf("resource authorization must precede input conflict: %d", w.Code)
	}
	values.Set("resource", "owned-record")
	if w := request(); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if runs.Load() != 1 || checks.Load() != 4 {
		t.Fatalf("resource authorization/run counts: checks=%d runs=%d", checks.Load(), runs.Load())
	}
}
