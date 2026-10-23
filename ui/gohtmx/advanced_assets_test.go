package ui

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

var advancedAssetFamilies = []string{"foundation", "interaction", "data", "workspace", "communication", "native", "forms"}

func advancedAssetURLs(t *testing.T, name string, data any) (styles, scripts []string) {
	t.Helper()
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := tpl.ExecuteTemplate(&output, name, data); err != nil {
		t.Fatal(err)
	}
	doc, err := html.Parse(&output)
	if err != nil {
		t.Fatal(err)
	}
	for _, link := range formNodes(doc, "link") {
		url, _ := formAttr(link, "href")
		styles = append(styles, url)
	}
	for _, script := range formNodes(doc, "script") {
		url, _ := formAttr(script, "src")
		scripts = append(scripts, url)
		if url != "/assets/lottie-light.min.js" {
			requireFormAttr(t, script, "type", "module")
		}
	}
	return
}

func TestAdvancedFamilyAssetsSelectJavaScriptAndKeepDependencies(t *testing.T) {
	for _, family := range advancedAssetFamilies {
		t.Run(family, func(t *testing.T) {
			styles, scripts := advancedAssetURLs(t, "ui-advanced-family-assets", family)
			wantStyles := []string{"/assets/ely-api.css", "/assets/ely-api-" + family + ".css"}
			switch family {
			case "workspace":
				wantStyles = append(wantStyles, "/assets/ely-api-forms.css")
			case "communication":
				wantStyles = append(wantStyles, "/assets/ely-api-calendar-parity.css")
			case "native":
				wantStyles = append(wantStyles, "/assets/ely-api-native-tooling.css")
			}
			wantScripts := []string{"/assets/ely-api-" + family + "-entry.js"}
			if family == "interaction" {
				wantScripts = append([]string{"/assets/lottie-light.min.js"}, wantScripts...)
			}
			if !reflect.DeepEqual(styles, wantStyles) || !reflect.DeepEqual(scripts, wantScripts) {
				t.Fatalf("%s assets = %v, %v; want %v, %v", family, styles, scripts, wantStyles, wantScripts)
			}
		})
	}
}

func TestAdvancedAllAssetsRemainCompatible(t *testing.T) {
	styles, scripts := advancedAssetURLs(t, "ui-advanced-assets", nil)
	wantScripts := []string{"/assets/lottie-light.min.js", "/assets/ely-api-all.js"}
	if !reflect.DeepEqual(scripts, wantScripts) {
		t.Fatalf("all-family scripts = %v; want %v", scripts, wantScripts)
	}
	wantStyles := []string{
		"/assets/ely-api.css", "/assets/ely-api-foundation.css", "/assets/ely-api-interaction.css",
		"/assets/ely-api-data.css", "/assets/ely-api-workspace.css", "/assets/ely-api-communication.css",
		"/assets/ely-api-calendar-parity.css", "/assets/ely-api-native.css", "/assets/ely-api-native-tooling.css",
		"/assets/ely-api-forms.css",
	}
	if !reflect.DeepEqual(styles, wantStyles) {
		t.Fatalf("all-family styles = %v; want %v", styles, wantStyles)
	}
}

func TestMobileGenerativeAndFeedbackWrappersUseShrinkableGridTracks(t *testing.T) {
	for _, tc := range []struct {
		name string
		path string
		want string
	}{
		{"FineTune and DatasetViewer", "assets/ely-api-native.css", "[data-ely-family='native'] .ely-native-card:is([data-native-kind='FineTuneJobCard'],[data-native-kind='DatasetViewer']) .ely-native-controls{grid-template-columns:minmax(0,1fr)}"},
		{"Alert and Callout", "assets/ely-api-interaction.css", "[data-ely-family=\"interaction\"] .ely-interaction--feedback-source:is([data-interaction-kind=\"Alert\"],[data-interaction-kind=\"Callout\"]){grid-template-columns:minmax(0,1fr)}"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			css, err := Files.ReadFile(tc.path)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(string(css), tc.want) {
				t.Fatalf("%s is missing the constrained component grid rule %q", tc.path, tc.want)
			}
		})
	}
	nativeCSS, err := Files.ReadFile("assets/ely-api-native.css")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(nativeCSS), ".ely-native-card:is([data-native-kind='FineTuneJobCard'],[data-native-kind='DatasetViewer']){grid-template-columns:minmax(0,1fr)}") {
		t.Fatal("generative track constraint must be on the inner controls grid, not the outer card")
	}
}

func TestLicenseViewerWrapsWithinItsContainerAndKeepsLicenseScrolling(t *testing.T) {
	css, err := Files.ReadFile("assets/ely-api-native.css")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		".ely-misc-licenses{width:min(560px,100%);min-width:0;display:flex;flex-wrap:wrap;gap:16px}",
		".ely-misc-licenses nav{width:min(240px,100%);min-width:0;flex:0 1 240px;display:flex;flex-direction:column;gap:4px}",
		".ely-misc-licenses article{min-width:0;flex:1 1 240px;display:flex;flex-direction:column;gap:8px}",
		"[data-ely-family='native'] .ely-misc-licenses pre{max-height:320px;overflow:auto;",
	} {
		if !strings.Contains(string(css), want) {
			t.Errorf("native LicenseViewer CSS is missing %q", want)
		}
	}
}

func TestAdvancedFamilyEntrypointsAreEmbeddedAndServed(t *testing.T) {
	mux := http.NewServeMux()
	if err := BindAssets(mux); err != nil {
		t.Fatal(err)
	}
	for _, family := range advancedAssetFamilies {
		path := "/assets/ely-api-" + family + "-entry.js"
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		want, err := Files.ReadFile(path[1:])
		if err != nil {
			t.Fatal(err)
		}
		if w.Code != http.StatusOK || !bytes.Equal(w.Body.Bytes(), want) || w.Header().Get("ETag") == "" {
			t.Fatalf("entrypoint %s was not served intact: status %d, headers %v", path, w.Code, w.Header())
		}
	}
}
