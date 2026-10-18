package ui

import (
	"bytes"
	"html/template"
	"strings"
	"testing"
)

func nativeTemplates(t *testing.T) *template.Template {
	t.Helper()
	tpl, err := template.New("").Funcs(Funcs()).ParseFS(Files, "templates/ely-api.html", "templates/ely-api-native.html", "templates/ely-api-native-tooling.html", "templates/shadcn-select.html", "templates/shadcn-switch.html")
	if err != nil {
		t.Fatal(err)
	}
	return tpl
}

func TestNativeAPIHasRendererForEveryAssignedPrimary(t *testing.T) {
	tpl := nativeTemplates(t)
	definitions, err := ComponentDefinitions()
	if err != nil {
		t.Fatal(err)
	}
	assigned := map[string]bool{"shell": true, "generative": true, "media": true, "theme": true, "i18n": true, "misc": true, "tooling": true, "rendering": true}
	count := 0
	for _, definition := range definitions {
		if !assigned[definition.Chapter] {
			continue
		}
		count++
		var output bytes.Buffer
		err := RenderComponent(tpl, &output, Component{Chapter: definition.Chapter, Name: definition.Name, ID: "native-" + strings.ReplaceAll(strings.ToLower(definition.Chapter), " ", "-"), Props: map[string]any{
			"Title": "Caller title", "Value": "Caller value", "Name": "caller_value",
			"Options": []map[string]any{{"Value": "one", "Label": "One", "Selected": true}},
			"Items":   []map[string]any{{"Value": "one", "Label": "One", "Content": "Caller row"}},
		}})
		if err != nil {
			t.Fatalf("%s/%s: %v", definition.Chapter, definition.Name, err)
		}
		if !strings.Contains(output.String(), `data-ely-family="native"`) || !strings.Contains(output.String(), "Caller title") {
			t.Fatalf("%s/%s did not render caller content in native wrapper", definition.Chapter, definition.Name)
		}
	}
	if count != 104 {
		t.Fatalf("assigned primary count = %d, want 104", count)
	}
}

func TestNativeAPIEscapesAndKeepsNativeStates(t *testing.T) {
	tpl := nativeTemplates(t)
	var output bytes.Buffer
	err := RenderComponent(tpl, &output, Component{Chapter: "generative", Name: "ImageGenerationPanel", ID: "native-safe", Props: map[string]any{
		"Title": `<img src=x onerror=alert(1)>`, "Value": `<script>alert(1)</script>`, "Name": "prompt", "Required": true, "Disabled": true,
		"Options": []map[string]any{{"Value": `"><script>`, "Label": `<b>style</b>`}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	html := output.String()
	if strings.Contains(html, "<script>") || strings.Contains(html, "<img src=x") {
		t.Fatal("caller strings became executable markup")
	}
	if !strings.Contains(html, "required") || !strings.Contains(html, "disabled") || !strings.Contains(html, `name="prompt"`) {
		t.Fatal("native required, disabled, or name semantics were lost")
	}
}

func TestNativeAPIPollStateIsInstanceLocal(t *testing.T) {
	tpl := nativeTemplates(t)
	render := func(id string) string {
		t.Helper()
		var output bytes.Buffer
		err := RenderComponent(tpl, &output, Component{Chapter: "misc", Name: "Poll", ID: id, Props: map[string]any{
			"Options": []map[string]any{{"Value": "yes", "Label": "Yes", "Selected": true}},
		}})
		if err != nil {
			t.Fatal(err)
		}
		return output.String()
	}
	first, second := render("native-poll-one"), render("native-poll-two")
	if !strings.Contains(first, `name="native-poll-one-vote"`) || !strings.Contains(second, `name="native-poll-two-vote"`) {
		t.Fatal("radio state is not namespaced to the component ID")
	}
}

func TestNativeAPIRendersMediaGeometryAndCodesFromCallerProps(t *testing.T) {
	tpl := nativeTemplates(t)
	render := func(chapter, name, id string, props map[string]any) string {
		t.Helper()
		var output bytes.Buffer
		if err := RenderComponent(tpl, &output, Component{Chapter: chapter, Name: name, ID: id, Props: props}); err != nil {
			t.Fatal(err)
		}
		return output.String()
	}
	video := render("media", "VideoPlayer", "native-video", map[string]any{"URL": "https://media.example/video.mp4"})
	if !strings.Contains(video, "<video") || !strings.Contains(video, "src=\"https://media.example/video.mp4\"") || !strings.Contains(video, "data-native-seek") {
		t.Fatal("video player did not retain its caller source and native controls")
	}
	model := render("media", "3DModelViewer", "native-model", map[string]any{"Vertices": "[[0,0,0],[1,0,0],[0,1,0]]", "Faces": "[[0,1,2]]"})
	if !strings.Contains(model, "data-native-model") || !strings.Contains(model, "data-vertices") || !strings.Contains(model, "data-faces") {
		t.Fatal("3D model caller geometry was not rendered")
	}
	barcode := render("misc", "BarcodeDisplay", "native-barcode", map[string]any{"Value": "CALLER-123"})
	if !strings.Contains(barcode, "<svg") || strings.Contains(barcode, "CALLER-123</svg>") {
		t.Fatal("barcode helper did not produce encoded SVG")
	}
}
