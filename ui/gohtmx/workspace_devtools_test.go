package ui

import (
	"bytes"
	"golang.org/x/net/html"
	"strings"
	"testing"
)

func TestWorkspaceDevtoolsCallerModels(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"ConnectionManager", "SchemaTree", "QueryEditor", "TableStructureEditor", "RedisKeyBrowser", "DocumentViewer", "ApiRequestBuilder", "WebSocketConsole", "GraphQLExplorer", "RegexTester", "ContainerList"} {
		for _, disabled := range []bool{false, true} {
			t.Run(name+map[bool]string{true: "/disabled", false: "/enabled"}[disabled], func(t *testing.T) {
				var out bytes.Buffer
				if err := RenderComponent(tpl, &out, Component{Chapter: "devtools", Name: name, ID: "caller-devtools", Props: map[string]any{"Disabled": disabled, "Devtools": map[string]any{"json": "</script><img src=x onerror=bad>", "port": 5432, "fields": []map[string]any{{"name": "caller field", "nullable": true}}}}}); err != nil {
					t.Fatal(err)
				}
				doc, err := html.Parse(strings.NewReader(out.String()))
				if err != nil {
					t.Fatal(err)
				}
				if len(formNodes(doc, "script")) != 0 || len(formNodes(doc, "img")) != 0 {
					t.Fatal("caller text became markup")
				}
				found := false
				for _, n := range formNodes(doc, "span") {
					if n.FirstChild != nil && n.FirstChild.Data == "</script><img src=x onerror=bad>" {
						found = true
					}
				}
				if !found || !strings.Contains(out.String(), `data-ws-devtools-source`) {
					t.Fatal("caller model missing")
				}
				if strings.Contains(out.String(), `<fieldset class="ely-api-disabled" disabled>`) != disabled {
					t.Fatal("disabled boundary changed")
				}
			})
		}
	}
}
