package pointerfixture

import (
	"fmt"
	"strings"

	"golang.org/x/net/html"
)

// ExpectedRole describes the production alias semantics, not an override in the
// fixture. CheckboxMenuItem and RadioMenuItem both inherit checkbox semantics
// for root leaves with Radio:false. Child panels do not inherit that default.
func ExpectedRole(alias, value string) string {
	switch value {
	case "branch", "off-branch", "empty-child", "alloff-child":
		return "menuitem"
	case "radio-a", "radio-b", "child-radio-a", "child-radio-b":
		return "menuitemradio"
	case "check":
		return "menuitemcheckbox"
	case "first", "plain", "off", "last":
		if alias == "CheckboxMenuItem" || alias == "RadioMenuItem" {
			return "menuitemcheckbox"
		}
	}
	return "menuitem"
}

type expectedRow struct {
	value, label, action, parent string
	disabled, selected           bool
	childIndex                   int
}

// This oracle is independent of both GoRows and the adapter's literal JSON.
func expectedRows(kind string) []expectedRow {
	if kind == "empty" {
		return nil
	}
	off := expectedRow{value: "off", label: "Unavailable", action: "blocked", disabled: true, childIndex: -1}
	if kind == "alloff" {
		return []expectedRow{off}
	}
	return []expectedRow{
		{value: "first", label: "First <safe>", action: "first-action", childIndex: -1},
		{value: "plain", label: "Plain", action: "plain-action", childIndex: -1},
		{value: "check", label: "Checkbox", action: "check-action", childIndex: -1},
		{value: "radio-a", label: "Comfortable", action: "density", selected: true, childIndex: -1},
		{value: "radio-b", label: "Compact", action: "density", childIndex: -1},
		{value: "branch", label: "Branch", childIndex: 6},
		{value: "child-first", label: "Child first", action: "child-action", parent: "branch", childIndex: -1},
		{value: "child-plain", label: "Child plain", action: "child-plain-action", parent: "branch", childIndex: -1},
		{value: "child-radio-a", label: "Child comfortable", action: "density", parent: "branch", selected: true, childIndex: -1},
		{value: "child-radio-b", label: "Child compact", action: "density", parent: "branch", childIndex: -1},
		off,
		{value: "off-branch", label: "Unavailable branch", disabled: true, childIndex: 8},
		{value: "off-child", label: "Unavailable child", action: "blocked", parent: "off-branch", disabled: true, childIndex: -1},
		{value: "empty-child", label: "Empty child", childIndex: 9},
		{value: "alloff-child", label: "All unavailable child", childIndex: 10},
		{value: "alloff-child-off", label: "Unavailable descendant", action: "blocked", parent: "alloff-child", disabled: true, childIndex: -1},
		{value: "last", label: "Last", action: "last-action", childIndex: -1},
	}
}

func attr(n *html.Node, key string) string {
	if n == nil {
		return ""
	}
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
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
func isMenu(n *html.Node) bool { return attr(n, "role") == "menu" }
func contains(parent, child *html.Node) bool {
	for n := child; n != nil; n = n.Parent {
		if n == parent {
			return true
		}
	}
	return false
}

// Inspect validates renderer provenance and the exact initial DOM contract. It
// does not claim that pointer events, focus, geometry, or lifecycle behavior ran.
func Inspect(markup string, full, catalogue bool, primary Spec) error {
	doc, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		return err
	}
	ids := map[string]*html.Node{}
	for _, n := range descendants(doc, func(*html.Node) bool { return true }) {
		if n.Data == "safe" {
			return fmt.Errorf("unescaped caller label")
		}
		if id := attr(n, "id"); id != "" {
			if ids[id] != nil {
				return fmt.Errorf("duplicate fixture ID %s", id)
			}
			ids[id] = n
		}
	}
	if strings.Contains(markup, "<!doctype html>") != full {
		return fmt.Errorf("document/fragment shell mismatch")
	}
	if !strings.Contains(markup, "Pointer commands &lt;safe&gt;") {
		return fmt.Errorf("escaped owner label is missing")
	}
	specs := []Spec{primary}
	if full {
		specs = Specs(primary.Component)
	}
	roots := descendants(doc, func(n *html.Node) bool { return attr(n, "data-ely-family") == "interaction" })
	if len(roots) != len(specs) {
		return fmt.Errorf("roots=%d want %d", len(roots), len(specs))
	}
	screens := descendants(doc, func(n *html.Node) bool { return has(n, "data-sdui-screen") })
	wantScreens := 0
	if catalogue {
		wantScreens = len(specs)
	}
	if len(screens) != wantScreens {
		return fmt.Errorf("screens=%d want %d", len(screens), wantScreens)
	}
	for _, spec := range specs {
		owner := ids[spec.ID]
		root := owner
		if catalogue {
			if owner == nil || owner.Data != "div" || attr(owner, "data-sdui-node") != "menus/"+spec.Component {
				return fmt.Errorf("%s: incorrect catalogue node wrapper", spec.ID)
			}
			components := descendants(owner, func(n *html.Node) bool { return has(n, "data-ely-family") })
			if len(components) != 1 || !strings.HasPrefix(attr(components[0], "id"), "sdui-internal-") {
				return fmt.Errorf("%s: incorrect internal production component", spec.ID)
			}
			root = components[0]
		}
		if root == nil || root.Data != "section" || attr(root, "data-ely-component") != "menus/"+spec.Component || attr(root, "data-ely-family") != "interaction" {
			return fmt.Errorf("%s: missing production component %s", spec.ID, spec.Component)
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
			if slot == nil || slot.Data != "div" || attr(slot, "data-fixture-slot") != spec.ID || !contains(slot, root) {
				return fmt.Errorf("%s: incorrect slot ownership", spec.ID)
			}
			if !contains(ids["host-form"], root) {
				return fmt.Errorf("%s: missing caller form ownership", spec.ID)
			}
		}
		if err := inspectRoot(root, ids, spec); err != nil {
			return fmt.Errorf("%s: %w", spec.ID, err)
		}
	}
	if full {
		return inspectShell(doc, ids, len(specs))
	}
	if len(descendants(doc, func(n *html.Node) bool { return has(n, "data-fixture-slot") || n.Data == "script" || n.Data == "link" })) != 0 {
		return fmt.Errorf("fragment contains document-only shell markup")
	}
	return nil
}

func inspectRoot(root *html.Node, ids map[string]*html.Node, spec Spec) error {
	rootID := attr(root, "id")
	if (attr(root, "data-ely-disabled") == "true") != spec.Disabled {
		return fmt.Errorf("incorrect root disabled state")
	}
	fieldsets := descendants(root, func(n *html.Node) bool { return n.Data == "fieldset" })
	if spec.Disabled && (len(fieldsets) != 1 || !has(fieldsets[0], "disabled")) || !spec.Disabled && len(fieldsets) != 0 {
		return fmt.Errorf("incorrect disabled fieldset")
	}
	suffix := "-menu"
	if spec.Component == "CheckboxMenuItem" || spec.Component == "RadioMenuItem" {
		suffix = "-checks"
	}
	panel := ids[rootID+suffix]
	if panel == nil || !contains(root, panel) || !isMenu(panel) || attr(panel, "aria-label") != Label || attr(panel, "tabindex") != "-1" || !has(panel, "hidden") {
		return fmt.Errorf("incorrect root panel")
	}
	triggers := descendants(root, func(n *html.Node) bool { return has(n, "data-interaction-menu") && ancestor(n, isMenu) == nil })
	if len(triggers) != 1 {
		return fmt.Errorf("root triggers=%d want 1", len(triggers))
	}
	trigger := triggers[0]
	if trigger.Data != "button" || attr(trigger, "type") != "button" || attr(trigger, "aria-haspopup") != "menu" || attr(trigger, "aria-controls") != rootID+suffix || attr(trigger, "data-interaction-menu") != rootID+suffix || attr(trigger, "aria-expanded") != "false" || has(trigger, "disabled") != spec.Disabled || has(trigger, "data-ely-action") {
		return fmt.Errorf("incorrect root trigger semantics")
	}
	contexts := descendants(root, func(n *html.Node) bool { return has(n, "data-interaction-context") })
	if spec.Component == "ContextMenu" {
		mode := spec.ContextMode
		if mode == "" {
			mode = "automatic"
		}
		if len(contexts) != 1 || attr(contexts[0], "data-ely-context-mode") != mode || attr(contexts[0], "tabindex") != "0" || !strings.Contains(textContent(contexts[0]), Content) || textContent(trigger) != ActionLabel {
			return fmt.Errorf("incorrect context owner contract")
		}
		if has(trigger, "hidden") != (mode == "manual") || mode == "manual" && attr(trigger, "tabindex") != "-1" || mode != "manual" && has(trigger, "tabindex") {
			return fmt.Errorf("incorrect manual/automatic fallback visibility")
		}
	} else if len(contexts) != 0 || has(trigger, "hidden") {
		return fmt.Errorf("unexpected context surface or hidden trigger")
	}
	primaryActions := descendants(root, func(n *html.Node) bool { return has(n, "data-interaction-menu-primary") })
	if spec.Component == "DropdownMenu" {
		if len(primaryActions) != 1 || attr(primaryActions[0], "data-ely-action") != "submit" || has(primaryActions[0], "disabled") != spec.Disabled {
			return fmt.Errorf("incorrect split dropdown primary action")
		}
	} else if len(primaryActions) != 0 {
		return fmt.Errorf("unexpected primary action")
	}
	rows := descendants(panel, func(n *html.Node) bool { return strings.HasPrefix(attr(n, "role"), "menuitem") })
	expected := expectedRows(spec.Rows)
	if len(rows) != len(expected) {
		return fmt.Errorf("rows=%d want %d", len(rows), len(expected))
	}
	for i, want := range expected {
		row := rows[i]
		if attr(row, "value") != want.value {
			return fmt.Errorf("row %d value=%q want %q", i, attr(row, "value"), want.value)
		}
		role := ExpectedRole(spec.Component, want.value)
		if row.Data != "button" || attr(row, "type") != "button" || attr(row, "tabindex") != "-1" || attr(row, "role") != role || has(row, "disabled") != (spec.Disabled || want.disabled) {
			return fmt.Errorf("%s: incorrect role/type/tabindex/disabled", want.value)
		}
		labels := descendants(row, func(n *html.Node) bool { return has(n, "data-interaction-menu-label") })
		if len(labels) != 1 || textContent(labels[0]) != want.label {
			return fmt.Errorf("%s: incorrect label descendant", want.value)
		}
		owner := panel
		if want.parent != "" {
			for _, parent := range expected {
				if parent.value == want.parent {
					owner = ids[fmt.Sprintf("%s-sub-%d", rootID, parent.childIndex)]
				}
			}
		}
		if ancestor(row, isMenu) != owner {
			return fmt.Errorf("%s: incorrect immediate panel ownership", want.value)
		}
		if want.childIndex >= 0 {
			childID := fmt.Sprintf("%s-sub-%d", rootID, want.childIndex)
			child := ids[childID]
			if role != "menuitem" || attr(row, "aria-haspopup") != "menu" || attr(row, "aria-expanded") != "false" || attr(row, "aria-controls") != childID || attr(row, "data-interaction-menu") != childID || has(row, "data-ely-action") || has(row, "data-interaction-menu-action") {
				return fmt.Errorf("%s: incorrect submenu trigger", want.value)
			}
			if child == nil || child.Parent != row.Parent || !isMenu(child) || attr(child, "tabindex") != "-1" || attr(child, "aria-label") != want.label || !has(child, "hidden") {
				return fmt.Errorf("%s: incorrect child panel relationship", want.value)
			}
		} else {
			if attr(row, "data-ely-action") != want.action || !has(row, "data-interaction-menu-action") || has(row, "data-interaction-menu") || has(row, "aria-controls") || has(row, "aria-haspopup") {
				return fmt.Errorf("%s: incorrect leaf action relationship", want.value)
			}
		}
		icons := descendants(row, func(n *html.Node) bool { return attr(n, "data-interaction-icon") == "circle" })
		if len(icons) != 1 || attr(icons[0], "aria-hidden") != "true" {
			return fmt.Errorf("%s: missing production icon descendant", want.value)
		}
		switch role {
		case "menuitemradio":
			if attr(row, "data-interaction-menu-radio") != "density" || has(row, "data-interaction-checkbox") {
				return fmt.Errorf("%s: incorrect radio dispatch/group", want.value)
			}
		case "menuitemcheckbox":
			if !has(row, "data-interaction-checkbox") || has(row, "data-interaction-menu-radio") {
				return fmt.Errorf("%s: incorrect checkbox dispatch", want.value)
			}
		default:
			if has(row, "data-interaction-checkbox") || has(row, "data-interaction-menu-radio") || has(row, "aria-checked") {
				return fmt.Errorf("%s: ordinary row has selection state", want.value)
			}
		}
		if role != "menuitem" && attr(row, "aria-checked") != fmt.Sprint(want.selected) {
			return fmt.Errorf("%s: incorrect selection state", want.value)
		}
	}
	panels := descendants(root, isMenu)
	wantPanels := 1
	if spec.Rows == "" {
		wantPanels = 5
	}
	if len(panels) != wantPanels {
		return fmt.Errorf("panels=%d want %d", len(panels), wantPanels)
	}
	headings := descendants(panel, func(n *html.Node) bool { return strings.Contains(attr(n, "class"), "ely-interaction__menu-heading") })
	if spec.Rows == "" {
		if len(headings) != 1 || textContent(headings[0]) != "Commands <safe>" || ancestor(headings[0], isMenu) != panel {
			return fmt.Errorf("incorrect escaped menu heading")
		}
		empty := ids[rootID+"-sub-9"]
		if len(descendants(empty, func(n *html.Node) bool { return strings.HasPrefix(attr(n, "role"), "menuitem") })) != 0 {
			return fmt.Errorf("allocated empty child gained fallback rows")
		}
		alloff := ids[rootID+"-sub-10"]
		if len(descendants(alloff, func(n *html.Node) bool { return n.Data == "button" && !has(n, "disabled") })) != 0 {
			return fmt.Errorf("all-disabled child gained an enabled row")
		}
	} else if len(headings) != 0 {
		return fmt.Errorf("empty/all-disabled panel gained a heading")
	}
	return nil
}

func inspectShell(doc *html.Node, ids map[string]*html.Node, slots int) error {
	for _, id := range []string{"before", "after", "swap-source"} {
		n := ids[id]
		if n == nil || n.Data != "button" || attr(n, "type") != "button" || has(n, "hidden") || has(n, "disabled") {
			return fmt.Errorf("missing visible shell button %s", id)
		}
	}
	form := ids["host-form"]
	if form == nil || form.Data != "form" {
		return fmt.Errorf("missing caller form")
	}
	scopes := descendants(form, func(n *html.Node) bool { return n.Data == "input" && attr(n, "name") == "scope" })
	if len(scopes) != 1 || attr(scopes[0], "type") != "hidden" || attr(scopes[0], "value") != "caller-value" {
		return fmt.Errorf("incorrect caller form payload")
	}
	if len(descendants(doc, func(n *html.Node) bool { return has(n, "data-fixture-slot") })) != slots {
		return fmt.Errorf("incorrect fixture slot count")
	}
	for _, href := range []string{"/assets/app.css", "/assets/ely-api.css", "/assets/ely-api-interaction.css"} {
		if len(descendants(doc, func(n *html.Node) bool {
			return n.Data == "link" && attr(n, "rel") == "stylesheet" && attr(n, "href") == href
		})) != 1 {
			return fmt.Errorf("missing production stylesheet %s", href)
		}
	}
	for _, src := range []string{"/assets/htmx.min.js", "/assets/ely-api-interaction-entry.js"} {
		scripts := descendants(doc, func(n *html.Node) bool { return n.Data == "script" && attr(n, "src") == src })
		if len(scripts) != 1 || strings.HasSuffix(src, "-entry.js") && attr(scripts[0], "type") != "module" {
			return fmt.Errorf("missing production script %s", src)
		}
	}
	if len(descendants(doc, func(n *html.Node) bool {
		return n.Data == "link" && attr(n, "rel") == "icon" && attr(n, "href") == "data:,"
	})) != 1 {
		return fmt.Errorf("missing data favicon")
	}
	return nil
}
