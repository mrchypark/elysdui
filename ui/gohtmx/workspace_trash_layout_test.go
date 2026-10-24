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
		"[data-ely-family='workspace'] [data-ws-trash] [data-ws-trash-confirm]{display:inline-grid;grid-template-columns:max-content;align-items:center;justify-items:center}",
		"[data-ely-family='workspace'] [data-ws-trash] [data-ws-trash-label],[data-ely-family='workspace'] [data-ws-trash] [data-ws-trash-confirm]::after{grid-area:1/1;font:inherit;letter-spacing:inherit;white-space:inherit}",
		"[data-ely-family='workspace'] [data-ws-trash] [data-ws-trash-confirm]::after{content:attr(data-ws-trash-confirm-label);visibility:hidden}",
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
		for _, want := range []string{strings.ReplaceAll(strings.ReplaceAll(path, "<", "&lt;"), ">", "&gt;"), `<span data-ws-trash-label>Empty trash</span>`, ">Restore</button>", `<span data-ws-trash-label>Delete</span>`, `data-ws-trash-confirm-label="Confirm empty trash"`, `data-ws-trash-confirm-label="Confirm delete"`, `data-ely-action="restore-file"`, `data-ely-action="delete-file-permanently"`, `value="caller-deleted"`} {
			if !strings.Contains(got, want) {
				t.Errorf("caller content/action lost: %s", want)
			}
		}
	}
}

func TestTrashConfirmationLabelsRetainDisabledCallerContract(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	props := map[string]any{"Disabled": true, "Deleted": []map[string]any{{"ID": "caller-safe", "Path": "docs/<caller>.md"}}}
	if err := RenderComponent(tpl, &out, Component{Chapter: "documents", Name: "TrashBin", ID: "disabled-trash", Props: props}); err != nil {
		t.Fatal(err)
	}
	got := out.String()
	for _, want := range []string{`data-ely-action="empty-trash" disabled><span data-ws-trash-label>Empty trash</span>`, `data-ely-action="restore-file" value="caller-safe" disabled>Restore</button>`, `data-ely-action="delete-file-permanently" value="caller-safe" disabled><span data-ws-trash-label>Delete</span>`, "docs/&lt;caller&gt;.md"} {
		if !strings.Contains(got, want) {
			t.Errorf("disabled caller contract lost: %s", want)
		}
	}
}
