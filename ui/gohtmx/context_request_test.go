package ui_test

import (
	"bytes"
	"fmt"
	"math"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestContextRequestStandaloneRender(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, qualified := range []bool{false, true} {
		for _, number := range []string{"0", "9007199254740992", "9007199254740993", "18446744073709551615"} {
			for _, xy := range [][2]float64{{0, 0}, {-1, 12.5}, {1e300, -1e300}, {math.MaxFloat64, -math.MaxFloat64}} {
				t.Run(fmt.Sprintf("%v/%s/%g", qualified, number, xy[0]), func(t *testing.T) {
					c := ui.Component{Chapter: "menus", Name: "ContextMenu", ID: "context-owner", Props: map[string]any{"ContextMode": "manual", "ContextRequest": map[string]any{"Number": number, "X": xy[0], "Y": xy[1]}, "Label": "Commands <safe>", "Content": "<unsafe>", "ActionLabel": "Open", "Items": []any{}}}
					if qualified {
						c.Chapter = ""
						c.Name = "menus/ContextMenu"
					}
					var out bytes.Buffer
					if err := ui.RenderComponent(tpl, &out, c); err != nil {
						t.Fatal(err)
					}
					for _, want := range []string{`data-ely-context-mode="manual"`, `data-ely-context-number="` + number + `"`, `data-ely-context-x="`, `data-ely-context-y="`, `tabindex="-1" hidden`, `Commands &lt;safe&gt;`, `&lt;unsafe&gt;`} {
						if !strings.Contains(out.String(), want) {
							t.Errorf("missing %s in %s", want, out.String())
						}
					}
				})
			}
		}
	}
}

func TestContextRequestStandaloneModesAndInvalidInputs(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	render := func(props map[string]any) (string, error) {
		var out bytes.Buffer
		err := ui.RenderComponent(tpl, &out, ui.Component{Chapter: "menus", Name: "ContextMenu", ID: "context-owner", Props: props})
		return out.String(), err
	}
	for _, props := range []map[string]any{{}, {"ContextRequest": nil}, {"ContextRequest": map[string]any(nil)}, {"ContextMode": "manual"}, {"ContextMode": "manual", "ContextRequest": nil}, {"ContextMode": "automatic", "ContextRequest": map[string]any{"Number": "0", "X": 0, "Y": 0}}} {
		out, err := render(props)
		if err != nil {
			t.Fatal(err)
		}
		mode := "automatic"
		if props["ContextMode"] == "manual" {
			mode = "manual"
		}
		if !strings.Contains(out, `data-ely-context-mode="`+mode+`"`) {
			t.Fatalf("missing mode %s", out)
		}
		if request, ok := props["ContextRequest"].(map[string]any); !ok || request == nil {
			if strings.Contains(out, "data-ely-context-number=") {
				t.Fatalf("absent request was serialized: %s", out)
			}
		}
	}
	for _, mode := range []any{"", nil, true, 0, "owner", "Manual"} {
		if _, err := render(map[string]any{"ContextMode": mode}); err == nil {
			t.Errorf("accepted mode %#v", mode)
		}
	}
	invalid := []any{false, "", 0, []any{}, map[string]any{}, map[string]any{"Number": "1", "X": 0}, map[string]any{"Number": "1", "X": 0, "Y": 0, "Extra": true}, map[string]any{"Number": 1, "X": 0, "Y": 0}}
	for _, number := range []string{"", "00", "01", "-1", "+1", " 1", "1 ", "1.0", "1e1", "1\n", "1\r", "1\r\n", "1\u2028", "1\u2029", "18446744073709551615\n", "١", "18446744073709551616", "999999999999999999999"} {
		invalid = append(invalid, map[string]any{"Number": number, "X": 0, "Y": 0})
	}
	for _, coord := range []any{nil, true, "0", math.NaN(), math.Inf(1), math.Inf(-1), []any{}, map[string]any{}} {
		for _, key := range []string{"X", "Y"} {
			request := map[string]any{"Number": "1", "X": 0, "Y": 0}
			request[key] = coord
			invalid = append(invalid, request)
		}
	}
	for i, request := range invalid {
		for _, mode := range []string{"automatic", "manual"} {
			if out, err := render(map[string]any{"ContextMode": mode, "ContextRequest": request}); err == nil || out != "" {
				t.Errorf("%s malformed %d accepted or non-atomic: %v %s", mode, i, err, out)
			}
		}
	}
	for _, coord := range []any{int8(-1), int16(0), int32(2), int64(3), uint(0), uint8(1), uint16(2), uint32(3), uint64(math.MaxUint64), float32(.5), float64(.25)} {
		if _, err := render(map[string]any{"ContextRequest": map[string]any{"Number": "0", "X": coord, "Y": 0}}); err != nil {
			t.Errorf("numeric Go primitive %T failed: %v", coord, err)
		}
	}
}

func TestContextRequestValidationIsExactRendererOnly(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Menu", "PieMenu", "SearchableMenu", "DropdownMenu"} {
		var out bytes.Buffer
		err := ui.RenderComponent(tpl, &out, ui.Component{Chapter: "menus", Name: name, ID: "other-menu", Props: map[string]any{"ContextMode": false, "ContextRequest": "invalid", "Label": "Menu"}})
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(out.String(), "data-ely-context-mode") || strings.Contains(out.String(), "data-ely-context-number") {
			t.Fatalf("request API leaked to %s", name)
		}
	}
}
