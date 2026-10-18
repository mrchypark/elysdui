// Command sdui serves a loopback-only, single-process server-driven UI example.
// The automatic session bootstrap is for local demonstrations, not authentication.
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
)

//go:embed screen.json
var screenJSON []byte

const sessionCookie = "ely-sdui-demo"

const (
	maxDemoSessions = 256
	demoSessionTTL  = time.Hour
)

type profile struct {
	Name       string
	Enabled    bool
	Count      int
	Attachment string
	Tags       string
	Intent     string
}

type session struct {
	CSRF    string
	Expires time.Time
	Profile profile
}

type server struct {
	mu       sync.Mutex
	sessions map[string]*session
	mux      *http.ServeMux
	screens  *sdui.Store
}

// NewHandler builds the example with its own isolated, bounded demo state.
// A real host must replace session bootstrap with its authentication middleware.
func NewHandler() (http.Handler, error) {
	s := &server{sessions: make(map[string]*session), mux: http.NewServeMux()}
	screen, registry, err := loadScreen()
	if err != nil {
		return nil, err
	}
	allowSession := func(_ context.Context, principal string) error {
		s.mu.Lock()
		defer s.mu.Unlock()
		if value, ok := s.sessions[principal]; !ok || time.Now().After(value.Expires) {
			return errors.New("demo session expired")
		}
		return nil
	}
	runtime, err := sdui.NewStore(screen, registry, sdui.Config{
		Endpoint:     "/",
		Authenticate: s.authenticate,
		Authorize:    allowSession,
		CSRF:         s.csrf,
		Loaders: map[string]sdui.Loader{
			"profile": s.load,
		},
		Actions: map[string]sdui.Action{
			"save-profile": {Targets: []string{"profile-form"}, Authorize: func(ctx context.Context, request sdui.Request) error { return allowSession(ctx, request.Principal) }, Run: s.save},
		},
		MaxBodyBytes:          128 << 10,
		IdempotencyTTL:        10 * time.Minute,
		MaxIdempotencyEntries: 512,
	})
	if err != nil {
		return nil, err
	}
	if err := sdui.BindAssets(s.mux); err != nil {
		return nil, err
	}
	s.mux.HandleFunc("GET /favicon.ico", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	s.screens = runtime
	s.mux.Handle("/{$}", runtime)
	return s, nil
}

// An optional external schema is strictly loaded before serving. SDUI_WATCH=1
// enables validated atomic activation; invalid updates retain the current plan.
func loadScreen() (sdui.Screen, *sdui.Registry, error) {
	var source io.Reader = bytes.NewReader(screenJSON)
	if path := os.Getenv("SDUI_SCHEMA"); path != "" {
		file, err := os.Open(path)
		if err != nil {
			return sdui.Screen{}, nil, fmt.Errorf("open SDUI_SCHEMA: %w", err)
		}
		defer file.Close()
		source = file
	}
	screen, err := sdui.Decode(source)
	if err != nil {
		return sdui.Screen{}, nil, err
	}
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		return sdui.Screen{}, nil, err
	}
	if err := registry.Register(sdui.Definition{Name: "profile-summary-card", Template: "card", Properties: map[string]sdui.Property{"title": {Type: sdui.String, Target: "Title", Required: true}}, Slots: map[string]sdui.SlotDefinition{"content": {Target: "Content", AllowedTypes: []string{"text"}, MaxNodes: 16}}}); err != nil {
		return sdui.Screen{}, nil, err
	}
	return screen, registry, nil
}

func token() (string, error) {
	value := make([]byte, 24)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	// Only the initial local page visit may bootstrap a demo session. An
	// unauthenticated POST never creates state or bypasses the runtime checks.
	if r.Method == http.MethodGet && r.URL.Path == "/" {
		if _, err := s.authenticate(r); err != nil {
			id, tokenErr := token()
			csrf, csrfErr := token()
			if tokenErr != nil || csrfErr != nil {
				http.Error(w, "demo session unavailable", http.StatusInternalServerError)
				return
			}
			now := time.Now()
			s.mu.Lock()
			for key, value := range s.sessions {
				if now.After(value.Expires) {
					delete(s.sessions, key)
				}
			}
			if len(s.sessions) >= maxDemoSessions {
				s.mu.Unlock()
				http.Error(w, "demo session capacity reached; restart the example", http.StatusServiceUnavailable)
				return
			}
			s.sessions[id] = &session{CSRF: csrf, Expires: now.Add(demoSessionTTL)}
			s.mu.Unlock()
			cookie := &http.Cookie{Name: sessionCookie, Value: id, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: int(demoSessionTTL.Seconds())}
			http.SetCookie(w, cookie)
			// Replace any invalid incoming cookie before passing to the runtime.
			r = r.Clone(r.Context())
			r.Header = r.Header.Clone()
			r.Header.Del("Cookie")
			r.AddCookie(cookie)
		}
	}
	s.mux.ServeHTTP(w, r)
}

func (s *server) authenticate(r *http.Request) (string, error) {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return "", errors.New("visit the local demo page first")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	value, ok := s.sessions[cookie.Value]
	if !ok || time.Now().After(value.Expires) {
		return "", errors.New("unknown or expired demo session")
	}
	return cookie.Value, nil
}

func (s *server) csrf(r *http.Request) (string, error) {
	principal, err := s.authenticate(r)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	value, err := s.sessionLocked(principal)
	if err != nil {
		return "", err
	}
	return value.CSRF, nil
}

// sessionLocked rechecks expiry after every lock acquisition; authentication
// and authorization can race with session expiry or cleanup on another request.
func (s *server) sessionLocked(principal string) (*session, error) {
	value, ok := s.sessions[principal]
	if !ok || time.Now().After(value.Expires) {
		return nil, errors.New("demo session expired")
	}
	return value, nil
}

func data(value profile, problem string) map[string]any {
	message := "Complete the form, then save. Changes to the switch also save through the server."
	if value.Count > 0 {
		updates := "off"
		if value.Enabled {
			updates = "on"
		}
		message = fmt.Sprintf("Saved %s. Updates %s. Save #%d.", value.Name, updates, value.Count)
	}
	if problem != "" {
		message = "No changes saved. Correct the validation error and try again."
	}
	return map[string]any{
		"name": value.Name, "enabled": value.Enabled, "message": message,
		"error": problem, "attachment": value.Attachment, "tags": value.Tags, "intent": value.Intent,
		"hasSaved": value.Count > 0,
		"summary":  []map[string]any{{"id": "identity", "label": "Profile: " + value.Name}, {"id": "count", "label": fmt.Sprintf("Committed saves: %d", value.Count)}},
	}
}

func (s *server) load(_ context.Context, request sdui.Request) (map[string]any, error) {
	if request.HTTPRequest.URL.RawQuery != "" {
		return nil, errors.New("this demo loader accepts no query parameters")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	value, err := s.sessionLocked(request.Principal)
	if err != nil {
		return nil, err
	}
	return data(value.Profile, ""), nil
}

func (s *server) save(_ context.Context, request sdui.Request) (sdui.Result, error) {
	name := strings.TrimSpace(request.Values.Get("name"))
	enabled := request.Values.Get("enabled") == "on"
	s.mu.Lock()
	value, err := s.sessionLocked(request.Principal)
	if err != nil {
		s.mu.Unlock()
		return sdui.Result{}, err
	}
	current := value.Profile
	s.mu.Unlock()
	current.Enabled = enabled
	if len(name) <= 80 {
		current.Name = name
	}
	invalid := func(message string) (sdui.Result, error) {
		return sdui.Result{Data: data(current, message), Status: http.StatusUnprocessableEntity}, nil
	}
	if name == "" {
		return invalid("Enter a display name.")
	}
	if len(name) > 80 {
		return invalid("Display name must be 80 bytes or less.")
	}
	for _, field := range []string{"name", "enabled", "intent", "delay"} {
		if len(request.Values[field]) > 1 {
			return invalid("Use one value for " + field + ".")
		}
	}
	if len(request.Values["tag"]) > 16 {
		return invalid("Choose at most sixteen tags.")
	}
	for _, tag := range request.Values["tag"] {
		if len(tag) > 128 {
			return invalid("Tags must be 128 bytes or less.")
		}
	}
	if len(request.Values.Get("intent")) > 128 {
		return invalid("Submitter value must be 128 bytes or less.")
	}
	files := request.Files["attachment"]
	if len(files) > 1 {
		return invalid("Choose at most one attachment.")
	}
	if len(files) == 1 && files[0].Filename != "" {
		if len(files[0].Filename) > 255 {
			return invalid("Attachment filename must be 255 bytes or less.")
		}
		if files[0].Size > 64<<10 {
			return invalid("Attachment must be 64 KiB or smaller.")
		}
		// This demo records escaped metadata only. It never persists or serves
		// uploaded bytes. Production upload handling needs its own validation.
		current.Attachment = fmt.Sprintf("Attachment: %s (%d bytes)", files[0].Filename, files[0].Size)
	}
	current.Tags = "Repeated fields: " + strings.Join(request.Values["tag"], ", ")
	current.Intent = "Submitter: " + request.Values.Get("intent")
	s.mu.Lock()
	value, err = s.sessionLocked(request.Principal)
	if err != nil {
		s.mu.Unlock()
		return sdui.Result{}, err
	}
	current.Count = value.Profile.Count + 1
	value.Profile = current
	s.mu.Unlock()
	result := sdui.Result{Data: data(current, "")}
	// A bounded, local demonstration aid makes out-of-order responses testable.
	// The state mutation happens before the delay, and the response is a snapshot.
	// Cancellation cannot undo a committed mutation; callers must use idempotency.
	if delay, err := strconv.Atoi(request.Values.Get("delay")); err == nil && delay > 0 {
		if delay > 300 {
			delay = 300
		}
		time.Sleep(time.Duration(delay) * time.Millisecond)
	}
	return result, nil
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8093"
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		log.Fatal("PORT must be a number from 1 to 65535")
	}
	handler, err := NewHandler()
	if err != nil {
		log.Fatal(err)
	}
	if os.Getenv("SDUI_WATCH") == "1" {
		path := os.Getenv("SDUI_SCHEMA")
		if path == "" {
			log.Fatal("SDUI_WATCH requires an explicit local SDUI_SCHEMA path")
		}
		go func() {
			err := handler.(*server).screens.WatchFile(context.Background(), path, 250*time.Millisecond, func(snapshot sdui.Snapshot, err error) {
				if err != nil {
					log.Printf("Screen update rejected; active screen retained: %v", err)
				} else {
					log.Printf("Active screen revision: %s", snapshot.Revision)
				}
			})
			if err != nil {
				log.Printf("Screen watcher stopped: %v", err)
			}
		}()
	}
	address := "127.0.0.1:" + strconv.Itoa(number)
	log.Printf("elysdui demo (local demo sessions only): http://%s", address)
	log.Fatal((&http.Server{Addr: address, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: time.Minute}).ListenAndServe())
}
