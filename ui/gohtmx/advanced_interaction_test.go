package ui

import (
	"bytes"
	"strconv"
	"strings"
	"testing"
)

func TestInteractionRenderersCoverEveryPrimary(t *testing.T) {
	chapters, err := Catalogue()
	if err != nil {
		t.Fatal(err)
	}
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	owned := map[string]bool{"buttons": true, "navigation": true, "menus": true, "overlays": true, "feedback": true, "motion": true, "interaction": true}
	count := 0
	for _, chapter := range chapters {
		if !owned[chapter.Slug] {
			continue
		}
		for index, story := range chapter.Stories {
			count++
			var body bytes.Buffer
			component := Component{Chapter: chapter.Slug, Name: story.Name, ID: "interaction-" + chapter.Slug + "-" + strconv.Itoa(index+1), Props: map[string]any{
				"Title": "Caller title", "Label": "Caller label", "Content": "Caller content", "Name": "field", "Value": "Caller value", "ActionLabel": "Caller action", "BackLabel": "Caller back", "ForwardLabel": "Caller forward", "Items": []map[string]any{{"Value": "first", "Label": "Caller first", "Content": "Caller first content", "Selected": true, "Href": "#first"}, {"Value": "second", "Label": "Caller second", "Content": "Caller second content", "Href": "#second"}},
			}}
			if err := RenderComponent(tpl, &body, component); err != nil {
				t.Fatalf("%s/%s: %v", chapter.Slug, story.Name, err)
			}
			output := body.String()
			if !strings.Contains(output, `data-ely-family="interaction"`) || !strings.Contains(output, `data-ely-kind="`+story.Name+`"`) {
				t.Fatalf("%s/%s lacks its interaction root", chapter.Slug, story.Name)
			}
			if !strings.Contains(output, "Caller") {
				t.Fatalf("%s/%s did not render caller data", chapter.Slug, story.Name)
			}
		}
	}
	if count != 88 {
		t.Fatalf("interaction primary count = %d, want 88", count)
	}
}

func TestInteractionRenderersEscapeAndKeepInstancesIndependent(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, component := range []Component{
		{Chapter: "buttons", Name: "ToggleButton", ID: "interaction-first", Props: map[string]any{"Label": `<img src=x onerror=alert(1)>`, "Value": "one"}},
		{Chapter: "buttons", Name: "ToggleButton", ID: "interaction-second", Props: map[string]any{"Label": "Second", "Value": "two", "Disabled": true}},
		{Chapter: "navigation", Name: "Tabs", ID: "interaction-empty", Props: map[string]any{"Label": "Empty", "Items": []map[string]any{}}},
	} {
		var body bytes.Buffer
		if err := RenderComponent(tpl, &body, component); err != nil {
			t.Fatal(err)
		}
		output := body.String()
		if strings.Contains(output, "<img src=x") {
			t.Fatal("caller string became executable markup")
		}
		if !strings.Contains(output, `id="`+component.ID+`"`) {
			t.Fatalf("missing protected root id %q", component.ID)
		}
		if component.ID == "interaction-second" && !strings.Contains(output, " disabled") {
			t.Fatal("disabled state was not preserved")
		}
	}
}

func TestInteractionButtonUsesCallerLabelAndExactAction(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	component := Component{Chapter: "buttons", Name: "Button", ID: "interaction-caller-button", Props: map[string]any{"Label": "Publish evidence", "Action": "publish", "Value": "evidence-17"}}
	if err := RenderComponent(tpl, &body, component); err != nil {
		t.Fatal(err)
	}
	output := body.String()
	for _, want := range []string{">Publish evidence</button>", `data-ely-action="publish"`, `value="evidence-17"`} {
		if !strings.Contains(output, want) {
			t.Fatalf("button lost caller data %q: %s", want, output)
		}
	}
}

func TestInteractionAliasKeepsPrimaryKindAndRequestedVariant(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	if err := RenderComponent(tpl, &body, Component{Chapter: "buttons", Name: "DropdownButton", ID: "interaction-alias", Props: map[string]any{"Label": "Publish", "Items": []map[string]any{{"Label": "Save", "Value": "save"}}}}); err != nil {
		t.Fatal(err)
	}
	output := body.String()
	if !strings.Contains(output, `data-ely-kind="SplitButton"`) || !strings.Contains(output, `data-interaction-kind="SplitButton"`) || !strings.Contains(output, `data-interaction-variant="DropdownButton"`) {
		t.Fatalf("alias lost primary kind or requested variant: %s", output)
	}
}

func TestInteractionAliasesRenderTheirCallerSelectedPresentation(t *testing.T) {
	definitions, err := ComponentDefinitions()
	if err != nil {
		t.Fatal(err)
	}
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, definition := range definitions {
		if definition.Family != "interaction" {
			continue
		}
		for index, alias := range definition.Aliases {
			var body bytes.Buffer
			component := Component{Chapter: definition.Chapter, Name: alias, ID: "interaction-alias-" + strconv.Itoa(index+1) + "-" + strings.ReplaceAll(definition.Chapter, "-", "_"), Props: map[string]any{"Label": "Caller label", "Title": "Caller title", "Content": "Caller content", "Value": "caller-value", "Items": []map[string]any{{"Label": "Caller item", "Value": "caller-item"}}}}
			resolved, err := ResolveComponent(definition.Chapter, alias)
			if err != nil {
				t.Fatalf("resolve %s/%s: %v", definition.Chapter, alias, err)
			}
			if err := RenderComponent(tpl, &body, component); err != nil {
				t.Fatalf("render %s/%s: %v", definition.Chapter, alias, err)
			}
			output := body.String()
			if !strings.Contains(output, `data-interaction-kind="`+resolved.Name+`"`) || !strings.Contains(output, `data-interaction-variant="`+alias+`"`) {
				t.Fatalf("%s/%s lost kind or alias variant", definition.Chapter, alias)
			}
			if alias == "Lottie Player" && !strings.Contains(output, `data-interaction-lottie`) {
				t.Fatal("Lottie Player must render its playback host")
			}
		}
	}
}

func TestLottiePlayerEscapesInlineJSONWithoutTemplateRejection(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	animation := `{"v":"5.7.4","fr":30,"ip":0,"op":2,"w":8,"h":8,"layers":[]}`
	if err := RenderComponent(tpl, &body, Component{Chapter: "motion", Name: "Lottie Player", ID: "interaction-lottie", Props: map[string]any{"Label": "Caller animation", "Animation": animation, "Autoplay": true, "Loop": true}}); err != nil {
		t.Fatal(err)
	}
	output := body.String()
	for _, want := range []string{`data-interaction-lottie`, `data-lottie-animation`, `data-interaction-lottie-seek`, `data-interaction-lottie-progress`} {
		if !strings.Contains(output, want) {
			t.Fatalf("Lottie Player is missing %q", want)
		}
	}
	if strings.Contains(output, "ZgotmplZ") || strings.Contains(output, "<script>alert") {
		t.Fatalf("Lottie JSON was rendered unsafely: %s", output)
	}
}
