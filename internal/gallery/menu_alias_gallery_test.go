package uiexamples

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestMenuAliasGalleryCheckRouting(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/components/audit?aliases=1&family=interaction", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("audit status: %d", response.Code)
	}
	doc, err := html.Parse(strings.NewReader(response.Body.String()))
	if err != nil {
		t.Fatal(err)
	}
	attr := func(n *html.Node, key string) string {
		if n == nil {
			return ""
		}
		for _, a := range n.Attr {
			if a.Key == key {
				return a.Val
			}
		}
		return ""
	}
	cases := map[string]*html.Node{}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if name := attr(n, "data-audit-name"); name != "" {
			cases[name] = n
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	for _, tc := range []struct{ name, key, role, group, primary string }{
		{"menus/RadioMenuItem", "menus/RadioMenuItem", "menuitemradio", "default", "false"},
		{"menus/CheckboxMenuItem", "menus/CheckboxMenuItem", "menuitemcheckbox", "", "true"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			record := cases[tc.name]
			if record == nil {
				t.Fatal("missing exact gallery case")
			}
			if got := attr(record, "data-audit-key"); got != tc.key {
				t.Errorf("gallery check key=%q want %q", got, tc.key)
			}
			if got := attr(record, "data-audit-primary"); got != tc.primary {
				t.Errorf("primary=%q want %q", got, tc.primary)
			}
			roots, defaults, density := 0, 0, 0
			var inspect func(*html.Node)
			inspect = func(n *html.Node) {
				if attr(n, "data-ely-component") == tc.name {
					roots++
				}
				if attr(n, "value") == "sidebar" || attr(n, "value") == "minimap" || attr(n, "value") == "status-bar" {
					defaults++
					if attr(n, "role") != tc.role || attr(n, "data-interaction-menu-radio") != tc.group {
						t.Errorf("default row lost exact alias semantics: %v", n.Attr)
					}
				}
				if attr(n, "value") == "compact" || attr(n, "value") == "standard" || attr(n, "value") == "comfortable" {
					density++
					if attr(n, "role") != "menuitemradio" || attr(n, "data-interaction-menu-radio") != "density" {
						t.Errorf("explicit density radio semantics lost: %v", n.Attr)
					}
				}
				for c := n.FirstChild; c != nil; c = c.NextSibling {
					inspect(c)
				}
			}
			inspect(record)
			if roots != 2 || defaults != 6 || density != 6 {
				t.Errorf("paired fixture coverage: roots=%d defaults=%d density=%d", roots, defaults, density)
			}
		})
	}
	if got := attr(cases["menus/OverflowMenu"], "data-audit-key"); got != "menus/DropdownMenu" {
		t.Errorf("unrelated alias routing changed: %q", got)
	}
}
