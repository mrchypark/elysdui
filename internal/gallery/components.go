// Package uiexamples serves the standalone elysdui UI example gallery.
package uiexamples

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io/fs"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/mrchypark/elysdui/ui/gohtmx"
)

//go:embed templates/*.html assets/*
var Files embed.FS

type ComponentStory = ui.ComponentStory
type ComponentChapter = ui.ComponentChapter

type ComponentLink struct{ Href, Name string }

type ComponentPage struct {
	Chapters       []ComponentChapter
	Cards          []GalleryCard
	Chapter        ComponentChapter
	Story          *ComponentStory
	Previous, Next *ComponentLink
	Query          string
	Family         string
	Description    string
	Preview        template.HTML
	Count, Stories int
}

type page struct {
	Title      string
	Components ComponentPage
}

type Server struct {
	templates      *template.Template
	mux            *http.ServeMux
	components     []ComponentChapter
	galleryCards   []GalleryCard
	referenceNotes map[string]string
}

func New() (*Server, error) {
	templates, err := ui.NewTemplates()
	if err != nil {
		return nil, err
	}
	if _, err := templates.ParseFS(Files, "templates/*.html"); err != nil {
		return nil, err
	}
	s := &Server{templates: templates, mux: http.NewServeMux()}
	if err := s.loadComponents(); err != nil {
		return nil, err
	}
	notes, err := Files.ReadFile("assets/reference-stories.json")
	if err != nil {
		return nil, err
	}
	var references []struct{ Key, Description string }
	if err := json.Unmarshal(notes, &references); err != nil {
		return nil, err
	}
	s.referenceNotes = make(map[string]string, len(references))
	for _, reference := range references {
		s.referenceNotes[reference.Key] = reference.Description
	}
	if err := s.buildGalleryCards(); err != nil {
		return nil, err
	}
	if err := ui.BindAssets(s.mux); err != nil {
		return nil, err
	}
	assets, err := fs.Sub(Files, "assets")
	if err != nil {
		return nil, err
	}
	s.mux.Handle("GET /assets/", http.StripPrefix("/assets/", http.FileServer(http.FS(assets))))
	s.mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/components", http.StatusSeeOther)
	})
	s.mux.HandleFunc("GET /playground/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://mrchypark.github.io/elysdui/go-htmx/playground/", http.StatusSeeOther)
	})
	s.mux.HandleFunc("GET /components", s.componentIndex)
	s.mux.HandleFunc("GET /components/usage", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if err := s.templates.ExecuteTemplate(w, "component-usage", nil); err != nil {
			http.Error(w, "component usage unavailable", http.StatusInternalServerError)
		}
	})
	s.mux.HandleFunc("GET /components/themes", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if err := s.templates.ExecuteTemplate(w, "component-themes", nil); err != nil {
			http.Error(w, "component themes unavailable", http.StatusInternalServerError)
		}
	})
	s.mux.HandleFunc("GET /components/demo", s.componentDemo)
	s.mux.HandleFunc("GET /components/api", s.advancedUsage)
	s.mux.HandleFunc("GET /components/audit", s.advancedAudit)
	s.mux.HandleFunc("POST /components/markdown-preview", s.markdownPreview)
	s.mux.HandleFunc("GET /components/{chapter}/{story}", s.componentStory)
	return s, nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
	s.mux.ServeHTTP(w, r)
}

func (s *Server) loadComponents() error {
	chapters, err := ui.Catalogue()
	if err != nil {
		return err
	}
	for i := range chapters {
		for j := range chapters[i].Stories {
			chapters[i].Stories[j].Endpoint = "/components/demo"
		}
	}
	s.components = chapters
	return nil
}

func componentHref(chapter, story string) string { return "/components/" + chapter + "/" + story }

func (s *Server) componentPage() ComponentPage {
	p := ComponentPage{Chapters: s.components, Cards: s.galleryCards}
	names := map[string]bool{}
	for _, chapter := range s.components {
		p.Stories += len(chapter.Stories)
		for _, story := range chapter.Stories {
			for _, name := range story.Components {
				names[name] = true
			}
		}
	}
	p.Count = len(names)
	return p
}

func componentQuery(r *http.Request) (string, error) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if utf8.RuneCountInString(query) > 200 {
		return "", fmt.Errorf("query exceeds 200 characters")
	}
	return query, nil
}

func (s *Server) componentIndex(w http.ResponseWriter, r *http.Request) {
	p := s.componentPage()
	query, err := componentQuery(r)
	if err != nil {
		http.Error(w, "Search queries must be 200 characters or fewer.", http.StatusBadRequest)
		return
	}
	p.Query = query

	s.render(w, http.StatusOK, "components", page{Title: "elysdui UI · Examples", Components: p})
}

func (s *Server) findComponent(chapter, slug string) (ComponentChapter, *ComponentStory) {
	for _, item := range s.components {
		if item.Slug != chapter {
			continue
		}
		for i := range item.Stories {
			if item.Stories[i].Slug == slug {
				return item, &item.Stories[i]
			}
		}
	}
	return ComponentChapter{}, nil
}

func (s *Server) componentStory(w http.ResponseWriter, r *http.Request) {
	p := s.componentPage()
	p.Chapter, p.Story = s.findComponent(r.PathValue("chapter"), r.PathValue("story"))
	if p.Story == nil {
		http.NotFound(w, r)
		return
	}
	var previous *ComponentLink
	found := false
	for _, chapter := range s.components {
		for _, story := range chapter.Stories {
			link := &ComponentLink{Href: componentHref(chapter.Slug, story.Slug), Name: story.Name}
			if found && p.Next == nil {
				p.Next = link
			}
			if chapter.Slug == p.Chapter.Slug && story.Slug == p.Story.Slug {
				p.Previous = previous
				found = true
			}
			previous = link
		}
	}
	var preview bytes.Buffer
	var component ui.Component
	for _, fixture := range advancedCases() {
		if fixture.Component.Chapter == p.Chapter.Slug && fixture.Component.Name == p.Story.Name {
			component = fixture.Component
			break
		}
	}
	previews := storyPreviewComponents(component)
	p.Description = s.referenceNotes[p.Chapter.Slug+"/"+p.Story.Slug]
	definition, err := ui.ResolveComponent(component.Chapter, component.Name)
	if err != nil {
		http.Error(w, "The component API could not be found.", http.StatusInternalServerError)
		return
	}
	p.Family = definition.Family
	if len(previews) > 1 {
		if stacked, _ := component.Props["PreviewStack"].(bool); stacked {
			preview.WriteString(`<div class="component-examples" data-preview-stack>`)
		} else {
			preview.WriteString(`<div class="component-examples">`)
		}
	}
	for _, component := range previews {
		if err := ui.RenderComponent(s.templates, &preview, component); err != nil {
			http.Error(w, "The example could not be displayed.", http.StatusInternalServerError)
			return
		}
	}
	if len(previews) > 1 {
		preview.WriteString(`</div>`)
	}
	// The preview is generated by an already escaped, embedded Go template.
	p.Preview = template.HTML(preview.String())
	s.render(w, http.StatusOK, "components", page{Title: "elysdui UI · Examples", Components: p})
}

type ComponentDemo struct {
	Query   string
	Matches []string
}

func (s *Server) componentDemo(w http.ResponseWriter, r *http.Request) {
	query, err := componentQuery(r)
	if err != nil {
		http.Error(w, "Input must be 200 characters or fewer.", http.StatusBadRequest)
		return
	}
	p := ComponentDemo{Query: query}
	for _, chapter := range s.components {
		for _, story := range chapter.Stories {
			if query != "" && strings.Contains(strings.ToLower(story.Title+" "+strings.Join(story.Components, " ")), strings.ToLower(query)) {
				p.Matches = append(p.Matches, story.Name)
				if len(p.Matches) == 8 {
					break
				}
			}
		}
		if len(p.Matches) == 8 {
			break
		}
	}
	var out bytes.Buffer
	if err := s.templates.ExecuteTemplate(&out, "component-demo-response", p); err != nil {
		http.Error(w, "The example could not be displayed.", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(out.Bytes())
}

func (s *Server) render(w http.ResponseWriter, status int, name string, data page) {
	var out bytes.Buffer
	if err := s.templates.ExecuteTemplate(&out, name, data); err != nil {
		http.Error(w, "The page could not be displayed.", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(out.Bytes())
}
