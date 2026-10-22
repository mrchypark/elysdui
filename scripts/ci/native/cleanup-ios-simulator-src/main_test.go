package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

var testOwner = ownership{"20A3F099-5BB8-42E0-B8DB-737A1F15799B", "ElyCI-eeef7ca3-ff59-4327-8358-702c09f902af", true}

func inventory(owner ownership) []byte {
	return fmt.Appendf(nil, `{"devices":{"runtime":[{"udid":%q,"name":%q}]}}`, owner.UDID, owner.Name)
}

func state(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := saveOwner(filepath.Join(dir, "created-device.json"), testOwner); err != nil {
		t.Fatal(err)
	}
	return dir
}

func owned(t *testing.T, dir string) bool {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dir, "created-device.json"))
	if err != nil {
		t.Fatal(err)
	}
	var owner ownership
	if err = json.Unmarshal(data, &owner); err != nil {
		t.Fatal(err)
	}
	return owner.Owned
}

func noPause(context.Context) error { return nil }

func TestCleanup(t *testing.T) {
	timeout := errors.New("simulated command timeout 124")
	for _, tt := range []struct {
		name             string
		shutdown, delete error
		absentAfter      int
		wantError        bool
	}{
		{"normal", nil, nil, 1, false},
		{"shutdown-timeout-delete-succeeds", timeout, nil, 1, false},
		{"delete-timeout-but-server-completes", nil, timeout, 1, false},
		{"retry-after-two-timeouts", timeout, timeout, 2, false},
		{"exit-zero-device-persists", nil, nil, 99, true},
		{"both-timeouts-device-persists", timeout, timeout, 99, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			dir := state(t)
			deletes, shutdowns := 0, 0
			run := func(ctx context.Context, args ...string) result {
				if deadline, ok := ctx.Deadline(); !ok || time.Until(deadline) > 31*time.Second {
					t.Fatal("command is unbounded")
				}
				switch strings.Join(args, " ") {
				case "simctl list devices --json":
					if deletes >= tt.absentAfter {
						return result{output: []byte(`{"devices":{}}`)}
					}
					return result{output: inventory(testOwner)}
				case "simctl shutdown " + testOwner.UDID:
					shutdowns++
					return result{err: tt.shutdown}
				case "simctl delete " + testOwner.UDID:
					deletes++
					return result{err: tt.delete}
				default:
					t.Fatalf("foreign command: %v", args)
					return result{}
				}
			}
			err := cleanup(context.Background(), dir, run, noPause)
			if (err != nil) != tt.wantError {
				t.Fatalf("error=%v", err)
			}
			if owned(t, dir) != tt.wantError {
				t.Fatal("incorrect ownership update")
			}
			if shutdowns != 1 || deletes > 2 {
				t.Fatalf("attempts: shutdown=%d delete=%d", shutdowns, deletes)
			}
		})
	}
}

func TestFailClosedInventory(t *testing.T) {
	changed := testOwner
	changed.Name = "Foreign simulator"
	for _, tt := range []struct {
		name     string
		response result
	}{
		{"query-failed", result{err: errors.New("simctl unavailable")}},
		{"malformed", result{output: []byte("{")}},
		{"null", result{output: []byte("null")}},
		{"missing-devices", result{output: []byte("{}")}},
		{"null-devices", result{output: []byte(`{"devices":null}`)}},
		{"null-device-list", result{output: []byte(`{"devices":{"runtime":null}}`)}},
		{"changed-name", result{output: inventory(changed)}},
		{"bad-device", result{output: []byte(`{"devices":{"runtime":[{}]}}`)}},
		{"duplicate", result{output: []byte(fmt.Sprintf(`{"devices":{"a":[{"udid":%q,"name":%q}],"b":[{"udid":%q,"name":%q}]}}`, testOwner.UDID, testOwner.Name, testOwner.UDID, testOwner.Name))}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			dir := state(t)
			err := cleanup(context.Background(), dir, func(_ context.Context, args ...string) result {
				if strings.Join(args, " ") != "simctl list devices --json" {
					t.Fatalf("mutated despite invalid inventory: %v", args)
				}
				return tt.response
			}, noPause)
			if err == nil || !owned(t, dir) {
				t.Fatalf("did not fail closed: %v", err)
			}
		})
	}
}

func TestOwnershipGuards(t *testing.T) {
	for _, raw := range []string{
		"{", `{"owned":true,"udid":"bad","name":"ElyCI-x"}`,
		fmt.Sprintf(`{"owned":true,"udid":%q,"name":"Personal iPhone"}`, testOwner.UDID),
	} {
		t.Run(raw, func(t *testing.T) {
			dir := t.TempDir()
			if err := os.WriteFile(filepath.Join(dir, "created-device.json"), []byte(raw), 0600); err != nil {
				t.Fatal(err)
			}
			if cleanup(context.Background(), dir, func(context.Context, ...string) result { t.Fatal("invalid owner invoked simctl"); return result{} }, noPause) == nil {
				t.Fatal("accepted invalid state")
			}
		})
	}
	t.Run("symlink", func(t *testing.T) {
		dir := t.TempDir()
		other := state(t)
		if err := os.Symlink(filepath.Join(other, "created-device.json"), filepath.Join(dir, "created-device.json")); err != nil {
			t.Fatal(err)
		}
		if cleanup(context.Background(), dir, func(context.Context, ...string) result { t.Fatal("followed symlink"); return result{} }, noPause) == nil {
			t.Fatal("accepted symlink")
		}
	})
	for _, hasState := range []bool{false, true} {
		t.Run(fmt.Sprint("no-op-", hasState), func(t *testing.T) {
			dir := t.TempDir()
			if hasState {
				owner := testOwner
				owner.Owned = false
				if err := saveOwner(filepath.Join(dir, "created-device.json"), owner); err != nil {
					t.Fatal(err)
				}
			}
			if err := cleanup(context.Background(), dir, func(context.Context, ...string) result { t.Fatal("unowned simctl"); return result{} }, noPause); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestAlreadyAbsentAndForeignUntouched(t *testing.T) {
	dir := state(t)
	foreign := testOwner
	foreign.UDID = "11111111-2222-3333-4444-555555555555"
	foreign.Name = "Personal iPhone"
	err := cleanup(context.Background(), dir, func(_ context.Context, args ...string) result {
		if strings.Join(args, " ") != "simctl list devices --json" {
			t.Fatal("mutated absent or foreign device")
		}
		return result{output: inventory(foreign)}
	}, noPause)
	if err != nil || owned(t, dir) {
		t.Fatalf("absent ownership retained: %v", err)
	}
}

func TestIdentityChangesDuringCleanup(t *testing.T) {
	dir := state(t)
	calls := 0
	changed := testOwner
	changed.Name = "Not ours now"
	err := cleanup(context.Background(), dir, func(_ context.Context, args ...string) result {
		if args[1] == "delete" {
			t.Fatal("deleted changed identity")
		}
		if args[1] == "list" {
			calls++
			if calls > 1 {
				return result{output: inventory(changed)}
			}
		}
		return result{output: inventory(testOwner)}
	}, noPause)
	if err == nil || !owned(t, dir) {
		t.Fatal("did not fail closed")
	}
}

func TestChangedStateNotOverwritten(t *testing.T) {
	dir := state(t)
	path := filepath.Join(dir, "created-device.json")
	err := cleanup(context.Background(), dir, func(context.Context, ...string) result {
		if err := os.WriteFile(path, []byte("other owner"), 0600); err != nil {
			t.Fatal(err)
		}
		return result{output: []byte(`{"devices":{}}`)}
	}, noPause)
	if err == nil {
		t.Fatal("overwrote concurrent ownership")
	}
	raw, _ := os.ReadFile(path)
	if string(raw) != "other owner" {
		t.Fatal("state changed")
	}
}

func TestDeadline(t *testing.T) {
	dir := state(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := cleanup(ctx, dir, func(ctx context.Context, _ ...string) result { return result{err: ctx.Err()} }, noPause)
	if err == nil || !owned(t, dir) {
		t.Fatal("cancelled cleanup passed")
	}
}

func TestDeadlineDuringCleanup(t *testing.T) {
	dir := state(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	calls := 0
	start := time.Now()
	err := cleanup(ctx, dir, func(ctx context.Context, args ...string) result {
		calls++
		if calls == 1 {
			return result{output: inventory(testOwner)}
		}
		<-ctx.Done()
		return result{err: ctx.Err()}
	}, noPause)
	if err == nil || !owned(t, dir) || time.Since(start) > time.Second {
		t.Fatalf("total deadline failed: %v", err)
	}
}

func TestVerificationAndReceiptFailures(t *testing.T) {
	for _, failure := range []string{"verification-query", "receipt", "changed-state"} {
		t.Run(failure, func(t *testing.T) {
			dir := state(t)
			deleted := false
			shutdown := false
			err := cleanup(context.Background(), dir, func(_ context.Context, args ...string) result {
				switch args[1] {
				case "shutdown":
					shutdown = true
					if failure == "receipt" {
						return result{err: receiptError{errors.New("disk full")}}
					}
				case "delete":
					deleted = true
				case "list":
					if deleted {
						return result{err: errors.New("verification unavailable")}
					}
					if shutdown && failure == "changed-state" {
						if err := os.WriteFile(filepath.Join(dir, "created-device.json"), []byte("changed"), 0600); err != nil {
							t.Fatal(err)
						}
					}
				}
				return result{output: inventory(testOwner)}
			}, noPause)
			if err == nil {
				t.Fatal("accepted unverifiable cleanup")
			}
			if failure != "verification-query" && deleted {
				t.Fatal("deleted after ownership/receipt failure")
			}
			if failure != "changed-state" && !owned(t, dir) {
				t.Fatal("cleared unverified ownership")
			}
		})
	}
}

// Fake xcrun only; this test cannot address any real simulator.
func TestCommandTimeoutReceiptsAndReaping(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "xcrun")
	pidFile := filepath.Join(dir, "pid")
	script := "#!/bin/sh\nprintf '%s' \"$$\" > '" + pidFile + "'\nexec sleep 30\n"
	if err := os.WriteFile(bin, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	go func() {
		for ctx.Err() == nil {
			if _, err := os.Stat(pidFile); err == nil {
				cancel()
				return
			}
			time.Sleep(10 * time.Millisecond)
		}
	}()
	start := time.Now()
	response := commandRunner(dir)(ctx, "simctl", "delete", testOwner.UDID)
	if !errors.Is(response.err, context.Canceled) || time.Since(start) > 7*time.Second {
		t.Fatalf("timeout not bounded: %v", response.err)
	}
	var pid int
	raw, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = fmt.Sscan(string(raw), &pid); err != nil {
		t.Fatal(err)
	}
	if err = syscall.Kill(pid, 0); !errors.Is(err, syscall.ESRCH) {
		t.Fatalf("owned child remains: %d %v", pid, err)
	}
	meta, err := os.ReadFile(filepath.Join(dir, "01-simctl-delete.json"))
	if err != nil {
		t.Fatal(err)
	}
	var receipt struct{ Exit int }
	if err = json.Unmarshal(meta, &receipt); err != nil || receipt.Exit != 124 {
		t.Fatalf("bad receipt: %s", meta)
	}
	for _, suffix := range []string{".stdout", ".stderr"} {
		if _, err = os.Stat(filepath.Join(dir, "01-simctl-delete"+suffix)); err != nil {
			t.Fatal(err)
		}
	}
}
