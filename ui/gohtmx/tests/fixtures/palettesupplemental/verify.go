package palettesupplemental

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mrchypark/elysdui/ui/gohtmx/tests/fixtures/palettefixture"
	"golang.org/x/net/html"
)

func attr(n *html.Node, key string) string {
	if n != nil {
		for _, a := range n.Attr {
			if a.Key == key {
				return a.Val
			}
		}
	}
	return ""
}
func has(n *html.Node, key string) bool {
	if n != nil {
		for _, a := range n.Attr {
			if a.Key == key {
				return true
			}
		}
	}
	return false
}
func find(n *html.Node, predicate func(*html.Node) bool) []*html.Node {
	result := []*html.Node{}
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node.Type == html.ElementNode && predicate(node) {
			result = append(result, node)
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
	}
	if n != nil {
		visit(n)
	}
	return result
}
func textContent(n *html.Node) string {
	if n == nil {
		return ""
	}
	if n.Type == html.TextNode {
		return n.Data
	}
	var out strings.Builder
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		out.WriteString(textContent(child))
	}
	return out.String()
}
func contains(parent, child *html.Node) bool {
	for n := child; n != nil; n = n.Parent {
		if n == parent {
			return true
		}
	}
	return false
}

// Inspect verifies real server output, not runtime focus, filtering, event
// delivery or HTMX replacement. Browser evidence must establish those separately.
func Inspect(markup, surface string, fragment bool, identities []palettefixture.Identity) error {
	if surface != "go-qualified" && surface != "go-chapter" && surface != "sdui" {
		return fmt.Errorf("unknown supplemental surface %q", surface)
	}
	doc, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		return err
	}
	ids := map[string]*html.Node{}
	for _, n := range find(doc, func(*html.Node) bool { return true }) {
		if id := attr(n, "id"); id != "" {
			if ids[id] != nil {
				return fmt.Errorf("duplicate ID %s", id)
			}
			ids[id] = n
		}
		for _, a := range n.Attr {
			if strings.HasPrefix(a.Key, "on") {
				return fmt.Errorf("inline handler %s", a.Key)
			}
		}
	}
	specs := []palettefixture.Spec{palettefixture.Primary("original"), palettefixture.Peer()}
	if fragment {
		specs = []palettefixture.Spec{palettefixture.Primary("fresh")}
	}
	if len(identities) != 2 {
		return fmt.Errorf("expected primary and peer identities")
	}
	roots := find(doc, func(n *html.Node) bool { return has(n, "data-ely-family") })
	if len(roots) != len(specs) {
		return fmt.Errorf("family root count %d", len(roots))
	}
	if len(find(doc, func(n *html.Node) bool { return has(n, "data-fixture-owner") })) != len(specs) {
		return fmt.Errorf("fixture owner count")
	}
	for i, spec := range specs {
		identity := identities[i]
		wrapper := ids[spec.OwnerID]
		family := ids[identity.FamilyID]
		dialog := ids[identity.DialogID]
		if wrapper == nil || wrapper.Data != "div" || attr(wrapper, "data-fixture-owner") != spec.OwnerID || attr(wrapper, "data-fixture-generation") != spec.Generation {
			return fmt.Errorf("%s: wrapper", spec.OwnerID)
		}
		if identity.OwnerID != spec.OwnerID || family == nil || family.Data != "section" || attr(family, "data-ely-component") != "navigation/CommandPalette" || attr(family, "data-ely-family") != "interaction" || attr(family, "data-ely-kind") != "CommandPalette" || !contains(wrapper, family) {
			return fmt.Errorf("%s: production family root", spec.OwnerID)
		}
		if dialog == nil || dialog.Data != "dialog" || !has(dialog, "data-interaction-palette") || has(dialog, "open") || !contains(family, dialog) {
			return fmt.Errorf("%s: palette dialog", spec.OwnerID)
		}
		triggers := find(family, func(n *html.Node) bool { return has(n, "data-interaction-dialog") })
		if len(triggers) != 1 || triggers[0].Data != "button" || attr(triggers[0], "data-interaction-dialog") != identity.DialogID || has(triggers[0], "disabled") {
			return fmt.Errorf("%s: generated opener", spec.OwnerID)
		}
		inputs := find(dialog, func(n *html.Node) bool { return n.Data == "input" })
		if len(inputs) != 1 || attr(inputs[0], "id") != identity.FamilyID+"-palette-query" || attr(inputs[0], "aria-controls") != identity.FamilyID+"-palette-results" || has(inputs[0], "aria-activedescendant") || attr(inputs[0], "type") != "search" || attr(inputs[0], "name") != spec.QueryName || attr(inputs[0], "value") != "" || attr(inputs[0], "aria-label") != "Command search" || attr(inputs[0], "placeholder") != "Type a command" || !has(inputs[0], "data-interaction-filter") || has(inputs[0], "disabled") {
			return fmt.Errorf("%s: query input", spec.OwnerID)
		}
		if inputs[0].Parent.Data != "form" || attr(inputs[0].Parent, "data-ely-submit") != "run" {
			return fmt.Errorf("%s: production query form", spec.OwnerID)
		}
		lists := find(dialog, func(n *html.Node) bool { return has(n, "data-interaction-palette-results") })
		if len(lists) != 1 || attr(lists[0], "id") != identity.FamilyID+"-palette-results" || !has(lists[0], "data-interaction-roving") || lists[0].Data != "ul" || attr(lists[0], "role") != "listbox" || attr(lists[0], "aria-label") != "Command search" {
			return fmt.Errorf("%s: result list", spec.OwnerID)
		}
		options := find(lists[0], func(n *html.Node) bool { return has(n, "data-interaction-palette-option") })
		values := []string{"open-file", "option-file", "other-place", "disabled-open", "zebra-file"}
		if spec.Peer {
			values = []string{"peer-open", "peer-option", "peer-other", "peer-disabled", "peer-zebra"}
		}
		labels := []string{"Open", "Option", "Other place", "Open disabled", "Zebra"}
		actions := []string{"open-command", "option-command", "other-command", "disabled-command", "zebra-command"}
		for entry := 1; entry <= 40; entry++ {
			value := fmt.Sprintf("entry-%02d", entry)
			if spec.Peer {
				value = "peer-" + value
			}
			values = append(values, value)
			labels = append(labels, fmt.Sprintf("Entry %02d", entry))
			actions = append(actions, "entry-command")
		}
		if len(options) != 45 {
			return fmt.Errorf("%s: option count %d", spec.OwnerID, len(options))
		}
		for index, option := range options {
			if attr(option, "id") != fmt.Sprintf("%s-palette-option-%d", identity.FamilyID, index) || option.Parent.Data != "li" || option.Parent.Parent != lists[0] || option.Data != "button" || attr(option, "type") != "button" || attr(option, "role") != "option" || attr(option, "value") != values[index] || attr(option, "data-ely-action") != actions[index] || attr(option, "data-interaction-palette-group") != "Commands" || has(option, "disabled") != (index == 3 || index == 11) || attr(option, "aria-selected") != "false" || textContent(option) != labels[index] || has(option, "hidden") || has(option.Parent, "hidden") {
				return fmt.Errorf("%s: option %d payload/semantics", spec.OwnerID, index)
			}
		}
		if surface == "sdui" {
			screen := ids[identity.ScreenID]
			node := ids[identity.NodeID]
			result := ids[identity.ResultID]
			if screen == nil || attr(screen, "data-sdui-screen") != identity.ScreenID || attr(screen, "data-sdui-endpoint") != "/sdui-action" || attr(screen, "data-sdui-csrf") != "palette-query-fixture" || !contains(wrapper, screen) || !contains(screen, node) || !contains(node, family) || attr(node, "data-sdui-node") != "navigation/CommandPalette" || result == nil || attr(result, "data-sdui-region") != identity.ResultID || !contains(screen, result) {
				return fmt.Errorf("%s: compiled SDUI ownership", spec.OwnerID)
			}
			var events []struct {
				On, Action, Target, SourceAction string
				Payload                          map[string]struct{ Path, Type string }
			}
			if err := json.Unmarshal([]byte(attr(node, "data-sdui-events")), &events); err != nil {
				return err
			}
			if len(events) != 6 {
				return fmt.Errorf("%s: compiled event count", spec.OwnerID)
			}
			for index, event := range events {
				if event.On != "ely:action" || event.Action != "command-observed" || event.Target != identity.ResultID || event.SourceAction != []string{"open-command", "option-command", "other-command", "disabled-command", "zebra-command", "entry-command"}[index] || len(event.Payload) != 4 {
					return fmt.Errorf("%s: compiled event routing", spec.OwnerID)
				}
				for name, path := range map[string]string{"commandAction": "/action", "commandValue": "/value", "ownerID": "/id", "component": "/component"} {
					if event.Payload[name].Path != path || event.Payload[name].Type != "string" {
						return fmt.Errorf("%s: typed payload %s", spec.OwnerID, name)
					}
				}
			}
		} else if identity.ScreenID != "" || len(find(wrapper, func(n *html.Node) bool { return has(n, "data-sdui-screen") || has(n, "data-sdui-node") })) != 0 {
			return fmt.Errorf("standalone fixture imported SDUI structure")
		}
	}
	scripts := find(doc, func(n *html.Node) bool { return n.Data == "script" })
	if fragment {
		if strings.Contains(markup, "<!doctype") || len(scripts) != 0 || ids["palette-peer"] != nil || ids["palette-owner-result"] != nil {
			return fmt.Errorf("fragment includes page shell")
		}
		return nil
	}
	expectedScripts := []string{"/fixture-observer.js", "/assets/htmx.min.js", "/assets/ely-controls.js", "/assets/ely-patterns.js", "/assets/ely-api-interaction-entry.js"}
	if surface == "sdui" {
		expectedScripts = append(expectedScripts, "/assets/sdui.js")
	}
	expectedScripts = append(expectedScripts, "/supplemental-observer.js")
	if len(scripts) != len(expectedScripts) {
		return fmt.Errorf("script count %d", len(scripts))
	}
	for index, src := range expectedScripts {
		if attr(scripts[index], "src") != src || strings.TrimSpace(textContent(scripts[index])) != "" {
			return fmt.Errorf("script order or inline behavior at %s", src)
		}
		if (src == "/fixture-observer.js" || src == "/supplemental-observer.js") && attr(scripts[index], "type") != "" {
			return fmt.Errorf("observer must be an early classic script")
		}
		if src == "/assets/ely-api-interaction-entry.js" && attr(scripts[index], "type") != "module" {
			return fmt.Errorf("family loader module")
		}
	}
	for _, href := range []string{"/assets/app.css", "/assets/ely-api.css", "/assets/ely-api-interaction.css", "/assets/ely-controls.css", "/assets/ely-patterns.css"} {
		if len(find(doc, func(n *html.Node) bool {
			return n.Data == "link" && attr(n, "href") == href && attr(n, "rel") == "stylesheet"
		})) != 1 {
			return fmt.Errorf("stylesheet %s", href)
		}
	}
	swap := ids["palette-swap"]
	if swap == nil || swap.Data != "button" || attr(swap, "type") != "button" || attr(swap, "hx-get") != "/fragment" || attr(swap, "hx-target") != "#palette-primary" || attr(swap, "hx-swap") != "outerHTML" {
		return fmt.Errorf("real HTMX swap source")
	}
	if outside := ids["palette-outside"]; outside == nil || outside.Data != "button" || attr(outside, "type") != "button" {
		return fmt.Errorf("outside button")
	}
	if result := ids["palette-owner-result"]; result == nil || result.Data != "output" {
		return fmt.Errorf("owner result output")
	}
	return nil
}
