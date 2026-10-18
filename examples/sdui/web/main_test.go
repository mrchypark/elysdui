package main

import (
	"bytes"
	"context"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
)

var csrfAttribute = regexp.MustCompile(`data-sdui-csrf="([^"]+)"`)

type demoClient struct {
	handler  http.Handler
	cookie   *http.Cookie
	csrf     string
	revision string
}

func client(t *testing.T, handler http.Handler) demoClient {
	t.Helper()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("GET /: %d: %s", response.Code, response.Body.String())
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		t.Fatalf("expected HTTP-only same-site demo cookie, got %#v", cookies)
	}
	match := csrfAttribute.FindStringSubmatch(response.Body.String())
	if len(match) != 2 || len(match[1]) < 32 {
		t.Fatalf("missing per-session CSRF token: %s", response.Body.String())
	}
	return demoClient{handler: handler, cookie: cookies[0], csrf: match[1], revision: response.Header().Get("X-SDUI-Revision")}
}

func (c demoClient) form(key, name string) url.Values {
	return url.Values{
		"_action": {"save-profile"}, "_target": {"profile-form"}, "_csrf": {c.csrf}, "_request": {key}, "_revision": {c.revision},
		"name": {name}, "enabled": {"on"}, "tag": {"go", "hypermedia"}, "intent": {"save"},
	}
}

func (c demoClient) post(form url.Values, key string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(form.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if c.cookie != nil {
		r.AddCookie(c.cookie)
	}
	if key != "" {
		r.Header.Set("Idempotency-Key", key)
	}
	w := httptest.NewRecorder()
	c.handler.ServeHTTP(w, r)
	return w
}

func handlerForTest(t *testing.T) http.Handler {
	t.Helper()
	t.Setenv("SDUI_SCHEMA", "")
	h, err := NewHandler()
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func TestDemoInitialPageAndAssets(t *testing.T) {
	h := handlerForTest(t)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))
	for _, want := range []string{"<!doctype html>", `id="profile-screen"`, `id="profile-form"`, `id="profile-editor"`, `id="updates-switch"`, "ely-api-forms-entry.js", "/assets/sdui.js", "Local demo only"} {
		if !strings.Contains(w.Body.String(), want) {
			t.Errorf("page missing %q", want)
		}
	}
	for _, unwanted := range []string{"ely-api-all.js", "ely-api-workspace-entry.js", "ely-api-native-entry.js"} {
		if strings.Contains(w.Body.String(), unwanted) {
			t.Errorf("page loads unrelated asset %q", unwanted)
		}
	}
	for _, path := range []string{"/assets/sdui.js", "/assets/ely-api-forms-entry.js", "/assets/app.css"} {
		asset := httptest.NewRecorder()
		h.ServeHTTP(asset, httptest.NewRequest(http.MethodGet, path, nil))
		if asset.Code != http.StatusOK || asset.Body.Len() == 0 {
			t.Errorf("bundled %s: %d (%d bytes)", path, asset.Code, asset.Body.Len())
		}
	}
}

func TestDemoAuthenticationCSRFAndActionAllowlist(t *testing.T) {
	h := handlerForTest(t)
	c := client(t, h)
	tests := []struct {
		name   string
		client demoClient
		change func(url.Values)
		key    string
		status int
	}{
		{"anonymous mutation", demoClient{handler: h, csrf: c.csrf}, nil, "auth", 401},
		{"invalid csrf", c, func(v url.Values) { v.Set("_csrf", "wrong") }, "csrf", 403},
		{"duplicate csrf", c, func(v url.Values) { v.Add("_csrf", c.csrf) }, "duplicate-csrf", 403},
		{"unknown action", c, func(v url.Values) { v.Set("_action", "delete-account") }, "action", 400},
		{"unknown target", c, func(v url.Values) { v.Set("_target", "profile-screen") }, "target", 400},
		{"missing idempotency key", c, nil, "", 400},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			values := test.client.form(test.key, "Ada")
			if test.change != nil {
				test.change(values)
			}
			got := test.client.post(values, test.key)
			if got.Code != test.status {
				t.Fatalf("status = %d, want %d: %s", got.Code, test.status, got.Body.String())
			}
		})
	}
	other := client(t, h)
	values := other.form("other-csrf", "Grace")
	values.Set("_csrf", c.csrf)
	if got := other.post(values, "other-csrf"); got.Code != http.StatusForbidden {
		t.Fatalf("accepted another session's CSRF: %d", got.Code)
	}
}

func TestDemoValidationReplayAndSessionIsolation(t *testing.T) {
	h := handlerForTest(t)
	c := client(t, h)
	invalid := c.post(c.form("invalid", "  "), "invalid")
	if invalid.Code != http.StatusUnprocessableEntity || !strings.Contains(invalid.Body.String(), "Enter a display name.") {
		t.Fatalf("invalid response: %d: %s", invalid.Code, invalid.Body.String())
	}
	name := `<script>alert("x")</script>`
	first := c.post(c.form("first-save", name), "first-save")
	if first.Code != http.StatusOK || !strings.Contains(first.Body.String(), "Save #1.") || strings.Contains(first.Body.String(), name) || !strings.Contains(first.Body.String(), "&lt;script&gt;") {
		t.Fatalf("escaped success: %d: %s", first.Code, first.Body.String())
	}
	if strings.Contains(first.Body.String(), "<!doctype html>") || !strings.Contains(first.Body.String(), `id="profile-form"`) {
		t.Fatal("action must return only the same-ID region")
	}
	replay := c.post(c.form("first-save", name), "first-save")
	if replay.Code != 200 || replay.Body.String() != first.Body.String() {
		t.Fatal("identical retry did not return the exact cached fragment")
	}
	conflict := c.post(c.form("first-save", "changed"), "first-save")
	if conflict.Code != http.StatusConflict {
		t.Fatalf("reusing key for different input: %d", conflict.Code)
	}
	second := c.post(c.form("second-save", "Grace"), "second-save")
	if !strings.Contains(second.Body.String(), "Save #2.") {
		t.Fatalf("retry mutated state more than once: %s", second.Body.String())
	}
	other := client(t, h)
	isolated := other.post(other.form("first-save", "Linus"), "first-save")
	if !strings.Contains(isolated.Body.String(), "Saved Linus.") || !strings.Contains(isolated.Body.String(), "Save #1.") {
		t.Fatalf("sessions share state or replay keys: %s", isolated.Body.String())
	}
}

func TestDemoMultipartPreservesFilesAndRepeatedFields(t *testing.T) {
	c := client(t, handlerForTest(t))
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for name, values := range c.form("upload", "Ada") {
		for _, value := range values {
			if err := writer.WriteField(name, value); err != nil {
				t.Fatal(err)
			}
		}
	}
	file, err := writer.CreateFormFile("attachment", "sample.txt")
	if err != nil {
		t.Fatal(err)
	}
	contents := "A local demo attachment."
	fmt.Fprint(file, contents)
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, "/", &body)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	r.Header.Set("Idempotency-Key", "upload")
	r.AddCookie(c.cookie)
	w := httptest.NewRecorder()
	c.handler.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("multipart: %d: %s", w.Code, w.Body.String())
	}
	for _, want := range []string{fmt.Sprintf("sample.txt (%d bytes)", len(contents)), "Repeated fields: go, hypermedia", "Submitter: save"} {
		if !strings.Contains(w.Body.String(), want) {
			t.Errorf("multipart response missing %q: %s", want, w.Body.String())
		}
	}
}

func TestExternalSchemaValidatedBeforeServing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "screen.json")
	if err := os.WriteFile(path, []byte(`{"version":"1","id":"bad","root":{"id":"root","type":"script"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SDUI_SCHEMA", path)
	if _, err := NewHandler(); err == nil {
		t.Fatal("accepted an unregistered external node type")
	}
	external := bytes.Replace(screenJSON, []byte("Server-driven profile editor"), []byte("External screen loaded at startup"), 1)
	if err := os.WriteFile(path, external, 0600); err != nil {
		t.Fatal(err)
	}
	h, err := NewHandler()
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), "External screen loaded at startup") {
		t.Fatalf("did not use external schema: %d: %s", w.Code, w.Body.String())
	}
}

func TestDemoRejectsUnsupportedLoaderQueries(t *testing.T) {
	c := client(t, handlerForTest(t))
	for _, path := range []string{"/?unsupported=1", "/?page=2", "/?bad=%zz"} {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		r.AddCookie(c.cookie)
		w := httptest.NewRecorder()
		c.handler.ServeHTTP(w, r)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s returned %d", path, w.Code)
		}
	}
}

func TestDemoExpiredSessionCallbacksFailSafely(t *testing.T) {
	s := &server{sessions: map[string]*session{"expired": {Expires: time.Now().Add(-time.Second)}}}
	for _, principal := range []string{"expired", "missing"} {
		request := sdui.Request{Principal: principal, Values: url.Values{"name": {"Ada"}}, HTTPRequest: httptest.NewRequest(http.MethodGet, "/", nil)}
		if _, err := s.load(context.Background(), request); err == nil {
			t.Errorf("load accepted %s session", principal)
		}
		if _, err := s.save(context.Background(), request); err == nil {
			t.Errorf("save accepted %s session", principal)
		}
	}
}

func TestDemoConcurrentSavesKeepLiveCount(t *testing.T) {
	c := client(t, handlerForTest(t))
	const saves = 12
	var workers sync.WaitGroup
	for i := 0; i < saves; i++ {
		workers.Go(func() {
			key := fmt.Sprintf("parallel-%d", i)
			response := c.post(c.form(key, key), key)
			if response.Code != http.StatusOK {
				t.Errorf("parallel save: %d: %s", response.Code, response.Body.String())
			}
		})
	}
	workers.Wait()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.AddCookie(c.cookie)
	w := httptest.NewRecorder()
	c.handler.ServeHTTP(w, r)
	if !strings.Contains(w.Body.String(), fmt.Sprintf("Save #%d.", saves)) {
		t.Fatalf("lost concurrent save count: %s", w.Body.String())
	}
}

func TestDemoOversizedDisplayValuesNeverPersist(t *testing.T) {
	for _, field := range []string{"name", "tag", "intent"} {
		t.Run(field, func(t *testing.T) {
			h := handlerForTest(t)
			c := client(t, h)
			values := c.form("oversized-"+field, "Ada")
			values.Set(field, strings.Repeat("x", 17000))
			response := c.post(values, "oversized-"+field)
			if response.Code != 422 {
				t.Fatalf("got %d: %s", response.Code, response.Body.String())
			}
			response = c.post(c.form("valid-after-"+field, "Grace"), "valid-after-"+field)
			if response.Code != 200 || !strings.Contains(response.Body.String(), "Save #1.") {
				t.Fatalf("invalid value persisted or committed: %d %s", response.Code, response.Body.String())
			}
		})
	}
}
