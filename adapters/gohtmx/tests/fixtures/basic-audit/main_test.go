package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/mrchypark/elysdui/internal/sduicatalogue"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"golang.org/x/net/html"
)

func walk(node *html.Node, visit func(*html.Node)) {
	visit(node)
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		walk(child, visit)
	}
}
func attr(node *html.Node, key string) string {
	for _, a := range node.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}
func parsed(t *testing.T, text string) *html.Node {
	t.Helper()
	node, err := html.Parse(strings.NewReader(text))
	if err != nil {
		t.Fatal(err)
	}
	return node
}

func TestExactly48CanonicalFixturesAndScopedTwins(t *testing.T) {
	before, err := json.Marshal(sduicatalogue.BasicFixtures())
	if err != nil {
		t.Fatal(err)
	}
	cases, err := inventory()
	if err != nil {
		t.Fatal(err)
	}
	if len(cases) != 48 {
		t.Fatal(len(cases))
	}
	var out bytes.Buffer
	if err = render(&out); err != nil {
		t.Fatal(err)
	}
	doc := parsed(t, out.String())
	ids := map[string]*html.Node{}
	frames := map[string][]*html.Node{}
	walk(doc, func(n *html.Node) {
		if id := attr(n, "id"); id != "" {
			if ids[id] != nil {
				t.Errorf("duplicate ID %s", id)
			}
			ids[id] = n
		}
		if name := attr(n, "data-basic-component"); name != "" {
			frames[name] = append(frames[name], n)
		}
	})
	if len(frames) != 48 {
		t.Fatalf("got%d rendered identities", len(frames))
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			pair := frames[c.Name]
			if len(pair) != 2 {
				t.Fatalf("expected main/twin, got%d", len(pair))
			}
			for i, frame := range pair {
				scope := "basic-" + c.Template + "-main"
				if i == 1 {
					scope = "basic-" + c.Template + "-twin"
				}
				if attr(frame, "id") != scope+"-frame" || attr(frame, "data-basic-props-sha256") != c.PropsSHA256 {
					t.Fatal("identity/props hash drift")
				}
				walk(frame, func(n *html.Node) {
					if id := attr(n, "id"); id != "" && !strings.HasPrefix(id, scope) {
						t.Errorf("foreign ID %s", id)
					}
					if name := attr(n, "name"); name != "" && !strings.HasPrefix(name, scope+"_value") {
						t.Errorf("unscoped field %s", name)
					}
					for _, key := range []string{"for", "aria-controls", "aria-labelledby", "aria-describedby", "list", "popovertarget"} {
						for _, ref := range strings.Fields(attr(n, key)) {
							if ids[ref] == nil || !strings.HasPrefix(ref, scope) {
								t.Errorf("unresolved/foreign %s=%s", key, ref)
							}
						}
					}
					if href := attr(n, "href"); strings.HasPrefix(href, "#") {
						if ids[strings.TrimPrefix(href, "#")] == nil || !strings.HasPrefix(href, "#"+scope) {
							t.Errorf("unscoped fragment %s", href)
						}
					}
				})
			}
		})
	}
	after, _ := json.Marshal(sduicatalogue.BasicFixtures())
	if !bytes.Equal(before, after) {
		t.Fatal("canonical fixtures mutated")
	}
}

func TestCanonicalPropsAndDisabledOptionsPreserved(t *testing.T) {
	for _, f := range sduicatalogue.BasicFixtures() {
		main := instanceProps(f, "main")
		twin := instanceProps(f, "twin")
		for key, value := range f.Props {
			if key == "ID" || key == "Name" || key == "Items" && (f.Template == "menu" || f.Template == "breadcrumb") {
				continue
			}
			if !reflect.DeepEqual(main[key], value) || !reflect.DeepEqual(twin[key], value) {
				t.Errorf("%s changed canonical %s", f.Name, key)
			}
		}
		if options, ok := main["Options"].([]map[string]any); ok {
			if options[1]["Disabled"] != true {
				t.Errorf("%s silently enabled beta", f.Name)
			}
			options[0]["Label"] = "changed only main copy"
			if reflect.DeepEqual(main["Options"], twin["Options"]) || reflect.DeepEqual(main["Options"], f.Props["Options"]) {
				t.Errorf("%s shares mutable option props", f.Name)
			}
		}
	}
}

func TestBasicCallerStringsStayEscaped(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range sduicatalogue.BasicFixtures() {
		t.Run(f.Name, func(t *testing.T) {
			props := instanceProps(f, "escape")
			for _, key := range []string{"Label", "Title", "Description", "Content", "Text", "Value", "Placeholder", "AriaLabel"} {
				props[key] = `<img data-injected="yes" src=x onerror=alert(1)>`
			}
			var out bytes.Buffer
			if err := tpl.ExecuteTemplate(&out, f.Template, props); err != nil {
				t.Fatal(err)
			}
			walk(parsed(t, out.String()), func(n *html.Node) {
				if attr(n, "data-injected") == "yes" || attr(n, "onerror") != "" {
					t.Fatal("caller string became executable markup")
				}
			})
		})
	}
}

func TestBasicMatrixAndNonvisualInitialStates(t *testing.T) {
	if _, err := matrix(""); err == nil {
		t.Fatal("missing source pin accepted")
	}
	value, err := matrix(strings.Repeat("a", 40))
	if err != nil {
		t.Fatal(err)
	}
	m := value.(map[string]any)
	rows := m["auditCases"].([]map[string]any)
	if len(rows) != 48 {
		t.Fatal(len(rows))
	}
	for _, row := range rows {
		if len(row["profileIds"].([]string)) != 8 || !strings.HasPrefix(row["caseId"].(string), "basic:") {
			t.Fatal(row)
		}
	}
	var out bytes.Buffer
	if err = render(&out); err != nil {
		t.Fatal(err)
	}
	for _, state := range []string{"native-dialog-closed-context-only", "native-datalist-nonvisual-context-only"} {
		if !strings.Contains(out.String(), state) {
			t.Fatal(state)
		}
	}
}

func TestStaticAndLiveUseIdenticalRenderer(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "export")
	if err := export(dir); err != nil {
		t.Fatal(err)
	}
	if err := export(dir); err == nil {
		t.Fatal("existing directory overwrite accepted")
	}
	want, err := os.ReadFile(filepath.Join(dir, "basic-audit", "index.html"))
	if err != nil {
		t.Fatal(err)
	}
	h, err := handler()
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	h.ServeHTTP(response, httptest.NewRequest("GET", fixturePath, nil))
	if response.Code != 200 || !bytes.Equal(want, response.Body.Bytes()) {
		t.Fatal("live/static page drift")
	}
	for _, path := range []string{"/manifest.json", "/assets/basic-audit.css", "/assets/ely-controls.js", "/assets/ely-patterns.js", "/assets/ely-map.js", "/assets/sample.svg"} {
		response = httptest.NewRecorder()
		h.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Code != 200 {
			t.Fatalf("asset%s status%d", path, response.Code)
		}
		data, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(strings.TrimPrefix(path, "/"))))
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(data, response.Body.Bytes()) {
			t.Errorf("live/static bytes drift%s", path)
		}
	}
}

func TestActionVariantsPreserveCanonical48AndDisabledBeta(t *testing.T) {
	before, err := inventory()
	if err != nil {
		t.Fatal(err)
	}
	rows, err := actionInventory()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 53 || !reflect.DeepEqual(rows[:48], before) {
		t.Fatal("canonical inventory changed")
	}
	fixtures := actionFixtures()
	seen := map[string]bool{}
	for i, f := range fixtures[48:] {
		if !strings.HasSuffix(f.Name, "@second-enabled-option") || seen[f.Name] {
			t.Fatal(f.Name)
		}
		seen[f.Name] = true
		options := f.Props["Options"].([]map[string]any)
		if len(options) != 3 || options[1]["Value"] != "beta" || options[1]["Disabled"] != true || options[2]["Value"] != "gamma" || options[2]["Disabled"] == true {
			t.Fatal(options)
		}
		for _, original := range before {
			if original.Template == f.Template && original.PropsSHA256 == rows[48+i].PropsSHA256 {
				t.Fatal("variant reused canonical props hash")
			}
		}
		options[0]["Label"] = "variant-only mutation"
	}
	after, err := inventory()
	if err != nil || !reflect.DeepEqual(before, after) {
		t.Fatal("variant mutated canonical props")
	}
	value, err := actionMatrix(strings.Repeat("a", 40))
	if err != nil {
		t.Fatal(err)
	}
	m := value.(map[string]any)
	if m["actionFixture"] != true || len(m["auditCases"].([]map[string]any)) != 53 {
		t.Fatal("action matrix scope")
	}
}

func TestActionPageHasSeparateScopedVariantsAndLabelledHostOpener(t *testing.T) {
	var out bytes.Buffer
	if err := renderMode(&out, true); err != nil {
		t.Fatal(err)
	}
	frames, ids := map[string]int{}, map[string]bool{}
	openers := 0
	walk(parsed(t, out.String()), func(n *html.Node) {
		if name := attr(n, "data-basic-component"); name != "" {
			frames[name]++
		}
		if id := attr(n, "id"); id != "" {
			if ids[id] {
				t.Errorf("duplicate ID %s", id)
			}
			ids[id] = true
		}
		for _, a := range n.Attr {
			if a.Key == "data-basic-open-dialog" {
				openers++
				if n.Data != "button" {
					t.Error("host opener is not native button")
				}
			}
		}
	})
	if len(frames) != 53 || openers != 2 {
		t.Fatalf("frames%d openers%d", len(frames), openers)
	}
	for name, count := range frames {
		if count != 2 {
			t.Errorf("%s instance count%d", name, count)
		}
	}
	var canonical bytes.Buffer
	if err := render(&canonical); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(canonical.String(), "basic-audit-actions.js") || strings.Contains(canonical.String(), "basic-audit-actions.css") || strings.Contains(canonical.String(), "data-basic-open-dialog") || strings.Contains(canonical.String(), "@second-enabled-option") {
		t.Fatal("phase2 changed canonical page")
	}
	dir := filepath.Join(t.TempDir(), "export")
	if err := export(dir); err != nil {
		t.Fatal(err)
	}
	h, err := handler()
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{actionPath, "/action-manifest.json", "/assets/basic-audit-actions.js", "/assets/basic-audit-actions.css"} {
		response := httptest.NewRecorder()
		h.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		file := strings.TrimPrefix(path, "/")
		if path == actionPath {
			file += "index.html"
		}
		data, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(file)))
		if err != nil {
			t.Fatal(err)
		}
		if response.Code != 200 || !bytes.Equal(data, response.Body.Bytes()) {
			t.Errorf("live/static action fixture mismatch %s", path)
		}
	}
}

func TestActionManifestPinsEmbeddedAndHostAssetBytes(t *testing.T) {
	manifest, err := actionManifest()
	if err != nil {
		t.Fatal(err)
	}
	hashes := manifest["assetHashes"].(map[string]string)
	for _, path := range []string{"/assets/app.css", "/assets/ely-controls.css", "/assets/ely-patterns.css", "/assets/ely-map.css", "/assets/ely-controls.js", "/assets/ely-patterns.js", "/assets/ely-map.js", "/assets/theme.js", "/assets/basic-audit.css", "/assets/basic-audit-actions.js", "/assets/basic-audit-actions.css"} {
		if hashes[path] == "" {
			t.Errorf("missing expected asset %s", path)
		}
	}
	for path, expected := range hashes {
		var data []byte
		switch path {
		case "/assets/basic-audit.css":
			data = []byte(fixtureCSS)
		case "/assets/basic-audit-actions.js":
			data = []byte(actionJS)
		case "/assets/basic-audit-actions.css":
			data = []byte(actionCSS)
		default:
			data, err = ui.Files.ReadFile(strings.TrimPrefix(path, "/"))
			if err != nil {
				t.Fatal(err)
			}
		}
		digest := sha256.Sum256(data)
		if hex.EncodeToString(digest[:]) != expected {
			t.Errorf("expected bytes mismatch %s", path)
		}
	}
	var output bytes.Buffer
	if err = renderMode(&output, true); err != nil {
		t.Fatal(err)
	}
	maps := 0
	walk(parsed(t, output.String()), func(n *html.Node) {
		if attr(n, "data-basic-component") != "basic/map-view" {
			return
		}
		maps++
		canvas, reset := 0, 0
		walk(n, func(child *html.Node) {
			for _, a := range child.Attr {
				if a.Key == "data-map-canvas" {
					canvas++
					if attr(child, "tabindex") != "0" {
						t.Error("map canvas not natively focusable")
					}
				}
			}
			if attr(child, "data-map-zoom") == "reset" {
				reset++
			}
		})
		if canvas != 1 || reset != 0 {
			t.Errorf("canonical canvas%d reset%d", canvas, reset)
		}
	})
	if maps != 2 {
		t.Errorf("canonical map instances%d", maps)
	}
}

func TestActionSpacingLeavesInitialRouteAndCSSUnchanged(t *testing.T) {
	const cssPath = "/assets/basic-audit-actions.css"
	const initialCSSHash = "70dcc04d1c99b164f180c10049674f54af2bdcdb5b8a001686809c7a263e8b65"
	digest := sha256.Sum256([]byte(fixtureCSS))
	if hex.EncodeToString(digest[:]) != initialCSSHash {
		t.Fatal("initial fixture CSS bytes changed")
	}
	if actionCSS != `.basic-record{margin-block-end:100vh}.basic-pair{row-gap:100vh}.basic-frame[data-basic-component="basic/slider"]{padding:1rem .5rem;margin-inline:-.5rem}` {
		t.Fatal("action spacing and slider-only compensated host allocation changed")
	}
	var initial, actions bytes.Buffer
	if err := render(&initial); err != nil {
		t.Fatal(err)
	}
	if err := renderMode(&actions, true); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(initial.String(), cssPath) || strings.Count(actions.String(), `<link rel="stylesheet" href="`+cssPath+`">`) != 1 {
		t.Fatal("spacing stylesheet must load exactly once on the action route only")
	}
	if strings.Contains(initial.String(), "padding:1rem") || strings.Contains(fixtureCSS, "basic/slider") {
		t.Fatal("slider allocation must not enter initial HTML or initial fixture CSS")
	}
	for _, page := range []string{initial.String(), actions.String()} {
		for _, scope := range []string{"basic-slider-main", "basic-slider-twin"} {
			if !strings.Contains(page, `class="basic-frame" id="`+scope+`-frame" data-basic-component="basic/slider"`) || !strings.Contains(page, `id="`+scope+`"`) {
				t.Fatal("existing independent slider frame/input identity must remain unchanged")
			}
		}
	}
	h, err := handler()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		path string
		want []byte
	}{{fixturePath, initial.Bytes()}, {"/assets/basic-audit.css", []byte(fixtureCSS)}, {cssPath, []byte(actionCSS)}} {
		response := httptest.NewRecorder()
		h.ServeHTTP(response, httptest.NewRequest("GET", tc.path, nil))
		if response.Code != 200 || !bytes.Equal(response.Body.Bytes(), tc.want) {
			t.Errorf("route bytes mismatch %s", tc.path)
		}
		if strings.HasSuffix(tc.path, ".css") && response.Header().Get("Content-Type") != "text/css" {
			t.Errorf("stylesheet content type %s", tc.path)
		}
	}
}
