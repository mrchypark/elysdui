package uiexamples

import (
	"bytes"
	"html/template"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestFullCatalogueRendersNatively(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	entries, err := fs.ReadDir(ui.Files, "templates")
	if err != nil {
		t.Fatal(err)
	}
	definitions := map[string]string{}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".html") {
			continue
		}
		name := "templates/" + entry.Name()
		data, err := ui.Files.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		file, err := template.New(entry.Name()).Funcs(ui.Funcs()).Parse(string(data))
		if err != nil {
			t.Fatal(err)
		}
		for _, definition := range file.Templates() {
			templateName := definition.Name()
			if !strings.HasPrefix(templateName, "ely-") || templateName == entry.Name() {
				continue
			}
			if previous := definitions[templateName]; previous != "" {
				t.Fatalf("native template %s defined in both %s and %s", templateName, previous, entry.Name())
			}
			definitions[templateName] = entry.Name()
		}
	}
	if got := len(server.components); got != 44 {
		t.Fatalf("chapters = %d, want 44", got)
	}
	seen := map[string]bool{}
	assetPattern := regexp.MustCompile("src=\"(/assets/[^\" ]+)")
	for _, chapter := range server.components {
		for _, story := range chapter.Stories {
			if len(story.Slug) > 255 {
				t.Fatalf("component route exceeds static hosting filename limit: %s/%s", chapter.Slug, story.Slug)
			}
			path := componentHref(chapter.Slug, story.Slug)
			if seen[path] {
				t.Fatalf("duplicate story route %s", path)
			}
			seen[path] = true
			var preview bytes.Buffer
			var fixture ui.Component
			for _, record := range advancedCases() {
				if record.Component.Chapter == chapter.Slug && record.Component.Name == story.Name {
					fixture = record.Component
					break
				}
			}
			for _, component := range storyPreviewComponents(fixture) {
				if err := ui.RenderComponent(server.templates, &preview, component); err != nil {
					t.Fatalf("%s: %v", path, err)
				}
			}
			body := preview.String()
			if strings.TrimSpace(body) == "" || strings.Contains(body, "Preparing "+story.Name+"…") {
				t.Errorf("empty preview %s", path)
			}
			for _, asset := range assetPattern.FindAllStringSubmatch(body, -1) {
				name := strings.TrimPrefix(asset[1], "/")
				if _, err := Files.ReadFile(name); err != nil {
					if _, sharedErr := ui.Files.ReadFile(name); sharedErr != nil {
						t.Errorf("%s references unavailable asset %s: gallery=%v shared=%v", path, name, err, sharedErr)
					}
				}
			}
			if regexp.MustCompile(`(?i)\sstyle\s*=`).MatchString(body) {
				t.Errorf("%s contains an inline style", path)
			}
			for _, forbidden := range []string{"ZgotmplZ", "<script", "onclick=", "oninput=", "javascript:", "gallery_bg.wasm", "component-frame"} {
				if strings.Contains(body, forbidden) {
					t.Errorf("%s contains %q", path, forbidden)
				}
			}
		}
	}
	if got := len(seen); got != 624 {
		t.Fatalf("stories = %d, want 624", got)
	}
	p := server.componentPage()
	if p.Count != 1279 {
		t.Fatalf("aliases = %d, want 1279", p.Count)
	}
}

func TestStandaloneRoutesBoundaryAndEscaping(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	request := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		server.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w
	}
	if w := request("/"); w.Code != http.StatusSeeOther || w.Header().Get("Location") != "/components" {
		t.Fatalf("root redirect = %d %q", w.Code, w.Header().Get("Location"))
	}
	index := request("/components")
	if index.Code != http.StatusOK || !strings.Contains(index.Body.String(), "1279 component names") {
		t.Fatalf("catalogue response = %d", index.Code)
	}
	if strings.Contains(index.Body.String(), "/app/") || strings.Contains(index.Body.String(), "로그아웃") || strings.Contains(index.Body.String(), "연구 노트") {
		t.Fatal("gallery still contains application navigation")
	}
	search := request("/components?q=ClearableInput")
	if search.Code != http.StatusOK || !strings.Contains(search.Body.String(), "/components/forms/input-textfield-clearableinput") || !strings.Contains(search.Body.String(), `value="ClearableInput"`) {
		t.Fatal("alias query and complete client-searchable catalogue are missing")
	}
	story := request("/components/forms/input-textfield-clearableinput")
	if story.Code != http.StatusOK || !strings.Contains(story.Body.String(), "data-demo-story=\"forms/input-textfield-clearableinput\"") || !strings.Contains(story.Body.String(), "data-slot=\"input\"") {
		t.Fatal("native input story did not render")
	}
	if csp := story.Header().Get("Content-Security-Policy"); !strings.Contains(csp, "default-src 'self'") || strings.Contains(csp, "unsafe-inline") {
		t.Fatalf("CSP = %q", csp)
	}
	for _, path := range []string{"/components/maps/mapview-mapmarker-maplayer", "/components/forms/unknown"} {
		if w := request(path); w.Code != http.StatusNotFound {
			t.Fatalf("%s = %d, want 404", path, w.Code)
		}
	}
	for _, path := range []string{"/app", "/login", "/logout", "/assets/ely/gallery_bg.wasm", "/assets/ely/assets/tiles/0/0/0.png"} {
		if w := request(path); w.Code != http.StatusNotFound {
			t.Fatalf("standalone server exposed %s with %d", path, w.Code)
		}
	}
	for _, path := range []string{"/components?q=" + strings.Repeat("a", 201), "/components/demo?q=" + strings.Repeat("a", 201)} {
		if w := request(path); w.Code != http.StatusBadRequest {
			t.Fatalf("%s = %d, want 400", path, w.Code)
		}
	}
	malicious := "%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E"
	for _, path := range []string{"/components?q=" + malicious, "/components/demo?q=" + malicious} {
		w := request(path)
		if w.Code != http.StatusOK || strings.Contains(w.Body.String(), "<img src=x onerror") || !strings.Contains(w.Body.String(), "&lt;img") {
			t.Fatalf("query escaping failed for %s", path)
		}
	}
	demo := request("/components/demo?q=ClearableInput")
	if demo.Code != http.StatusOK || !strings.Contains(demo.Body.String(), "Local demo response") || strings.Contains(demo.Body.String(), "<html") {
		t.Fatal("demo is not an htmx fragment")
	}
}

func TestAssetsAndSharedPrimitives(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/assets/components.css", "/assets/ely/LICENSE.txt", "/assets/app.css", "/assets/htmx.min.js"} {
		w := httptest.NewRecorder()
		server.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusOK || w.Body.Len() == 0 {
			t.Fatalf("%s = %d, %d bytes", path, w.Code, w.Body.Len())
		}
	}
	templates, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := templates.ExecuteTemplate(&out, "button", map[string]any{"Label": "<img onerror=alert(1)>", "Variant": "outline"}); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out.String(), "<img onerror") || !strings.Contains(out.String(), "data-slot=") {
		t.Fatal("shared button escaped incorrectly")
	}
	if _, err := fs.ReadFile(Files, "assets/components.css"); err != nil {
		t.Fatal(err)
	}
}

func TestStoryLoadsItsDemoStylesheetsAndDependencies(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]string{
		"/components/forms/input-textfield-clearableinput": "ely-api-forms.css",
		"/components/tables/table":                         "ely-api-data.css",
		"/components/buttons/button":                       "ely-api-interaction.css",
		"/components/editor/codeeditor-editorgutter-linenumbers-foldingcontrol-minimap-ruler-indentguide-bracketmatcher-rainbowbrackets-multicursor-selectionhighlight-stickyscroll-breadcrumb-inlayhints-codelens-inlinedecoration": "ely-api-workspace.css",
		"/components/chat/chatcontainer-messagelist-messagebubble-messageavatar-messageheader-messagefooter-dateseparator-scrolltobottombutton":                                                                                      "ely-api-communication.css",
		"/components/media/imageviewer": "ely-api-native.css",
		"/components/canvas/colorpanel-gradientpanel-shadoweditor-bordereditor-typographypanel": "ely-api-workspace.css",
	}
	for path, stylesheet := range cases {
		w := httptest.NewRecorder()
		server.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusOK {
			t.Fatalf("%s = %d", path, w.Code)
		}
		body := w.Body.String()
		if strings.Contains(body, "class=\"component-live native-preview\"") {
			t.Errorf("%s applies legacy sizing rules to the public API", path)
		}
		if !strings.Contains(body, "/assets/"+stylesheet) {
			t.Errorf("%s does not load %s", path, stylesheet)
		}
		if stylesheet == "ely-api-communication.css" && !strings.Contains(body, "/assets/ely-api-calendar-parity.css") {
			t.Errorf("%s omits calendar styles", path)
		}
		if stylesheet == "ely-api-native.css" && !strings.Contains(body, "/assets/ely-api-native-tooling.css") {
			t.Errorf("%s omits native tooling styles", path)
		}
		if stylesheet == "ely-api-workspace.css" && !strings.Contains(body, "/assets/ely-api-forms.css") {
			t.Errorf("%s omits nested form styles", path)
		}
		for _, other := range []string{"ely-api-interaction.css", "ely-api-data.css", "ely-api-forms.css", "ely-api-workspace.css", "ely-api-communication.css", "ely-api-native.css", "ely-api-foundation.css"} {
			if other != stylesheet && !(stylesheet == "ely-api-workspace.css" && other == "ely-api-forms.css") && strings.Contains(body, "/assets/"+other) {
				t.Errorf("%s leaks %s", path, other)
			}
		}
	}
	stylesheets := []string{"ely-api-interaction.css", "ely-api-data.css", "ely-api-forms.css", "ely-api-workspace.css", "ely-api-communication.css", "ely-api-native.css", "ely-api-foundation.css"}
	for _, chapter := range server.components {
		path := componentHref(chapter.Slug, chapter.Stories[0].Slug)
		w := httptest.NewRecorder()
		server.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		loaded := 0
		for _, stylesheet := range stylesheets {
			if strings.Contains(w.Body.String(), "/assets/"+stylesheet) {
				loaded++
			}
		}
		want := 1
		if strings.Contains(w.Body.String(), "/assets/ely-api-workspace.css") {
			want = 2
		}
		if w.Code != http.StatusOK || loaded != want {
			t.Errorf("%s = %d with %d demo stylesheets", path, w.Code, loaded)
		}
	}
	index := httptest.NewRecorder()
	server.ServeHTTP(index, httptest.NewRequest(http.MethodGet, "/components", nil))
	if !strings.Contains(index.Body.String(), "ely-api-interaction.css") || strings.Contains(index.Body.String(), "ely-api-interaction-entry.js") {
		t.Fatal("catalogue thumbnails require styles without interactive demo runtimes")
	}
}

func TestShadcnPrimitives(t *testing.T) {
	templates, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]map[string]any{
		"button":    {"Label": "<img onerror=alert(1)>", "Type": "submit", "Variant": "outline"},
		"input":     {"ID": "sample", "Name": "sample", "Placeholder": "<script>alert(1)</script>", "Required": true},
		"textarea":  {"ID": "notes", "Name": "notes", "Value": "<script>alert(1)</script>"},
		"checkbox":  {"ID": "check", "Checked": true, "AriaLabel": "Choose"},
		"switch":    {"ID": "switch", "Checked": true, "AriaLabel": "Toggle"},
		"slider":    {"Value": 42, "AriaLabel": "Value"},
		"progress":  {"Value": 42, "AriaLabel": "Progress"},
		"badge":     {"Text": "Draft"},
		"kbd-group": {"Keys": []string{"Ctrl", "K"}},
		"separator": {},
	}
	for name, args := range cases {
		var out bytes.Buffer
		if err := templates.ExecuteTemplate(&out, name, args); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		for _, forbidden := range []string{"ZgotmplZ", "<script>", "<img onerror", "style="} {
			if strings.Contains(out.String(), forbidden) {
				t.Fatalf("%s contains %s", name, forbidden)
			}
		}
		if !strings.Contains(out.String(), "data-slot=") {
			t.Fatalf("%s lost shadcn marker", name)
		}
	}
}

func TestBasicFormStoriesUseSharedTemplates(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	// Replacing a shared primitive must reach its gallery examples too.
	for _, name := range []string{"input", "textarea", "checkbox", "switch", "select", "radio-group", "button"} {
		if _, err := server.templates.New(name).Parse(`<span data-shared-test="` + name + `"></span>`); err != nil {
			t.Fatal(err)
		}
	}
	for _, tc := range []struct {
		slug, primitive string
	}{
		{"input-textfield-clearableinput", "input"},
		{"emailinput-urlinput", "input"},
		{"phoneinput-maskedinput", "input"},
		{"textarea-autoresizeinput", "textarea"},
		{"passwordinput", "input"},
		{"searchinput", "input"},
		{"numberinput", "input"},
		{"checkbox-checkboxgroup", "checkbox"},
		{"switch-toggle", "switch"},
		{"select-nativeselect", "select"},
		{"radio-radiogroup", "radio-group"},
		{"searchinput", "button"},
	} {
		t.Run(tc.slug+"/"+tc.primitive, func(t *testing.T) {
			_, story := server.findComponent("forms", tc.slug)
			if story == nil {
				t.Fatal("missing story")
			}
			response := httptest.NewRecorder()
			server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, componentHref("forms", tc.slug), nil))
			if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `data-shared-test="`+tc.primitive+`"`) {
				t.Fatalf("public example did not reuse shared %s: status=%d", tc.primitive, response.Code)
			}
		})
	}
}
