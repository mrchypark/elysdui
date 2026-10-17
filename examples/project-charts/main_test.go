package main

import (
	"html"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestProjectChartSDUIHTTP(t *testing.T) {
	h, err := handler()
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/sdui", nil))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, text := range []string{"select-task", "select-day", "remaining", "No selection yet.", "data-sdui-events"} {
		if !strings.Contains(w.Body.String(), text) {
			t.Fatalf("missing %s", text)
		}
	}
	for _, tc := range []struct {
		action, id, field, value, date string
		index                          int
	}{
		{"inspect-task", "sdui-gantt", "progress", "25.25", "", 1}, {"inspect-day", "sdui-burn", "remaining", "45.25", "2026-10-13", 1},
	} {
		t.Run(tc.action, func(t *testing.T) {
			values := url.Values{"_csrf": {"local-chart-demo-csrf"}, "_action": {tc.action}, "_target": {"selection-result"}, "chartID": {tc.id}, "index": {"1"}, tc.field: {tc.value}, "date": {tc.date}, "value": {"caller"}}
			req := httptest.NewRequest("POST", "/sdui", strings.NewReader(values.Encode()))
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			req.Header.Set("Idempotency-Key", tc.action+"-test-key")
			w := httptest.NewRecorder()
			h.ServeHTTP(w, req)
			if w.Code != 200 {
				t.Fatal(w.Code, w.Body.String())
			}
			body := html.UnescapeString(w.Body.String())
			for _, want := range []string{`"chartID":"` + tc.id + `"`, `"index":1`, `"` + tc.field + `":` + tc.value} {
				if !strings.Contains(body, want) {
					t.Fatalf("missing host-processed %s in %s", want, body)
				}
			}
		})
	}
}

func TestProjectChartCallerAssets(t *testing.T) {
	h, err := handler()
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, asset := range []string{"/assets/ely-api-communication-entry.js", "/assets/ely-api-communication.css", "/assets/ely-api.css"} {
		if !strings.Contains(w.Body.String(), `"`+asset+`"`) {
			t.Errorf("caller is missing required chart asset %s", asset)
		}
	}
}
