package ui

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"reflect"
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
