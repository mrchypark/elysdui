package main

import (
	"golang.org/x/net/html"
	stdhtml "html"
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
	// Obtain payload IDs from the same HTML that the browser receives.
	doc, err := html.Parse(strings.NewReader(w.Body.String()))
	if err != nil {
		t.Fatal(err)
	}
	controlIDs := map[string]string{}
	var visit func(*html.Node)
	visit = func(n *html.Node) {
		var id, component string
		for _, a := range n.Attr {
			if a.Key == "id" {
				id = a.Val
			}
			if a.Key == "data-ely-component" {
				component = a.Val
			}
		}
		if component != "" {
			controlIDs[component] = id
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			visit(c)
		}
	}
	visit(doc)
	if len(controlIDs) == 0 {
		t.Fatal("missing rendered controls")
	}
	for _, tc := range []struct {
		action, id, field, value, date string
		index                          int
	}{
		{"inspect-task", controlIDs["project/GanttChart"], "progress", "25.25", "", 1}, {"inspect-day", controlIDs["project/Burndown Chart"], "remaining", "45.25", "2026-10-13", 1},
	} {
		t.Run(tc.action, func(t *testing.T) {
			values := url.Values{"_csrf": {"local-chart-demo-csrf"}, "_action": {tc.action}, "_target": {"selection-result"}, "chartID": {tc.id}, "index": {"1"}, tc.field: {tc.value}, "date": {tc.date}, "value": {"build"}}
			if tc.date != "" {
				values.Set("value", tc.date)
			}
			req := httptest.NewRequest("POST", "/sdui", strings.NewReader(values.Encode()))
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			req.Header.Set("Idempotency-Key", tc.action+"-test-key")
			w := httptest.NewRecorder()
			h.ServeHTTP(w, req)
			if w.Code != 200 {
				t.Fatal(w.Code, w.Body.String())
			}
			body := stdhtml.UnescapeString(w.Body.String())
			for _, want := range []string{`"chartID":"` + tc.id + `"`, `"index":1`, `"` + tc.field + `":` + tc.value} {
				if !strings.Contains(body, want) {
					t.Fatalf("missing host-processed %s in %s", want, body)
				}
			}
			for _, field := range []string{"index", "value", tc.field, "date"} {
				if field == "date" && tc.date == "" {
					continue
				}
				original := values.Get(field)
				values.Set(field, "999")
				bad := httptest.NewRequest("POST", "/sdui", strings.NewReader(values.Encode()))
				bad.Header.Set("Content-Type", "application/x-www-form-urlencoded")
				bad.Header.Set("Idempotency-Key", tc.action+"-bad-"+field)
				rejected := httptest.NewRecorder()
				h.ServeHTTP(rejected, bad)
				if rejected.Code < 400 {
					t.Fatalf("forged %s accepted: %d", field, rejected.Code)
				}
				values.Set(field, original)
			}

			// Logical wrapper IDs and forged IDs must never pass control validation.
			for _, badID := range []string{"sdui-gantt", "sdui-burn", "sdui-internal-forged"} {
				values.Set("chartID", badID)
				bad := httptest.NewRequest("POST", "/sdui", strings.NewReader(values.Encode()))
				bad.Header.Set("Content-Type", "application/x-www-form-urlencoded")
				bad.Header.Set("Idempotency-Key", tc.action+"-"+badID)
				rejected := httptest.NewRecorder()
				h.ServeHTTP(rejected, bad)
				if rejected.Code < 400 {
					t.Fatalf("forged chart ID %q accepted: %d", badID, rejected.Code)
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

func TestProjectChartBridgeAssets(t *testing.T) {
	h, err := handler()
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/assets/sdui.js", "/assets/sdui.css", "/assets/app.css"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 || w.Body.Len() == 0 {
			t.Errorf("%s: status %d, bytes %d", path, w.Code, w.Body.Len())
		}
	}
}
