package gohtmx

import (
	"bytes"
	"strings"
	"testing"
)

func TestMultipleEventBindings(t *testing.T) {
	registry := schemaRegistry(t)
	d := Definition{Name: "actions", Template: "sdui-text", Events: []string{"ely:action"}, Properties: map[string]Property{}}
	if err := registry.Register(d); err != nil {
		t.Fatal(err)
	}
	events := []Event{{On: "ely:action", SourceAction: "edit", Action: "edit-row", Target: "root", Payload: map[string]PayloadBinding{"row": {Path: "/row/id", Type: Integer}}}, {On: "ely:action", SourceAction: "remove", Action: "remove-row", Target: "root"}}
	screen := compositionScreen(Node{ID: "menu", Type: "actions", Events: events})
	plan, err := Compile(screen, registry)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Events()) != 2 {
		t.Fatal(plan.Events())
	}
	snapshot := plan.Events()
	snapshot[0].Payload["row"] = PayloadBinding{Path: "/wrong", Type: String}
	if plan.Events()[0].Payload["row"].Path != "/row/id" {
		t.Fatal("mutable event snapshot")
	}
	var output bytes.Buffer
	if err := plan.Render(&output, RenderContext{}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "data-sdui-events=") || !strings.Contains(output.String(), "sourceAction") {
		t.Fatal(output.String())
	}
	for name, mutate := range map[string]func(*Node){
		"both":      func(n *Node) { n.Event = &events[0] },
		"duplicate": func(n *Node) { n.Events = append(n.Events, n.Events[0]) },
		"wildcard":  func(n *Node) { n.Events[0].SourceAction = "" },
		"reserved payload": func(n *Node) {
			n.Events[0].Payload = map[string]PayloadBinding{"_action": {Path: "/action", Type: String}}
		},
		"invalid pointer": func(n *Node) { n.Events[0].Payload = map[string]PayloadBinding{"row": {Path: "/row/~2", Type: String}} },
		"unknown type":    func(n *Node) { n.Events[0].Payload = map[string]PayloadBinding{"row": {Path: "/row", Type: "html"}} },
	} {
		t.Run(name, func(t *testing.T) {
			candidate := screen
			candidate.Root.Children = append([]Node(nil), screen.Root.Children...)
			candidate.Root.Children[0].Events = append([]Event(nil), events...)
			mutate(&candidate.Root.Children[0])
			if _, err := Compile(candidate, registry); err == nil {
				t.Fatal("accepted")
			}
		})
	}
}
