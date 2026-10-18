package ui

import (
	"bytes"
	"strconv"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestNativeThemeCallerContracts(t *testing.T) {
	tpl := nativeTemplates(t)
	for _, test := range []struct {
		chapter, name string
		props         map[string]any
		want          []string
	}{
		{"theme", "Shape", map[string]any{"Items": []map[string]any{{"Label": "Caller radius", "Value": "19px", "Size": "sm"}}, "Elevations": []map[string]any{{"Label": "Caller shadow", "Value": "floating"}}}, []string{`data-native-radius="19px"`, `data-native-elevation="floating"`, "Caller shadow"}},
		{"i18n", "LocaleDate", map[string]any{"Locale": "de-DE", "Value": "-123.456789", "Decimals": 4, "Date": "2026-09-01T00:00:00Z", "TimeZone": "Europe/Berlin"}, []string{`data-locale="de-DE"`, `data-value="-123.456789"`, `data-decimals="4"`, `data-time-zone="Europe/Berlin"`}},
		{"i18n", "RTL layout", map[string]any{"Locale": "he-IL", "Items": []map[string]any{{"Label": "Caller document", "Content": "42 KB"}}}, []string{`data-locale="he-IL"`, "Caller document", "42 KB"}},
		{"i18n", "KeyboardNavigationHelper", map[string]any{"SkipLabel": "Skip caller navigation", "Content": "Caller main", "Action": "caller-guide", "ActionLabel": "Caller guide", "Items": []map[string]any{{"Label": "Caller home", "Action": "caller-home"}}}, []string{`href="#native-caller-content"`, `id="native-caller-content" data-native-skip-target tabindex="-1"`, "Skip caller navigation", "Caller main", `data-ely-action="caller-guide"`, `data-ely-action="caller-home"`}},
		{"i18n", "ColorBlindSafe Palette", map[string]any{"ColorBlindSafe": true, "Items": []map[string]any{{"Label": "Caller hue", "Color": "#123456", "SafeColor": "#abcdef"}}}, []string{`name="colorBlindSafe" checked`, `data-native-color-safe=""`, `data-native-standard-color="#123456"`, `data-native-safe-color="#abcdef"`, "Caller hue"}},
		{"theme", "Motion", map[string]any{"Items": []map[string]any{{"Label": "Caller spring", "Curve": "spring", "Value": "damping 0.75"}}, "ReducedMotion": true, "Action": "replay-caller"}, []string{`data-native-motion-kind="spring"`, `data-native-reduced-motion="true"`, `data-ely-action="replay-caller"`}},
		{"theme", "ThemeEditor", map[string]any{"Radius": 0, "Density": "compact", "FontScale": 1.3, "Tokens": "--caller-token: #123456;", "HighContrast": true, "ReducedMotion": true, "Action": "save-caller", "Colors": []map[string]any{{"Label": "Caller ink", "Token": "--caller-ink", "Color": "#abcdef"}}}, []string{`min="0" max="2" step=".25" value="0"`, `max="1.3"`, `value="compact" selected`, `data-ely-submit="save-caller"`, "--caller-token: #123456;", `data-native-theme-color="--caller-ink"`}},
		{"theme", "ThemeImporter", map[string]any{"Tokens": `{"type":"dark","colors":{}}`, "BaseTokens": "--caller-space: 7px;", "Action": "import-caller"}, []string{`data-native-base-tokens="--caller-space: 7px;"`, `data-ely-submit="import-caller"`, `data-native-theme-drop`, `data-native-theme-error`}},
		{"theme", "Platform Style", map[string]any{"Platform": "Linux", "IconTheme": true, "Action": "open-caller", "Items": []map[string]any{{"Label": "caller.go", "Icon": "file-code", "OwnerIcon": "braces"}}}, []string{`value="Linux" checked`, `data-native-icon-theme checked`, `data-owner-icon="braces"`, "caller.go", `data-ely-action="open-caller"`}},
		{"i18n", "I18nProvider", map[string]any{"Locale": "he-IL", "Value": 0, "Decimals": 0, "Options": []map[string]any{{"Value": "en-US", "Label": "English", "Selected": true}, {"Value": "he-IL", "Label": "Hebrew"}}, "Catalogs": `{"he-IL":{"hello":"<hello>"}}`, "MessageItems": []map[string]any{{"Key": "hello", "Args": `{"name":"<Ada>"}`}}}, []string{`value="he-IL" selected`, `data-value="0"`, `data-decimals="0"`, `data-native-message="hello"`, "&lt;Ada&gt;"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			var output bytes.Buffer
			if err := RenderComponent(tpl, &output, Component{Chapter: test.chapter, Name: test.name, ID: "native-caller", Props: test.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range test.want {
				if !strings.Contains(output.String(), want) {
					t.Fatalf("missing %q in %s", want, output.String())
				}
			}
			if test.name == "ThemeEditor" {
				doc, err := html.Parse(strings.NewReader(output.String()))
				if err != nil {
					t.Fatal(err)
				}
				found := map[string]bool{}
				for node := range doc.Descendants() {
					if node.Data != "input" {
						continue
					}
					attrs := map[string]string{}
					for _, a := range node.Attr {
						attrs[a.Key] = a.Val
					}
					name := attrs["name"]
					if name != "highContrast" && name != "reducedMotion" {
						continue
					}
					_, checked := attrs["checked"]
					_, hook := attrs["data-native-theme-toggle"]
					if !checked || !hook || attrs["role"] != "switch" || attrs["type"] != "checkbox" {
						t.Fatalf("invalid caller switch %s: %v", name, attrs)
					}
					found[name] = true
				}
				if len(found) != 2 {
					t.Fatal("missing caller switches")
				}
			}
			if strings.Contains(output.String(), " style=") {
				t.Fatal("inline style breaks the gallery CSP")
			}
		})
	}
	for _, value := range []any{1234567.89123, 0, -1234.56789, "1234.00001"} {
		var output bytes.Buffer
		if err := RenderComponent(tpl, &output, Component{Chapter: "i18n", Name: "I18nProvider", ID: "precise-number", Props: map[string]any{"Value": value}}); err != nil {
			t.Fatal(err)
		}
		doc, err := html.Parse(strings.NewReader(output.String()))
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for node := range doc.Descendants() {
			for _, attr := range node.Attr {
				if attr.Key == "data-value" {
					found = true
					got, err := strconv.ParseFloat(attr.Val, 64)
					if err != nil {
						t.Fatal(err)
					}
					want := float64(0)
					switch v := value.(type) {
					case float64:
						want = v
					case string:
						want, _ = strconv.ParseFloat(v, 64)
					}
					if got != want {
						t.Fatalf("caller number %v became %v", value, got)
					}
				}
			}
		}
		if !found {
			t.Fatal("missing caller number")
		}
	}
}
