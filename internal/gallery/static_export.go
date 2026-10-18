package uiexamples

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http/httptest"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"golang.org/x/net/html"
)

// StaticExport describes the generated, independently navigable gallery pages.
type StaticExport struct {
	Base    string   `json:"base"`
	Stories int      `json:"stories"`
	Pages   []string `json:"pages"`
}

// ExportStatic renders the complete gallery without starting a server. Existing
// unrelated files in dir (for example the playground) are left untouched.
func ExportStatic(dir, base string) (StaticExport, error) {
	result := StaticExport{}
	if !strings.HasPrefix(base, "/") || strings.HasPrefix(base, "//") || strings.ContainsAny(base, "?#\\\"'<> \t\r\n") || path.Clean(base) != strings.TrimSuffix(base, "/") && base != "/" {
		return result, fmt.Errorf("base must be a clean absolute URL path, such as /elysdui/go-htmx/")
	}
	base = strings.TrimSuffix(base, "/") + "/"
	result.Base = base
	s, err := New()
	if err != nil {
		return result, err
	}
	routes := map[string]string{"/playground/": "playground/", "/components": "components/", "/components/usage": "components/usage/", "/components/themes": "components/themes/", "/components/api": "components/api/", "/components/audit": "components/audit/", "/components/demo": "components/demo/"}
	requests := []string{"/components", "/components/usage", "/components/themes", "/components/api", "/components/audit", "/components/demo"}
	for _, chapter := range s.components {
		for _, story := range chapter.Stories {
			route := componentHref(chapter.Slug, story.Slug)
			routes[route] = strings.TrimPrefix(route, "/") + "/"
			requests = append(requests, route)
			result.Stories++
		}
	}
	for _, family := range []string{"", "foundation", "interaction", "data", "workspace", "communication", "native", "forms"} {
		for _, aliases := range []bool{false, true} {
			q := url.Values{}
			if family != "" {
				q.Set("family", family)
			}
			if aliases {
				q.Set("aliases", "1")
			}
			if len(q) == 0 {
				continue
			}
			route := "/components/audit?" + q.Encode()
			destination := "components/audit/"
			if family != "" {
				destination += family + "/"
			}
			if aliases {
				destination += "aliases/"
			}
			routes[route] = destination
			requests = append(requests, route)
		}
	}
	write := func(name string, data []byte) error {
		target := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		return os.WriteFile(target, data, 0644)
	}
	// The shared library's explicit asset handlers take precedence over gallery assets.
	for _, source := range []fs.FS{Files, ui.Files} {
		err = fs.WalkDir(source, "assets", func(name string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.IsDir() {
				return nil
			}
			data, err := fs.ReadFile(source, name)
			if err != nil {
				return err
			}
			switch path.Ext(name) {
			case ".css", ".js", ".json", ".svg":
				data = staticAssetPaths(data, base)
			}
			return write(name, data)
		})
		if err != nil {
			return result, err
		}
	}
	if err = write("assets/gallery-static.js", []byte(staticGalleryScript)); err != nil {
		return result, err
	}
	if err = write("assets/gallery-static.css", []byte(staticGalleryCSS)); err != nil {
		return result, err
	}
	// This adapter deliberately keeps a Markdown preview local and explains the
	// server-only operation rather than making a failed POST on GitHub Pages.
	if err = write("assets/advanced-markdown.js", []byte(staticMarkdownAdapter)); err != nil {
		return result, err
	}
	for _, route := range requests {
		recorder := httptest.NewRecorder()
		s.ServeHTTP(recorder, httptest.NewRequest("GET", route, nil))
		if recorder.Code != 200 {
			return result, fmt.Errorf("render %s: HTTP %d: %s", route, recorder.Code, recorder.Body.String())
		}
		data, err := staticHTML(recorder.Body.Bytes(), base, routes)
		if err != nil {
			return result, fmt.Errorf("rewrite %s: %w", route, err)
		}
		filename := routes[route] + "index.html"
		if err = write(filename, data); err != nil {
			return result, err
		}
		result.Pages = append(result.Pages, filename)
		if route == "/components" {
			if err = write("index.html", data); err != nil {
				return result, err
			}
			result.Pages = append(result.Pages, "index.html")
		}
	}
	manifest, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return result, err
	}
	if err = write("gallery-manifest.json", manifest); err != nil {
		return result, err
	}
	err = write(".nojekyll", nil)
	return result, err
}

var staticAssetPattern = regexp.MustCompile(`(["'` + "`" + `(=\s])/assets/`)

func staticAssetPaths(data []byte, base string) []byte {
	return staticAssetPattern.ReplaceAll(data, []byte("${1}"+base+"assets/"))
}

func staticHTML(data []byte, base string, routes map[string]string) ([]byte, error) {
	var out bytes.Buffer
	tokenizer := html.NewTokenizer(bytes.NewReader(data))
	for {
		kind := tokenizer.Next()
		if kind == html.ErrorToken {
			if tokenizer.Err() == io.EOF {
				break
			}
			return nil, tokenizer.Err()
		}
		if kind != html.StartTagToken && kind != html.SelfClosingTagToken && kind != html.EndTagToken {
			out.Write(tokenizer.Raw())
			continue
		}
		token := tokenizer.Token()
		if kind == html.EndTagToken && token.Data == "head" {
			fmt.Fprintf(&out, `<link rel="stylesheet" href="%sassets/gallery-static.css"><script src="%sassets/gallery-static.js"></script>`, base, base)
		}
		for i := range token.Attr {
			a := &token.Attr[i]
			if strings.HasPrefix(a.Val, "/assets/") {
				a.Val = base + strings.TrimPrefix(a.Val, "/")
				continue
			}
			parsed, err := url.Parse(a.Val)
			if err != nil || parsed.IsAbs() || parsed.Host != "" {
				continue
			}
			route := parsed.Path
			if parsed.RawQuery != "" {
				route += "?" + parsed.Query().Encode()
			}
			destination, ok := routes[route]
			if !ok {
				destination, ok = routes[parsed.Path]
			}
			if ok {
				a.Val = base + destination
				if _, exact := routes[route]; !exact && parsed.RawQuery != "" {
					a.Val += "?" + parsed.RawQuery
				}
				if parsed.Fragment != "" {
					a.Val += "#" + parsed.Fragment
				}
			}
		}
		if kind == html.EndTagToken && token.Data == "body" {
			fmt.Fprintf(&out, `<aside class="gallery-static-notice" role="note">Static gallery · Browser interactions work locally. Server submissions and external integrations are demos. <a href="%splayground/">Open SDUI playground ↗</a><span data-static-status role="status"></span></aside>`, base)
		}
		out.WriteString(token.String())
	}
	return staticAssetPaths(out.Bytes(), base), nil
}

const staticGalleryCSS = `.gallery-static-notice{padding:.65rem 1rem;border-bottom:1px solid var(--border,#ccc);font:13px/1.5 system-ui,sans-serif;background:var(--background,#fff);color:var(--foreground,#222);display:flex;gap:.5rem 1rem;flex-wrap:wrap}.gallery-static-notice:has([data-static-status]:not(:empty)){position:sticky;bottom:0;z-index:100}.gallery-static-notice a{color:inherit;text-decoration:underline}[data-static-status]:empty{display:none}[data-static-status]{font-weight:600}.component-chapters [hidden],.component-sidebar [hidden]{display:none!important}`

const staticGalleryScript = `(() => {
 const explain=()=>{const status=document.querySelector('[data-static-status]');if(status)status.textContent='This action needs a running Go backend; no data was sent.';};
 document.addEventListener('htmx:beforeRequest',event=>{event.preventDefault();explain();});
 document.addEventListener('submit',event=>{if(event.target.matches('.gallery-filters'))return;if(event.target.matches('.component-search')){event.preventDefault();filter(event.target.querySelector('input').value);return;}if(event.target.hasAttribute('hx-post')||event.target.hasAttribute('hx-get')||event.target.getAttribute('method')?.toLowerCase()==='post'){event.preventDefault();explain();}},true);
 function filter(value){const q=value.trim().toLowerCase();document.querySelectorAll('.component-chapters > li').forEach(chapter=>{const title=chapter.querySelector('.chapter-title')?.textContent.toLowerCase()||'';let visible=false;chapter.querySelectorAll('.chapter-stories a').forEach(link=>{link.hidden=!(title.includes(q)||link.textContent.toLowerCase().includes(q));visible ||= !link.hidden;});chapter.hidden=!visible;});document.querySelectorAll('.component-sidebar nav details').forEach(chapter=>{const title=chapter.querySelector('summary').textContent.toLowerCase();let visible=false;chapter.querySelectorAll('li').forEach(item=>{item.hidden=!(title.includes(q)||item.textContent.toLowerCase().includes(q));visible ||= !item.hidden;});chapter.hidden=!visible;if(q&&visible)chapter.open=true;});}
 document.addEventListener('input',event=>{if(event.target.matches('.component-sidebar .component-search input'))filter(event.target.value);});
 document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('.component-search').forEach(form=>{for(const attribute of [...form.attributes])if(attribute.name.startsWith('hx-'))form.removeAttribute(attribute.name);});const q=new URLSearchParams(location.search).get('q');if(q&&!document.querySelector('[data-gallery-index]')){document.querySelectorAll('.component-search input').forEach(input=>input.value=q);filter(q);}});
})();`

const staticMarkdownAdapter = `export async function previewMarkdown(detail){const note=document.createElement('p');note.textContent='Static preview: full Markdown rendering requires the Go backend.';const pre=document.createElement('pre');pre.dataset.staticMarkdownPreview='true';pre.textContent=detail.value||detail.source||'';return {nodes:[note,pre]};}
export function bindMarkdownPreview(root){const update=event=>{if(event.target===root&&event.detail.action==='preview-markdown')root.querySelector('[data-workspace-markdown-preview]')?.replaceChildren(...event.detail.result.nodes);};root.addEventListener('ely:result',update);const cleanup=()=>root.removeEventListener('ely:result',update);root.addEventListener('ely:cleanup',cleanup,{once:true});return cleanup;}`
