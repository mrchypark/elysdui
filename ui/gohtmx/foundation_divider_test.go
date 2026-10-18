package ui

import (
	"bytes"
	"fmt"
	"strings"
	"testing"
)

func TestFoundationIconAssetsAndLicenseAreBundled(t *testing.T) {
	names := FoundationIconNames()
	if len(names) < 300 {
		t.Fatalf("bundled icon count = %d, want at least 300", len(names))
	}
	for _, name := range names {
		if _, err := Files.ReadFile(fmt.Sprintf("assets/ely/icons/%s.svg", name)); err != nil {
			t.Fatalf("missing bundled icon %q: %v", name, err)
		}
	}
	license, err := Files.ReadFile("assets/ely/icons/LICENSE")
	if err != nil || !strings.Contains(string(license), "ISC License") || !strings.Contains(string(license), "MIT License") {
		t.Fatalf("missing complete bundled icon license: %v", err)
	}
}

func TestFoundationIconCompatibilityMarkup(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := tpl.ExecuteTemplate(&out, "ely-api-primitives", map[string]any{"Kind": "Icon", "Value": "★", "Alt": "Star glyph"}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), `data-foundation-icon-value="★"`) || !strings.Contains(out.String(), "★") {
		t.Fatal("legacy icon value was not preserved")
	}
	out.Reset()
	if err := tpl.ExecuteTemplate(&out, "ely-api-primitives", map[string]any{"Kind": "Svg", "Src": "/assets/ely/icons/compass.svg", "Alt": "Compass"}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), `data-foundation-icon-src="/assets/ely/icons/compass.svg"`) {
		t.Fatal("SVG source asset was not preserved")
	}
}

func TestFoundationBoxAndTextKeepLegacyCallerValues(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		kind  string
		props map[string]any
		want  string
	}{
		{"Box", map[string]any{"Kind": "Box", "Value": "<legacy-box>"}, "&lt;legacy-box&gt;"},
		{"Box", map[string]any{"Kind": "Box", "Text": "box text"}, "box text"},
		{"Text", map[string]any{"Kind": "Text", "Value": "<legacy-text>"}, "&lt;legacy-text&gt;"},
		{"Text", map[string]any{"Kind": "Text", "Text": "text fallback"}, "text fallback"},
	} {
		t.Run(test.kind+test.want, func(t *testing.T) {
			var out bytes.Buffer
			if err := tpl.ExecuteTemplate(&out, "ely-api-primitives", test.props); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(out.String(), test.want) {
				t.Errorf("missing legacy content %q in %s", test.want, out.String())
			}
		})
	}
}

func TestFoundationDividerRendersCallerOwnedVariants(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	err = tpl.ExecuteTemplate(&out, "ely-api-primitives", map[string]any{
		"Kind": "Divider",
		"Dividers": []map[string]string{
			{"Orientation": "horizontal"},
			{"Orientation": "horizontal", "Label": "or"},
			{"Orientation": "vertical", "Before": "Left", "After": "Right"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	body := out.String()
	for _, want := range []string{`<hr class="ely-foundation__divider">`, `aria-label="or"`, `aria-orientation="vertical"`, "Left", "Right"} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %q in %s", want, body)
		}
	}
}

func TestFoundationVariantsConstrainMarkup(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name, template string
		props          map[string]any
		wants          []string
	}{
		{"heading levels", "ely-api-typography", map[string]any{"Kind": "Heading", "Level": 7, "Value": "Fallback"}, []string{"<h1>Fallback</h1>"}},
		{"stack alias", "ely-api-layout", map[string]any{"Kind": "HStack", "Items": []string{"A", "B"}}, []string{`data-foundation-direction="row"`}},
		{"aspect data", "ely-api-layout", map[string]any{"Kind": "AspectRatio", "Ratio": 1, "Value": "Square"}, []string{`data-foundation-aspect="1"`, "Square"}},
		{"unchecked show", "ely-api-primitives", map[string]any{"ID": "show", "Kind": "Show", "Name": "shown", "Label": "Show", "Text": "Hidden", "Checked": false}, []string{"data-foundation-show", `aria-expanded="false"`, "data-foundation-conditional hidden"}},
		{"disabled controls", "ely-api-primitives", map[string]any{"ID": "copy", "Kind": "Clipboard", "Value": "Ely", "Label": "Copy", "Disabled": true}, []string{"data-foundation-copy-button disabled"}},
		{"safe SVG marks", "ely-api-primitives", map[string]any{"Kind": "Svg", "Icons": []string{"compass", "star"}}, []string{`data-foundation-icon="compass"`, `data-foundation-icon="star"`}},
		{"hidden tooltip", "ely-api-primitives", map[string]any{"ID": "tip", "Kind": "Tooltip Trigger", "Label": "Help", "Text": "More information"}, []string{"ely-foundation__tooltip-trigger", `role="tooltip"`}},
	} {
		t.Run(test.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := tpl.ExecuteTemplate(&out, test.template, test.props); err != nil {
				t.Fatal(err)
			}
			for _, want := range test.wants {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q in %s", want, out.String())
				}
			}
		})
	}
}

func TestFoundationSourceShapedCallerCompositions(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name, template string
		props          map[string]any
		wants          []string
	}{
		{"nested split", "ely-api-layout", map[string]any{"Kind": "SplitPane", "Label": "Resize", "Before": "Files", "NestedBefore": "Editor", "NestedAfter": "Terminal", "NestedLabel": "Resize inner"}, []string{"Files", "Editor", "Terminal", `aria-orientation="horizontal"`}},
		{"math collection", "ely-api-typography", map[string]any{"Kind": "Latex", "Latexes": []map[string]any{{"Value": `e^{i\pi}`, "Label": "Euler"}, {"Value": `\sqrt{x}`, "Label": "Root"}}}, []string{"ely-foundation__maths", `data-foundation-math="e^{i\pi}"`, `data-foundation-math="\sqrt{x}"`}},
		{"numeric options", "ely-api-typography", map[string]any{"Kind": "PercentText", "Value": "0.052", "Signed": true}, []string{`data-foundation-signed="true"`}},
		{"duration option", "ely-api-typography", map[string]any{"Kind": "DurationText", "Value": "245", "DurationStyle": "compact"}, []string{`data-foundation-duration-style="compact"`}},
		{"static typography", "ely-api-typography", map[string]any{"Kind": "Heading", "Headings": []map[string]any{{"Level": 1, "Value": "Quiet interfaces"}, {"Level": 2, "Value": "Quiet interfaces"}, {"Level": 3, "Value": "Quiet interfaces"}, {"Level": 4, "Value": "Quiet interfaces"}, {"Level": 5, "Value": "Quiet interfaces"}, {"Level": 6, "Value": "Quiet interfaces"}}}, []string{"<h1>Quiet interfaces</h1>", "<h2>Quiet interfaces</h2>", "<h3>Quiet interfaces</h3>", "<h4>Quiet interfaces</h4>", "<h5>Quiet interfaces</h5>", "<h6>Quiet interfaces</h6>"}},
		{"title pair", "ely-api-typography", map[string]any{"Kind": "Title", "Value": "Quarterly review", "Text": "Numbers, notes and the next three moves."}, []string{"ely-foundation__title-pair", "Quarterly review", "Numbers, notes and the next three moves."}},
		{"paragraph measure", "ely-api-typography", map[string]any{"Kind": "Paragraph", "Value": "Good interfaces are quiet."}, []string{"ely-foundation__prose", "Good interfaces are quiet."}},
		{"label collection", "ely-api-typography", map[string]any{"Kind": "Label", "Labels": []string{"Display name", "Workspace"}}, []string{"<label>Display name</label>", "<label>Workspace</label>"}},
		{"caption", "ely-api-typography", map[string]any{"Kind": "Caption", "Value": "Updated a moment ago"}, []string{"ely-foundation__caption", "Updated a moment ago"}},
		{"overline version", "ely-api-typography", map[string]any{"Kind": "Overline", "Value": "Release notes", "Version": "Version 0.1"}, []string{"ely-foundation__overline-pair", "Version 0.1"}},
		{"inline code", "ely-api-typography", map[string]any{"Kind": "Code", "Before": "Run", "Value": "cargo run", "After": "to open."}, []string{"ely-foundation__code-line", "Run", "cargo run", "to open."}},
		{"keycaps", "ely-api-typography", map[string]any{"Kind": "Kbd", "Keycaps": []map[string]any{{"Label": "secondary-s", "Keys": []string{"Ctrl", "S"}}}}, []string{"<kbd>Ctrl</kbd>", "<kbd>S</kbd>", "secondary-s"}},
		{"key combos", "ely-api-typography", map[string]any{"Kind": "KbdCombo", "KeyCombos": []map[string]any{{"Label": "secondary-k secondary-s", "Groups": []map[string]any{{"Keys": []string{"Ctrl", "K"}}, {"Keys": []string{"Ctrl", "S"}}}}}}, []string{"ely-foundation__kbd-specimens", "secondary-k secondary-s", "<kbd>K</kbd>"}},
		{"fit typography", "ely-api-typography", map[string]any{"Kind": "Truncate", "Before": "Note", "Value": "caller text", "Width": 240}, []string{"ely-foundation__fit--row", `data-foundation-width="240"`, "caller text"}},
		{"highlight query", "ely-api-typography", map[string]any{"Kind": "Highlight", "Text": "Quiet interfaces age well.", "Query": "age"}, []string{"data-foundation-highlight", `data-foundation-highlight-query="age"`}},
		{"external target", "ely-api-typography", map[string]any{"Kind": "ExternalLink", "Label": "caller", "Href": "https://example.test"}, []string{`target="_blank"`, `rel="noopener noreferrer"`, "caller"}},
		{"blockquote rail", "ely-api-typography", map[string]any{"Kind": "Blockquote", "Value": "caller quote", "Citation": "source"}, []string{"ely-foundation__blockquote", "caller quote", "<cite>source</cite>"}},
		{"line clamp", "ely-api-typography", map[string]any{"Kind": "LineClamp", "Value": "caller text", "Width": 360, "Lines": 2}, []string{`data-foundation-width="360"`, `data-foundation-clamp-lines="2"`}},
		{"middle fit", "ely-api-typography", map[string]any{"Kind": "MiddleEllipsis", "Value": "caller/path", "Width": 280}, []string{`data-foundation-width="280"`, `data-foundation-middle="caller/path"`}},
		{"ellipsis tooltip", "ely-api-typography", map[string]any{"Kind": "EllipsisTooltip", "Value": "caller tooltip", "Width": 240}, []string{`data-foundation-ellipsis-tooltip`, `data-foundation-full-text="caller tooltip"`, `data-foundation-width="240"`}},
		{"link line", "ely-api-typography", map[string]any{"Kind": "Link", "Before": "Read", "Label": "caller", "After": "now", "Href": "#caller"}, []string{"ely-foundation__link-line", `href="#caller"`, "Read", "caller", "now"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := tpl.ExecuteTemplate(&out, test.template, test.props); err != nil {
				t.Fatal(err)
			}
			for _, want := range test.wants {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q in %s", want, out.String())
				}
			}
		})
	}
}
