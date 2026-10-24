// Cleanup affects only the simulator in the preparation helper's ownership record.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"
)

type ownership struct {
	UDID  string `json:"udid"`
	Name  string `json:"name"`
	Owned bool   `json:"owned"`
}

type result struct {
	output []byte
	err    error
}

type runCommand func(context.Context, ...string) result

type receiptError struct{ error }

var uuid = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// A valid, successful inventory is the only proof that a device is absent.
func present(data []byte, owner ownership) (bool, error) {
	var inventory struct {
		Devices map[string][]struct{ UDID, Name string }
	}
	if err := json.Unmarshal(data, &inventory); err != nil || inventory.Devices == nil {
		return false, errors.New("invalid simulator inventory")
	}
	found := false
	for _, devices := range inventory.Devices {
		if devices == nil {
			return false, errors.New("inventory contains null device list")
		}
		for _, device := range devices {
			if !uuid.MatchString(device.UDID) || device.Name == "" {
				return false, errors.New("inventory contains invalid device identity")
			}
			if strings.EqualFold(device.UDID, owner.UDID) {
				if found || device.Name != owner.Name {
					return false, errors.New("owned simulator identity is ambiguous or changed")
				}
				found = true
			}
		}
	}
	return found, nil
}

func saveOwner(path string, owner ownership) error {
	data, err := json.MarshalIndent(owner, "", "  ")
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".cleanup-state-*")
	if err != nil {
		return err
	}
	name := file.Name()
	defer os.Remove(name)
	if _, err = file.Write(append(data, '\n')); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	return os.Rename(name, path)
}

func cleanup(ctx context.Context, dir string, run runCommand, pause func(context.Context) error) error {
	path := filepath.Join(dir, "created-device.json")
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("ownership record must be a regular file")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var owner ownership
	if err = json.Unmarshal(data, &owner); err != nil {
		return err
	}
	if !owner.Owned {
		return nil
	}
	if !uuid.MatchString(owner.UDID) || !strings.HasPrefix(owner.Name, "ElyCI-") || !uuid.MatchString(strings.TrimPrefix(owner.Name, "ElyCI-")) {
		return errors.New("invalid owned simulator identity")
	}
	call := func(limit time.Duration, args ...string) result {
		commandCtx, cancel := context.WithTimeout(ctx, limit)
		defer cancel()
		return run(commandCtx, args...)
	}
	check := func() (bool, error) {
		response := call(5*time.Second, "simctl", "list", "devices", "--json")
		if response.err != nil {
			return false, fmt.Errorf("inventory failed: %w", response.err)
		}
		return present(response.output, owner)
	}
	unchanged := func() error {
		current, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if string(current) != string(data) {
			return errors.New("ownership record changed during cleanup")
		}
		return nil
	}
	finish := func() error {
		if err := unchanged(); err != nil {
			return err
		}
		owner.Owned = false
		return saveOwner(path, owner)
	}
	exists, err := check()
	if err != nil {
		return err
	}
	if !exists {
		return finish()
	}
	// Shutdown can time out while CoreSimulator continues the request server-side.
	if err := unchanged(); err != nil {
		return err
	}
	response := call(30*time.Second, "simctl", "shutdown", owner.UDID)
	var receiptFailure receiptError
	if errors.As(response.err, &receiptFailure) {
		return response.err
	}
	for attempt := 0; attempt < 2; attempt++ {
		exists, err = check()
		if err != nil {
			return err
		}
		if !exists {
			return finish()
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := unchanged(); err != nil {
			return err
		}
		response = call(30*time.Second, "simctl", "delete", owner.UDID)
		if errors.As(response.err, &receiptFailure) {
			return response.err
		}
		for poll := 0; poll < 3; poll++ {
			exists, err = check()
			if err != nil {
				return err
			}
			if !exists {
				return finish()
			}
			if err := pause(ctx); err != nil {
				return err
			}
		}
	}
	return errors.New("owned simulator still present after bounded cleanup; ownership retained")
}

// Output files are per invocation and commands are never repeated without receipts.
func commandRunner(dir string) runCommand {
	count := 0
	return func(ctx context.Context, args ...string) result {
		count++
		stem := filepath.Join(dir, fmt.Sprintf("%02d-%s", count, strings.Join(args[:min(2, len(args))], "-")))
		out, err := os.Create(stem + ".stdout")
		if err != nil {
			return result{err: receiptError{err}}
		}
		defer out.Close()
		stderr, err := os.Create(stem + ".stderr")
		if err != nil {
			return result{err: receiptError{err}}
		}
		defer stderr.Close()
		cmd := exec.CommandContext(ctx, "xcrun", args...)
		cmd.Stdout, cmd.Stderr = out, stderr
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		cmd.Cancel = func() error {
			err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
			if errors.Is(err, syscall.ESRCH) {
				return os.ErrProcessDone
			}
			return err
		}
		cmd.WaitDelay = time.Second
		start := time.Now()
		err = cmd.Run()
		code := 0
		if err != nil {
			code = -1
			var exit *exec.ExitError
			if errors.As(err, &exit) {
				code = exit.ExitCode()
			}
			if ctx.Err() != nil {
				code = 124
				err = ctx.Err()
			}
		}
		meta, _ := json.Marshal(map[string]any{"command": append([]string{"xcrun"}, args...), "exit": code, "elapsed_seconds": time.Since(start).Seconds()})
		if writeErr := os.WriteFile(stem+".json", append(meta, '\n'), 0600); writeErr != nil {
			return result{err: receiptError{writeErr}}
		}
		data, readErr := os.ReadFile(stem + ".stdout")
		if readErr != nil {
			return result{err: receiptError{readErr}}
		}
		return result{output: data, err: err}
	}
}

func main() {
	defaultDir := os.Getenv("ELY_IOS_DIAGNOSTICS_DIR")
	if defaultDir == "" {
		defaultDir = "/tmp/ely-ios-diagnostics"
	}
	dir := flag.String("diagnostics-dir", defaultDir, "preparation diagnostics/ownership directory")
	flag.Parse()
	if flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "unexpected arguments")
		os.Exit(2)
	}
	if err := os.MkdirAll(*dir, 0700); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	evidence, err := os.MkdirTemp(*dir, "cleanup-")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	var before ownership
	if data, readErr := os.ReadFile(filepath.Join(*dir, "created-device.json")); readErr == nil {
		_ = json.Unmarshal(data, &before) // Evidence only; cleanup validates the record.
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 100*time.Second)
	defer cancel()
	err = cleanup(ctx, *dir, commandRunner(evidence), func(ctx context.Context) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
			return nil
		}
	})
	message := ""
	if err != nil {
		message = err.Error()
	}
	summary, _ := json.MarshalIndent(map[string]any{
		"success": err == nil, "error": message, "evidence": evidence,
		"sourceSHA": os.Getenv("ELY_IOS_SOURCE_SHA"), "ownedUDID": before.UDID,
		"absenceVerified": err == nil && before.Owned,
	}, "", "  ")
	if writeErr := os.WriteFile(filepath.Join(evidence, "summary.json"), append(summary, '\n'), 0600); writeErr != nil {
		fmt.Fprintln(os.Stderr, writeErr)
		os.Exit(1)
	}
	fmt.Println("Cleanup receipts:", evidence)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
