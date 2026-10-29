package uiexamples

import (
	"bytes"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestFoundationTypographyFixturesMatchReferenceSpecimens(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]AdvancedCase{}
	for _, fixture := range advancedFoundationCases() {
		fixtures[fixture.Component.Chapter+"/"+fixture.Component.Name] = fixture
	}
	for _, test := range []struct {
		name       string
		wants      []string
		valueAbove bool
	}{
		{"typography/RelativeTime", []string{"10 s", "3 min", "2 h", "3 d"}, true},
		{"typography/DateTimeText", []string{"2026-09-24T09:41:00Z", "default", "%Y-%m-%d", "%A %H:%M", `data-foundation-datetime-pattern="%Y-%m-%d"`, `data-foundation-datetime-pattern="%A %H:%M"`}, true},
		{"typography/NumberText", []string{"1234567.891", "42000", "-1234.5", "2 decimals", "integer", "negative", `data-foundation-decimals="2"`, `data-foundation-decimals="1"`}, true},
		{"typography/CurrencyText", []string{"1234.5", "-42", "1500.4", "9.99", "USD", "EUR", "JPY", "CHF"}, true},
		{"typography/PercentText", []string{"0.1234", "0.052", "-0.031", "plain", "gain", "loss", `data-foundation-signed="true"`}, true},
		{"typography/FileSizeText", []string{"1536", "3200000000", "3221225472", "1536 B", "3.2 GB", "binary", `data-foundation-filesize-binary="true"`}, true},
		{"typography/DurationText", []string{"5025", "1425", "245", "clock", "compact"}, true},
		{"typography/PluralText", []string{"1", "12345", "file", "files"}, true},
		{"typography/CopyableText", []string{"ely_live_4f9a2c81d7", "data-foundation-copy-button"}, false},
		{"typography/SelectableText", []string{"Selection works on read-only text too: logs, messages, receipts.", "data-foundation-selectable"}, false},
		{"typography/Emoji", []string{"sparkles", "herb", "coffee", "xl", `data-foundation-emoji-size="xxl"`}, false},
		{"typography/Latex", []string{"euler", "sum", "root", "Latex::parse(r", `e^{i\pi}`}, false},
		{"typography/AnimatedNumber", []string{"roll", "count up", `data-foundation-number-values="1284,1917,12406,9998,10031"`, `data-foundation-number-decimals="1"`}, false},
		{"typography/Typewriter", []string{"Writing, one grapheme at a time.", "中文与 emoji ✨ 也按字形逐个出现。", "Next line", "data-foundation-typewriter-next"}, false},
		{"typography/GradientText", []string{"Quiet type", "ink to muted", "ink to focus", "data-foundation-gradient-tone"}, false},
		{"typography/ShimmerText", []string{"Thinking through the request…"}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			fixture := testFixture(t, fixtures, test.name)
			fixture.Component.ID = "reference-specimen"
			var output bytes.Buffer
			if err := ui.RenderComponent(server.templates, &output, fixture.Component); err != nil {
				t.Fatal(err)
			}
			body := output.String()
			for _, want := range test.wants {
				if !strings.Contains(body, want) {
					t.Errorf("missing %q in %s", want, body)
				}
			}
			if test.valueAbove && !strings.Contains(body, "</output><figcaption>") && !strings.Contains(body, "</time><figcaption>") {
				t.Error("reference specimen does not place its value above its label")
			}
		})
	}
}

func TestFoundationScrollFixturesMatchReferenceSpecimens(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]AdvancedCase{}
	for _, fixture := range advancedFoundationCases() {
		fixtures[fixture.Component.Chapter+"/"+fixture.Component.Name] = fixture
	}
	for _, test := range []struct {
		name  string
		wants []string
	}{
		{"layout/ScrollArea", []string{"data-foundation-scroll", "Line 01 · quiet content that scrolls", "Line 24 · quiet content that scrolls"}},
		{"layout/Scrollbar", []string{"data-foundation-scrollbar", "Scroll position", "Line 30 · quiet content that scrolls"}},
		{"layout/ScrollShadow", []string{"data-foundation-scroll-shadow=\"bottom\"", "data-foundation-scroll-shadow-top", "data-foundation-scroll-shadow-bottom"}},
		{"layout/ScrollToTop", []string{"data-foundation-scroll-top", "aria-label=\"Scroll to top\"", ">↑</button>"}},
		{"layout/StickyHeader", []string{"Today", "Yesterday", "Earlier", "data-foundation-scrollbar", "Line 08 · quiet content that scrolls"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			fixture := testFixture(t, fixtures, test.name)
			fixture.Component.ID = "reference-scroll"
			var output bytes.Buffer
			if err := ui.RenderComponent(server.templates, &output, fixture.Component); err != nil {
				t.Fatal(err)
			}
			for _, want := range test.wants {
				if !strings.Contains(output.String(), want) {
					t.Errorf("missing %q in %s", want, output.String())
				}
			}
		})
	}
}

func TestFoundationRegionFixturesMatchReferenceSpecimens(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]AdvancedCase{}
	for _, fixture := range advancedFoundationCases() {
		fixtures[fixture.Component.Chapter+"/"+fixture.Component.Name] = fixture
	}
	for _, test := range []struct {
		name  string
		wants []string
	}{
		{"layout/Card", []string{"Storage", "Across all workspaces", "42.8 GB of 100 GB", "Media takes the most room.", "Later", "Manage"}},
		{"layout/Panel", []string{"Outline", "fn render", "struct Theme"}},
		{"layout/Section", []string{"Members", "People who can open this workspace.", "Ada", "Grace", "Linus"}},
		{"layout/Group", []string{"Shipping address", "Street", "City", "Postcode"}},
		{"layout/Frame", []string{"Framed content sits on the page tone."}},
		{"layout/Well", []string{"Wells hold secondary material."}},
		{"layout/Sidebar", []string{"Home", "Inbox", "Settings", "data-foundation-sidebar-toggle"}},
		{"layout/Drawer", []string{"Open drawer", "Drawers hold short tasks close to where the hand already is.", "data-foundation-dialog-handle"}},
		{"layout/Sheet", []string{"Open sheet", "Filters", "Sheets keep context visible while a side task runs.", "Status: open", "Owner: anyone"}},
		{"layout/Page", []string{"Projects", "Everything your team is shipping.", "Atlas", "Beacon", "Compass"}},
		{"layout/AppShell", []string{"Ely — Projects", "Home", "Inbox", "Settings", "main · 3 changes · UTF-8"}},
		{"layout/MasterDetail", []string{"Quarterly review", "Design sync", "Launch plan", "Hiring loop", "Numbers, notes and the next three moves."}},
		{"layout/DockZone", []string{"Drag a tab across the dock above to see them."}},
	} {
		t.Run(test.name, func(t *testing.T) {
			fixture := testFixture(t, fixtures, test.name)
			fixture.Component.ID = "reference-region"
			var output bytes.Buffer
			if err := ui.RenderComponent(server.templates, &output, fixture.Component); err != nil {
				t.Fatal(err)
			}
			for _, want := range test.wants {
				if !strings.Contains(output.String(), want) {
					t.Errorf("missing %q in %s", want, output.String())
				}
			}
		})
	}
}

func TestFoundationSystemsFixturesMatchReferenceSpecimens(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]AdvancedCase{}
	for _, fixture := range advancedFoundationCases() {
		fixtures[fixture.Component.Chapter+"/"+fixture.Component.Name] = fixture
	}
	for _, test := range []struct {
		name  string
		wants []string
	}{
		{"layout/Dock", []string{"files panel", "Center. Drag a tab onto a zone.", "search panel", "terminal panel"}},
		{"layout/DockZone", []string{"Drag a tab across the dock above to see them.", "ely-foundation__dropzone--caption"}},
		{"layout/FloatingPanel", []string{"Show panel", "Inspector", "Floating panels sit above the page.", "Opacity 100%"}},
		{"layout/Pane", []string{"Pane 1", "buffer 1", "Pane 2", "buffer 2"}},
		{"layout/Workspace", []string{"Save layout", "Restore", "data-foundation-workspace-restore", "disabled"}},
		{"layout/Viewport", []string{"Idea", "Draft", "Ship", "Content places itself with the transform; zoom stays between 0.1 and 8."}},
	} {
		t.Run(test.name, func(t *testing.T) {
			fixture := testFixture(t, fixtures, test.name)
			fixture.Component.ID = "reference-systems"
			var output bytes.Buffer
			if err := ui.RenderComponent(server.templates, &output, fixture.Component); err != nil {
				t.Fatal(err)
			}
			for _, want := range test.wants {
				if !strings.Contains(output.String(), want) {
					t.Errorf("missing %q in %s", want, output.String())
				}
			}
		})
	}
}

func TestFoundationLayoutRegionsPreserveCallerFallbacks(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"Card", "Panel", "Group", "Frame", "Well", "Drawer", "Sheet", "AppShell", "DockZone"} {
		t.Run(kind, func(t *testing.T) {
			var output bytes.Buffer
			component := ui.Component{Chapter: "layout", Name: kind, ID: "caller-region", Props: map[string]any{"Value": "Caller-owned region value", "Href": "#caller"}}
			if err := ui.RenderComponent(server.templates, &output, component); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(output.String(), "Caller-owned region value") {
				t.Fatal("caller value was not rendered")
			}
		})
	}
}

func TestDockGalleryFixtureStartsEnabledAndPreservesExplicitDisabled(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	fixture := testFixture(t, func() map[string]AdvancedCase {
		fixtures := make(map[string]AdvancedCase)
		for _, candidate := range advancedFoundationCases() {
			fixtures[candidate.Component.Chapter+"/"+candidate.Component.Name] = candidate
		}
		return fixtures
	}(), "layout/Dock")
	if fixture.Component.Props["Disabled"] != false {
		t.Fatalf("Dock gallery fixture Disabled = %v, want false", fixture.Component.Props["Disabled"])
	}
	for _, id := range []string{"dock-main", "dock-twin"} {
		t.Run(id, func(t *testing.T) {
			component := fixture.Component
			component.ID = id
			var output bytes.Buffer
			if err := ui.RenderComponent(server.templates, &output, component); err != nil {
				t.Fatal(err)
			}
			body := output.String()
			if !strings.Contains(body, `id="`+id+`"`) || strings.Contains(body, `data-ely-disabled="true"`) || strings.Contains(body, `<fieldset class="ely-api-disabled" disabled>`) {
				t.Fatalf("enabled Dock %s rendered disabled: %s", id, body)
			}
		})
	}
	component := fixture.Component
	component.ID = "dock-explicit-disabled"
	component.Props = make(map[string]any, len(fixture.Component.Props))
	for key, value := range fixture.Component.Props {
		component.Props[key] = value
	}
	component.Props["Disabled"] = true
	var output bytes.Buffer
	if err := ui.RenderComponent(server.templates, &output, component); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), `data-ely-disabled="true"`) || !strings.Contains(output.String(), `<fieldset class="ely-api-disabled" disabled>`) {
		t.Fatalf("explicitly disabled Dock lost native disabled semantics: %s", output.String())
	}
}

func testFixture(t *testing.T, fixtures map[string]AdvancedCase, name string) AdvancedCase {
	t.Helper()
	fixture, ok := fixtures[name]
	if !ok {
		t.Fatalf("missing fixture %s", name)
	}
	return fixture
}
