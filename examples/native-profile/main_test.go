package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/mrchypark/elysdui/sdui"
)

const demoURL = "http://127.0.0.1:8094"

func testHandler(t *testing.T) *server {
	t.Helper()
	handler, err := NewHandler()
	if err != nil {
		t.Fatal(err)
	}
	return handler.(*server)
}

func requestID(n int) string { return fmt.Sprintf("00000000-0000-4000-8000-%012d", n) }

func loadURL(id string) string {
	return demoURL + "/native/profile?" + url.Values{
		"protocolVersion": {"1"}, "requestID": {id}, "capabilities": {strings.Join(sdui.NativeCapabilities(), ",")},
	}.Encode()
}

type nativeClient struct {
	handler http.Handler
	cookie  *http.Cookie
	ready   sdui.NativeEnvelope
}

func startClient(t *testing.T, handler http.Handler) nativeClient {
	t.Helper()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, loadURL(requestID(1)), nil))
	if response.Code != 200 {
		t.Fatalf("initial load: %d %s", response.Code, response.Body.String())
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected one cookie, got %#v", cookies)
	}
	return nativeClient{handler: handler, cookie: cookies[0], ready: envelope(t, response)}
}

func envelope(t *testing.T, response *httptest.ResponseRecorder) sdui.NativeEnvelope {
	t.Helper()
	var value sdui.NativeEnvelope
	if err := json.Unmarshal(response.Body.Bytes(), &value); err != nil {
		t.Fatalf("invalid envelope: %v; %s", err, response.Body.String())
	}
	if value.ProtocolVersion != "1" || value.ScreenID != "profile" || value.Region.ID != profileRegion {
		t.Fatalf("incomplete envelope: %s", response.Body.String())
	}
	return value
}

func (c nativeClient) action(id int, name string) sdui.NativeActionRequest {
	return sdui.NativeActionRequest{
		ProtocolVersion: "1", ScreenID: "profile", ScreenRevision: c.ready.ScreenRevision,
		SessionID: c.ready.SessionID, RequestID: requestID(id), DataVersion: c.ready.DataVersion,
		NodeID: "profile-form", Event: "submit", Action: "save-profile", Target: profileRegion,
		Fields: map[string]string{"displayName": name}, EditRevisions: map[string]uint64{"displayName": 1}, Capabilities: sdui.NativeCapabilities(),
	}
}

func (c nativeClient) post(action sdui.NativeActionRequest, change func(*http.Request)) *httptest.ResponseRecorder {
	body, err := json.Marshal(action)
	if err != nil {
		panic(err)
	}
	return c.postBytes(body, change)
}

func (c nativeClient) postBytes(body []byte, change func(*http.Request)) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, demoURL+"/native/profile", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-CSRF-Token", c.ready.CSRFToken)
	if c.cookie != nil {
		r.AddCookie(c.cookie)
	}
	if change != nil {
		change(r)
	}
	w := httptest.NewRecorder()
	c.handler.ServeHTTP(w, r)
	return w
}

func (c nativeClient) reload(id int) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, loadURL(requestID(id)), nil)
	if c.cookie != nil {
		r.AddCookie(c.cookie)
	}
	w := httptest.NewRecorder()
	c.handler.ServeHTTP(w, r)
	return w
}

func nodeByID(node sdui.NativeNode, id string) *sdui.NativeNode {
	if node.ID == id {
		return &node
	}
	for _, child := range node.Children {
		if result := nodeByID(child, id); result != nil {
			return result
		}
	}
	return nil
}

func TestNativeInitialLoadAndSharedWebScreen(t *testing.T) {
	h := testHandler(t)
	c := startClient(t, h)
	if c.ready.Status != "ready" || c.ready.Fields["displayName"] != "Ada" || c.ready.DataVersion != 0 || len(c.ready.Errors) != 0 || len(c.ready.AcknowledgedEdits) != 0 {
		t.Fatalf("unexpected ready envelope: %#v", c.ready)
	}
	if c.cookie.Name != sessionCookie || !c.cookie.HttpOnly || c.cookie.SameSite != http.SameSiteStrictMode || c.cookie.MaxAge != 3600 || c.cookie.Path != "/" {
		t.Fatalf("unsafe demo cookie: %#v", c.cookie)
	}
	if c.ready.SessionID == c.cookie.Value || c.ready.CSRFToken == c.cookie.Value || c.ready.CSRFToken == c.ready.SessionID {
		t.Fatal("public correlation ID, CSRF and bearer cookie must be independent")
	}
	if len(c.cookie.Value) < 32 || len(c.ready.SessionID) < 32 || len(c.ready.CSRFToken) < 32 {
		t.Fatal("insufficient token entropy")
	}
	form := nodeByID(c.ready.Region, "profile-form")
	wantEvents := []sdui.Event{{On: "submit", Action: "save-profile", Target: profileRegion}}
	if form == nil || !reflect.DeepEqual(form.Events, wantEvents) {
		t.Fatalf("wrong action contract: %#v", form)
	}
	input := nodeByID(c.ready.Region, "display-name")
	if input == nil || input.Props["value"] != "Ada" || input.Props["type"] != "text" {
		t.Fatalf("input not resolved: %#v", input)
	}
	if nodeByID(c.ready.Region, "profile-error") != nil {
		t.Fatal("empty validation notice should be resolved out")
	}
	r := httptest.NewRequest(http.MethodGet, demoURL+"/", nil)
	r.AddCookie(c.cookie)
	web := httptest.NewRecorder()
	h.ServeHTTP(web, r)
	if web.Code != 200 {
		t.Fatalf("web load: %d %s", web.Code, web.Body.String())
	}
	for _, wanted := range []string{"<!doctype html>", `id="profile-region"`, `id="profile-form"`, `name="displayName"`, `value="Ada"`, `id="profile-status"`, "Edit your display name.", "/assets/sdui.js"} {
		if !strings.Contains(web.Body.String(), wanted) {
			t.Errorf("shared HTML missing %q", wanted)
		}
	}
	for _, path := range []string{"/assets/sdui.js", "/assets/app.css"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, demoURL+path, nil))
		if w.Code != 200 || w.Body.Len() == 0 {
			t.Fatalf("asset %s: %d", path, w.Code)
		}
	}
	get := c.reload(2)
	if get.Header().Get("Cache-Control") != "no-store, no-transform" || get.Header().Get("X-Content-Type-Options") != "nosniff" || get.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("unsafe headers: %v", get.Header())
	}
	if len(get.Result().Cookies()) != 0 || envelope(t, get).SessionID != c.ready.SessionID {
		t.Fatal("existing valid session should be retained")
	}
}

func TestNativeValidationCanonicalSaveAndReplay(t *testing.T) {
	c := startClient(t, testHandler(t))
	invalidRequest := c.action(2, " X ")
	invalidRequest.EditRevisions["displayName"] = 7
	invalid := c.post(invalidRequest, nil)
	if invalid.Code != 422 {
		t.Fatalf("validation: %d %s", invalid.Code, invalid.Body.String())
	}
	bad := envelope(t, invalid)
	if bad.Status != "invalid" || bad.Errors["displayName"] == "" || bad.Fields["displayName"] != "Ada" || bad.DataVersion != 0 || bad.AcknowledgedEdits["displayName"] != 7 {
		t.Fatalf("invalid result: %#v", bad)
	}
	if nodeByID(bad.Region, "profile-error") != nil {
		t.Fatal("request-scoped errors must stay in envelope.Errors so newer drafts can suppress them")
	}
	if status := nodeByID(bad.Region, "profile-status"); status != nil {
		t.Fatal("status belongs only in envelope.Message to prevent duplicate native announcements")
	}
	request := c.action(3, "  Grace Hopper\u2003")
	request.EditRevisions["displayName"] = 8
	saved := c.post(request, nil)
	if saved.Code != 200 {
		t.Fatalf("save: %d %s", saved.Code, saved.Body.String())
	}
	result := envelope(t, saved)
	if result.Status != "saved" || result.Fields["displayName"] != "Grace Hopper" || result.DataVersion != 1 || result.AcknowledgedEdits["displayName"] != 8 || len(result.Errors) != 0 {
		t.Fatalf("saved result: %#v", result)
	}
	if got := c.post(request, nil); got.Code != 200 || !bytes.Equal(got.Body.Bytes(), saved.Body.Bytes()) {
		t.Fatal("exact retry must return byte-identical saved response before stale data-version checking")
	}
	request.Fields["displayName"] = "Changed"
	if got := c.post(request, nil); got.Code != 409 || !strings.Contains(got.Body.String(), "request_id_reused") {
		t.Fatalf("changed retry: %d %s", got.Code, got.Body.String())
	}
	loaded := envelope(t, c.reload(4))
	if loaded.DataVersion != 1 || loaded.Fields["displayName"] != "Grace Hopper" {
		t.Fatal("retry mutated persisted state")
	}
}

func TestNativeUnicodeValidation(t *testing.T) {
	for _, test := range []struct {
		name      string
		input     string
		status    int
		canonical string
	}{
		{"two Unicode characters", "  李雷  ", 200, "李雷"},
		{"sixty Unicode characters", strings.Repeat("界", 60), 200, strings.Repeat("界", 60)},
		{"sixty-one Unicode characters", strings.Repeat("界", 61), 422, "Ada"},
		{"one Unicode character", "界", 422, "Ada"},
		{"blank", "\u2003 \t", 422, "Ada"},
	} {
		t.Run(test.name, func(t *testing.T) {
			c := startClient(t, testHandler(t))
			got := c.post(c.action(2, test.input), nil)
			if got.Code != test.status {
				t.Fatalf("status=%d want=%d: %s", got.Code, test.status, got.Body.String())
			}
			if envelope(t, got).Fields["displayName"] != test.canonical {
				t.Fatal("incorrect canonical field")
			}
		})
	}
}

func TestNativeStaleSchemaAndDataConflicts(t *testing.T) {
	c := startClient(t, testHandler(t))
	staleSchema := c.action(2, "Grace")
	staleSchema.ScreenRevision = "old-definition"
	response := c.post(staleSchema, nil)
	if response.Code != 409 {
		t.Fatalf("schema status: %d", response.Code)
	}
	conflict := envelope(t, response)
	if conflict.Status != "conflict" || conflict.ScreenRevision != c.ready.ScreenRevision || conflict.DataVersion != 0 || conflict.Fields["displayName"] != "Ada" || conflict.AcknowledgedEdits["displayName"] != 1 {
		t.Fatal("schema conflict must return current snapshot and acknowledged edit revisions")
	}
	if got := c.post(c.action(3, "Grace"), nil); got.Code != 200 {
		t.Fatalf("save: %d %s", got.Code, got.Body.String())
	}
	staleData := c.action(4, "Linus")
	response = c.post(staleData, nil)
	if response.Code != 409 {
		t.Fatalf("data status: %d", response.Code)
	}
	conflict = envelope(t, response)
	if conflict.Status != "conflict" || conflict.DataVersion != 1 || conflict.Fields["displayName"] != "Grace" {
		t.Fatal("stale write changed profile or lacks authoritative baseline")
	}
	staleData.RequestID = requestID(5)
	staleData.DataVersion = conflict.DataVersion
	if got := c.post(staleData, nil); got.Code != 200 || envelope(t, got).DataVersion != 2 {
		t.Fatalf("explicit conflict retry failed: %d %s", got.Code, got.Body.String())
	}
}

func TestNativeAuthenticationCSRFAndExactAction(t *testing.T) {
	h := testHandler(t)
	c := startClient(t, h)
	other := startClient(t, h)
	tests := []struct {
		name         string
		changeAction func(*sdui.NativeActionRequest)
		changeHTTP   func(*http.Request)
		status       int
	}{
		{"no cookie", nil, func(r *http.Request) { r.Header.Del("Cookie") }, 401},
		{"public session ID is not authentication", nil, func(r *http.Request) {
			r.Header.Del("Cookie")
			r.AddCookie(&http.Cookie{Name: sessionCookie, Value: c.ready.SessionID})
		}, 401},
		{"duplicate cookie", nil, func(r *http.Request) { r.AddCookie(c.cookie) }, 401},
		{"no csrf", nil, func(r *http.Request) { r.Header.Del("X-CSRF-Token") }, 403},
		{"wrong csrf", nil, func(r *http.Request) { r.Header.Set("X-CSRF-Token", "bad") }, 403},
		{"another session csrf", nil, func(r *http.Request) { r.Header.Set("X-CSRF-Token", other.ready.CSRFToken) }, 403},
		{"duplicate csrf", nil, func(r *http.Request) { r.Header.Add("X-CSRF-Token", c.ready.CSRFToken) }, 403},
		{"another public session ID", func(a *sdui.NativeActionRequest) { a.SessionID = other.ready.SessionID }, nil, 403},
		{"wrong screen", func(a *sdui.NativeActionRequest) { a.ScreenID = "other" }, nil, 403},
		{"wrong node", func(a *sdui.NativeActionRequest) { a.NodeID = "display-name" }, nil, 403},
		{"wrong event", func(a *sdui.NativeActionRequest) { a.Event = "change" }, nil, 403},
		{"wrong action", func(a *sdui.NativeActionRequest) { a.Action = "delete-profile" }, nil, 403},
		{"wrong target", func(a *sdui.NativeActionRequest) { a.Target = "other-region" }, nil, 403},
		{"wrong protocol", func(a *sdui.NativeActionRequest) { a.ProtocolVersion = "2" }, nil, 400},
		{"bad request ID", func(a *sdui.NativeActionRequest) { a.RequestID = "" }, nil, 400},
		{"extra field", func(a *sdui.NativeActionRequest) { a.Fields["admin"] = "true" }, nil, 400},
		{"missing field", func(a *sdui.NativeActionRequest) { a.Fields = map[string]string{} }, nil, 400},
		{"wrong field", func(a *sdui.NativeActionRequest) { a.Fields = map[string]string{"name": "Grace"} }, nil, 400},
		{"missing edit revision", func(a *sdui.NativeActionRequest) { a.EditRevisions = map[string]uint64{} }, nil, 400},
		{"wrong edit revision field", func(a *sdui.NativeActionRequest) { a.EditRevisions = map[string]uint64{"other": 1} }, nil, 400},
		{"query", nil, func(r *http.Request) { r.URL.RawQuery = "admin=true" }, 400},
		{"wrong origin", nil, func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") }, 403},
		{"cross-site request", nil, func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "cross-site") }, 403},
		{"DNS rebinding host", nil, func(r *http.Request) { r.Host = "attacker.example:8094" }, 403},
	}
	for i, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			action := c.action(10+i, "Grace")
			if test.changeAction != nil {
				test.changeAction(&action)
			}
			got := c.post(action, test.changeHTTP)
			if got.Code != test.status {
				t.Fatalf("status=%d want=%d: %s", got.Code, test.status, got.Body.String())
			}
		})
	}
	if got := envelope(t, c.reload(90)); got.DataVersion != 0 {
		t.Fatal("unauthorized request mutated profile")
	}
	if got := c.post(c.action(91, "Grace"), func(r *http.Request) { r.Header.Set("Origin", demoURL) }); got.Code != 200 {
		t.Fatalf("same-origin request: %d %s", got.Code, got.Body.String())
	}
	if got := envelope(t, other.reload(92)); got.Fields["displayName"] != "Ada" || got.DataVersion != 0 {
		t.Fatal("profiles leak between sessions")
	}
	if got := other.post(other.action(91, "Linus"), nil); got.Code != 200 || envelope(t, got).DataVersion != 1 {
		t.Fatal("request IDs must be scoped to authenticated session")
	}
}

func TestNativeCapabilitiesMethodsAndReadOnlyLoad(t *testing.T) {
	h := testHandler(t)
	for _, query := range []string{
		"protocolVersion=2&requestID=" + requestID(1) + "&capabilities=" + strings.Join(sdui.NativeCapabilities(), ","),
		"protocolVersion=1&requestID=" + requestID(1) + "&capabilities=region,text",
		"protocolVersion=1&requestID=" + requestID(1) + "&capabilities=region,form,stack,text,input,button,notice,notice",
		"protocolVersion=1&requestID=" + requestID(1) + "&capabilities=region,form,stack,text,input,button,notice&admin=true",
		"protocolVersion=1&protocolVersion=1&requestID=" + requestID(1) + "&capabilities=region,form,stack,text,input,button,notice",
	} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, demoURL+"/native/profile?"+query, nil))
		if w.Code != 400 && w.Code != 406 {
			t.Fatalf("malformed query accepted: %d %s", w.Code, w.Body.String())
		}
		if len(w.Result().Cookies()) != 0 {
			t.Fatal("invalid load must not create a session")
		}
	}
	if len(h.sessions) != 0 {
		t.Fatal("capability/version failures created state")
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodPut, demoURL+"/native/profile", nil))
	if w.Code != 405 || w.Header().Get("Allow") != "GET, POST" {
		t.Fatal("unexpected method accepted")
	}
	c := startClient(t, h)
	request := c.action(2, "Grace")
	request.Capabilities = []string{"region", "text"}
	if got := c.post(request, nil); got.Code != 406 {
		t.Fatalf("missing native capability: %d", got.Code)
	}
	for i := 0; i < 3; i++ {
		got := envelope(t, c.reload(3+i))
		if got.DataVersion != 0 || got.Fields["displayName"] != "Ada" {
			t.Fatal("GET changed business data")
		}
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.sessions[c.cookie.Value].Replays) != 0 {
		t.Fatal("read-only loads consume mutation replay slots")
	}
}

func TestNativeStrictJSONAndBodyLimits(t *testing.T) {
	c := startClient(t, testHandler(t))
	valid, _ := json.Marshal(c.action(2, "Grace"))
	for _, test := range []struct {
		name   string
		body   []byte
		change func(*http.Request)
		status int
	}{
		{"unknown member", append(append([]byte{}, valid[:len(valid)-1]...), []byte(`,"admin":true}`)...), nil, 400},
		{"duplicate key", append(append([]byte{}, valid[:len(valid)-1]...), []byte(`,"dataVersion":0}`)...), nil, 400},
		{"nested duplicate field", bytes.Replace(valid, []byte(`"displayName":"Grace"`), []byte(`"displayName":"Grace","displayName":"Linus"`), 1), nil, 400},
		{"wrong field type", bytes.Replace(valid, []byte(`"displayName":"Grace"`), []byte(`"displayName":123`), 1), nil, 400},
		{"missing version member", bytes.Replace(valid, []byte(`"dataVersion":0,`), nil, 1), nil, 400},
		{"case alias", bytes.Replace(valid, []byte(`"dataVersion"`), []byte(`"DataVersion"`), 1), nil, 400},
		{"null version", bytes.Replace(valid, []byte(`"dataVersion":0`), []byte(`"dataVersion":null`), 1), nil, 400},
		{"null field value", bytes.Replace(valid, []byte(`"displayName":"Grace"`), []byte(`"displayName":null`), 1), nil, 400},
		{"null revision", bytes.Replace(valid, []byte(`"displayName":1`), []byte(`"displayName":null`), 1), nil, 400},
		{"fractional edit revision", bytes.Replace(valid, []byte(`"displayName":1`), []byte(`"displayName":1.5`), 1), nil, 400},
		{"unsafe edit revision", bytes.Replace(valid, []byte(`"displayName":1`), []byte(`"displayName":9007199254740992`), 1), nil, 400},
		{"unsafe data version", bytes.Replace(valid, []byte(`"dataVersion":0`), []byte(`"dataVersion":9007199254740992`), 1), nil, 400},
		{"trailing object", append(append([]byte{}, valid...), []byte(`{}`)...), nil, 400},
		{"invalid UTF-8", bytes.Replace(valid, []byte("Grace"), []byte{0xff}, 1), nil, 400},
		{"too large", []byte(strings.Repeat(" ", maxBodyBytes+1)), nil, 413},
		{"wrong content type", valid, func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") }, 415},
		{"wrong charset", valid, func(r *http.Request) { r.Header.Set("Content-Type", "application/json; charset=latin1") }, 415},
		{"compressed body", valid, func(r *http.Request) { r.Header.Set("Content-Encoding", "gzip") }, 415},
	} {
		t.Run(test.name, func(t *testing.T) {
			got := c.postBytes(test.body, test.change)
			if got.Code != test.status {
				t.Fatalf("status=%d want=%d: %s", got.Code, test.status, got.Body.String())
			}
		})
	}
	if envelope(t, c.reload(3)).DataVersion != 0 {
		t.Fatal("invalid body mutated profile")
	}
}

func TestNativeFullRequestFingerprint(t *testing.T) {
	c := startClient(t, testHandler(t))
	original := c.action(2, "Grace")
	first := c.post(original, nil)
	if first.Code != 200 {
		t.Fatal(first.Body.String())
	}
	for _, change := range []func(*sdui.NativeActionRequest){
		func(a *sdui.NativeActionRequest) { a.DataVersion = 1 },
		func(a *sdui.NativeActionRequest) { a.ScreenRevision = "other" },
		func(a *sdui.NativeActionRequest) { a.EditRevisions["displayName"] = 2 },
		func(a *sdui.NativeActionRequest) { a.Capabilities = append(a.Capabilities, "future") },
		func(a *sdui.NativeActionRequest) { a.Fields["displayName"] = "Grace " },
	} {
		action := c.action(2, "Grace")
		change(&action)
		if got := c.post(action, nil); got.Code != 409 {
			t.Fatalf("changed request content accepted: %d %s", got.Code, got.Body.String())
		}
	}
	// Formatting and object-key order are not content. Semantic exact retries
	// share a fingerprint even when the JSON transport is re-serialized.
	pretty, _ := json.MarshalIndent(original, "", "  ")
	if got := c.postBytes(pretty, nil); got.Code != 200 || !bytes.Equal(got.Body.Bytes(), first.Body.Bytes()) {
		t.Fatal("equivalent JSON should replay")
	}
}

func TestNativeConcurrentRetryIsAtomic(t *testing.T) {
	c := startClient(t, testHandler(t))
	const count = 24
	responses := make(chan *httptest.ResponseRecorder, count)
	var group sync.WaitGroup
	for i := 0; i < count; i++ {
		group.Add(1)
		go func() { defer group.Done(); responses <- c.post(c.action(2, "Grace"), nil) }()
	}
	group.Wait()
	close(responses)
	var first string
	for response := range responses {
		if response.Code != 200 {
			t.Fatalf("concurrent retry: %d %s", response.Code, response.Body.String())
		}
		if first == "" {
			first = response.Body.String()
		} else if first != response.Body.String() {
			t.Fatal("retry response changed")
		}
	}
	if envelope(t, c.reload(3)).DataVersion != 1 {
		t.Fatal("duplicate concurrent requests committed more than once")
	}
}

func TestNativeConcurrentDifferentWritesConflict(t *testing.T) {
	c := startClient(t, testHandler(t))
	responses := make(chan *httptest.ResponseRecorder, 2)
	var group sync.WaitGroup
	for i, name := range []string{"Grace", "Linus"} {
		group.Add(1)
		go func(i int, name string) { defer group.Done(); responses <- c.post(c.action(2+i, name), nil) }(i, name)
	}
	group.Wait()
	close(responses)
	statuses := map[int]int{}
	for response := range responses {
		statuses[response.Code]++
	}
	if statuses[200] != 1 || statuses[409] != 1 || envelope(t, c.reload(9)).DataVersion != 1 {
		t.Fatalf("optimistic concurrency not atomic: %v", statuses)
	}
}

func TestNativeSessionExpiryCapacityAndReplayRetention(t *testing.T) {
	t.Run("session expiry", func(t *testing.T) {
		h := testHandler(t)
		c := startClient(t, h)
		h.mu.Lock()
		h.sessions[c.cookie.Value].Expires = time.Now().Add(-time.Second)
		h.mu.Unlock()
		if got := c.post(c.action(2, "Grace"), nil); got.Code != 401 {
			t.Fatal("expired session mutated")
		}
		got := c.reload(3)
		if got.Code != 200 || envelope(t, got).SessionID == c.ready.SessionID || len(got.Result().Cookies()) != 1 {
			t.Fatal("explicit reload should start a fresh demo session")
		}
	})
	t.Run("session capacity", func(t *testing.T) {
		h := testHandler(t)
		for i := 0; i < maxSessions; i++ {
			h.sessions[fmt.Sprintf("fixture-%d", i)] = &session{Expires: time.Now().Add(time.Hour)}
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, loadURL(requestID(1)), nil))
		if w.Code != 503 || len(h.sessions) != maxSessions || len(w.Result().Cookies()) != 0 {
			t.Fatalf("session capacity unbounded: %d", w.Code)
		}
	})
	t.Run("replay capacity never evicts successful keys", func(t *testing.T) {
		h := testHandler(t)
		c := startClient(t, h)
		original := c.action(2, "Grace")
		first := c.post(original, nil)
		if first.Code != 200 {
			t.Fatal(first.Body.String())
		}
		h.mu.Lock()
		for i := 0; i < maxReplays-1; i++ {
			h.sessions[c.cookie.Value].Replays[fmt.Sprintf("fixture-%d", i)] = cachedResponse{}
		}
		h.mu.Unlock()
		newRequest := c.action(3, "Linus")
		newRequest.DataVersion = 1
		if got := c.post(newRequest, nil); got.Code != 403 {
			t.Fatalf("action capacity: %d", got.Code)
		}
		if got := c.post(original, nil); got.Code != 200 || !bytes.Equal(got.Body.Bytes(), first.Body.Bytes()) {
			t.Fatal("capacity must not evict committed request IDs")
		}
		if envelope(t, c.reload(4)).DataVersion != 1 {
			t.Fatal("capacity refusal changed data")
		}
	})
}

func TestNativeAndWebUseSameBusinessProfile(t *testing.T) {
	h := testHandler(t)
	c := startClient(t, h)
	form := url.Values{"displayName": {"  Web User  "}, "_action": {"save-profile"}, "_target": {profileRegion}, "_csrf": {c.ready.CSRFToken}, "_request": {"web-save"}}
	r := httptest.NewRequest(http.MethodPost, demoURL+"/", strings.NewReader(form.Encode()))
	r.AddCookie(c.cookie)
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	r.Header.Set("Idempotency-Key", "web-save")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `id="profile-region"`) || strings.Contains(w.Body.String(), "<!doctype html>") {
		t.Fatalf("web action: %d %s", w.Code, w.Body.String())
	}
	loaded := envelope(t, c.reload(2))
	if loaded.Fields["displayName"] != "Web User" || loaded.DataVersion != 1 {
		t.Fatal("web and native do not share one business store")
	}
	if got := c.post(c.action(3, "Stale native"), nil); got.Code != 409 {
		t.Fatal("native client failed to detect intervening web save")
	}
	c.ready = loaded
	if got := c.post(c.action(4, `<script>alert("x")</script>`), nil); got.Code != 200 {
		t.Fatalf("native string save: %d", got.Code)
	}
	r = httptest.NewRequest(http.MethodGet, demoURL+"/", nil)
	r.AddCookie(c.cookie)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if strings.Contains(w.Body.String(), `<script>alert("x")</script>`) || !strings.Contains(w.Body.String(), "&lt;script&gt;") {
		t.Fatal("native text was treated as trusted HTML by web rendering")
	}
}

// UPDATE_NATIVE_FIXTURES=1 regenerates cross-platform fixtures from real HTTP
// replies. Dynamic correlation/secrets are replaced with explicit fixture data.
func TestNativeFixtures(t *testing.T) {
	c := startClient(t, testHandler(t))
	invalid := c.post(c.action(2, "X"), nil)
	saved := c.post(c.action(3, "  Grace Hopper  "), nil)
	if invalid.Code != 422 || saved.Code != 200 {
		t.Fatal("fixture action failed")
	}
	for name, value := range map[string]sdui.NativeEnvelope{"profile-ready.json": c.ready, "profile-invalid.json": envelope(t, invalid), "profile-saved.json": envelope(t, saved)} {
		value.SessionID = "fixture-session"
		value.CSRFToken = "fixture-csrf"
		value.ScreenRevision = "fixture-revision-2"
		encoded, err := json.MarshalIndent(value, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		encoded = append(encoded, '\n')
		path := filepath.Join("..", "..", "contracts", "native", "profile-v1", "fixtures", name)
		if os.Getenv("UPDATE_NATIVE_FIXTURES") == "1" {
			if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, encoded, 0644); err != nil {
				t.Fatal(err)
			}
		}
		fixture, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read fixture %s: %v; run UPDATE_NATIVE_FIXTURES=1 go test ./examples/native-profile -run TestNativeFixtures", name, err)
		}
		if !bytes.Equal(fixture, encoded) {
			t.Fatalf("fixture %s drifted from actual server response; review and regenerate", name)
		}
	}
}

func TestNativeVersionExhaustionNeverMutates(t *testing.T) {
	h := testHandler(t)
	c := startClient(t, h)
	h.mu.Lock()
	h.sessions[c.cookie.Value].Profile.DataVersion = sdui.MaxNativeRevision
	h.mu.Unlock()
	action := c.action(2, "Grace")
	action.DataVersion = sdui.MaxNativeRevision
	got := c.post(action, nil)
	if got.Code != 403 || !strings.Contains(got.Body.String(), "version_capacity") {
		t.Fatalf("version overflow not blocked: %d %s", got.Code, got.Body.String())
	}
	loaded := envelope(t, c.reload(3))
	if loaded.DataVersion != sdui.MaxNativeRevision || loaded.Fields["displayName"] != "Ada" {
		t.Fatal("version-exhausted action mutated profile")
	}
}

type lockCheckingWriter struct {
	*httptest.ResponseRecorder
	server *server
	locked bool
}

func (w *lockCheckingWriter) Write(body []byte) (int, error) {
	if w.server.mu.TryLock() {
		w.server.mu.Unlock()
	} else {
		w.locked = true
	}
	return w.ResponseRecorder.Write(body)
}

func TestNativeDoesNotHoldBusinessLockWhileWritingHTTP(t *testing.T) {
	h := testHandler(t)
	c := startClient(t, h)
	body, _ := json.Marshal(c.action(2, "Grace"))
	r := httptest.NewRequest(http.MethodPost, demoURL+"/native/profile", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-CSRF-Token", c.ready.CSRFToken)
	r.AddCookie(c.cookie)
	w := &lockCheckingWriter{ResponseRecorder: httptest.NewRecorder(), server: h}
	h.ServeHTTP(w, r)
	if w.Code != 200 || w.locked {
		t.Fatalf("business mutex held during response write: status=%d locked=%v", w.Code, w.locked)
	}
}

func TestNativeUnsupportedTreeFailsBeforeMutation(t *testing.T) {
	h := testHandler(t)
	c := startClient(t, h)
	original := h.plan
	screen, err := sdui.Decode(bytes.NewReader(screenJSON))
	if err != nil {
		t.Fatal(err)
	}
	screen.Root.Children = append(screen.Root.Children, sdui.Node{
		ID: "unsupported-password", Type: "input", Props: map[string]any{"name": "password", "label": "Password", "type": "password"},
	})
	registry, err := sdui.DefaultRegistry()
	if err != nil {
		t.Fatal(err)
	}
	h.plan, err = sdui.Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	if got := c.post(c.action(2, "Grace"), nil); got.Code != 406 || !strings.Contains(got.Body.String(), "unsupported_screen") {
		t.Fatalf("unsupported action tree: %d %s", got.Code, got.Body.String())
	}
	if got := c.reload(3); got.Code != 406 {
		t.Fatalf("unsupported load tree: %d", got.Code)
	}
	h.plan = original
	if got := envelope(t, c.reload(4)); got.DataVersion != 0 || got.Fields["displayName"] != "Ada" {
		t.Fatal("failed native resolution mutated business data")
	}
}

func TestNativeFeedbackAppearsOnlyInEnvelope(t *testing.T) {
	c := startClient(t, testHandler(t))
	invalid := c.post(c.action(2, "X"), nil)
	saved := c.post(c.action(3, "Grace"), nil)
	conflict := c.post(c.action(4, "Linus"), nil)
	if invalid.Code != 422 || saved.Code != 200 || conflict.Code != 409 {
		t.Fatalf("unexpected feedback responses: invalid=%d saved=%d conflict=%d", invalid.Code, saved.Code, conflict.Code)
	}
	for _, response := range []sdui.NativeEnvelope{c.ready, envelope(t, invalid), envelope(t, saved), envelope(t, conflict)} {
		t.Run(response.Status, func(t *testing.T) {
			if response.Message == "" {
				t.Fatal("native status/live announcements must remain in the envelope")
			}
			for _, id := range []string{"profile-status", "profile-error"} {
				if nodeByID(response.Region, id) != nil {
					t.Fatalf("native tree must not duplicate envelope feedback with %s", id)
				}
			}
			encoded, err := json.Marshal(response.Region)
			if err != nil {
				t.Fatal(err)
			}
			for _, message := range append([]string{"Edit your display name.", response.Message}, response.Errors["displayName"]) {
				if message != "" && strings.Contains(string(encoded), message) {
					t.Fatalf("native tree repeats request-scoped feedback %q", message)
				}
			}
		})
	}
}

func TestWebFeedbackRemainsVisible(t *testing.T) {
	h := testHandler(t)
	c := startClient(t, h)
	for i, test := range []struct {
		name       string
		status     int
		message    string
		validation bool
	}{
		{"X", 422, "No changes saved. Check your display name.", true},
		{"Grace", 200, "Profile saved.", false},
	} {
		form := url.Values{
			"displayName": {test.name}, "_action": {"save-profile"}, "_target": {profileRegion},
			"_csrf": {c.ready.CSRFToken}, "_request": {fmt.Sprintf("web-feedback-%d", i)},
		}
		r := httptest.NewRequest(http.MethodPost, demoURL+"/", strings.NewReader(form.Encode()))
		r.AddCookie(c.cookie)
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		r.Header.Set("Idempotency-Key", fmt.Sprintf("web-feedback-%d", i))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != test.status {
			t.Fatalf("web status: got %d want %d: %s", w.Code, test.status, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), `id="profile-status"`) || strings.Count(w.Body.String(), test.message) != 1 {
			t.Fatalf("web feedback must remain visible once: %s", w.Body.String())
		}
		if strings.Contains(w.Body.String(), `id="profile-error"`) != test.validation {
			t.Fatalf("web validation visibility changed: %s", w.Body.String())
		}
		if test.validation && !strings.Contains(w.Body.String(), "Use 2 to 60 characters for your display name.") {
			t.Fatal("web field validation was lost")
		}
	}
}
