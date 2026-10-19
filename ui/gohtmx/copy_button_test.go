package ui

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestCopyButtonDefaultsOverridesAndEscaping(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	value := "<text> & \"quoted\"\n한글 📋"
	for _, tc := range []struct {
		name, label, aria, size, variant, action, iconOnly string
		props                                              map[string]any
	}{
		{"minimal", "Copy", "Copy", "icon-xs", "ghost", "copy", "true", map[string]any{"Value": value}},
		{"empty", "Copy", "Copy", "icon-xs", "ghost", "copy", "true", map[string]any{"Value": ""}},
		{"label", "Copy <label>", "Copy <label>", "default", "ghost", "copy", "false", map[string]any{"Value": value, "Label": "Copy <label>"}},
		{"title", "Copy title", "Copy title", "default", "ghost", "copy", "false", map[string]any{"Value": value, "Title": "Copy title"}},
		{"overrides", "Copy action", "Copy exact text", "sm", "outline", "custom-copy", "false", map[string]any{"Value": value, "Label": "Other label", "Title": "Other title", "ActionLabel": "Copy action", "AriaLabel": "Copy exact text", "Size": "sm", "ButtonVariant": "outline", "Action": "custom-copy"}},
		{"explicit-icon", "Copy named item", "Copy named item", "default", "ghost", "copy", "true", map[string]any{"Value": value, "Label": "Copy named item", "IconOnly": true}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "buttons", Name: "CopyButton", ID: "copy", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			nodes := copyButtonNodes(t, out.String())
			var button, tooltip, status *html.Node
			for _, node := range nodes {
				if _, ok := copyButtonAttr(node, "data-interaction-copy"); ok {
					if button != nil {
						t.Fatal("multiple controls")
					}
					button = node
				}
				if _, ok := copyButtonAttr(node, "data-interaction-copy-tooltip"); ok {
					tooltip = node
				}
				if _, ok := copyButtonAttr(node, "data-interaction-copy-status"); ok {
					if status != nil {
						t.Fatal("multiple live statuses")
					}
					status = node
				}
				if node.Data == "script" || node.Data == "label" {
					t.Fatal("caller text became markup")
				}
			}
			if button == nil || button.Data != "button" || tooltip == nil || status == nil {
				t.Fatalf("missing native control, tooltip or live status: %s", out.String())
			}
			for name, want := range map[string]string{"id": "copy-control", "type": "button", "aria-label": tc.aria, "data-size": tc.size, "data-variant": tc.variant, "data-ely-action": tc.action, "data-interaction-button-icon": "copy", "data-interaction-icon-only": tc.iconOnly, "aria-describedby": "copy-control-tooltip"} {
				if got, _ := copyButtonAttr(button, name); got != want {
					t.Errorf("%s = %q, want %q", name, got, want)
				}
			}
			if got, _ := copyButtonAttr(button, "value"); got != tc.props["Value"] {
				t.Errorf("escaped payload = %q, want %q", got, tc.props["Value"])
			}
			if copyButtonText(button) != tc.label {
				t.Errorf("visible/fallback label = %q, want %q", copyButtonText(button), tc.label)
			}
			for _, name := range []string{"aria-pressed", "aria-busy", "aria-disabled", "disabled"} {
				if _, ok := copyButtonAttr(button, name); ok {
					t.Errorf("unexpected initial %s", name)
				}
			}
			if id, _ := copyButtonAttr(tooltip, "id"); id != "copy-control-tooltip" || copyButtonText(tooltip) != "Copy" {
				t.Error("scoped tooltip lost initial Copy text")
			}
			if live, _ := copyButtonAttr(status, "aria-live"); live != "polite" || copyButtonText(status) != "" {
				t.Error("status must initially be empty and polite")
			}
		})
	}
}

func TestCopyButtonItemsUseUniqueControlsAndPreserveDisabled(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, rootDisabled := range []bool{false, true} {
		var out bytes.Buffer
		props := map[string]any{"Disabled": rootDisabled, "Items": []map[string]any{{"Value": "one"}, {"Value": "two", "Label": "Second", "Disabled": true}, {"Value": "three", "Label": "Third", "Size": "lg", "ButtonVariant": "outline"}}}
		if err := RenderComponent(tpl, &out, Component{Chapter: "buttons", Name: "CopyButton", ID: "items", Props: props}); err != nil {
			t.Fatal(err)
		}
		ids := map[string]bool{}
		var buttons []*html.Node
		for _, node := range copyButtonNodes(t, out.String()) {
			if id, ok := copyButtonAttr(node, "id"); ok {
				if ids[id] {
					t.Fatalf("duplicate id %q", id)
				}
				ids[id] = true
			}
			if _, ok := copyButtonAttr(node, "data-interaction-copy"); ok {
				buttons = append(buttons, node)
			}
		}
		if len(buttons) != 3 {
			t.Fatalf("got %d controls", len(buttons))
		}
		for i, button := range buttons {
			if _, got := copyButtonAttr(button, "disabled"); got != (rootDisabled || i == 1) {
				t.Errorf("root disabled %v, item %d disabled %v", rootDisabled, i, got)
			}
			if id, _ := copyButtonAttr(button, "id"); !strings.HasPrefix(id, "items-copy-") {
				t.Errorf("missing deterministic item id: %q", id)
			}
			if description, _ := copyButtonAttr(button, "aria-describedby"); !ids[description] {
				t.Errorf("missing item tooltip %q", description)
			}
		}
		if copyButtonText(buttons[2]) != "Third" {
			t.Error("item label lost")
		}
		if size, _ := copyButtonAttr(buttons[2], "data-size"); size != "lg" {
			t.Error("explicit item size lost")
		}
	}
}

func copyButtonNodes(t *testing.T, markup string) []*html.Node {
	t.Helper()
	root, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		t.Fatal(err)
	}
	var nodes []*html.Node
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node.Type == html.ElementNode {
			nodes = append(nodes, node)
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
	}
	visit(root)
	return nodes
}

func copyButtonAttr(node *html.Node, name string) (string, bool) {
	for _, attr := range node.Attr {
		if attr.Key == name {
			return attr.Val, true
		}
	}
	return "", false
}

func copyButtonText(node *html.Node) string {
	var result strings.Builder
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node.Type == html.TextNode {
			result.WriteString(node.Data)
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
	}
	visit(node)
	return strings.TrimSpace(result.String())
}
