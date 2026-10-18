package gohtmx

import (
	"fmt"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"github.com/mrchypark/elysdui/sdui"
	"html/template"
	"io"
)

func (p *Plan) renderNode(w io.Writer, node sdui.ResolvedNode, ctx RenderContext, budget *mappingBudget) error {
	definition, ok := p.definitions[node.Type]
	if !ok {
		return fmt.Errorf("gohtmx: missing renderer for %q", node.Type)
	}
	props := make(map[string]any, len(node.Props)+len(node.Slots)+1)
	for key, value := range node.Props {
		mapped, err := remapValueBounded(definition.Properties[key], value, budget)
		if err != nil {
			return err
		}
		props[definition.Properties[key].Target] = mapped
	}
	props["ID"] = node.ControlID
	for _, name := range sortedKeys(node.Slots) {
		var content boundedBuffer
		for _, child := range node.Slots[name] {
			if err := p.renderNode(&content, child, ctx, budget); err != nil {
				return err
			}
		}
		props[definition.Slots[name].Target] = template.HTML(content.String()) // Only adapter-rendered child markup is trusted.
	}
	var body boundedBuffer
	renderer := "leaf"
	if definition.Container != "" {
		renderer = string(definition.Container)
		for _, child := range node.Children {
			if err := p.renderNode(&body, child, ctx, budget); err != nil {
				return err
			}
		}
	} else if definition.Component != "" {
		if err := ui.RenderComponentLimited(p.templates, &body, ui.Component{Chapter: definition.Chapter, Name: definition.Component, ID: node.ControlID, Props: props}, MaxRenderBytes); err != nil {
			return err
		}
	} else if err := p.templates.ExecuteTemplate(&body, definition.Template, props); err != nil {
		return err
	}
	return structureTemplates.ExecuteTemplate(w, renderer, map[string]any{"ID": node.ID, "Type": node.Type, "Props": props, "Event": eventJSON(node.Events), "CSRF": ctx.CSRF, "Body": template.HTML(body.String())})
}
