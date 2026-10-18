// Command native-profile serves one profile schema as Ely HTML and resolved native
// JSON. Automatic, loopback-only demo sessions are not production authentication.
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/sdui"
)

//go:embed screen.json
var screenJSON []byte

//go:embed controls.json
var controlsJSON []byte

const (
	sessionCookie = "ely-native-demo"
	maxSessions   = 256
	maxReplays    = 256
	sessionTTL    = time.Hour
	maxBodyBytes  = 64 << 10
	profileRegion = "profile-region"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var capabilityPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_/-]{0,63}$`)

type profile struct {
	DisplayName   string
	Company       string
	Notifications bool
	DigestConsent bool
	ColorTheme    string
	DataVersion   uint64
}

type cachedResponse struct {
	Fingerprint [32]byte
	Status      int
	Body        []byte
}

type webReplay struct {
	Fingerprint [32]byte
	Result      gohtmx.Result
}

type session struct {
	ID         string // Public response correlation ID, never the bearer cookie.
	CSRF       string
	Expires    time.Time
	Profile    profile
	Replays    map[string]cachedResponse
	WebReplays map[string]webReplay
}

type server struct {
	mu         sync.Mutex
	sessions   map[string]*session // Keyed only by secret random cookie.
	plan       *sdui.Plan
	nativePlan *sdui.Plan
	controls   bool
	revision   string
	mux        *http.ServeMux
}

// NewControlsHandler expands only the native screen. The original web profile
// form remains available and edits only the display name in the same session.
func NewControlsHandler() (http.Handler, error) {
	handler, err := NewHandler()
	if err != nil {
		return nil, err
	}
	screen, err := sdui.Decode(bytes.NewReader(controlsJSON))
	if err != nil {
		return nil, err
	}
	registry, err := sdui.DefaultRegistry()
	if err != nil {
		return nil, err
	}
	plan, err := sdui.Compile(screen, registry)
	if err != nil {
		return nil, err
	}
	s := handler.(*server)
	s.nativePlan, s.controls = plan, true
	s.revision = fmt.Sprintf("sha256-%x", sha256.Sum256(controlsJSON))
	return s, nil
}

var legacyCapabilities = []string{"region", "form", "stack", "text", "input", "button", "notice"}

// NewHandler creates an isolated, bounded in-memory demo. Real applications must
// provide their own authentication and a durable transaction/replay store.
func NewHandler() (http.Handler, error) {
	screen, err := sdui.Decode(bytes.NewReader(screenJSON))
	if err != nil {
		return nil, err
	}
	registry, err := sdui.DefaultRegistry()
	if err != nil {
		return nil, err
	}
	plan, err := sdui.Compile(screen, registry)
	if err != nil {
		return nil, err
	}
	s := &server{
		sessions: make(map[string]*session), plan: plan,
		revision: fmt.Sprintf("sha256-%x", sha256.Sum256(screenJSON)), mux: http.NewServeMux(),
	}
	allowSession := func(_ context.Context, principal string) error {
		s.mu.Lock()
		defer s.mu.Unlock()
		_, err := s.sessionLocked(principal)
		return err
	}
	// Compile the HTML preview independently. The native plans above use only
	// the neutral semantic registry and never need templates or HTML bindings.
	webRegistry, err := gohtmx.DefaultRegistry()
	if err != nil {
		return nil, err
	}
	webPlan, err := gohtmx.Compile(screen, webRegistry)
	if err != nil {
		return nil, err
	}
	web, err := gohtmx.NewHandler(webPlan, gohtmx.Config{
		Endpoint: "/", Authenticate: s.authenticate, Authorize: allowSession, CSRF: s.csrf,
		Loaders: map[string]gohtmx.Loader{"load-profile": s.loadWeb},
		Actions: map[string]gohtmx.Action{"save-profile": {
			Targets:   []string{profileRegion},
			Authorize: func(ctx context.Context, req gohtmx.Request) error { return allowSession(ctx, req.Principal) },
			Run:       s.saveWeb,
		}},
		MaxBodyBytes: maxBodyBytes, RequestCompression: &gohtmx.RequestCompressionOptions{Disabled: true},
		IdempotencyTTL: sessionTTL, MaxIdempotencyEntries: maxSessions * maxReplays,
	})
	if err != nil {
		return nil, err
	}
	if err := gohtmx.BindAssets(s.mux); err != nil {
		return nil, err
	}
	s.mux.HandleFunc("/native/profile", s.nativeProfile)
	s.mux.HandleFunc("GET /favicon.ico", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	s.mux.Handle("/{$}", web)
	return s, nil
}

func token() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, no-transform")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	w.Header().Add("Vary", "Cookie")
	if !localHost(r.Host) {
		writeError(w, http.StatusForbidden, "invalid_host", "Use the configured loopback demo address.")
		return
	}
	// Native apps omit Origin. Browsers must be same-origin; never enable CORS
	// for this automatic-session demo. Host checking also stops DNS rebinding.
	if !sameOrigin(r) {
		writeError(w, http.StatusForbidden, "invalid_origin", "Cross-origin requests are not allowed.")
		return
	}
	if r.Method == http.MethodGet && r.URL.Path == "/" {
		var err error
		r, err = s.bootstrap(w, r)
		if err != nil {
			writeError(w, http.StatusServiceUnavailable, "session_unavailable", err.Error())
			return
		}
	}
	s.mux.ServeHTTP(w, r)
}

func localHost(authority string) bool {
	host := authority
	if parsed, _, err := net.SplitHostPort(authority); err == nil {
		host = parsed
	}
	switch strings.ToLower(host) {
	case "127.0.0.1", "localhost", "::1", "[::1]", "10.0.2.2":
		return true
	default:
		return false
	}
}

func sameOrigin(r *http.Request) bool {
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return false
	}
	origins := r.Header.Values("Origin")
	if len(origins) == 0 {
		return true
	}
	if len(origins) != 1 {
		return false
	}
	origin, err := url.Parse(origins[0])
	if err != nil || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" || origin.Path != "" {
		return false
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return origin.Scheme == scheme && strings.EqualFold(origin.Host, r.Host)
}

func (s *server) bootstrap(w http.ResponseWriter, r *http.Request) (*http.Request, error) {
	if _, err := s.authenticate(r); err == nil {
		return r, nil
	}
	secret, err := token()
	if err != nil {
		return r, errors.New("demo session unavailable")
	}
	id, err := token()
	if err != nil {
		return r, errors.New("demo session unavailable")
	}
	csrf, err := token()
	if err != nil {
		return r, errors.New("demo session unavailable")
	}
	now := time.Now()
	s.mu.Lock()
	for key, value := range s.sessions {
		if !now.Before(value.Expires) {
			delete(s.sessions, key)
		}
	}
	if len(s.sessions) >= maxSessions {
		s.mu.Unlock()
		return r, errors.New("demo session capacity reached; wait for expiry or restart the demo")
	}
	s.sessions[secret] = &session{
		ID: id, CSRF: csrf, Expires: now.Add(sessionTTL), Profile: profile{DisplayName: "Ada", ColorTheme: "system"},
		Replays: make(map[string]cachedResponse), WebReplays: make(map[string]webReplay),
	}
	s.mu.Unlock()
	cookie := &http.Cookie{Name: sessionCookie, Value: secret, Path: "/", HttpOnly: true, Secure: r.TLS != nil, SameSite: http.SameSiteStrictMode, MaxAge: int(sessionTTL.Seconds())}
	http.SetCookie(w, cookie)
	r = r.Clone(r.Context())
	r.Header = r.Header.Clone()
	r.Header.Del("Cookie")
	r.AddCookie(cookie)
	return r, nil
}

func cookieSecret(r *http.Request) (string, error) {
	var found string
	for _, cookie := range r.Cookies() {
		if cookie.Name == sessionCookie {
			if found != "" || len(cookie.Value) != 64 {
				return "", errors.New("ambiguous or invalid demo cookie")
			}
			found = cookie.Value
		}
	}
	if found == "" {
		return "", errors.New("load the demo first")
	}
	return found, nil
}

func (s *server) authenticate(r *http.Request) (string, error) {
	secret, err := cookieSecret(r)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.sessionLocked(secret); err != nil {
		return "", err
	}
	return secret, nil
}

// Call only while holding s.mu; recheck expiry even after prior authentication.
func (s *server) sessionLocked(secret string) (*session, error) {
	value, ok := s.sessions[secret]
	if !ok || !time.Now().Before(value.Expires) {
		return nil, errors.New("unknown or expired demo session")
	}
	return value, nil
}

func (s *server) csrf(r *http.Request) (string, error) {
	secret, err := cookieSecret(r)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	value, err := s.sessionLocked(secret)
	if err != nil {
		return "", err
	}
	return value.CSRF, nil
}

func validateCapabilities(capabilities []string) error {
	if len(capabilities) == 0 || len(capabilities) > 64 {
		return errors.New("invalid capability list")
	}
	seen := make(map[string]bool, len(capabilities))
	for _, capability := range capabilities {
		if !capabilityPattern.MatchString(capability) || seen[capability] {
			return errors.New("invalid or repeated capability")
		}
		seen[capability] = true
	}
	for _, required := range legacyCapabilities {
		if !seen[required] {
			return fmt.Errorf("required native capability missing: %s", required)
		}
	}
	return nil
}

func (s *server) nativeProfile(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.nativeLoad(w, r)
	case http.MethodPost:
		s.nativeSave(w, r)
	default:
		w.Header().Set("Allow", "GET, POST")
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Use GET or POST.")
	}
}

func (s *server) nativeLoad(w http.ResponseWriter, r *http.Request) {
	if len(r.URL.RawQuery) > 4096 {
		writeError(w, 400, "invalid_query", "Query is too large.")
		return
	}
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil || len(query) != 3 || len(query["protocolVersion"]) != 1 || len(query["requestID"]) != 1 || len(query["capabilities"]) != 1 {
		writeError(w, 400, "invalid_query", "Specify protocolVersion, requestID and capabilities exactly once.")
		return
	}
	if query.Get("protocolVersion") != sdui.NativeVersion {
		writeError(w, 400, "unsupported_protocol", "This demo requires native protocol 1.")
		return
	}
	if !uuidPattern.MatchString(query.Get("requestID")) {
		writeError(w, 400, "invalid_request_id", "A UUID requestID is required.")
		return
	}
	capabilities := strings.Split(query.Get("capabilities"), ",")
	if err := validateCapabilities(capabilities); err != nil {
		writeError(w, 406, "unsupported_capabilities", err.Error())
		return
	}
	r, err = s.bootstrap(w, r)
	if err != nil {
		writeError(w, 503, "session_unavailable", err.Error())
		return
	}
	secret, _ := cookieSecret(r)
	s.mu.Lock()
	value, err := s.sessionLocked(secret)
	if err != nil {
		s.mu.Unlock()
		writeError(w, 401, "authentication_required", "Reload to start a new demo session.")
		return
	}
	response, err := s.envelopeLocked(value, query.Get("requestID"), "ready", "Edit your display name.", nil, nil, capabilities, value.Profile)
	s.mu.Unlock()
	if err != nil {
		if errors.Is(err, sdui.ErrUnsupportedNative) {
			writeError(w, 406, "unsupported_screen", "This screen requires unsupported native controls.")
			return
		}
		writeError(w, 500, "render_failed", "The screen could not be resolved.")
		return
	}
	writeJSON(w, 200, response)
}

func (s *server) nativeSave(w http.ResponseWriter, r *http.Request) {
	secret, err := s.authenticate(r)
	if err != nil {
		writeError(w, 401, "authentication_required", "Reload to start a new demo session.")
		return
	}
	if r.URL.RawQuery != "" {
		writeError(w, 400, "invalid_query", "Actions do not accept query parameters.")
		return
	}
	mediaType, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" || len(r.Header.Values("Content-Type")) != 1 || (params["charset"] != "" && !strings.EqualFold(params["charset"], "utf-8")) || len(params) > 1 || (len(params) == 1 && params["charset"] == "") {
		writeError(w, 415, "unsupported_media_type", "Send application/json encoded as UTF-8.")
		return
	}
	if coding := r.Header.Get("Content-Encoding"); len(r.Header.Values("Content-Encoding")) > 1 || (coding != "" && coding != "identity") {
		writeError(w, 415, "unsupported_encoding", "Compressed action bodies are not supported.")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes+1))
	if err != nil {
		writeError(w, 400, "invalid_body", "Could not read action body.")
		return
	}
	if len(body) > maxBodyBytes {
		writeError(w, 413, "body_too_large", "Action body exceeds 64 KiB.")
		return
	}
	if !utf8.Valid(body) {
		writeError(w, 400, "invalid_body", "The action must be valid UTF-8 JSON.")
		return
	}
	action, err := sdui.DecodeNativeAction(bytes.NewReader(body))
	if err != nil {
		writeError(w, 400, "invalid_body", "The action must match the native request schema.")
		return
	}
	if action.ProtocolVersion != sdui.NativeVersion {
		writeError(w, 400, "unsupported_protocol", "This demo requires native protocol 1.")
		return
	}
	if !uuidPattern.MatchString(action.RequestID) {
		writeError(w, 400, "invalid_request_id", "A UUID requestID is required.")
		return
	}
	if err := validateCapabilities(action.Capabilities); err != nil {
		writeError(w, 406, "unsupported_capabilities", err.Error())
		return
	}
	if action.ScreenID != "profile" || action.NodeID != "profile-form" || action.Event != "submit" || action.Action != "save-profile" || action.Target != profileRegion {
		writeError(w, 403, "action_forbidden", "This screen permits only profile-form submit/save-profile to profile-region.")
		return
	}
	expected := []string{"displayName"}
	if s.controls {
		expected = append(expected, "company", "notifications", "digestConsent", "colorTheme")
	}
	if len(action.Fields) != len(expected) || len(action.EditRevisions) != len(expected) {
		writeError(w, 400, "invalid_fields", "Send exactly the declared form fields and their edit revisions.")
		return
	}
	for _, field := range expected {
		if _, ok := action.Fields[field]; !ok {
			writeError(w, 400, "invalid_fields", "Missing form field.")
			return
		}
		if _, ok := action.EditRevisions[field]; !ok {
			writeError(w, 400, "invalid_fields", "Missing edit revision.")
			return
		}
	}
	canonical, err := json.Marshal(action)
	if err != nil {
		writeError(w, 400, "invalid_body", "Could not fingerprint the action.")
		return
	}
	fingerprint := sha256.Sum256(canonical)

	status, encoded := s.applyNative(secret, r.Header.Values("X-CSRF-Token"), action, fingerprint)
	// Never keep the business mutex while a slow client receives the response.
	writeJSONBytes(w, status, encoded)
}

// Authentication, replay lookup, version checks, rendering, business mutation
// and replay insertion share one lock. No successful write can lose its key.
func (s *server) applyNative(secret string, csrf []string, action sdui.NativeActionRequest, fingerprint [32]byte) (int, []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	value, err := s.sessionLocked(secret)
	if err != nil {
		return errorResponse(401, "authentication_required", "Reload to start a new demo session.")
	}
	if action.SessionID != value.ID {
		return errorResponse(403, "session_mismatch", "The action belongs to another session.")
	}
	if len(csrf) != 1 || subtle.ConstantTimeCompare([]byte(csrf[0]), []byte(value.CSRF)) != 1 {
		return errorResponse(403, "invalid_csrf", "The session CSRF token is required.")
	}
	if cached, ok := value.Replays[action.RequestID]; ok {
		if cached.Fingerprint != fingerprint {
			return errorResponse(409, "request_id_reused", "The requestID was already used with different content.")
		}
		return cached.Status, cached.Body
	}
	if len(value.Replays)+len(value.WebReplays) >= maxReplays {
		return errorResponse(403, "replay_capacity", "This demo session reached its action limit. Wait for expiry or restart the server, then reload.")
	}
	status, state, message := http.StatusOK, "saved", "Profile saved."
	candidate := value.Profile
	problems := map[string]string{}
	if action.ScreenRevision != s.revision {
		status, state, message = 409, "conflict", "The screen changed. Review your draft and save again."
	} else if action.DataVersion != value.Profile.DataVersion {
		status, state, message = 409, "conflict", "Your profile changed since this screen was loaded. Review your draft and save again."
	} else if name, problem := validateName(action.Fields["displayName"]); problem != "" {
		status, state, message = 422, "invalid", "No changes saved."
		problems["displayName"] = problem
	} else {
		if candidate.DataVersion >= sdui.MaxNativeRevision {
			return errorResponse(403, "version_capacity", "This demo reached its version limit. Restart the server, then reload.")
		}
		if s.controls {
			company := strings.TrimSpace(action.Fields["company"])
			if utf8.RuneCountInString(company) > 80 {
				problems["company"] = "Use at most 80 characters for the company."
			}
			enabled := action.Fields["notifications"]
			if enabled != "true" && enabled != "false" {
				problems["notifications"] = "Choose enabled or disabled."
			}
			candidate.Company, candidate.Notifications = company, enabled == "true"
			consent := action.Fields["digestConsent"]
			if consent != "true" && consent != "false" {
				problems["digestConsent"] = "Choose whether to receive the digest."
			}
			theme := action.Fields["colorTheme"]
			if theme != "system" && theme != "light" && theme != "dark" {
				problems["colorTheme"] = "Choose System, Light or Dark."
			}
			candidate.DigestConsent, candidate.ColorTheme = consent == "true", theme
		}
		if len(problems) > 0 {
			status, state, message = 422, "invalid", "No changes saved."
			candidate = value.Profile
		} else {
			candidate.DisplayName = name
			candidate.DataVersion++
		}
	}
	response, err := s.envelopeLocked(value, action.RequestID, state, message, action.EditRevisions, problems, action.Capabilities, candidate)
	if err != nil {
		if errors.Is(err, sdui.ErrUnsupportedNative) {
			return errorResponse(406, "unsupported_screen", "This screen requires unsupported native controls.")
		}
		return errorResponse(500, "render_failed", "The screen could not be resolved.")
	}
	encoded, err := json.Marshal(response)
	if err != nil || len(encoded) > sdui.MaxNativeResponseBytes {
		return errorResponse(500, "render_failed", "The screen could not be encoded.")
	}
	if status == http.StatusOK {
		value.Profile = candidate
	}
	value.Replays[action.RequestID] = cachedResponse{Fingerprint: fingerprint, Status: status, Body: encoded}
	return status, encoded
}

func validateName(raw string) (string, string) {
	name := strings.TrimSpace(raw)
	length := utf8.RuneCountInString(name)
	if length < 2 || length > 60 {
		return name, "Use 2 to 60 characters for your display name."
	}
	return name, ""
}

func screenData(displayName, message, problem string) map[string]any {
	return map[string]any{"displayName": displayName, "message": message, "error": problem}
}

// Caller holds s.mu so fields, version and the resolved tree share one snapshot.
// Request-scoped validation/status stays exclusively in envelope fields: native
// clients can suppress it by edit revision. A tree notice would outlive the edit
// that caused it, and a tree status would duplicate native live announcements.
// Both nodes resolve out for native; HTML still uses these schema bindings.
func (s *server) envelopeLocked(value *session, requestID, status, message string, edits map[string]uint64, problems map[string]string, capabilities []string, current profile) (sdui.NativeEnvelope, error) {
	if edits == nil {
		edits = map[string]uint64{}
	}
	if problems == nil {
		problems = map[string]string{}
	}
	plan := s.plan
	data := screenData(current.DisplayName, "", "")
	fields := map[string]string{"displayName": current.DisplayName}
	required := append([]string(nil), legacyCapabilities...)
	if s.controls {
		plan = s.nativePlan
		data["company"], data["notifications"] = current.Company, current.Notifications
		fields["company"] = current.Company
		fields["notifications"] = fmt.Sprint(current.Notifications)
		data["digestConsent"], data["colorTheme"] = current.DigestConsent, current.ColorTheme
		fields["digestConsent"], fields["colorTheme"] = fmt.Sprint(current.DigestConsent), current.ColorTheme
		required = append(required, "switch", "checkbox", "select")
	}
	region, err := plan.ResolveNative(profileRegion, sdui.ResolveContext{Data: data}, capabilities)
	if err != nil {
		return sdui.NativeEnvelope{}, err
	}
	return sdui.NativeEnvelope{
		ProtocolVersion: sdui.NativeVersion, ScreenID: "profile", ScreenRevision: s.revision,
		SessionID: value.ID, RequestID: requestID, DataVersion: current.DataVersion,
		Status: status, CSRFToken: value.CSRF, RequiredCapabilities: required,
		Region: region, Fields: fields,
		AcknowledgedEdits: edits, Errors: problems, Message: message,
	}, nil
}

func (s *server) loadWeb(_ context.Context, request gohtmx.Request) (map[string]any, error) {
	if request.HTTPRequest.URL.RawQuery != "" {
		return nil, errors.New("this demo loader accepts no query parameters")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	value, err := s.sessionLocked(request.Principal)
	if err != nil {
		return nil, err
	}
	return screenData(value.Profile.DisplayName, "Edit your display name.", ""), nil
}

func (s *server) saveWeb(_ context.Context, request gohtmx.Request) (gohtmx.Result, error) {
	if len(request.Files) != 0 || request.HTTPRequest.URL.RawQuery != "" {
		return gohtmx.Result{}, errors.New("unexpected upload or query")
	}
	for name, values := range request.Values {
		if (name != "displayName" && name != "_action" && name != "_target" && name != "_csrf" && name != "_request" && name != "_revision") || len(values) != 1 {
			return gohtmx.Result{}, errors.New("unexpected form field")
		}
	}
	if len(request.Values["displayName"]) != 1 {
		return gohtmx.Result{}, errors.New("displayName is required")
	}
	key := request.HTTPRequest.Header.Get("Idempotency-Key")
	fingerprint := sha256.Sum256([]byte(request.Values.Encode()))
	s.mu.Lock()
	defer s.mu.Unlock()
	value, err := s.sessionLocked(request.Principal)
	if err != nil {
		return gohtmx.Result{}, err
	}
	if previous, ok := value.WebReplays[key]; ok {
		if previous.Fingerprint != fingerprint {
			return gohtmx.Result{}, errors.New("idempotency key changed")
		}
		return previous.Result, nil
	}
	if len(value.Replays)+len(value.WebReplays) >= maxReplays {
		return gohtmx.Result{}, errors.New("demo action capacity reached")
	}
	name, problem := validateName(request.Values.Get("displayName"))
	message, status := "Profile saved.", http.StatusOK
	if problem != "" {
		message, status = "No changes saved. Check your display name.", http.StatusUnprocessableEntity
	}
	if problem == "" {
		if value.Profile.DataVersion >= sdui.MaxNativeRevision {
			return gohtmx.Result{}, errors.New("demo version capacity reached")
		}
		value.Profile.DisplayName = name
		value.Profile.DataVersion++
	}
	result := gohtmx.Result{Status: status, Data: screenData(name, message, problem)}
	value.WebReplays[key] = webReplay{Fingerprint: fingerprint, Result: result}
	return result, nil
}

func errorResponse(status int, code, message string) (int, []byte) {
	// This shape contains strings only, so marshaling cannot fail.
	encoded, _ := json.Marshal(map[string]any{"error": map[string]string{"code": code, "message": message}})
	return status, encoded
}
func writeError(w http.ResponseWriter, status int, code, message string) {
	status, encoded := errorResponse(status, code, message)
	writeJSONBytes(w, status, encoded)
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	encoded, err := json.Marshal(value)
	if err != nil {
		http.Error(w, "JSON encoding failed", 500)
		return
	}
	writeJSONBytes(w, status, encoded)
}
func writeJSONBytes(w http.ResponseWriter, status int, encoded []byte) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(encoded)
}

func main() {
	controls := flag.Bool("controls", false, "Serve the multi-field native controls demo")
	port := flag.Int("port", 8094, "Loopback HTTP port")
	flag.Parse()
	if *port < 1 || *port > 65535 {
		log.Fatal("port must be between 1 and 65535")
	}
	var handler http.Handler
	var err error
	if *controls {
		handler, err = NewControlsHandler()
	} else {
		handler, err = NewHandler()
	}
	if err != nil {
		log.Fatal(err)
	}
	address := fmt.Sprintf("127.0.0.1:%d", *port)
	log.Printf("Ely native profile demo: http://%s (temporary local sessions only)", address)
	log.Fatal((&http.Server{Addr: address, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: time.Minute}).ListenAndServe())
}
