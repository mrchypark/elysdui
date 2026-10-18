package uiexamples

import (
	"bytes"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"strings"
	"testing"
)

func TestFoundationVisualRepairSpecimens(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	wants := map[string][]string{
		"Icon":      {`data-specimen-rows`, `data-foundation-icon="custom-mark"`, `data-foundation-icon-size="12"`, `data-foundation-icon-size="32"`},
		"Image":     {`data-foundation-image-state="loaded"`, `data-foundation-image-state="error"`, `data-foundation-image-state="empty"`, `<figcaption>loaded</figcaption>`, `<img src="/assets/ely/native-generative/atrium.jpg"`},
		"Clipboard": {`data-foundation-paste-button`, `data-foundation-copy hidden>Ely`, `cx.write_to_clipboard(…)`},
		"Container": {`ely-foundation__container-specimen`, `Container::new(ContainerSize::Sm)`},
		"Fragment":  {`data-foundation-icon="layers"`, `two siblings, no wrapper`, `.children([a, b])`},
	}
	for _, c := range advancedFoundationCases() {
		expected, ok := wants[c.Component.Name]
		if !ok {
			continue
		}
		t.Run(c.Component.Name, func(t *testing.T) {
			var out bytes.Buffer
			for _, preview := range storyPreviewComponents(c.Component) {
				if err := ui.RenderComponent(server.templates, &out, preview); err != nil {
					t.Fatal(err)
				}
			}
			for _, want := range expected {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q", want)
				}
			}
		})
	}
	for _, name := range []string{"TitleBar", "ColumnShell", "WindowControls"} {
		p := map[string]any{}
		nativeShellFixtures(name, p)
		examples := p["PreviewExamples"].([]map[string]any)
		if name != "WindowControls" && p["PreviewStack"] != true {
			t.Errorf("%s must stack its fixed-width specimens", name)
		}
		for _, example := range examples {
			if example["SpecimenCaption"] == nil {
				t.Errorf("%s missing specimen caption", name)
			}
		}
	}
}
