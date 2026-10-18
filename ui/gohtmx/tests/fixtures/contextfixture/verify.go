package contextfixture

import (
	"fmt"
	"golang.org/x/net/html"
	"strings"
)

// Inspect validates renderer provenance and exact owner markup without claiming
// that native focus, geometry or browser lifecycle behavior has been tested.
func Inspect(markup string, full, catalogue bool) error {
	doc, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		return err
	}
	ids := map[string]bool{}
	roots, screens, manual, automatic, seeds := 0, 0, 0, 0, 0
	var visit func(*html.Node) error
	visit = func(node *html.Node) error {
		attrs := map[string]string{}
		for _, attr := range node.Attr {
			attrs[attr.Key] = attr.Val
		}
		if id := attrs["id"]; id != "" {
			if ids[id] {
				return fmt.Errorf("duplicate fixture ID %s", id)
			}
			ids[id] = true
		}
		if node.Data == "safe" {
			return fmt.Errorf("unescaped caller label")
		}
		if attrs["data-ely-family"] == "interaction" {
			roots++
		}
		if attrs["data-sdui-screen"] != "" {
			screens++
		}
		if mode := attrs["data-ely-context-mode"]; mode != "" {
			if mode == "manual" {
				manual++
			} else if mode == "automatic" {
				automatic++
			} else {
				return fmt.Errorf("invalid context mode %q", mode)
			}
			var trigger *html.Node
			for child := node.FirstChild; child != nil; child = child.NextSibling {
				if child.Type == html.ElementNode && child.Data == "button" {
					trigger = child
					break
				}
			}
			if trigger == nil {
				return fmt.Errorf("missing context root trigger")
			}
			ta := map[string]string{}
			for _, a := range trigger.Attr {
				ta[a.Key] = a.Val
			}
			if mode == "manual" {
				if _, ok := ta["hidden"]; !ok || ta["tabindex"] != "-1" {
					return fmt.Errorf("manual fallback must be hidden and untabbable")
				}
			}
			if number, present := attrs["data-ely-context-number"]; present {
				seeds++
				if number == "" || attrs["data-ely-context-x"] == "" || attrs["data-ely-context-y"] == "" {
					return fmt.Errorf("incomplete seed attributes")
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if err := visit(child); err != nil {
				return err
			}
		}
		return nil
	}
	if err := visit(doc); err != nil {
		return err
	}
	want := 1
	if full {
		want = 10
	}
	if roots != want {
		return fmt.Errorf("roots=%d want %d", roots, want)
	}
	wantScreens := 0
	if catalogue {
		wantScreens = want
	}
	if screens != wantScreens {
		return fmt.Errorf("screens=%d want %d", screens, wantScreens)
	}
	if full && (manual != 7 || automatic != 2 || seeds != 2) {
		return fmt.Errorf("full-page owner states manual=%d automatic=%d seeds=%d", manual, automatic, seeds)
	}
	if strings.Contains(markup, "<!doctype html>") != full {
		return fmt.Errorf("document/fragment shell mismatch")
	}
	return nil
}
