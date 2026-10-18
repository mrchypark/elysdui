package sduicatalogue

import (
	"reflect"
	"testing"
)

func TestContextRequestAnnotationIsExactAndPreservesExistingContract(t *testing.T) {
	original := Property{Type: "array", Target: "Items", Items: &Property{Type: "object", Properties: map[string]Property{"label": {Type: "string", Target: "Label"}}}}
	for _, identity := range []Contract{
		{Name: "menus/ContextMenu", Chapter: "menus", Component: "ContextMenu"},
		{Name: "menus/PieMenu", Chapter: "menus", Component: "PieMenu", Primary: "ContextMenu"},
		{Name: "menus/SearchableMenu", Chapter: "menus", Component: "SearchableMenu"},
		{Name: "other/ContextMenu", Chapter: "other", Component: "ContextMenu"},
		{Name: "menus/ContextMenu", Chapter: "menus", Component: "PieMenu"},
	} {
		t.Run(identity.Name+"/"+identity.Component, func(t *testing.T) {
			identity.Properties = map[string]Property{"items": original}
			identity.Events = []string{"click", "change", "ely:action", "ely:change"}
			identity.Excluded = []Exclusion{{Path: "HTML", Reason: "test exclusion"}}
			applyContextRequestContract(&identity)
			if !reflect.DeepEqual(identity.Properties["items"], original) || !reflect.DeepEqual(identity.Events, []string{"click", "change", "ely:action", "ely:change"}) || !reflect.DeepEqual(identity.Excluded, []Exclusion{{Path: "HTML", Reason: "test exclusion"}}) {
				t.Fatal("annotation changed existing rows, events or exclusions")
			}
			want := 1
			if identity.Name == "menus/ContextMenu" && identity.Chapter == "menus" && identity.Component == "ContextMenu" {
				want = 3
				assertContextRequestContract(t, identity)
			}
			if len(identity.Properties) != want {
				t.Fatalf("annotation changed %s beyond exact scope: %+v", identity.Name, identity.Properties)
			}
		})
	}
}

func assertContextRequestContract(t *testing.T, c Contract) {
	t.Helper()
	mode := c.Properties["contextMode"]
	if mode.Type != "string" || mode.Target != "ContextMode" || mode.Required || mode.Nullable || !reflect.DeepEqual(mode.Enum, []string{"automatic", "manual"}) {
		t.Fatalf("invalid ContextMode contract: %+v", mode)
	}
	request := c.Properties["contextRequest"]
	if request.Type != "object" || request.Target != "ContextRequest" || !request.Nullable || request.Required || request.AdditionalProperties != nil || len(request.Properties) != 3 {
		t.Fatalf("request must be optional, nullable and closed: %+v", request)
	}
	for key, want := range map[string]Property{
		"number": {Type: "string", Target: "Number", Required: true, Format: "context-request-number", MaxLength: 20},
		"x":      {Type: "number", Target: "X", Required: true},
		"y":      {Type: "number", Target: "Y", Required: true},
	} {
		if !reflect.DeepEqual(request.Properties[key], want) {
			t.Errorf("request.%s = %+v, want %+v", key, request.Properties[key], want)
		}
	}
}

func TestContextRequestGeneratedContractIsExact(t *testing.T) {
	manifest, _, err := Build()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range manifest.Contracts {
		if c.Name == "menus/ContextMenu" {
			found = true
			assertContextRequestContract(t, c)
			continue
		}
		for _, key := range []string{"contextMode", "contextRequest"} {
			if _, exists := c.Properties[key]; exists {
				t.Errorf("%s gained %s", c.Name, key)
			}
		}
	}
	if !found {
		t.Fatal("exact ContextMenu contract not found")
	}
}
