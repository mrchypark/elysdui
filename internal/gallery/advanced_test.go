package uiexamples

import (
	"bytes"
	"fmt"
	"github.com/mrchypark/elysdui/ui/gohtmx"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

func TestEveryAdvancedAPIAndAliasRenders(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]AdvancedCase{}
	for _, fixture := range advancedCases() {
		fixtures[fixture.Component.Chapter+"/"+fixture.Component.Name] = fixture
	}
	defs, err := ui.ComponentDefinitions()
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	inlineExecutable := regexp.MustCompile(`(?i)<[^>]+\s(?:style|on[a-z]+)\s*=`)
	for _, definition := range defs {
		for _, name := range append([]string{definition.Name}, definition.Aliases...) {
			key := definition.Chapter + "/" + name
			if seen[key] {
				continue
			}
			seen[key] = true
			resolved, err := ui.ResolveComponent(definition.Chapter, name)
			if err != nil {
				t.Fatal(err)
			}
			fixture, ok := fixtures[key]
			if !ok {
				fixture, ok = fixtures[resolved.Chapter+"/"+resolved.Name]
			}
			if !ok {
				t.Fatalf("missing fixture %s", key)
			}
			c := fixture.Component
			c.Name = name
			c.ID = fmt.Sprintf("case-%d", len(seen))
			c.Props = aliasFixtureProps(c.Props, name)
			var output bytes.Buffer
			if err := ui.RenderComponent(server.templates, &output, c); err != nil {
				t.Errorf("%s: %v", key, err)
				continue
			}
			if !strings.Contains(output.String(), `data-ely-component="`+key+`"`) {
				t.Errorf("%s has wrong API identity", key)
			}
			if strings.Contains(output.String(), "ZgotmplZ") {
				t.Errorf("%s contains unsafe template value", key)
			}
			if inlineExecutable.Match(output.Bytes()) {
				t.Errorf("%s violates the project's inline style/event CSP", key)
			}
		}
	}
	if len(fixtures) < 624 {
		t.Errorf("fixtures=%d, want624", len(fixtures))
	}
	for _, path := range []string{"/components/api", "/components/audit", "/components/audit?aliases=1", "/components/audit?family=forms"} {
		w := httptest.NewRecorder()
		server.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != 200 {
			t.Errorf("%s: %d %s", path, w.Code, w.Body.String()[:min(500, w.Body.Len())])
		}
	}
}

func TestAuditAliasLinkKeepsSelectedFamily(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/components/audit?family=data", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `href="/components/audit?aliases=1&amp;family=data"`) {
		t.Fatal("alias link lost the selected component family")
	}
}

func TestAuditIncludesEveryResolvedName(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	definitions, err := ui.ComponentDefinitions()
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{}
	seen := map[string]bool{}
	for _, definition := range definitions {
		for _, name := range append([]string{definition.Name}, definition.Aliases...) {
			key := definition.Chapter + "/" + name
			if !seen[key] {
				seen[key] = true
				counts[definition.Family]++
			}
		}
	}
	for family, count := range counts {
		response := httptest.NewRecorder()
		server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/components/audit?aliases=1&family="+family, nil))
		if got := strings.Count(response.Body.String(), "data-audit-case "); response.Code != http.StatusOK || got != count {
			t.Errorf("%s audit rendered %d cases, want %d (status %d)", family, got, count, response.Code)
		}
	}
}

func TestMarkdownPreviewHostAdapter(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	body := strings.NewReader("source=%23+Caller+heading%0A%0A%3Cscript%3Ealert(1)%3C%2Fscript%3E")
	request := httptest.NewRequest(http.MethodPost, "/components/markdown-preview", body)
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != 200 || !strings.Contains(response.Body.String(), "<h1>Caller heading</h1>") || strings.Contains(response.Body.String(), "<script>alert(1)") {
		t.Fatal(response.Code, response.Body.String())
	}
}
