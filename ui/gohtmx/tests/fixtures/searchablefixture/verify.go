package searchablefixture

import (
	"fmt"
	"strings"

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

func descendants(n *html.Node, predicate func(*html.Node) bool) []*html.Node {
	var result []*html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && predicate(n) {
			result = append(result, n)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	if n != nil {
		walk(n)
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
	var text strings.Builder
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		text.WriteString(textContent(c))
	}
	return text.String()
}

func ancestor(n *html.Node, predicate func(*html.Node) bool) *html.Node {
	for p := n.Parent; p != nil; p = p.Parent {
		if predicate(p) {
			return p
		}
	}
	return nil
}

func contains(parent, child *html.Node) bool {
	for n := child; n != nil; n = n.Parent {
		if n == parent {
			return true
		}
	}
	return false
}

// Inspect checks the production-rendered initial DOM, not browser filtering,
// focus, keyboard phases, event delivery, or replacement lifecycle behavior.
func Inspect(markup string, full, catalogue bool, primary Spec) error {
	doc, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		return err
	}
	if strings.Contains(markup, "<!doctype html>") != full {
		return fmt.Errorf("document/fragment shell mismatch")
	}
	if strings.Contains(markup, "<safe>") || !strings.Contains(markup, "Search commands &lt;safe&gt;") || !strings.Contains(markup, "Find commands &lt;safe&gt;") {
		return fmt.Errorf("unescaped or missing caller text")
	}
	ids := map[string]*html.Node{}
	for _, n := range descendants(doc, func(*html.Node) bool { return true }) {
		for _, a := range n.Attr {
			if strings.HasPrefix(a.Key, "on") {
				return fmt.Errorf("fixture must not add inline behavior %s", a.Key)
			}
		}
		if id := attr(n, "id"); id != "" {
			if ids[id] != nil {
				return fmt.Errorf("duplicate fixture ID %s", id)
			}
			ids[id] = n
		}
	}
	specs := []Spec{primary}
	if full {
		specs = Specs()
	}
	roots := descendants(doc, func(n *html.Node) bool { return attr(n, "data-ely-family") == "interaction" })
	if len(roots) != len(specs) {
		return fmt.Errorf("roots=%d want %d", len(roots), len(specs))
	}
	wantScreens := 0
	if catalogue {
		wantScreens = len(specs)
	}
	if screens := descendants(doc, func(n *html.Node) bool { return has(n, "data-sdui-screen") }); len(screens) != wantScreens {
		return fmt.Errorf("screens=%d want %d", len(screens), wantScreens)
	}
	for _, spec := range specs {
		owner := ids[spec.ID]
		root := owner
		if catalogue {
			if owner == nil || owner.Data != "div" || attr(owner, "data-sdui-node") != "menus/SearchableMenu" {
				return fmt.Errorf("%s: incorrect catalogue node wrapper", spec.ID)
			}
			components := descendants(owner, func(n *html.Node) bool { return has(n, "data-ely-family") })
			if len(components) != 1 || !strings.HasPrefix(attr(components[0], "id"), "sdui-internal-") {
				return fmt.Errorf("%s: incorrect internal production component", spec.ID)
			}
			root = components[0]
		}
		if root == nil || root.Data != "section" || attr(root, "data-ely-component") != "menus/SearchableMenu" || attr(root, "data-ely-family") != "interaction" || attr(root, "data-ely-kind") != "SearchableMenu" {
			return fmt.Errorf("%s: missing production SearchableMenu", spec.ID)
		}
		screen := ancestor(root, func(n *html.Node) bool { return has(n, "data-sdui-screen") })
		if catalogue {
			if screen == nil || attr(screen, "id") != spec.ID+"-screen" || attr(screen, "data-sdui-screen") != spec.ID+"-screen" {
				return fmt.Errorf("%s: incorrect catalogue screen ownership", spec.ID)
			}
		} else if screen != nil {
			return fmt.Errorf("%s: standalone output has an SDUI wrapper", spec.ID)
		}
		if full {
			slot := ids["fixture-slot-"+spec.ID]
			if slot == nil || slot.Data != "div" || attr(slot, "data-fixture-slot") != spec.ID || !contains(slot, root) || !contains(ids["host-form"], root) {
				return fmt.Errorf("%s: incorrect slot/form ownership", spec.ID)
			}
		}
		if err := inspectRoot(root, ids, spec); err != nil {
			return fmt.Errorf("%s: %w", spec.ID, err)
		}
	}
	if full {
		return inspectShell(doc, ids)
	}
	if len(descendants(doc, func(n *html.Node) bool {
		return has(n, "data-fixture-slot") || n.Data == "script" || n.Data == "link" || n.Data == "style"
	})) != 0 {
		return fmt.Errorf("fragment contains document-only shell markup")
	}
	return nil
}

func inspectRoot(root *html.Node, ids map[string]*html.Node, spec Spec) error {
	if attr(root, "data-ely-disabled") == "true" || len(descendants(root, func(n *html.Node) bool { return n.Data == "fieldset" })) != 0 {
		return fmt.Errorf("search root must remain enabled")
	}
	panelID := attr(root, "id") + "-search-menu"
	panel := ids[panelID]
	if panel == nil || panel.Data != "div" || !contains(root, panel) || attr(panel, "role") != "menu" || !has(panel, "data-interaction-search-menu") || !has(panel, "hidden") {
		return fmt.Errorf("incorrect search panel")
	}
	if len(descendants(root, func(n *html.Node) bool { return attr(n, "role") == "menu" })) != 1 {
		return fmt.Errorf("incorrect search panel count")
	}
	triggers := descendants(root, func(n *html.Node) bool { return has(n, "data-interaction-menu") })
	if len(triggers) != 1 {
		return fmt.Errorf("triggers=%d want 1", len(triggers))
	}
	trigger := triggers[0]
	if trigger.Data != "button" || attr(trigger, "type") != "button" || attr(trigger, "aria-controls") != panelID || attr(trigger, "data-interaction-menu") != panelID || attr(trigger, "aria-expanded") != "false" || has(trigger, "disabled") || has(trigger, "hidden") || has(trigger, "data-ely-action") || textContent(trigger) != "Search commands <safe> ⌄" {
		return fmt.Errorf("incorrect search trigger semantics")
	}
	icons := descendants(trigger, func(n *html.Node) bool { return attr(n, "data-interaction-icon") == "search" })
	if len(icons) != 1 || attr(icons[0], "aria-hidden") != "true" {
		return fmt.Errorf("incorrect trigger icon")
	}
	inputs := descendants(root, func(n *html.Node) bool { return n.Data == "input" || has(n, "data-interaction-filter") })
	if len(inputs) != 1 {
		return fmt.Errorf("search inputs=%d want 1", len(inputs))
	}
	input := inputs[0]
	if input.Data != "input" || !contains(panel, input) || attr(input, "type") != "search" || !has(input, "data-interaction-filter") || attr(input, "aria-label") != "Find commands <safe>" || attr(input, "placeholder") != "Find commands <safe>" || attr(input, "value") != "root-query" || has(input, "disabled") || has(input, "hidden") || has(input, "data-ely-action") {
		return fmt.Errorf("incorrect accessible search input or root query")
	}
	type expectedRow struct {
		value, label, action string
		disabled             bool
	}
	// Independent of GoRows and the adapter's authored JSON, including order.
	expected := []expectedRow{
		{"hidden", "Unrelated", "hidden-action", false},
		{"off", "Alpha blocked", "blocked-action", true},
		{"alpha-one", "Alpha one", "choose-one", false},
		{"alpha-two", "Alpha two", "choose-two", false},
	}
	if spec.Rows == "empty" {
		expected = nil
	} else if spec.Rows == "alloff" {
		expected = expected[1:2]
	}
	rows := descendants(panel, func(n *html.Node) bool { return strings.HasPrefix(attr(n, "role"), "menuitem") })
	if len(rows) != len(expected) {
		return fmt.Errorf("rows=%d want %d", len(rows), len(expected))
	}
	for i, want := range expected {
		row := rows[i]
		if row.Data != "button" || attr(row, "type") != "button" || attr(row, "role") != "menuitem" || attr(row, "tabindex") != "-1" || attr(row, "value") != want.value || attr(row, "data-ely-action") != want.action || !has(row, "data-interaction-menu-action") || has(row, "disabled") != want.disabled {
			return fmt.Errorf("row %d: incorrect value/action/role/disabled contract", i)
		}
		if has(row, "hidden") || has(row.Parent, "hidden") || has(row, "aria-checked") || has(row, "data-interaction-checkbox") || has(row, "data-interaction-menu-radio") || has(row, "data-interaction-menu") || has(row, "aria-controls") {
			return fmt.Errorf("%s: unexpected selection, submenu, or fixture filtering", want.value)
		}
		labels := descendants(row, func(n *html.Node) bool { return has(n, "data-interaction-menu-label") })
		if len(labels) != 1 || textContent(labels[0]) != want.label {
			return fmt.Errorf("%s: incorrect row label", want.value)
		}
	}
	headings := descendants(panel, func(n *html.Node) bool { return strings.Contains(attr(n, "class"), "ely-interaction__menu-heading") })
	if spec.Rows == "" {
		if len(headings) != 1 || textContent(headings[0]) != "Commands <safe>" {
			return fmt.Errorf("incorrect escaped heading")
		}
	} else if len(headings) != 0 {
		return fmt.Errorf("empty/all-disabled fixture gained a heading")
	}
	return nil
}

func inspectShell(doc *html.Node, ids map[string]*html.Node) error {
	for _, id := range []string{"before", "after", "swap-source"} {
		n := ids[id]
		if n == nil || n.Data != "button" || attr(n, "type") != "button" || has(n, "hidden") || has(n, "disabled") || has(n, "data-ely-action") {
			return fmt.Errorf("missing plain shell button %s", id)
		}
	}
	if ancestor(ids["swap-source"], func(n *html.Node) bool {
		return has(n, "data-ely-family") || has(n, "data-fixture-slot") || n.Data == "form"
	}) != nil {
		return fmt.Errorf("swap source must remain external to replaceable roots and form")
	}
	form := ids["host-form"]
	if form == nil || form.Data != "form" {
		return fmt.Errorf("missing caller form")
	}
	scopes := descendants(form, func(n *html.Node) bool { return n.Data == "input" && attr(n, "name") == "scope" })
	if len(scopes) != 1 || attr(scopes[0], "type") != "hidden" || attr(scopes[0], "value") != "caller-value" {
		return fmt.Errorf("incorrect caller form payload")
	}
	if len(descendants(doc, func(n *html.Node) bool { return has(n, "data-fixture-slot") })) != 4 {
		return fmt.Errorf("incorrect fixture slot count")
	}
	for _, href := range []string{"/assets/app.css", "/assets/ely-api.css", "/assets/ely-api-interaction.css"} {
		if len(descendants(doc, func(n *html.Node) bool {
			return n.Data == "link" && attr(n, "rel") == "stylesheet" && attr(n, "href") == href
		})) != 1 {
			return fmt.Errorf("missing production stylesheet %s", href)
		}
	}
	scripts := descendants(doc, func(n *html.Node) bool { return n.Data == "script" })
	if len(scripts) != 2 {
		return fmt.Errorf("only the two production script entries are allowed")
	}
	for i, src := range []string{"/assets/htmx.min.js", "/assets/ely-api-interaction-entry.js"} {
		if attr(scripts[i], "src") != src || strings.TrimSpace(textContent(scripts[i])) != "" || i == 1 && attr(scripts[i], "type") != "module" {
			return fmt.Errorf("incorrect production script %s or inline behavior", src)
		}
	}
	if len(descendants(doc, func(n *html.Node) bool {
		return n.Data == "link" && attr(n, "rel") == "icon" && attr(n, "href") == "data:,"
	})) != 1 {
		return fmt.Errorf("missing data favicon")
	}
	return nil
}
