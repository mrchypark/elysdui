package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestDataReviewTreeInitialSelection(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"Tree", "FileTree"} {
		t.Run(kind, func(t *testing.T) {
			var out bytes.Buffer
			if err := tpl.ExecuteTemplate(&out, "ely-api-data", map[string]any{
				"Chapter": "lists", "Kind": kind,
				"Items": []map[string]any{
					{"Value": "folder", "Label": "Folder", "Folder": true, "Selected": true, "Open": true,
						"Children": []map[string]any{{"Value": "child", "Label": "Child", "Selected": true}}},
					{"Value": "other", "Label": "Other"},
				},
			}); err != nil {
				t.Fatal(err)
			}
			body := out.String()
			if got := strings.Count(body, `role="treeitem" aria-selected="true"`); got != 2 {
				t.Fatalf("selected folder and child must retain owner selection: got %d; %s", got, body)
			}
			if got := strings.Count(body, `role="treeitem" aria-selected="false"`); got != 1 {
				t.Fatalf("unspecified selection must default to false: got %d; %s", got, body)
			}
		})
	}
}

func TestDataReviewDirectoryNameExcludesIcon(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := tpl.ExecuteTemplate(&out, "ely-api-data", map[string]any{
		"Chapter": "lists", "Kind": "DirectoryListing",
		"Items": []map[string]any{{"Label": `<Alpha>.txt`, "Icon": "Z", "Value": "alpha"}},
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), `data-ely-directory-name="&lt;Alpha&gt;.txt"`) {
		t.Fatalf("directory sort key must contain only the escaped caller label: %s", out.String())
	}
}
