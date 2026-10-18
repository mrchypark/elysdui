package gohtmx

import (
	"html/template"
	"testing"
)

func TestRegistryValidationAndSnapshot(t *testing.T) {
	tpl := template.Must(template.New("leaf").Parse(`{{.Text}}`))
	valid := func() Definition {
		return Definition{Name: "custom", Template: "leaf", Properties: map[string]Property{"text": {Type: String, Target: "Text", Default: "safe"}}}
	}
	tests := map[string]func(*Definition){
		"unknown template": func(d *Definition) { d.Template = "missing" }, "multiple renderers": func(d *Definition) { d.Container = Stack },
		"missing renderer": func(d *Definition) { d.Template = "" }, "unknown container": func(d *Definition) { d.Template = ""; d.Container = "iframe" },
		"unknown family": func(d *Definition) { d.Family = "evil" }, "invalid name": func(d *Definition) { d.Name = "<bad>" },
		"unknown component": func(d *Definition) { d.Template = ""; d.Component = "Missing" },
		"wrong family":      func(d *Definition) { d.Template = ""; d.Component = "Switch"; d.Chapter = "forms"; d.Family = "data" },
		"reserved prop":     func(d *Definition) { d.Properties["href"] = Property{Type: String} },
		"reserved target":   func(d *Definition) { d.Properties["safe"] = Property{Type: String, Target: "Attrs"} },
		"unknown type":      func(d *Definition) { d.Properties["safe"] = Property{Type: "html"} },
		"duplicate target":  func(d *Definition) { d.Properties["safe"] = Property{Type: String, Target: "Text"} },
		"invalid default":   func(d *Definition) { d.Properties["safe"] = Property{Type: Boolean, Default: "false"} },
		"wrong enum":        func(d *Definition) { d.Properties["safe"] = Property{Type: Boolean, Enum: []string{"false"}} },
		"unsupported event": func(d *Definition) { d.Events = []string{"onclick"} }, "submit on leaf": func(d *Definition) { d.Events = []string{"submit"} },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			d := valid()
			mutate(&d)
			if err := NewRegistry(tpl).Register(d); err == nil {
				t.Fatal("invalid definition accepted")
			}
		})
	}
	r := NewRegistry(tpl)
	d := valid()
	if err := r.Register(d); err != nil {
		t.Fatal(err)
	}
	if err := r.Register(d); err == nil {
		t.Fatal("duplicate accepted")
	}
	d.Properties["text"] = Property{Type: Boolean}
	plan, err := Compile(Screen{Version: Version, ID: "screen", Root: Node{ID: "root", Type: "custom"}}, r)
	if err != nil {
		t.Fatal(err)
	}
	nodes, err := plan.Resolve(ResolveContext{})
	if err != nil {
		t.Fatal(err)
	}
	if nodes[0].Props["text"] != "safe" {
		t.Fatal("registered definition mutated")
	}
	if err := NewRegistry(nil).Register(valid()); err == nil {
		t.Fatal("nil templates accepted")
	}
}
