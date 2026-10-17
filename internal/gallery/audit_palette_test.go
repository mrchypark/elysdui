package uiexamples

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/net/html"
)

func paletteAuditNodes(root *html.Node, key, value string) []*html.Node {
	var matches []*html.Node
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node.Type == html.ElementNode {
			for _, attr := range node.Attr {
				if attr.Key == key && attr.Val == value {
					matches = append(matches, node)
					break
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
	}
	visit(root)
	return matches
}

func paletteAuditUnique(t *testing.T, root *html.Node, key, value string) *html.Node {
	t.Helper()
	nodes := paletteAuditNodes(root, key, value)
	if len(nodes) != 1 {
		t.Fatalf("%s=%q: got %d nodes, want exactly 1", key, value, len(nodes))
	}
	return nodes[0]
}

func TestColorPickerAuditSuppliesOptionalPalette(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, path string
		want       int
	}{
		{"audit", "/components/audit?family=forms", 1},
		{"public-preview", "/components/forms/colorpicker", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if response.Code != http.StatusOK {
				t.Fatalf("status = %d", response.Code)
			}
			document, err := html.Parse(response.Body)
			if err != nil {
				t.Fatal(err)
			}
			var scope *html.Node
			if tc.name == "audit" {
				swatch := paletteAuditUnique(t, document, "data-audit-name", "forms/ColorSwatch")
				if len(paletteAuditNodes(swatch, "data-ely-swatch-chip", "#228855")) == 0 {
					t.Fatal("unrelated ColorSwatch green fixture must remain present")
				}
				scope = paletteAuditUnique(t, document, "data-audit-name", "forms/ColorPicker")
				scope = paletteAuditUnique(t, scope, "data-audit-main", "")
			} else {
				scope = paletteAuditUnique(t, document, "data-demo-story", "forms/colorpicker")
			}
			picker := paletteAuditUnique(t, scope, "data-ely-component", "forms/ColorPicker")
			if got := len(paletteAuditNodes(picker, "data-ely-color-choice", "#228855")); got != tc.want {
				t.Fatalf("scoped ColorPicker palette choices = %d, want %d", got, tc.want)
			}
		})
	}
}
