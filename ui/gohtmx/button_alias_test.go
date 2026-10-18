package ui

import "testing"

func TestElyButtonVariantsRetainSharedStyles(t *testing.T) {
	for alias, shared := range map[string]string{"primary": "default", "danger": "destructive", "subtle": "secondary"} {
		for _, href := range []string{"", "/components"} {
			aliasDoc := renderSharedForm(t, "button", "Label", "Save", "Variant", alias, "Href", href, "Disabled", true)
			sharedDoc := renderSharedForm(t, "button", "Label", "Save", "Variant", shared, "Href", href, "Disabled", true)
			tag := "button"
			if href != "" {
				tag = "a"
			}
			aliasNodes, sharedNodes := formNodes(aliasDoc, tag), formNodes(sharedDoc, tag)
			if len(aliasNodes) != 1 || len(sharedNodes) != 1 {
				t.Fatalf("%s did not render one %s", alias, tag)
			}
			got, _ := formAttr(aliasNodes[0], "class")
			want, _ := formAttr(sharedNodes[0], "class")
			if got != want {
				t.Errorf("%s lost shared %s styling", alias, shared)
			}
			requireFormAttr(t, aliasNodes[0], "data-variant", alias)
			if tag == "button" {
				requireFormAttr(t, aliasNodes[0], "disabled", "")
			}
		}
	}
}
