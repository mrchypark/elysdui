package uiexamples

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"golang.org/x/net/html"
)

func TestStepperFixtureProducerUsesNumericSeed(t *testing.T) {
	found := false
	for _, fixture := range advancedFormsCases() {
		if fixture.Component.Chapter != "forms" || fixture.Component.Name != "Knob" {
			continue
		}
		found = true
		for _, key := range []string{"Stepper", "forms/Stepper"} {
			props := SDUIAliasProps(fixture.Component.Props, key)
			value, _ := props["Value"].(string)
			if _, err := strconv.ParseFloat(value, 64); err != nil {
				t.Errorf("raw fixture through %s has invalid numeric value %q", key, value)
			}
		}
	}
	if !found {
		t.Fatal("missing Knob fixture used by Stepper alias")
	}
	for _, fixture := range SDUIFixtures() {
		if fixture.Component.Chapter != "forms" || fixture.Component.Name != "Knob" || fixture.Source != "fixture:forms/Knob" {
			continue
		}
		value, _ := fixture.Component.Props["Value"].(string)
		if _, err := strconv.ParseFloat(value, 64); err != nil {
			t.Fatalf("SDUI fixture provider retained invalid numeric value %q", value)
		}
	}
}

func TestFormsAuditTargetFixtures(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/components/audit?aliases=1&family=forms", nil))
	if response.Code != http.StatusOK {
		t.Fatal(response.Code)
	}
	document, err := html.Parse(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if got := len(nativeFindAll(document, "li", "data-audit-case")); got != 166 {
		t.Fatalf("forms audit rows = %d, want 166", got)
	}
	for _, tc := range []struct {
		key   string
		wants []string
	}{
		{"forms/Stepper", []string{`type="number"`, `value="2"`, `data-ely-stepper-input="true"`}},
		{"forms/PercentInput", []string{`<span aria-hidden="true">%</span>`}},
		{"forms/UnitInput", []string{`data-ely-unit="px"`, `data-ely-unit-option="em"`}},
		{"forms/MaskedInput", []string{`data-ely-mask="aa-9999"`, `value="ab-1234"`}},
		{"forms/InputAddon", []string{`class="ely-api-input-addon">@</span>`}},
		{"forms/EmojiPicker", []string{`data-ely-icon-text="✨"`, `data-ely-icon-text="👩‍💻"`}},
		{"forms/DirtyIndicator", []string{`data-ely-dirty="" aria-live="polite">Unsaved changes</output>`}},
		{"forms/FormError", []string{`role="alert">Example: email could not be saved.</p>`}},
		{"account/OrgSwitcher", []string{`Atlas Studio`, `Pro · 12 members`, `Field Notes`}},
	} {
		t.Run(tc.key, func(t *testing.T) {
			row := paletteAuditUnique(t, document, "data-audit-name", tc.key)
			for _, instance := range []string{"data-audit-main", "data-audit-twin"} {
				scope := paletteAuditUnique(t, row, instance, "")
				var markup bytes.Buffer
				if err := html.Render(&markup, scope); err != nil {
					t.Fatal(err)
				}
				for _, want := range tc.wants {
					if !strings.Contains(markup.String(), want) {
						t.Errorf("%s missing %q", instance, want)
					}
				}
				if tc.key == "forms/Stepper" {
					inputs := paletteAuditNodes(scope, "data-ely-stepper-input", "true")
					if len(inputs) != 1 {
						t.Fatalf("%s number inputs = %d, want 1", instance, len(inputs))
					}
					if value, _ := nativeAttr(inputs[0], "value"); value != "2" {
						t.Errorf("%s Stepper seed = %q, want 2", instance, value)
					}
				}
			}
		})
	}
	popup := paletteAuditUnique(t, document, "data-audit-name", "maps/MapPopup")
	for _, instance := range []string{"data-audit-main", "data-audit-twin"} {
		scope := paletteAuditUnique(t, popup, instance, "")
		if !nativeHasAttr(paletteAuditUnique(t, scope, "data-map-popup", ""), "hidden") {
			t.Fatal("MapPopup must remain closed until the marker action")
		}
	}
}

func TestStepperFixturePreservesValidNumericCallerProps(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{"0", "-2.5", "12.75"} {
		t.Run(value, func(t *testing.T) {
			props := map[string]any{"Value": value, "Min": "-20", "Max": 100, "Step": "0.25"}
			adjusted := aliasFixtureProps(props, "forms/Stepper")
			if adjusted["Value"] != value || props["Value"] != value {
				t.Fatal("fixture overwrote a valid caller value")
			}
			var markup bytes.Buffer
			if err := ui.RenderComponent(server.templates, &markup, ui.Component{Chapter: "forms", Name: "Stepper", ID: "caller-stepper", Props: props}); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(markup.String(), `value="`+value+`"`) {
				t.Fatal("public Stepper lost caller numeric value")
			}
		})
	}
	props := map[string]any{"Value": "alpha"}
	_ = aliasFixtureProps(props, "forms/Stepper")
	if props["Value"] != "alpha" {
		t.Fatal("fixture adjustment mutated its source props")
	}
	if got := aliasFixtureProps(props, "account/Stepper")["Value"]; got != "alpha" {
		t.Fatal("forms-only fixture leaked into another chapter")
	}
}

func TestYearDurationFixturesRemoveOnlyQualifiedInheritedMax(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ base, alias, value string }{{"MonthPicker", "YearPicker", "2026"}, {"RelativeDatePicker", "DurationPicker", "30"}} {
		t.Run(tc.alias, func(t *testing.T) {
			var original map[string]any
			for _, fixture := range advancedFormsCases() {
				if fixture.Component.Chapter == "forms" && fixture.Component.Name == tc.base {
					original = fixture.Component.Props
				}
			}
			if original == nil || original["Max"] != 5 {
				t.Fatal("expected actual common gallery Max5 fixture")
			}
			beforeValue := original["Value"]
			props := aliasFixtureProps(original, "forms/"+tc.alias)
			if _, exists := props["Max"]; exists || props["Value"] != tc.value {
				t.Fatalf("qualified fixture retains invalid inherited max or changed value: %v", props)
			}
			if original["Max"] != 5 || original["Value"] != beforeValue {
				t.Fatal("alias correction mutated canonical source props")
			}
			if aliasFixtureProps(original, tc.alias)["Max"] != 5 || aliasFixtureProps(original, "other/"+tc.alias)["Max"] != 5 {
				t.Fatal("qualified correction leaked to an unqualified or other-chapter fixture")
			}
			render := func(p map[string]any) *html.Node {
				t.Helper()
				var markup bytes.Buffer
				if err := ui.RenderComponent(server.templates, &markup, ui.Component{Chapter: "forms", Name: tc.alias, ID: "bounded-fixture", Props: p}); err != nil {
					t.Fatal(err)
				}
				doc, err := html.Parse(strings.NewReader(markup.String()))
				if err != nil {
					t.Fatal(err)
				}
				return paletteAuditUnique(t, doc, "name", "caller_value")
			}
			input := render(props)
			if value, _ := nativeAttr(input, "value"); value != tc.value || nativeHasAttr(input, "max") {
				t.Fatal("actual canonical alias input still has inherited bound or wrong value")
			}
			if tc.alias == "YearPicker" {
				if step, _ := nativeAttr(input, "step"); step != "1" {
					t.Fatal("year step changed")
				}
			} else if min, _ := nativeAttr(input, "min"); min != "0" {
				t.Fatal("duration must remain nonnegative")
			}
			caller := map[string]any{"Name": "caller_value", "Value": "4", "Min": "0", "Max": 5}
			if max, _ := nativeAttr(render(caller), "max"); max != "5" {
				t.Fatal("public renderer discarded explicit caller bound")
			}
			caller["Max"] = 99
			if aliasFixtureProps(caller, "forms/"+tc.alias)["Max"] != 99 || caller["Max"] != 99 {
				t.Fatal("non-default explicit fixture bound changed")
			}
		})
	}
}

func TestGalleryEmojiCataloguePreservesUpstreamData(t *testing.T) {
	if len(galleryEmojiOptions) != 1914 {
		t.Fatalf("emoji count: %d", len(galleryEmojiOptions))
	}
	seen := map[string]bool{}
	groups := map[string]bool{}
	joined := false
	for _, option := range galleryEmojiOptions {
		value := option["Value"].(string)
		if value == "" || seen[value] || option["Glyph"] != value || option["Label"] == "" {
			t.Fatalf("invalid emoji: %v", option)
		}
		seen[value] = true
		groups[option["Group"].(string)] = true
		if value == "👩‍💻" {
			joined = true
		}
	}
	if len(groups) != 9 || !joined || !seen["✨"] {
		t.Fatal("groups or complete joined emoji lost")
	}
}

func TestRegionalCataloguesPreserveUpstreamChoices(t *testing.T) {
	for key, count := range map[string]int{"languages": 184, "countries": 249, "currencies": 154} {
		options := galleryRegionalOptions[key]
		if len(options) != count {
			t.Fatalf("%s count: %d", key, len(options))
		}
		seen := map[string]bool{}
		for _, option := range options {
			v := option["Value"].(string)
			if v == "" || seen[v] || option["Label"] == "" {
				t.Fatalf("invalid %s choice: %v", key, option)
			}
			seen[v] = true
		}
	}
}
