package uiexamples

import (
	"bytes"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"html"
	"html/template"
	"maps"
	"strings"
	"testing"
)

func TestNativeMiscSourceFixtures598To613(t *testing.T) {
	tpl, err := template.New("").Funcs(ui.Funcs()).ParseFS(ui.Files, "templates/ely-api.html", "templates/ely-api-native.html", "templates/ely-api-native-tooling.html", "templates/shadcn-select.html", "templates/shadcn-switch.html")
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, fixture := range advancedNativeCases() {
		if fixture.Component.Chapter != "misc" {
			continue
		}
		count++
		t.Run(fixture.Component.Name, func(t *testing.T) {
			p := fixture.Component.Props
			examples := p["PreviewExamples"].([]map[string]any)
			if len(examples) == 0 {
				t.Fatal("missing source preview")
			}
			for _, example := range examples {
				props := maps.Clone(p)
				maps.Copy(props, example)
				name := fixture.Component.Name
				if alternate, ok := example["PreviewName"].(string); ok {
					name = alternate
				}
				props = aliasFixtureProps(props, "misc/"+name)
				var out bytes.Buffer
				if err := ui.RenderComponent(tpl, &out, ui.Component{Chapter: "misc", Name: name, ID: "source-misc", Props: props}); err != nil {
					t.Fatal(err)
				}
				if strings.Contains(out.String(), "Caller row") || strings.Contains(out.String(), "A7K9") {
					t.Fatal("generic fixture leaked")
				}
			}
		})
	}
	if count != 16 {
		t.Fatalf("want16 source components, got%d", count)
	}
	var poll, quiz, license, transfer, clock map[string]any
	for _, c := range advancedNativeCases() {
		switch c.Component.Chapter + "/" + c.Component.Name {
		case "misc/Poll":
			poll = c.Component.Props
		case "misc/Quiz":
			quiz = c.Component.Props
		case "misc/LicenseViewer":
			license = c.Component.Props
		case "misc/ExportDialog":
			transfer = c.Component.Props
		case "misc/Clock":
			clock = c.Component.Props
		}
	}
	if poll["Label"] != "Which chart should come next?" || len(poll["Options"].([]any)) != 3 || len(poll["Questions"].([]any)) != 3 {
		t.Fatal("poll/survey source data lost")
	}
	if len(quiz["Questions"].([]any)) != 2 || len(quiz["Items"].([]any)) != 3 {
		t.Fatal("quiz/deck source data lost")
	}
	packages := license["Items"].([]any)
	if len(packages) != 4 || !strings.Contains(packages[2].(map[string]any)["Content"].(string), "SIL OPEN FONT LICENSE") {
		t.Fatal("full source licenses lost")
	}
	if len(clock["Items"].([]any)) != 5 || len(transfer["PreviewExamples"].([]map[string]any)) != 3 || !strings.Contains(transfer["CSV"].(string), `"Lin, Wei"`) {
		t.Fatal("source zones or transfer previews lost")
	}
	for _, name := range []string{"w7xk.png", "q3np.png", "LICENSE"} {
		data, err := ui.Files.ReadFile("assets/ely/native-misc/" + name)
		if err != nil || len(data) == 0 {
			t.Fatalf("missing source asset%s: %v", name, err)
		}
	}
}

func TestNativeMiscSourceVisualCorrections(t *testing.T) {
	tpl, err := template.New("").Funcs(ui.Funcs()).ParseFS(ui.Files, "templates/ely-api.html", "templates/ely-api-native.html", "templates/ely-api-native-tooling.html", "templates/shadcn-select.html", "templates/shadcn-switch.html")
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"BarcodeDisplay", "Signature", "Rating Widget", "ShareSheet", "PrintButton", "Clock", "ExportDialog"} {
		p := map[string]any{}
		fixtureName := name
		if name == "Signature" || name == "Rating Widget" {
			fixtureName = "BarcodeDisplay"
		}
		if name == "ShareSheet" {
			fixtureName = "PrintButton"
		}
		nativeMiscFixtures(fixtureName, p)
		if _, exists := p["GallerySourceOnlyNotice"]; exists {
			t.Fatal("gallery-only flag must not enter fixture/schema caller data")
		}
		p = aliasFixtureProps(p, "misc/"+name)
		examples := p["PreviewExamples"].([]map[string]any)
		if name == "Clock" && (examples[0]["Caption"] != "clock" || examples[1]["Caption"] != "world clock") {
			t.Fatal("clock specimen captions lost")
		}
		if name == "ExportDialog" && len(examples) != 3 {
			t.Fatal("transfer row must retain all three independent dialogs")
		}
		var out bytes.Buffer
		if err := ui.RenderComponent(tpl, &out, ui.Component{Chapter: "misc", Name: name, ID: "visual-misc", Props: p}); err != nil {
			t.Fatal(err)
		}
		switch name {
		case "BarcodeDisplay":
			if !strings.Contains(out.String(), `data-misc-source-note>BarcodeDisplay, Signature, and Rating Widget are source-only`) || strings.Contains(out.String(), `data-misc-source-note hidden`) {
				t.Fatal("barcode family must show its accurate source-only notice")
			}
		case "Rating Widget":
			if !strings.Contains(out.String(), `data-misc-source-note>Rating Widget is source-only`) || strings.Contains(out.String(), `data-native-rating`) {
				t.Fatal("rating alias must show a source-only notice, not imply a working control")
			}
		case "Signature":
			if !strings.Contains(out.String(), `data-misc-source-note>Signature is source-only`) || strings.Contains(out.String(), `data-native-rating`) {
				t.Fatal("signature alias must show its gallery source-only notice")
			}
		case "ShareSheet":
			if !strings.Contains(out.String(), `data-misc-source-note>ShareSheet is source-only`) || !strings.Contains(out.String(), `does not invoke platform share UI`) || strings.Contains(out.String(), `data-ely-action=`) || strings.Contains(out.String(), `ely-misc-warning`) {
				t.Fatal("share alias must accurately describe the demo without presenting an action")
			}
		case "PrintButton":
			if !strings.Contains(out.String(), `class="ely-misc-warning">PrintButton: gpui has no print API.`) || strings.Contains(out.String(), "ShareSheet is") {
				t.Fatal("print specimen must contain only the short source warning")
			}
		}
	}
	for _, action := range []string{"", "caller-share"} {
		props := aliasFixtureProps(map[string]any{"Action": action, "ActionLabel": "Share"}, "misc/ShareSheet")
		var share bytes.Buffer
		if err := ui.RenderComponent(tpl, &share, ui.Component{Chapter: "misc", Name: "ShareSheet", ID: "public-share", Props: props}); err != nil {
			t.Fatal(err)
		}
		if action == "" {
			action = "share"
		}
		if !strings.Contains(share.String(), `data-ely-action="`+action+`"`) || strings.Contains(share.String(), `data-misc-source-note`) {
			t.Fatal("source-only gallery fixture must not alter default or caller ShareSheet actions")
		}
	}
	for _, name := range []string{"BarcodeDisplay", "Rating Widget", "Signature", "PrintButton", "ShareSheet"} {
		note := "Caller-owned <custom> & source note."
		props := aliasFixtureProps(map[string]any{"SourceNote": note}, "misc/"+name)
		var caller bytes.Buffer
		if err := ui.RenderComponent(tpl, &caller, ui.Component{Chapter: "misc", Name: name, ID: "caller-note", Props: props}); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(caller.String(), `data-misc-source-note>`+html.EscapeString(note)) || strings.Contains(caller.String(), "is source-only in this native demo") {
			t.Fatalf("%s overwrote a caller-owned SourceNote: %s", name, caller.String())
		}
	}
}
