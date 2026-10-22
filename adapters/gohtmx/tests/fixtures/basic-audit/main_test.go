package main

import (
	"bytes"
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
