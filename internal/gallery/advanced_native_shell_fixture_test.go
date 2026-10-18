package uiexamples

import (
	"bytes"
	"html/template"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestNativeShellSourceFixtures99To122(t *testing.T) {
	tpl, err := template.New("").Funcs(ui.Funcs()).ParseFS(ui.Files, "templates/ely-api.html", "templates/ely-api-native.html", "templates/ely-api-native-tooling.html", "templates/shadcn-select.html", "templates/shadcn-switch.html")
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]map[string]any{}
	for _, c := range advancedNativeCases() {
		if c.Component.Chapter == "shell" {
			fixtures[c.Component.Name] = c.Component.Props
		}
	}
	names := []string{"TitleBar", "ColumnShell", "WindowControls", "WindowDragRegion", "WindowResizeBorder", "NativeMenu", "Toolbar", "StatusBar", "ActivityBar", "TabBar", "SplashScreen", "AboutDialog", "TrayIcon", "DockBadge", "SystemNotification", "MultiWindow Manager", "WindowSwitcher", "QuickLauncher", "MiniWindow", "UpdateBanner", "UpdateDialog", "CrashReporter", "OfflineIndicator", "ZoomControl"}
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			p := fixtures[name]
			examples, ok := p["PreviewExamples"].([]map[string]any)
			if !ok || len(examples) == 0 {
				t.Fatal("source preview missing")
			}
			want := 1
			if name == "TitleBar" || name == "WindowControls" {
				want = 3
			}
			if name == "ColumnShell" {
				want = 2
			}
			if len(examples) != want {
				t.Fatalf("want %d source specimens, got %d", want, len(examples))
			}
			for _, example := range examples {
				var out bytes.Buffer
				if err := ui.RenderComponent(tpl, &out, ui.Component{Chapter: "shell", Name: name, ID: "source-shell", Props: example}); err != nil {
					t.Fatal(err)
				}
				if strings.Contains(out.String(), "Caller row") || strings.Contains(out.String(), "Document preview") {
					t.Fatal("generic sample leaked into source specimen")
				}
			}
		})
	}
	if len(fixtures) != 24 {
		t.Fatalf("expected 24 shell primaries, got %d", len(fixtures))
	}
	for i, platform := range []string{"mac", "windows", "linux"} {
		if fixtures["TitleBar"]["PreviewExamples"].([]map[string]any)[i]["Platform"] != platform {
			t.Fatal("source platform order lost")
		}
	}
	columns := fixtures["ColumnShell"]["PreviewExamples"].([]map[string]any)
	if columns[0]["Width"] != 640 || columns[1]["Width"] != 760 || columns[0]["Height"] != 280 || len(columns[1]["Columns"].([]map[string]any)) != 3 {
		t.Fatal("source column geometry lost")
	}
	activity := fixtures["ActivityBar"]
	if activity["Selected"] != "files" || len(activity["Items"].([]map[string]any)) != 5 || len(activity["FooterItems"].([]map[string]any)) != 2 {
		t.Fatal("source activity rail state lost")
	}
	if fixtures["TabBar"]["Selected"] != "roadmap" || fixtures["TabBar"]["LocalAdd"] != true || len(fixtures["TabBar"]["Items"].([]map[string]any)) != 3 {
		t.Fatal("source tabs lost")
	}
	if fixtures["SplashScreen"]["Progress"] != 62 || fixtures["TrayIcon"]["Shown"] != false || fixtures["DockBadge"]["Value"] != "" || len(fixtures["MultiWindow Manager"]["Items"].([]map[string]any)) != 0 {
		t.Fatal("source initial host state fabricated")
	}
	banners := fixtures["UpdateBanner"]["Banners"].([]map[string]any)
	if len(banners) != 3 || banners[1]["Progress"] != 42 || banners[2]["State"] != "ready" || len(fixtures["UpdateDialog"]["Items"].([]map[string]any)) != 4 {
		t.Fatal("source update datasets lost")
	}
	if fixtures["CrashReporter"]["Details"] != true || !strings.Contains(fixtures["CrashReporter"]["Value"].(string), "layout::dock::restore + 112") {
		t.Fatal("source report lost")
	}
	if fixtures["OfflineIndicator"]["State"] != "online" || fixtures["ZoomControl"]["Percent"] != 100 {
		t.Fatal("source connectivity/zoom initial state lost")
	}
}
