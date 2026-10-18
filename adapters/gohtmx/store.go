package gohtmx

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

const MaxScreenHistory = 16

var ErrRevisionConflict = errors.New("sdui: active revision does not match expected revision")
var ErrUnknownRevision = errors.New("sdui: revision is not retained")

// Snapshot is immutable configuration only. User data is loaded per request;
// bound values and authentication state are never stored in a screen snapshot.
type Snapshot struct {
	Revision    string
	Plan        *Plan
	ActivatedAt time.Time
	handler     *Handler
	digest      string
}

type RevisionInfo struct {
	Revision    string
	ScreenID    string
	ActivatedAt time.Time
}

// Store atomically activates completely validated screens. Each HTTP request
// pins one snapshot. All revisions share the same replay cache, so replacing
// configuration cannot silently reset duplicate-mutation protection.
// A browser page must submit the revision it rendered; stale pages receive409
// before executing an action and must reload explicitly.
type Store struct {
	registry   *Registry
	config     Config
	active     atomic.Pointer[Snapshot]
	mu         sync.Mutex
	generation uint64
	history    []*Snapshot
}

func NewStore(screen Screen, registry *Registry, config Config) (*Store, error) {
	plan, err := Compile(screen, registry)
	if err != nil {
		return nil, err
	}
	handler, err := NewHandler(plan, config)
	if err != nil {
		return nil, err
	}
	digest, err := screenDigest(screen)
	if err != nil {
		return nil, err
	}
	s := &Store{registry: registry, config: handler.config, generation: 1}
	snap := s.snapshot(plan, handler, digest)
	s.active.Store(snap)
	return s, nil
}

func screenDigest(screen Screen) (string, error) {
	data, err := json.Marshal(screen)
	if err != nil {
		return "", fmt.Errorf("sdui: serialize screen: %w", err)
	}
	hash := sha256.Sum256(data)
	return fmt.Sprintf("%x", hash[:12]), nil
}
func (s *Store) snapshot(plan *Plan, handler *Handler, digest string) *Snapshot {
	revision := fmt.Sprintf("%d-%s", s.generation, digest)
	handler.revision = revision
	return &Snapshot{Revision: revision, Plan: plan, ActivatedAt: time.Now().UTC(), handler: handler, digest: digest}
}

func (s *Store) Snapshot() Snapshot {
	if s == nil {
		return Snapshot{}
	}
	snap := s.active.Load()
	if snap == nil {
		return Snapshot{}
	}
	return *snap
}

func (s *Store) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.active.Load() == nil {
		http.Error(w, "screen unavailable", http.StatusServiceUnavailable)
		return
	}
	snap := s.active.Load()
	snap.handler.ServeHTTP(w, r)
}

// Activate compiles and checks all loader/action contracts before taking the
// short swap lock. expectedRevision is required; unchanged canonical configuration is a no-op. Concurrent/stale publishers
// fail without replacing the valid active screen.
func (s *Store) Activate(screen Screen, expectedRevision string) (Snapshot, error) {
	if s == nil || s.active.Load() == nil {
		return Snapshot{}, fmt.Errorf("sdui: uninitialized store")
	}
	plan, err := Compile(screen, s.registry)
	if err != nil {
		return Snapshot{}, err
	}
	handler, err := NewHandler(plan, s.config)
	if err != nil {
		return Snapshot{}, err
	}
	digest, err := screenDigest(screen)
	if err != nil {
		return Snapshot{}, err
	}
	return s.activate(plan, handler, digest, expectedRevision)
}
func (s *Store) activate(plan *Plan, handler *Handler, digest, expected string) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current := s.active.Load()
	if expected == "" || current == nil || current.Revision != expected {
		return Snapshot{}, ErrRevisionConflict
	}
	if digest == current.digest {
		return *current, nil
	}
	if s.generation == ^uint64(0) {
		return Snapshot{}, fmt.Errorf("sdui: revision counter exhausted")
	}
	s.generation++
	handler.replayCache = current.handler.replayCache
	next := s.snapshot(plan, handler, digest)
	s.history = append(s.history, current)
	if len(s.history) > MaxScreenHistory-1 {
		s.history = append([]*Snapshot(nil), s.history[len(s.history)-(MaxScreenHistory-1):]...)
	}
	s.active.Store(next)
	return *next, nil
}

// Rollback activates a retained plan under a NEW revision. Old pages never
// regain permission merely because the same configuration becomes active again.
func (s *Store) Rollback(revision, expectedRevision string) (Snapshot, error) {
	if s == nil || s.active.Load() == nil {
		return Snapshot{}, fmt.Errorf("sdui: uninitialized store")
	}
	s.mu.Lock()
	var target *Snapshot
	for _, snapshot := range s.history {
		if snapshot.Revision == revision {
			target = snapshot
			break
		}
	}
	s.mu.Unlock()
	if target == nil {
		return Snapshot{}, ErrUnknownRevision
	}
	handler, err := NewHandler(target.Plan, s.config)
	if err != nil {
		return Snapshot{}, err
	}
	return s.activate(target.Plan, handler, target.digest, expectedRevision)
}

func (s *Store) History() []RevisionInfo {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	current := s.active.Load()
	if current == nil {
		return nil
	}
	result := []RevisionInfo{{current.Revision, current.Plan.ScreenID(), current.ActivatedAt}}
	for i := len(s.history) - 1; i >= 0; i-- {
		v := s.history[i]
		result = append(result, RevisionInfo{v.Revision, v.Plan.ScreenID(), v.ActivatedAt})
	}
	return result
}

func (s *Store) Load(reader io.Reader, expectedRevision string) (Snapshot, error) {
	screen, err := Decode(reader)
	if err != nil {
		return Snapshot{}, err
	}
	return s.Activate(screen, expectedRevision)
}
func (s *Store) LoadFile(path, expectedRevision string) (Snapshot, error) {
	file, err := os.Open(path)
	if err != nil {
		return Snapshot{}, err
	}
	defer file.Close()
	return s.Load(file, expectedRevision)
}

// WatchFile watches ONLY the host-selected local file; schemas cannot choose a
// path or URL. Changed bytes are fully validated before activation. Invalid
// candidates leave the active plan untouched and are reported once per change.
// This blocking function exits on context cancellation. The callback runs on
// this goroutine and must return promptly; it is never used as authorization.
func (s *Store) WatchFile(ctx context.Context, path string, interval time.Duration, onResult func(Snapshot, error)) error {
	if s == nil || s.active.Load() == nil {
		return fmt.Errorf("sdui: uninitialized store")
	}
	if interval < 100*time.Millisecond {
		return fmt.Errorf("sdui: watch interval must be at least100ms")
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	var last [32]byte
	haveLast := false
	lastError := ""
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
		file, err := os.Open(path)
		if err != nil {
			if err.Error() != lastError && onResult != nil {
				onResult(Snapshot{}, err)
			}
			lastError = err.Error()
			continue
		}
		data, readErr := io.ReadAll(io.LimitReader(file, MaxSchemaBytes+1))
		file.Close()
		if readErr != nil {
			if readErr.Error() != lastError && onResult != nil {
				onResult(Snapshot{}, readErr)
			}
			lastError = readErr.Error()
			continue
		}
		digest := sha256.Sum256(data)
		if haveLast && digest == last && lastError == "" {
			continue
		}
		last, haveLast, lastError = digest, true, ""
		current := s.Snapshot()
		snapshot, err := s.Load(bytes.NewReader(data), current.Revision)
		if onResult != nil {
			onResult(snapshot, err)
		}
	}
}
