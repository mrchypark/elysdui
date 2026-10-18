package uiexamples

import (
	"fmt"
	"strings"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func storyPreviewComponents(component ui.Component) []ui.Component {
	component = storyPreviewComponent(component)
	examples, _ := component.Props["PreviewExamples"].([]map[string]any)
	delete(component.Props, "PreviewExamples")
	if len(examples) == 0 {
		return []ui.Component{component}
	}
	components := make([]ui.Component, len(examples))
	for i, example := range examples {
		components[i] = component
		components[i].ID = fmt.Sprintf("component-preview-%d", i+1)
		components[i].Props = storyPreviewProps(component.Props)
		for key, value := range storyPreviewProps(example) {
			components[i].Props[key] = value
		}
		if name, ok := components[i].Props["PreviewName"].(string); ok && name != "" {
			components[i].Name = name
		}
		delete(components[i].Props, "PreviewName")
	}
	return components
}

// Gallery copy is independent of the escaped-value and disabled-control audit fixtures.
func storyPreviewComponent(component ui.Component) ui.Component {
	title, _ := component.Props["Title"].(string)
	component.Props = storyPreviewProps(component.Props)
	component.ID = "component-preview"
	component.Props["Disabled"] = false
	if title == "" || title == component.Name || strings.Contains(strings.ToLower(title), "caller") || strings.HasSuffix(title, " audit instance") {
		component.Props["Title"] = ""
	}
	if component.Props["Description"] == "Instance-specific workspace state" {
		component.Props["Description"] = ""
	}
	if value, ok := component.Props["Value"].(string); ok && strings.HasPrefix(value, "<caller value ") {
		component.Props["Value"] = "Quiet interfaces"
	}
	return component
}

func storyPreviewProps(source map[string]any) map[string]any {
	props := make(map[string]any, len(source))
	for key, value := range source {
		switch item := value.(type) {
		case map[string]any:
			value = storyPreviewProps(item)
		case []map[string]any:
			items := make([]map[string]any, len(item))
			for i, entry := range item {
				items[i] = storyPreviewProps(entry)
			}
			value = items
		case []string:
			items := make([]string, len(item))
			for i, entry := range item {
				items[i] = storyPreviewText(entry)
			}
			value = items
		case string:
			if key != "Value" && key != "Href" && key != "Name" && key != "ID" && key != "Payload" && key != "Diff" {
				value = storyPreviewText(item)
			}
		}
		props[key] = value
	}
	return props
}

func storyPreviewText(text string) string {
	if strings.Contains(text, "audit-") || strings.Contains(text, "isolation and escaped-value") {
		return ""
	}
	return strings.NewReplacer("Caller-controlled ", "", "Caller supplied ", "", "Caller-owned ", "", "caller-owned ", "", "First caller ", "First ", "Second caller ", "Second ", "Caller ", "", "caller ", "").Replace(text)
}
