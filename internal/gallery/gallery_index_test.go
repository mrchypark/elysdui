package uiexamples

import (
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestVisualGalleryCoversCatalogue(t *testing.T) {
	s, err := New()
	if err != nil {
		t.Fatal(err)
	}
	if len(s.galleryCards) != len(s.components) {
		t.Fatal("every category needs a visual card")
	}
	seen := map[string]bool{}
	for _, card := range s.galleryCards {
		if seen[card.Chapter.Slug] || card.Preview == "" {
			t.Fatalf("invalid card: %s", card.Chapter.Slug)
		}
		seen[card.Chapter.Slug] = true
		if !strings.Contains(string(card.Preview), "data-ui-component") && !strings.Contains(string(card.Preview), "data-ely-kind") && !strings.Contains(string(card.Preview), "data-slot") {
			t.Errorf("card %s lacks rendered component", card.Chapter.Slug)
		}
		for _, story := range card.Chapter.Stories {
			for _, alias := range story.Components {
				if !strings.Contains(card.Search, alias) {
					t.Errorf("missing searchable alias %s", alias)
				}
			}
		}
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest("GET", "/components", nil))
	body := w.Body.String()
	for _, want := range []string{`elysdui · Component Gallery`, `<span>elysdui</span>`, `data-gallery-index`, `id="gallery-category"`, `id="gallery-empty"`, `role="status"`, `inert aria-hidden="true"`, `href="/playground/"`} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %s", want)
		}
	}
	if strings.Count(body, `data-gallery-card data-category=`) != 44 {
		t.Fatal("expected 44 rendered cards")
	}
}

func TestGalleryThumbnailsArePresentationOnly(t *testing.T) {
	out, err := galleryThumbnail([]byte(`<div id="same" autofocus><form action="/send"><input name="email" hx-post="/save" oninput="bad()"></form><script>bad()</script><iframe src="/frame"></iframe><audio src="/audio"></audio><a href="/target">Link</a></div>`))
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{`id=`, `autofocus`, `action=`, `name=`, `hx-`, `oninput=`, `<script`, `<iframe`, `<audio`, `href=`} {
		if strings.Contains(string(out), forbidden) {
			t.Errorf("thumbnail retains %s", forbidden)
		}
	}
}

func TestGalleryPlaygroundLinksRespectStaticBase(t *testing.T) {
	for _, base := range []string{"/", "/elysdui/"} {
		output, err := staticHTML([]byte(`<html><head></head><body><a href="/playground/">Playground</a></body></html>`), base, map[string]string{"/playground/": "playground/"})
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(output), `href="`+base+`playground/"`) {
			t.Fatalf("playground lost base %s", base)
		}
		if !strings.Contains(string(output), "Static gallery · Browser interactions work locally.") {
			t.Fatal("static export notice must use English")
		}
		if strings.Index(string(output), "gallery-static-notice") > strings.Index(string(output), "</body>") {
			t.Fatal("static notice must be inside the body")
		}
	}
}

func TestGalleryUnicodeQueryCanBeReloaded(t *testing.T) {
	s, err := New()
	if err != nil {
		t.Fatal(err)
	}
	for _, count := range []int{67, 200, 201} {
		w := httptest.NewRecorder()
		s.ServeHTTP(w, httptest.NewRequest("GET", "/components?q="+url.QueryEscape(strings.Repeat("가", count)), nil))
		want := 200
		if count > 200 {
			want = 400
		}
		if w.Code != want {
			t.Errorf("%d Korean characters: got %d want %d", count, w.Code, want)
		}
	}
}
