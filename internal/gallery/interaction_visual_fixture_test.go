package uiexamples

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestInteractionVisualFixturesHaveStableVisibleInitialStates(t *testing.T) {
	var tabs, lottie *ui.Component
	for _, fixture := range advancedInteractionCases() {
		component := fixture.Component
		switch component.Chapter + "/" + component.Name {
		case "navigation/Tabs":
			tabs = &component
		case "motion/Lottie Player":
			lottie = &component
		}
	}
	if tabs == nil || lottie == nil {
		t.Fatal("Tabs and Lottie Player fixtures must both be present")
	}
	if tabs.Props["Disabled"] != false || tabs.Props["Value"] != "activity" {
		t.Fatalf("Tabs initial state = disabled:%v value:%v, want enabled activity tab", tabs.Props["Disabled"], tabs.Props["Value"])
	}

	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var renderedTabs bytes.Buffer
	if err := ui.RenderComponent(tpl, &renderedTabs, *tabs); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(renderedTabs.String(), `role="tab" disabled`) || !strings.Contains(renderedTabs.String(), `value="activity"`) || !strings.Contains(renderedTabs.String(), `aria-selected="true"`) {
		t.Fatalf("Tabs fixture did not render an enabled selected tab: %s", renderedTabs.String())
	}

	animation, ok := lottie.Props["Animation"].(string)
	if !ok || lottie.Props["Autoplay"] != false || lottie.Props["Loop"] != false {
		t.Fatalf("Lottie initial state = autoplay:%v loop:%v; want both off", lottie.Props["Autoplay"], lottie.Props["Loop"])
	}
	var data map[string]any
	if err := json.Unmarshal([]byte(animation), &data); err != nil {
		t.Fatalf("Lottie fixture animation is invalid JSON: %v", err)
	}
	layers, ok := data["layers"].([]any)
	if !ok || len(layers) != 1 {
		t.Fatalf("Lottie fixture has %v layers, want one visible vector layer", data["layers"])
	}
	layer, ok := layers[0].(map[string]any)
	if !ok || layer["ty"] != float64(4) {
		t.Fatalf("Lottie fixture first layer = %v, want a shape layer", layers[0])
	}
	groups, ok := layer["shapes"].([]any)
	if !ok || len(groups) != 1 {
		t.Fatalf("Lottie shape groups = %v, want one", layer["shapes"])
	}
	group, ok := groups[0].(map[string]any)
	if !ok {
		t.Fatalf("Lottie shape group = %v, want object", groups[0])
	}
	shapes, ok := group["it"].([]any)
	if !ok {
		t.Fatalf("Lottie shape items = %v, want vector items", group["it"])
	}
	hasVisibleEllipse, hasVisibleFill := false, false
	staticVector := func(shape map[string]any, property string) ([]any, bool) {
		values, ok := shape[property].(map[string]any)
		if !ok {
			return nil, false
		}
		vector, ok := values["k"].([]any)
		return vector, ok
	}
	for _, item := range shapes {
		shape, ok := item.(map[string]any)
		if !ok {
			continue
		}
		switch shape["ty"] {
		case "el":
			size, sizeOK := staticVector(shape, "s")
			if sizeOK && len(size) == 2 {
				width, widthOK := size[0].(float64)
				height, heightOK := size[1].(float64)
				hasVisibleEllipse = widthOK && heightOK && width > 0 && height > 0
			}
		case "fl":
			color, colorOK := staticVector(shape, "c")
			opacityProperty, opacityOK := shape["o"].(map[string]any)
			if colorOK && len(color) == 4 && opacityOK {
				alpha, alphaOK := color[3].(float64)
				opacity, valueOK := opacityProperty["k"].(float64)
				hasVisibleFill = alphaOK && valueOK && alpha > 0 && opacity > 0
			}
		}
	}
	if !hasVisibleEllipse || !hasVisibleFill {
		t.Fatalf("Lottie fixture must include a positive-size ellipse with visible fill; got %v", shapes)
	}

	var renderedLottie bytes.Buffer
	if err := ui.RenderComponent(tpl, &renderedLottie, *lottie); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(renderedLottie.String(), `data-lottie-autoplay="false"`) || !strings.Contains(renderedLottie.String(), `data-lottie-loop="false"`) {
		t.Fatal("Lottie fixture rendered with autoplay or looping enabled")
	}
}
