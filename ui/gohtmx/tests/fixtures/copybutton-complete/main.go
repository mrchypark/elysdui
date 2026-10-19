// Command copybutton-complete renders a bounded CopyButton contract fixture.
// Every control and replacement fragment comes from the production renderer;
// the document shell supplies only layout and ordinary HTMX replacement buttons.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"os"

	"github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/sdui"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"golang.org/x/net/html"
)

const literalValue = "<text> & \"quoted\"\n한글 📋"
const overrideLabel = "Copy override"
const overrideAriaLabel = "Copy the override value"
const adapterLabel = "Copy adapter text"

// Minimal inputs deliberately omit Label, Size, ButtonVariant, Icon and
// IconOnly. A fixture must not supply a missing production default.
func standaloneComponents() []ui.Component {
	return []ui.Component{
		{Chapter: "buttons", Name: "CopyButton", ID: "copy-a", Props: map[string]any{"Value": literalValue}},
		{Chapter: "buttons", Name: "CopyButton", ID: "copy-b", Props: map[string]any{"Value": literalValue}},
		{Chapter: "buttons", Name: "CopyButton", ID: "copy-empty", Props: map[string]any{"Value": ""}},
		{Chapter: "buttons", Name: "CopyButton", ID: "copy-disabled", Props: map[string]any{"Value": literalValue, "Disabled": true}},
		{Chapter: "buttons", Name: "CopyButton", ID: "copy-items", Props: map[string]any{"Items": []map[string]any{
			{"Value": "first"}, {"Value": "second"}, {"Value": "third", "Disabled": true},
		}}},
		{Chapter: "buttons", Name: "CopyButton", ID: "copy-override", Props: map[string]any{
			"Value": literalValue, "Label": overrideLabel, "AriaLabel": overrideAriaLabel,
			"Size": "sm", "ButtonVariant": "outline", "Action": "custom-copy",
		}},
	}
}

func adapterScreen(id string, disabled bool) sdui.Screen {
	return sdui.Screen{Version: sdui.Version, ID: id + "-screen", Root: sdui.Node{
		ID: id, Type: "buttons/CopyButton", Props: map[string]any{
			"value": literalValue, "label": adapterLabel, "disabled": disabled,
		},
	}}
}

// renderRoot is independent of the document shell, adapter and replacement
// strategy. It always renders a new minimal production copy-a instance.
func renderRoot(tpl *template.Template) ([]byte, error) {
	var out bytes.Buffer
	if err := ui.RenderComponent(tpl, &out, standaloneComponents()[0]); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// elementBytes preserves the production renderer's original escaping and byte
// representation. The tokenizer recognizes quoted attributes and nested tags;
// a regular-expression or string-based HTML rewrite would not be sufficient.
func elementBytes(markup []byte, id string, inner bool) ([]byte, error) {
	z := html.NewTokenizer(bytes.NewReader(markup))
	position, start, contentStart, depth := 0, -1, -1, 0
	var targetTag string
	for {
		kind := z.Next()
		from := position
		position += len(z.Raw())
		if kind == html.ErrorToken {
			if err := z.Err(); err != io.EOF {
				return nil, err
			}
			return nil, fmt.Errorf("production element %q not found or incomplete", id)
		}
		if kind != html.StartTagToken && kind != html.SelfClosingTagToken && kind != html.EndTagToken {
			continue
		}
		token := z.Token()
		if start < 0 && (kind == html.StartTagToken || kind == html.SelfClosingTagToken) {
			for _, attr := range token.Attr {
				if attr.Key == "id" && attr.Val == id {
					if kind == html.SelfClosingTagToken {
						if inner {
							return []byte{}, nil
						}
						return markup[from:position], nil
					}
					start, contentStart, targetTag = from, position, token.Data
					break
				}
			}
		}
		if start < 0 || token.Data != targetTag {
			continue
		}
		if kind == html.StartTagToken {
			depth++
		} else if kind == html.EndTagToken {
			depth--
			if depth == 0 {
				if inner {
					return markup[contentStart:from], nil
				}
				return markup[start:position], nil
			}
		}
	}
}

const documentStart = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CopyButton production contract fixture</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="/assets/app.css">
<link rel="stylesheet" href="/assets/ely-api.css">
<link rel="stylesheet" href="/assets/ely-api-interaction.css">
<style>body{margin:24px;font-family:system-ui,sans-serif}main{display:grid;gap:24px;max-width:760px}section{display:grid;gap:12px}h1{font-size:20px}h2{font-size:16px}</style>
<script src="/copybutton-observer.js"></script>
<script src="/assets/htmx.min.js"></script>
<script type="module" src="/assets/ely-api-interaction-entry.js"></script>
</head><body><main><h1>CopyButton production contract fixture</h1>
<section aria-label="Replacement controls"><div>
<button id="replace-root" type="button" hx-get="/fragment/root" hx-target="#copy-a" hx-swap="outerHTML">Replace root</button>
<button id="replace-control" type="button" hx-get="/fragment/control" hx-target="#copy-a-control" hx-swap="outerHTML">Replace control</button>
<button id="replace-inner" type="button" hx-get="/fragment/inner" hx-target="#copy-a" hx-swap="innerHTML">Replace contents</button>
</div></section>
`

func writeDocument(w io.Writer, tpl *template.Template) error {
	var out bytes.Buffer
	out.WriteString(documentStart)
	for _, component := range standaloneComponents() {
		fmt.Fprintf(&out, "<section aria-label=\"%s specimen\"><h2>%s</h2>\n", component.ID, component.ID)
		if component.ID == "copy-a" {
			out.WriteString(`<form id="copy-form"><button id="before-copy" type="button">Before copy</button>`)
		}
		if err := ui.RenderComponent(tpl, &out, component); err != nil {
			return err
		}
		if component.ID == "copy-a" {
			out.WriteString(`<button id="after-copy" type="button">After copy</button></form>`)
		}
		out.WriteString("</section>\n")
	}
	registry, err := gohtmx.CatalogueRegistry()
	if err != nil {
		return err
	}
	for _, spec := range []struct {
		id       string
		disabled bool
	}{{"copy-adapter", false}, {"copy-adapter-disabled", true}} {
		plan, err := gohtmx.Compile(adapterScreen(spec.id, spec.disabled), registry)
		if err != nil {
			return err
		}
		fmt.Fprintf(&out, "<section aria-label=\"%s specimen\"><h2>%s</h2>\n", spec.id, spec.id)
		if err := plan.Render(&out, gohtmx.RenderContext{}); err != nil {
			return err
		}
		out.WriteString("</section>\n")
	}
	out.WriteString("</main></body></html>\n")
	_, err = w.Write(out.Bytes())
	return err
}

func writeManifest(w io.Writer) error {
	return json.NewEncoder(w).Encode(map[string]any{
		"suite": "copybutton-complete", "component": "buttons/CopyButton", "literalValue": literalValue,
		"standalone": standaloneComponents(),
		"adapter":    []sdui.Screen{adapterScreen("copy-adapter", false), adapterScreen("copy-adapter-disabled", true)},
		"fragments":  map[string]string{"root": "/fragment/root", "control": "/fragment/control", "inner": "/fragment/inner"},
		"assets":     []string{"/assets/app.css", "/assets/ely-api.css", "/assets/ely-api-interaction.css", "/assets/htmx.min.js", "/assets/ely-api-interaction-entry.js"},
		"observer":   "/copybutton-observer.js",
		"rootSelectors": map[string]string{
			"copy-adapter":          "#copy-adapter [data-ely-family]",
			"copy-adapter-disabled": "#copy-adapter-disabled [data-ely-family]",
		},
		"form": "#copy-form", "tabBefore": "#before-copy", "tabAfter": "#after-copy",
	})
}

func run(w io.Writer, args []string) error {
	mode := "document"
	if len(args) > 1 {
		return fmt.Errorf("usage: copybutton-complete [document|root|control|inner|manifest]")
	}
	if len(args) == 1 {
		mode = args[0]
	}
	if mode == "manifest" {
		return writeManifest(w)
	}
	if mode != "document" && mode != "root" && mode != "control" && mode != "inner" {
		return fmt.Errorf("unknown fixture mode %q", mode)
	}
	tpl, err := ui.NewTemplates()
	if err != nil {
		return err
	}
	if mode == "document" {
		return writeDocument(w, tpl)
	}
	markup, err := renderRoot(tpl)
	if err != nil {
		return err
	}
	if mode == "control" {
		markup, err = elementBytes(markup, "copy-a-control", false)
	} else if mode == "inner" {
		markup, err = elementBytes(markup, "copy-a", true)
	}
	if err != nil {
		return err
	}
	_, err = w.Write(markup)
	return err
}

func main() {
	if err := run(os.Stdout, os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
