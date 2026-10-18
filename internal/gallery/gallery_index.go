package uiexamples

import (
	"bytes"
	"fmt"
	"html/template"
	"strings"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"golang.org/x/net/html"
)

// GalleryCard uses the same rendered component as its detail page. Thumbnails
// are inert, non-interactive illustrations; full behavior lives on detail pages.
type GalleryCard struct {
	Chapter ComponentChapter
	Story   ComponentStory
	Preview template.HTML
	Search  string
}

func (s *Server) buildGalleryCards() error {
	thumbnails, err := s.templates.Clone()
	if err != nil {
		return err
	}
	preferred := map[string]string{"primitives": "Text", "layout": "Card", "feedback": "Alert", "motion": "ProgressBar", "data": "AvatarGroup", "overlays": "Callout", "media": "ImageThumbnail", "calendar": "MiniCalendar", "tooling": "DesignTokenViewer", "generative": "GenerationQueue", "maps": "CoordinateDisplay"}
	fixtures := map[string]ui.Component{}
	for _, fixture := range advancedCases() {
		fixtures[fixture.Component.Chapter+"/"+fixture.Component.Name] = fixture.Component
	}
	// Start with everyday building blocks, then keep the catalogue's stable order.
	chapters := make([]ComponentChapter, 0, len(s.components))
	featured := []string{"buttons", "forms", "navigation", "data", "tables", "charts"}
	for _, slug := range featured {
		for _, chapter := range s.components {
			if chapter.Slug == slug {
				chapters = append(chapters, chapter)
			}
		}
	}
	for _, chapter := range s.components {
		found := false
		for _, slug := range featured {
			found = found || chapter.Slug == slug
		}
		if !found {
			chapters = append(chapters, chapter)
		}
	}
	for _, chapter := range chapters {
		story := chapter.Stories[0]
		for _, candidate := range chapter.Stories {
			if candidate.Name == preferred[chapter.Slug] {
				story = candidate
				break
			}
		}
		component, ok := fixtures[chapter.Slug+"/"+story.Name]
		if !ok {
			return fmt.Errorf("gallery thumbnail missing: %s/%s", chapter.Slug, story.Name)
		}
		component = storyPreviewComponents(component)[0]
		component.ID = "gallery-" + chapter.Slug
		var out bytes.Buffer
		if err := ui.RenderComponent(thumbnails, &out, component); err != nil {
			return err
		}
		preview, err := galleryThumbnail(out.Bytes())
		if err != nil {
			return err
		}
		search := chapter.Title + " " + chapter.Summary
		for _, item := range chapter.Stories {
			search += " " + item.Name + " " + strings.Join(item.Components, " ")
		}
		s.galleryCards = append(s.galleryCards, GalleryCard{chapter, story, preview, search})
	}
	return nil
}

func galleryThumbnail(data []byte) (template.HTML, error) {
	doc, err := html.Parse(bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	var clean func(*html.Node)
	clean = func(n *html.Node) {
		for child := n.FirstChild; child != nil; {
			next := child.NextSibling
			if child.Type == html.ElementNode && (child.Data == "script" || child.Data == "iframe" || child.Data == "audio" || child.Data == "video") {
				n.RemoveChild(child)
			} else {
				clean(child)
			}
			child = next
		}
		attrs := n.Attr[:0]
		for _, a := range n.Attr {
			if a.Key == "loading" || a.Key == "decoding" || a.Key == "id" || a.Key == "autofocus" || a.Key == "name" || a.Key == "href" || a.Key == "action" || a.Key == "formaction" || strings.HasPrefix(a.Key, "hx-") || strings.HasPrefix(a.Key, "on") {
				continue
			}
			attrs = append(attrs, a)
		}
		n.Attr = attrs
		if n.Type == html.ElementNode && n.Data == "img" {
			n.Attr = append(n.Attr, html.Attribute{Key: "loading", Val: "lazy"}, html.Attribute{Key: "decoding", Val: "async"})
		}
	}
	clean(doc)
	var out bytes.Buffer
	var body func(*html.Node) error
	body = func(n *html.Node) error {
		if n.Type == html.ElementNode && n.Data == "body" {
			for child := n.FirstChild; child != nil; child = child.NextSibling {
				if err := html.Render(&out, child); err != nil {
					return err
				}
			}
			return nil
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			if err := body(child); err != nil {
				return err
			}
		}
		return nil
	}
	if err := body(doc); err != nil {
		return "", err
	}
	// Source is trusted, escaped library templates; never user-supplied markup.
	return template.HTML(out.String()), nil
}
