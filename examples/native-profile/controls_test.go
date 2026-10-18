package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/mrchypark/elysdui/sdui"
)

func controlsClient(t *testing.T) nativeClient {
	t.Helper()
	handler, err := NewControlsHandler()
	if err != nil {
		t.Fatal(err)
	}
	return startClient(t, handler)
}
func controlsAction(c nativeClient, id int) sdui.NativeActionRequest {
	a := c.action(id, "  Grace Hopper  ")
	a.Fields["company"], a.Fields["notifications"] = "  Example Labs  ", "true"
	a.EditRevisions["company"], a.EditRevisions["notifications"] = 3, 2
	a.Fields["digestConsent"], a.Fields["colorTheme"] = "true", "dark"
	a.EditRevisions["digestConsent"], a.EditRevisions["colorTheme"] = 1, 1
	return a
}
func TestNativeControlsValidationAtomicSaveReplayAndCapability(t *testing.T) {
	c := controlsClient(t)
	if !reflect.DeepEqual(c.ready.Fields, map[string]string{"displayName": "Ada", "company": "", "notifications": "false", "digestConsent": "false", "colorTheme": "system"}) {
		t.Fatalf("unexpected initial fields: %v", c.ready.Fields)
	}
	bad := controlsAction(c, 2)
	bad.Fields["notifications"] = "yes"
	result := c.post(bad, nil)
	if result.Code != 422 || envelope(t, result).Fields["displayName"] != "Ada" {
		t.Fatalf("invalid boolean mutated profile: %s", result.Body.String())
	}
	good := controlsAction(c, 3)
	saved := c.post(good, nil)
	if saved.Code != 200 {
		t.Fatal(saved.Body.String())
	}
	value := envelope(t, saved)
	if value.Fields["company"] != "Example Labs" || value.Fields["notifications"] != "true" || value.Fields["displayName"] != "Grace Hopper" || value.DataVersion != 1 || value.Fields["digestConsent"] != "true" || value.Fields["colorTheme"] != "dark" {
		t.Fatalf("bad save: %#v", value)
	}
	if replay := c.post(good, nil); !bytes.Equal(saved.Body.Bytes(), replay.Body.Bytes()) {
		t.Fatal("replay changed")
	}
	if !reflect.DeepEqual(value.Fields, envelope(t, c.reload(4)).Fields) {
		t.Fatal("reload lost fields")
	}
	// An older client's seven capabilities continue to load the legacy profile,
	// but cannot load the expanded screen. No partial rendering or omission.
	query := url.Values{"protocolVersion": {"1"}, "requestID": {requestID(5)}, "capabilities": {strings.Join(legacyCapabilities, ",")}}
	for _, tc := range []struct {
		handler http.Handler
		want    int
	}{{c.handler, 406}, {testHandler(t), 200}} {
		rec := httptest.NewRecorder()
		tc.handler.ServeHTTP(rec, httptest.NewRequest("GET", demoURL+"/native/profile?"+query.Encode(), nil))
		if rec.Code != tc.want {
			t.Fatalf("legacy negotiation: got %d want %d: %s", rec.Code, tc.want, rec.Body.String())
		}
	}
}
func TestNativeControlsFixtures(t *testing.T) {
	c := controlsClient(t)
	action := controlsAction(c, 2)
	saved := c.post(action, nil)
	if saved.Code != 200 {
		t.Fatal(saved.Body.String())
	}
	invalid := controlsAction(c, 3)
	invalid.DataVersion = 1
	invalid.Fields["colorTheme"] = "unknown"
	bad := c.post(invalid, nil)
	if bad.Code != 422 {
		t.Fatal(bad.Body.String())
	}
	for name, value := range map[string]sdui.NativeEnvelope{"profile-controls-invalid.json": envelope(t, bad), "profile-controls-ready.json": c.ready, "profile-controls-saved.json": envelope(t, saved)} {
		value.SessionID, value.CSRFToken, value.ScreenRevision = "fixture-session", "fixture-csrf", "fixture-controls-revision-1"
		encoded, err := json.MarshalIndent(value, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		encoded = append(encoded, '\n')
		path := filepath.Join("..", "..", "contracts", "native", "profile-v1", "fixtures", name)
		if os.Getenv("UPDATE_NATIVE_FIXTURES") == "1" {
			if err := os.WriteFile(path, encoded, 0644); err != nil {
				t.Fatal(err)
			}
		}
		current, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(current, encoded) {
			t.Fatalf("%s drifted from Go HTTP response", name)
		}
	}
}

func TestSelectionFieldsRejectInvalidValuesWithoutPartialMutation(t *testing.T) {
	for _, field := range []string{"digestConsent", "colorTheme"} {
		t.Run(field, func(t *testing.T) {
			c := controlsClient(t)
			bad := controlsAction(c, 2)
			bad.Fields[field] = "invalid"
			result := c.post(bad, nil)
			if result.Code != 422 {
				t.Fatal(result.Code, result.Body.String())
			}
			reply := envelope(t, result)
			if reply.Errors[field] == "" || !reflect.DeepEqual(reply.Fields, c.ready.Fields) || reply.DataVersion != 0 {
				t.Fatalf("invalid selection mutated baseline: %#v", reply)
			}
			if replay := c.post(bad, nil); !bytes.Equal(result.Body.Bytes(), replay.Body.Bytes()) {
				t.Fatal("invalid replay changed")
			}
			changed := bad
			changed.Fields = map[string]string{}
			for k, v := range bad.Fields {
				changed.Fields[k] = v
			}
			changed.Fields[field] = "true"
			if replay := c.post(changed, nil); replay.Code != 409 {
				t.Fatal("changed retry accepted", replay.Code)
			}
		})
	}
}
func TestSelectionCapabilitiesAreRequiredBeforeMutation(t *testing.T) {
	for _, missing := range []string{"checkbox", "select"} {
		t.Run(missing, func(t *testing.T) {
			c := controlsClient(t)
			a := controlsAction(c, 2)
			a.Capabilities = nil
			for _, cap := range sdui.NativeCapabilities() {
				if cap != missing {
					a.Capabilities = append(a.Capabilities, cap)
				}
			}
			if result := c.post(a, nil); result.Code != 406 {
				t.Fatal(result.Code, result.Body.String())
			}
			if got := envelope(t, c.reload(3)); !reflect.DeepEqual(got.Fields, c.ready.Fields) || got.DataVersion != 0 {
				t.Fatal("missing capability mutated data")
			}
		})
	}
}
