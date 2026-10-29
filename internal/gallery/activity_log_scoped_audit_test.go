package uiexamples

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAuditCanRenderOneExactActivityLogCasePair(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	server.ServeHTTP(response, httptest.NewRequest("GET", "/components/audit?aliases=1&family=workspace&case=collab/ActivityLog", nil))
	if response.Code != 200 {
		t.Fatalf("exact ActivityLog audit case status=%d body=%s", response.Code, response.Body.String())
	}
	body := response.Body.String()
	if strings.Count(body, `data-audit-case `) != 1 || strings.Count(body, `data-audit-name="collab/ActivityLog"`) != 1 {
		t.Fatal("scoped audit must retain exactly one public case wrapper")
	}
	if strings.Count(body, `data-ely-component="collab/ActivityLog"`) != 2 {
		t.Fatal("scoped audit must retain the exact primary and independent twin")
	}
	for _, href := range []string{"#gamma-space", "#lift", "#on-lift"} {
		if !strings.Contains(body, `href="`+href+`"`) {
			t.Errorf("scoped ActivityLog primary/twin lost native link %s", href)
		}
	}
	if strings.Contains(body, `data-audit-name="collab/CommentThread"`) {
		t.Fatal("scoped case must not expand to workspace peers")
	}
}

func TestAuditCaseFilterFailsClosed(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{
		"/components/audit?case=ActivityLog",
		"/components/audit?family=workspace&case=collab/NotAComponent",
		"/components/audit?family=communication&case=collab/ActivityLog",
	} {
		response := httptest.NewRecorder()
		server.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Code != 400 {
			t.Errorf("invalid/unmatched audit case %q status=%d, want 400", path, response.Code)
		}
	}
}
