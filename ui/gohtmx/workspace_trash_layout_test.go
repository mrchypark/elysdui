package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestTrashLayoutKeepsTrackAndCallerContentWithinCard(t *testing.T) {
	css, err := Files.ReadFile("assets/ely-api-workspace.css")
	if err != nil {
		t.Fatal(err)
	}
	for _, rule := range []string{
		"[data-ely-family='workspace'] [data-ws-trash]{grid-template-columns:minmax(0,1fr);min-width:0}",
		"[data-ely-family='workspace'] [data-ws-trash] .ely-workspace__trash-head{flex-wrap:wrap}",
		"[data-ely-family='workspace'] [data-ws-trash-item]{flex-wrap:wrap}",
		"[data-ely-family='workspace'] [data-ws-trash-item]>div{flex:1 1 10rem;overflow-wrap:anywhere}",
		"[data-ely-family='workspace'] [data-ws-trash] button{flex-shrink:0}",
	} {
		if !strings.Contains(string(css), rule) {
			t.Errorf("missing non-clipping trash layout rule: %s", rule)
		}
	}
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	path := "docs/" + strings.Repeat("long-unbroken-path", 12) + "/<caller>.md"
	for _, empty := range []bool{false, true} {
		props := map[string]any{}
		if !empty {
			props["Deleted"] = []map[string]any{{"ID": "caller-deleted", "Path": path, "DeletedAt": "2026-10-09"}}
		}
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: "documents", Name: "TrashBin", ID: "caller-trash", Props: props}); err != nil {
			t.Fatal(err)
		}
		got := out.String()
		if empty {
			if !strings.Contains(got, "The trash is empty") || strings.Contains(got, "data-ws-trash-confirm") {
				t.Fatal("empty state changed")
			}
			continue
		}
		for _, want := range []string{strings.ReplaceAll(strings.ReplaceAll(path, "<", "&lt;"), ">", "&gt;"), ">Empty trash</button>", ">Restore</button>", ">Delete</button>", `data-ely-action="restore-file"`, `data-ely-action="delete-file-permanently"`, `value="caller-deleted"`} {
			if !strings.Contains(got, want) {
				t.Errorf("caller content/action lost: %s", want)
			}
		}
	}
}
