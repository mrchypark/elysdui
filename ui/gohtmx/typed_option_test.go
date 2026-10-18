package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestIconPickerAcceptsTypedCallerOptions(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	err = RenderComponent(tpl, &output, Component{Chapter: "forms", Name: "IconPicker", ID: "typed-icons", Props: map[string]any{
		"Name": "icon", "Value": "caller-key", "Label": "Choose icon",
		"Options": []Option{{Value: "caller-key", Label: "Activity", Icon: "activity"}, {Value: "other-key", Label: "Other", Glyph: "☆", Disabled: true}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`name="icon"`, `value="caller-key"`, `data-ely-icon-glyph="activity"`, `data-ely-icon-label="☆"`, `disabled`} {
		if !strings.Contains(output.String(), want) {
			t.Errorf("typed caller option lost %s", want)
		}
	}
}

func TestRegionalPickerAcceptsTypedCallerOptions(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	err = RenderComponent(tpl, &output, Component{Chapter: "forms", Name: "CountrySelect", ID: "typed-regions", Props: map[string]any{"Name": "country", "Value": "CN", "Options": []Option{{Value: "CN", Label: "China", Note: "CN", Keywords: "中国"}}}})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`data-ui-label="China"`, `data-ui-search="CN 中国"`, `name="country"`} {
		if !strings.Contains(output.String(), want) {
			t.Errorf("typed regional option lost %s", want)
		}
	}
}
