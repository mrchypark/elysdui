// Command basic-audit renders the existing 48 basic caller fixtures, not SDUI screens.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/mrchypark/elysdui/internal/sduicatalogue"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

const fixturePath = "/basic-audit/"
const fixtureCSS = `body{margin:0;background:var(--color-paper);color:var(--color-ink)}main{max-width:1280px;margin:auto;padding:16px}.basic-record{margin-block:24px}.basic-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.basic-frame{min-width:0}.basic-context{font-size:12px;color:var(--color-muted)}@media(max-width:600px){.basic-pair{grid-template-columns:minmax(0,1fr)}}`
const frameTemplates = `{{define "basic-head"}}<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Basic template audit fixtures</title>{{template "font-preloads"}}<link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/basic-audit.css">{{template "ui-component-assets"}}{{template "ui-map-assets"}}<script src="/assets/theme.js"></script></head><body><main><h1>Basic template audit fixtures</h1><p>Initial caller fixtures only. Captures are not visual or action approval.</p>{{end}}
{{define "basic-record"}}<article class="basic-record" data-audit-name="{{.Name}}"><h2>{{.Name}}</h2><div class="basic-pair">{{end}}
{{define "basic-instance"}}{{if .Twin}}<div data-audit-twin>{{else}}<div data-audit-main>{{end}}<section class="basic-frame" id="{{.Scope}}-frame" data-basic-component="{{.Name}}" data-basic-props-sha256="{{.PropsSHA256}}" data-basic-initial-state="{{.InitialState}}">{{if ne .InitialState "rendered"}}<p class="basic-context" data-basic-context>{{.InitialState}}: this initial image shows fixture context, not an opened control.</p>{{end}}<span id="{{.Scope}}-first"></span>{{end}}`

type basicCase struct {
	Name        string `json:"name"`
	Template    string `json:"template"`
	PropsSHA256 string `json:"propsSHA256"`
}

func inventory() ([]basicCase, error) {
	fixtures, names := sduicatalogue.BasicFixtures(), sduicatalogue.BasicNames()
	if len(fixtures) != 48 || len(names) != 48 {
		return nil, fmt.Errorf("expected exactly48 basic fixtures")
	}
	result := make([]basicCase, 0, len(fixtures))
	seen := map[string]bool{}
	for i, f := range fixtures {
		if f.Name != "basic/"+names[i] || f.Template != names[i] || seen[f.Name] {
			return nil, fmt.Errorf("basic fixture identity mismatch: %s", f.Name)
		}
		seen[f.Name] = true
		data, err := json.Marshal(f.Props)
		if err != nil {
			return nil, err
		}
		digest := sha256.Sum256(data)
		result = append(result, basicCase{f.Name, f.Template, hex.EncodeToString(digest[:])})
	}
	return result, nil
}

// Clone before structural identity scoping; canonical fixture values/disabled options stay intact.
func scoped(value any) any {
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, child := range v {
			out[key] = scoped(child)
		}
		return out
	case []map[string]any:
		out := make([]map[string]any, len(v))
		for i, child := range v {
			out[i] = scoped(child).(map[string]any)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, child := range v {
			out[i] = scoped(child)
		}
		return out
	default:
		return value
	}
}

func instanceProps(f sduicatalogue.Fixture, scope string) map[string]any {
	props := scoped(f.Props).(map[string]any)
	props["ID"], props["Name"] = scope, scope+"_value"
	// Both provided link fixtures target #first; keep that fixture navigation local.
	if f.Template == "breadcrumb" || f.Template == "menu" {
		for _, item := range props["Items"].([]map[string]any) {
			if item["Href"] == "#first" {
				item["Href"] = "#" + scope + "-first"
			}
		}
	}
	return props
}

func render(w io.Writer) error {
	tpl, err := ui.NewTemplates()
	if err != nil {
		return err
	}
	tpl, err = tpl.Parse(frameTemplates)
	if err != nil {
		return err
	}
	cases, err := inventory()
	if err != nil {
		return err
	}
	if err = tpl.ExecuteTemplate(w, "basic-head", nil); err != nil {
		return err
	}
	for i, f := range sduicatalogue.BasicFixtures() {
		if err = tpl.ExecuteTemplate(w, "basic-record", cases[i]); err != nil {
			return err
		}
		for _, twin := range []bool{false, true} {
			scope := "basic-" + f.Template + "-main"
			if twin {
				scope = "basic-" + f.Template + "-twin"
			}
			state := "rendered"
			if f.Template == "dialog" {
				state = "native-dialog-closed-context-only"
			}
			if f.Template == "datalist" {
				state = "native-datalist-nonvisual-context-only"
			}
			frame := struct {
				Name, Scope, PropsSHA256, InitialState string
				Twin                                   bool
			}{f.Name, scope, cases[i].PropsSHA256, state, twin}
			if err = tpl.ExecuteTemplate(w, "basic-instance", frame); err != nil {
				return err
			}
			if err = tpl.ExecuteTemplate(w, f.Template, instanceProps(f, scope)); err != nil {
				return fmt.Errorf("%s: %w", f.Name, err)
			}
			if _, err = io.WriteString(w, "</section></div>"); err != nil {
				return err
			}
		}
		if _, err = io.WriteString(w, "</div></article>"); err != nil {
			return err
		}
	}
	_, err = io.WriteString(w, "</main></body></html>")
	return err
}

func matrix(revision string) (any, error) {
	if !regexp.MustCompile(`^[a-f0-9]{40}$`).MatchString(revision) {
		return nil, fmt.Errorf("matrix requires -revision=<full source SHA>")
	}
	cases, err := inventory()
	if err != nil {
		return nil, err
	}
	profiles := []string{}
	for _, mode := range []string{"live", "static"} {
		for _, size := range []string{"desktop", "mobile"} {
			for _, theme := range []string{"light", "dark"} {
				profiles = append(profiles, mode+"-"+size+"-"+theme)
			}
		}
	}
	rows := []map[string]any{}
	for _, c := range cases {
		rows = append(rows, map[string]any{
			"caseId": "basic:" + c.Template, "componentIdentity": c.Name, "family": "basic", "fixtureIdentity": "basic-fixture:" + c.Name,
			"fixturePropsSHA256": c.PropsSHA256, "template": c.Template, "sourceSHA": revision, "profileIds": profiles,
			"surface": []string{"live-basic", "static-basic"}, "aliasMapping": map[string]any{"requestedName": c.Name, "relation": "canonical-basic-template"},
			"referenceCitation": []string{"internal/sduicatalogue/basic.go#BasicNames/BasicFixtures", "ui/gohtmx/templates/"},
		})
	}
	return map[string]any{"source": map[string]any{"revision": revision}, "fixture": "basic", "auditCases": rows, "scope": "48 canonical basic caller fixtures; no named variants, actions, story pages or visual approval"}, nil
}

func handler() (http.Handler, error) {
	var page bytes.Buffer
	if err := render(&page); err != nil {
		return nil, err
	}
	cases, err := inventory()
	if err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	if err = ui.BindAssets(mux); err != nil {
		return nil, err
	}
	mux.HandleFunc("GET /assets/basic-audit.css", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/css")
		io.WriteString(w, fixtureCSS)
	})
	mux.HandleFunc("GET /manifest.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"basicNames": sduicatalogue.BasicNames(), "cases": cases})
	})
	mux.HandleFunc("GET "+fixturePath, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != fixturePath {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'self'")
		w.Write(page.Bytes())
	})
	return mux, nil
}

func export(dir string) error {
	var page bytes.Buffer
	if err := render(&page); err != nil {
		return err
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return fmt.Errorf("export requires a new owned directory: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "basic-audit"), 0700); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "basic-audit", "index.html"), page.Bytes(), 0600); err != nil {
		return err
	}
	cases, err := inventory()
	if err != nil {
		return err
	}
	data, err := json.Marshal(map[string]any{"basicNames": sduicatalogue.BasicNames(), "cases": cases})
	if err != nil {
		return err
	}
	if err = os.WriteFile(filepath.Join(dir, "manifest.json"), append(data, '\n'), 0600); err != nil {
		return err
	}
	// Export the same embedded public UI asset set as BindAssets, without gallery/SDUI assets.
	if err = fs.WalkDir(ui.Files, "assets", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return os.MkdirAll(filepath.Join(dir, filepath.FromSlash(path)), 0700)
		}
		data, err := ui.Files.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(dir, filepath.FromSlash(path)), data, 0600)
	}); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "assets", "basic-audit.css"), []byte(fixtureCSS), 0600)
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8099", "owned loopback listener")
	dir := flag.String("dir", "", "export live renderer and embedded assets to an owned output directory")
	dump := flag.String("dump", "", "/manifest.json or /matrix.json or /basic-audit/")
	revision := flag.String("revision", "", "explicit matrix source revision")
	flag.Parse()
	if flag.NArg() != 0 || (*dump != "" && *dir != "") {
		fmt.Fprintln(os.Stderr, "unexpected arguments or conflicting dump/export modes")
		os.Exit(2)
	}
	var err error
	switch {
	case *dump == "/matrix.json":
		var result any
		result, err = matrix(*revision)
		if err == nil {
			err = json.NewEncoder(os.Stdout).Encode(result)
		}
	case *dump == "/manifest.json":
		var cases []basicCase
		cases, err = inventory()
		if err == nil {
			err = json.NewEncoder(os.Stdout).Encode(map[string]any{"basicNames": sduicatalogue.BasicNames(), "cases": cases})
		}
	case *dump == fixturePath:
		err = render(os.Stdout)
	case *dump != "":
		err = fmt.Errorf("unknown dump path")
	case *dir != "":
		err = export(*dir)
	default:
		var h http.Handler
		h, err = handler()
		if err == nil {
			if !strings.HasPrefix(*addr, "127.0.0.1:") {
				err = fmt.Errorf("loopback address required")
			} else {
				err = http.ListenAndServe(*addr, h)
			}
		}
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
