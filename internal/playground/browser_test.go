package playground

import (
	"encoding/json"
	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
	"strings"
	"testing"
)

func TestBrowserPreviewMatchesNative(t *testing.T) {
	browser, err := NewBrowserRenderer(sdui.Files.ReadFile)
	if err != nil {
		t.Fatal(err)
	}
	native := setup(t)
	for _, example := range examples() {
		t.Run(example.ID, func(t *testing.T) {
			body, err := json.Marshal(map[string]any{"screen": example.Screen, "data": example.Data, "profile": "dynamic", "strategy": "smallest", "minBytes": 256, "minSavingsBytes": 32, "minSavingsPercent": 5})
			if err != nil {
				t.Fatal(err)
			}
			want := request(t, native, "POST", "/api/preview", body, true)
			var got struct {
				Status int    `json:"status"`
				Body   string `json:"body"`
			}
			if err := json.Unmarshal([]byte(browser.Request("POST", "/api/preview", string(body))), &got); err != nil {
				t.Fatal(err)
			}
			if got.Status != want.Code || got.Body != want.Body.String() {
				t.Fatalf("browser/native mismatch: status %d/%d\nbrowser: %s\nnative: %s", got.Status, want.Code, got.Body, want.Body.String())
			}
		})
	}
}

func TestBrowserRequestBoundsAndNumbers(t *testing.T) {
	browser, err := NewBrowserRenderer(sdui.Files.ReadFile)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, body string
		status     int
	}{
		{"precise repeat keys", `{"screen":{"version":"1","id":"demo","root":{"id":"root","type":"text","props":{"text":"ok"},"repeat":{"items":"/items","as":"item","key":"/id"}}},"data":{"items":[{"id":9007199254740992},{"id":9007199254740993}]}}`, 200},
		{"oversized", strings.Repeat(" ", maxBody+1), 413},
		{"invalid", `{"screen":`, 422},
		{"unknown envelope", `{"screen":{},"extra":true}`, 422},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var got struct {
				Status int `json:"status"`
			}
			if err := json.Unmarshal([]byte(browser.Request("POST", "/api/preview", tc.body)), &got); err != nil {
				t.Fatal(err)
			}
			if got.Status != tc.status {
				t.Fatalf("status %d, want %d", got.Status, tc.status)
			}
		})
	}
	if _, err := NewBrowserRenderer(nil); err == nil {
		t.Fatal("missing trusted assets accepted")
	}
}
