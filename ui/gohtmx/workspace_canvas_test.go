package ui

import (
	"bytes"

	"golang.org/x/net/html"
	"strings"
	"testing"
)

func TestWorkspaceCanvasSceneCallerContract(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"InfiniteCanvas", "ToolPalette", "LayerPanel", "ColorPanel", "ConstraintsEditor", "NodeEditor", "FlowChart", "MindMap", "Whiteboard"} {
		t.Run(kind, func(t *testing.T) {
			scene := map[string]any{"width": 620, "shapes": []map[string]any{{"id": "caller", "text": "</script><script>alert(1)</script>", "x": 12, "y": 34, "w": 56, "h": 78}}, "style": map[string]any{"color": "#123456", "start": "#123456", "end": "#abcdef"}}
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "canvas", Name: kind, ID: "caller-canvas", Props: map[string]any{"CanvasScene": scene, "Disabled": true}}); err != nil {
				t.Fatal(err)
			}
			doc, err := html.Parse(strings.NewReader(out.String()))
			if err != nil {
				t.Fatal(err)
			}
			if len(formNodes(doc, "script")) != 0 {
				t.Fatal("scene must contain inert HTML only")
			}
			var found bool
			for _, n := range formNodes(doc, "span") {
				if n.FirstChild != nil && n.FirstChild.Data == "</script><script>alert(1)</script>" {
					found = true
				}
			}
			if !found {
				t.Fatal("caller text corrupted")
			}
			if !strings.Contains(out.String(), `data-ely-disabled="true"`) {
				t.Fatal("disabled boundary lost")
			}
			if kind == "ColorPanel" {
				if !strings.Contains(out.String(), `data-ely-color-picker`) || !strings.Contains(out.String(), `data-ely-gradient`) {
					t.Fatal("reusable forms absent")
				}
			}
		})
	}
}

func TestWorkspaceCanvasNestedControlIDsAreInstanceLocal(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, id := range []string{"first", "second"} {
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: "canvas", Name: "ColorPanel", ID: id, Props: map[string]any{"CanvasScene": map[string]any{"style": map[string]any{"color": "#123456", "start": "#123456", "end": "#abcdef"}}}}); err != nil {
			t.Fatal(err)
		}
		doc, err := html.Parse(strings.NewReader(out.String()))
		if err != nil {
			t.Fatal(err)
		}
		var walk func(*html.Node)
		walk = func(n *html.Node) {
			for _, attr := range n.Attr {
				if attr.Key == "id" {
					if !strings.HasPrefix(attr.Val, id) || seen[attr.Val] {
						t.Errorf("duplicate or unscoped ID %q", attr.Val)
					}
					seen[attr.Val] = true
				}
			}
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				walk(c)
			}
		}
		walk(doc)
	}
}

func TestWorkspaceCanvasUsesSharedCompactControls(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := RenderComponent(tpl, &out, Component{Chapter: "canvas", Name: "ColorPanel", ID: "styled-canvas", Props: map[string]any{"CanvasScene": map[string]any{"style": map[string]any{"color": "#f4efe6", "start": "#e9e4da", "end": "#8a7f6d"}}}}); err != nil {
		t.Fatal(err)
	}
	for _, marker := range []string{`data-ely-kind="ColorPicker"`, `data-ely-kind="GradientEditor"`, `data-ely-gradient-compact`, `data-cs-switch`, `data-slot="switch"`} {
		if !strings.Contains(out.String(), marker) {
			t.Errorf("missing supported nested control %s", marker)
		}
	}
}
