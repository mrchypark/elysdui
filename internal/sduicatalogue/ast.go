package sduicatalogue

import (
	"fmt"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"html/template"
	"regexp"
	"sort"
	"strings"
	"text/template/parse"
)

// symbol describes provenance, never executable application data. A helper's
// dict/withProps arguments retain paths back to the caller's original props.
type symbol struct {
	paths   []string
	fields  map[string]symbol
	literal any
	known   bool
}
type access struct {
	hints   map[string]bool
	formats map[string]bool
	whole   bool
}
type analysis struct {
	refs      map[string]*access
	forms     bool
	assets    map[string]bool
	templates *template.Template
	fixed     map[string]any
	active    map[string]int
}
type scope struct {
	dot  symbol
	vars map[string]symbol
}

func analyze(t *template.Template, name string, fixed map[string]any) *analysis {
	a := &analysis{assets: map[string]bool{}, refs: map[string]*access{}, templates: t, fixed: fixed, active: map[string]int{}}
	root := symbol{paths: []string{""}, fields: map[string]symbol{}}
	for k, v := range fixed {
		root.fields[k] = symbol{literal: v, known: true}
	}
	a.template(name, root)
	return a
}
func cloneScope(s scope) scope {
	n := scope{dot: s.dot, vars: map[string]symbol{}}
	for k, v := range s.vars {
		n.vars[k] = v
	}
	return n
}
func field(s symbol, key string) symbol {
	if v, ok := s.fields[key]; ok {
		return v
	}
	out := symbol{}
	for _, p := range s.paths {
		if p == "" {
			out.paths = append(out.paths, key)
		} else {
			out.paths = append(out.paths, p+"."+key)
		}
	}
	return out
}
func mergeSymbol(a, b symbol) symbol {
	if a.known && b.known && fmt.Sprint(a.literal) == fmt.Sprint(b.literal) {
		return a
	}
	out := symbol{fields: map[string]symbol{}}
	seen := map[string]bool{}
	for _, p := range append(append([]string{}, a.paths...), b.paths...) {
		if !seen[p] {
			out.paths = append(out.paths, p)
			seen[p] = true
		}
	}
	for k, v := range a.fields {
		out.fields[k] = v
	}
	for k, v := range b.fields {
		if prev, ok := out.fields[k]; ok {
			out.fields[k] = mergeSymbol(prev, v)
		} else {
			out.fields[k] = v
		}
	}
	return out
}
func (a *analysis) mark(s symbol, hint, format string, whole bool) {
	for _, path := range s.paths {
		if path == "" || len(strings.Split(path, ".")) > 16 {
			continue
		}
		r := a.refs[path]
		if r == nil {
			r = &access{hints: map[string]bool{}, formats: map[string]bool{}}
			a.refs[path] = r
		}
		if hint != "" {
			r.hints[hint] = true
		}
		if format != "" {
			r.formats[format] = true
		}
		r.whole = r.whole || whole
	}
}
func (a *analysis) template(name string, dot symbol) {
	if name == "map-view" || name == "coordinate-display" {
		a.assets["map"] = true
	}
	if name == "ws-scene-value" {
		a.mark(dot, "", "", true)
		return
	}
	t := a.templates.Lookup(name)
	if t == nil || t.Tree == nil || a.active[name] >= 6 {
		return
	}
	for _, p := range dot.paths {
		if len(strings.Split(p, ".")) > 14 {
			return
		}
	}
	a.active[name]++
	defer func() { a.active[name]-- }()
	s := scope{dot: dot, vars: map[string]symbol{"$": dot}}
	source, _ := ui.Files.ReadFile("templates/" + t.Tree.ParseName)
	a.walk(t.Tree.Root, &s, string(source))
}

var attrBefore = regexp.MustCompile(`([A-Za-z_:][-A-Za-z0-9_:]*)\s*=\s*["'][^"']*$`)

func outputFormat(source string, pos parse.Pos) string {
	i := int(pos)
	if i > len(source) {
		return ""
	}
	start := max(0, i-350)
	before := source[start:i]
	m := attrBefore.FindStringSubmatch(before)
	if len(m) == 0 {
		return ""
	}
	attr := strings.ToLower(m[1])
	switch attr {
	case "name":
		return "identifier"
	case "href", "cite":
		if strings.Contains(m[0], `="#{{`) || strings.Contains(m[0], `='#{{`) {
			return ""
		}
		return "url"
	case "fill", "stroke":
		return "color"
	case "srcdoc":
		return "sandbox-html"
	case "poster":
		return "image-url"
	case "src":
		if strings.LastIndex(before, "<img") > strings.LastIndex(before, ">") {
			return "image-url"
		}
		return "media-url"
	}
	if strings.HasPrefix(attr, "data-") {
		if strings.HasSuffix(attr, "-token") {
			return "data-token"
		}
		if strings.Contains(attr, "color") || attr == "data-native-swatch" || attr == "data-tool-ground" || attr == "data-tool-ink" {
			return "color"
		}
		if strings.HasSuffix(attr, "-action") || attr == "data-ely-submit" {
			return "action"
		}
		if strings.Contains(attr, "url") || strings.HasSuffix(attr, "-src") || strings.HasSuffix(attr, "-href") {
			return "url"
		}
	}
	return ""
}
func (a *analysis) walk(n parse.Node, s *scope, source string) {
	if n == nil {
		return
	}
	switch x := n.(type) {
	case *parse.ListNode:
		if x == nil {
			return
		}
		for _, c := range x.Nodes {
			a.walk(c, s, source)
		}
	case *parse.TextNode:
		if strings.Contains(strings.ToLower(string(x.Text)), "<form") {
			a.forms = true
		}
	case *parse.ActionNode:
		v := a.pipe(x.Pipe, s)
		if len(x.Pipe.Decl) == 0 {
			a.mark(v, "string", outputFormat(source, x.Position()), true)
		}
	case *parse.TemplateNode:
		a.template(x.Name, a.pipe(x.Pipe, s))
	case *parse.IfNode:
		v := a.pipe(x.Pipe, s)
		a.mark(v, "boolean", "", false)
		if v.known {
			if truth(v.literal) {
				a.walk(x.List, s, source)
			} else {
				a.walk(x.ElseList, s, source)
			}
			return
		}
		left, right := cloneScope(*s), cloneScope(*s)
		a.walk(x.List, &left, source)
		a.walk(x.ElseList, &right, source)
		for k, v := range left.vars {
			s.vars[k] = mergeSymbol(v, right.vars[k])
		}
	case *parse.WithNode:
		v := a.pipe(x.Pipe, s)
		a.mark(v, "", "", false)
		inner := cloneScope(*s)
		inner.dot = v
		a.walk(x.List, &inner, source)
		other := cloneScope(*s)
		a.walk(x.ElseList, &other, source)
	case *parse.RangeNode:
		v := a.pipe(x.Pipe, s)
		a.mark(v, "array", "", false)
		item := field(v, "*")
		inner := cloneScope(*s)
		inner.dot = item
		if len(x.Pipe.Decl) == 1 {
			inner.vars[x.Pipe.Decl[0].Ident[0]] = item
		}
		if len(x.Pipe.Decl) > 1 {
			inner.vars[x.Pipe.Decl[0].Ident[0]] = symbol{}
			inner.vars[x.Pipe.Decl[1].Ident[0]] = item
		}
		a.walk(x.List, &inner, source)
		other := cloneScope(*s)
		a.walk(x.ElseList, &other, source)
	}
}
func (a *analysis) pipe(p *parse.PipeNode, s *scope) symbol {
	if p == nil {
		return s.dot
	}
	var out symbol
	for i, c := range p.Cmds {
		out = a.command(c, s, out, i > 0)
	}
	for _, d := range p.Decl {
		s.vars[d.Ident[0]] = out
	}
	return out
}
func (a *analysis) node(n parse.Node, s *scope) symbol {
	switch x := n.(type) {
	case *parse.DotNode:
		return s.dot
	case *parse.FieldNode:
		v := s.dot
		for _, k := range x.Ident {
			v = field(v, k)
		}
		return v
	case *parse.VariableNode:
		v := s.vars[x.Ident[0]]
		for _, k := range x.Ident[1:] {
			v = field(v, k)
		}
		return v
	case *parse.ChainNode:
		v := a.node(x.Node, s)
		for _, k := range x.Field {
			v = field(v, k)
		}
		return v
	case *parse.PipeNode:
		return a.pipe(x, s)
	case *parse.StringNode:
		return symbol{literal: x.Text, known: true}
	case *parse.BoolNode:
		return symbol{literal: x.True, known: true}
	case *parse.NumberNode:
		if x.IsInt {
			return symbol{literal: x.Int64, known: true}
		}
		return symbol{literal: x.Float64, known: true}
	case *parse.NilNode:
		return symbol{known: true}
	}
	return symbol{}
}
func truth(v any) bool {
	if v == nil {
		return false
	}
	switch x := v.(type) {
	case bool:
		return x
	case string:
		return x != ""
	case int64:
		return x != 0
	case float64:
		return x != 0
	}
	return true
}
func literalType(v any) string {
	switch v.(type) {
	case string:
		return "string"
	case bool:
		return "boolean"
	case int, int64:
		return "integer"
	case float64:
		return "number"
	}
	return ""
}
func (a *analysis) command(c *parse.CommandNode, s *scope, prev symbol, piped bool) symbol {
	if len(c.Args) == 0 {
		return symbol{}
	}
	id, call := c.Args[0].(*parse.IdentifierNode)
	if !call {
		return a.node(c.Args[0], s)
	}
	args := []symbol{}
	for _, n := range c.Args[1:] {
		args = append(args, a.node(n, s))
	}
	if piped {
		args = append(args, prev)
	}
	switch id.Ident {
	case "dict", "withProps":
		out := symbol{fields: map[string]symbol{}}
		start := 0
		if id.Ident == "withProps" && len(args) > 0 {
			out = args[0]
			out.fields = map[string]symbol{}
			for k, v := range args[0].fields {
				out.fields[k] = v
			}
			start = 1
		}
		for i := start; i+1 < len(args); i += 2 {
			if key, ok := args[i].literal.(string); ok {
				out.fields[key] = args[i+1]
			}
		}
		return out
	case "or", "and":
		var out symbol
		all := true
		for _, arg := range args {
			out = mergeSymbol(out, arg)
			if !arg.known {
				all = false
			}
		}
		if all {
			for _, arg := range args {
				if (id.Ident == "or" && truth(arg.literal)) || (id.Ident == "and" && !truth(arg.literal)) {
					return arg
				}
			}
			if len(args) > 0 {
				return args[len(args)-1]
			}
		}
		// A fixed true arm makes an OR selector true; a fixed false arm makes AND false.
		for _, arg := range args {
			if !arg.known {
				break
			}
			if (id.Ident == "or" && truth(arg.literal)) || (id.Ident == "and" && !truth(arg.literal)) {
				return arg
			}
		}
		return out
	case "eq", "ne", "lt", "le", "gt", "ge":
		hint := ""
		for _, arg := range args {
			if arg.known && literalType(arg.literal) != "" {
				hint = literalType(arg.literal)
			}
		}
		for _, arg := range args {
			a.mark(arg, hint, "", false)
		}
		known := len(args) > 1
		for _, arg := range args {
			known = known && arg.known
		}
		if known && (id.Ident == "eq" || id.Ident == "ne") {
			same := false
			for _, arg := range args[1:] {
				same = same || fmt.Sprint(args[0].literal) == fmt.Sprint(arg.literal)
			}
			if id.Ident == "ne" {
				same = !same
			}
			return symbol{known: true, literal: same}
		}
		return symbol{}
	case "not":
		if len(args) > 0 {
			a.mark(args[0], "boolean", "", false)
			if args[0].known {
				return symbol{known: true, literal: !truth(args[0].literal)}
			}
		}
		return symbol{}
	case "index":
		if len(args) > 1 {
			v := args[0]
			for _, key := range args[1:] {
				if k, ok := key.literal.(string); ok {
					v = field(v, k)
				} else {
					a.mark(v, "array", "", false)
					v = field(v, "*")
				}
			}
			return v
		}
	case "len":
		for _, arg := range args {
			a.mark(arg, "", "", false)
		}
		return symbol{}
	case "markdownHTML":
		for _, arg := range args {
			a.mark(arg, "string", "markdown-source", true)
		}
		return symbol{}
	case "seq", "add":
		for _, arg := range args {
			a.mark(arg, "integer", "", false)
		}
		return symbol{}
	case "deref":
		if len(args) > 0 {
			return args[0]
		}
	case "list":
		var out symbol
		for _, arg := range args {
			out = mergeSymbol(out, arg)
		}
		return symbol{fields: map[string]symbol{"*": out}}
	case "menuHasItems":
		// The result is boolean, but the caller value remains a typed array.
		// Do not propagate the input path into conditions on the result.
		if len(args) > 0 {
			a.mark(args[0], "array", "menu-items", false)
		}
		return symbol{}
	case "join":
		if len(args) > 0 {
			a.mark(args[0], "array", "", false)
			a.mark(field(args[0], "*"), "string", "", true)
		}
		return symbol{}
	}
	for _, arg := range args {
		a.mark(arg, "string", "", true)
	}
	return symbol{}
}
func (a *analysis) paths() []string {
	out := make([]string, 0, len(a.refs))
	for p := range a.refs {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}
