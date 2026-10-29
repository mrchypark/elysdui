package uiexamples

import (
	"bytes"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"html/template"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNativeToolingFixtures(t *testing.T) {
	tpl, err := template.New("tooling").Funcs(ui.Funcs()).ParseFS(ui.Files, "templates/ely-api-native-tooling.html")
	if err != nil {
		t.Fatal(err)
	}
	names := []string{"InspectorOverlay", "FPSMeter", "RenderCounter", "EventLogger", "DesignTokenViewer", "IconBrowser", "A11yChecker", "ScreenshotTest Harness", "ComponentGallery", "PlaygroundPanel", "RenderSurface"}
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			props := map[string]any{"Action": "old-command", "Value": "fake-state", "Items": []string{"stale"}}
			chapter := "tooling"
			if name == "RenderSurface" {
				chapter = "rendering"
			}
			nativeToolingProps(chapter, name, props)
			var out bytes.Buffer
			if err := tpl.ExecuteTemplate(&out, "native-tooling", props); err != nil {
				t.Fatal(err)
			}
			html := out.String()
			for _, bad := range []string{"style=", "ZgotmplZ", "old-command", "fake-state", "stale"} {
				if strings.Contains(html, bad) {
					t.Errorf("unexpected %q", bad)
				}
			}
			switch name {
			case "DesignTokenViewer":
				groups := props["Groups"].([]map[string]any)
				if len(groups) != 12 {
					t.Fatalf("groups: %d", len(groups))
				}
				for i, n := range []int{36, 13, 8, 16, 8, 4, 3, 6, 5, 3, 3, 6} {
					if got := len(groups[i]["Items"].([]map[string]any)); got != n {
						t.Errorf("group %d: %d want %d", i, got, n)
					}
				}
			case "IconBrowser":
				if got := len(props["Icons"].([]string)); got != len(ui.FoundationIconNames()) {
					t.Fatalf("incomplete icon catalogue: %d", got)
				}
			case "A11yChecker":
				pairs := props["Items"].([]map[string]any)
				if len(pairs) != 81 {
					t.Fatalf("pairs: %d", len(pairs))
				}
				for _, pair := range pairs {
					if pair["Foreground"] == "" || pair["Background"] == "" {
						t.Fatal("missing pinned color")
					}
				}
			case "InspectorOverlay":
				if strings.Contains(html, "data-tool-inspect-toggle") {
					t.Fatal("release source should not show inspector trigger")
				}
			case "ComponentGallery":
				if strings.Contains(html, "<button") {
					t.Fatal("source gallery is descriptive")
				}
				for _, want := range []string{`aria-label="Component gallery"`, `href="/components/primitives/box-view"`, `href="/components/media/imageviewer"`, `href="/components/tooling/inspectoroverlay"`} {
					if !strings.Contains(html, want) {
						t.Errorf("caller gallery fixture missing %q", want)
					}
				}
			case "PlaygroundPanel":
				if strings.Count(html, "data-tool-playground=") != 2 {
					t.Fatal("both source playgrounds required")
				}
			}
		})
	}
}

func TestNativeToolingComponentGalleryLinksResolve(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	props := map[string]any{}
	nativeToolingProps("tooling", "ComponentGallery", props)
	items := props["Items"].([]map[string]any)
	if len(items) != 3 {
		t.Fatalf("ComponentGallery link count = %d, want 3", len(items))
	}
	var out bytes.Buffer
	if err := server.templates.ExecuteTemplate(&out, "native-tooling", props); err != nil {
		t.Fatal(err)
	}
	// Use the same story inventory and destinations as ExportStatic.
	routes := map[string]string{}
	for _, chapter := range server.components {
		for _, story := range chapter.Stories {
			route := componentHref(chapter.Slug, story.Slug)
			routes[route] = strings.TrimPrefix(route, "/") + "/"
		}
	}
	const base = "/elysdui/go-htmx/"
	static, err := staticHTML(out.Bytes(), base, routes)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		href := item["URL"].(string)
		destination, ok := routes[href]
		if !ok {
			t.Fatalf("ComponentGallery link %q is not an exported story route", href)
		}
		if !strings.Contains(out.String(), `href="`+href+`"`) {
			t.Errorf("ComponentGallery did not render link %q", href)
		}
		response := httptest.NewRecorder()
		server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, href, nil))
		if response.Code != http.StatusOK {
			t.Errorf("ComponentGallery link %q returned %d", href, response.Code)
		}
		if !strings.Contains(string(static), `href="`+base+destination+`"`) {
			t.Errorf("ComponentGallery link %q was not rewritten to the static story", href)
		}
	}
}
