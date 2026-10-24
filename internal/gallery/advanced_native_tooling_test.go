package uiexamples

import (
	"bytes"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"html/template"
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
				for _, want := range []string{`aria-label="Component gallery"`, `href="/gallery/foundation"`, `href="/gallery/media"`, `href="/gallery/tooling"`} {
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
