package playground

import sdui "github.com/mrchypark/elysdui/adapters/gohtmx"

type example struct {
	ID     string         `json:"id"`
	Title  string         `json:"title"`
	Screen sdui.Screen    `json:"screen"`
	Data   map[string]any `json:"data"`
}

func examples() []example {
	text := func(id, value string) sdui.Node {
		return sdui.Node{ID: id, Type: "text", Props: map[string]any{"text": value}}
	}
	screen := func(id string, nodes ...sdui.Node) sdui.Screen {
		return sdui.Screen{Version: "1", ID: id + "-screen", Root: sdui.Node{ID: id + "-layout", Type: "stack", Props: map[string]any{"gap": "lg"}, Children: nodes}}
	}
	return []example{
		{ID: "basic", Title: "Welcome · basic components", Screen: screen("basic", text("welcome-title", "Build something useful."), sdui.Node{ID: "welcome-note", Type: "notice", Props: map[string]any{"title": "Your SDUI canvas: ", "text": "Edit this screen visually or change the JSON. Both use the same typed contracts and Go renderer."}}, sdui.Node{ID: "welcome-button", Type: "button", Props: map[string]any{"label": "Create your first screen", "variant": "primary"}}), Data: map[string]any{}},
		{ID: "advanced", Title: "Advanced · catalogue components", Screen: screen("advanced", text("advanced-title", "The full component catalogue"), sdui.Node{ID: "advanced-switch", Type: "forms/Switch", Props: map[string]any{"label": "Notifications", "checked": true}}), Data: map[string]any{}},
		{ID: "slots", Title: "Slots · composed card", Screen: screen("slots", sdui.Node{ID: "slot-card", Type: "playground/card", Props: map[string]any{"title": "A composed card"}, Slots: map[string][]sdui.Node{"content": {text("slot-text", "This text is a typed child in the content slot."), sdui.Node{ID: "slot-button", Type: "button", Props: map[string]any{"label": "Slot action"}}}}}), Data: map[string]any{}},
		{ID: "repeat", Title: "Repeat · data bindings", Screen: screen("repeat", text("repeat-title", "A small project list"), sdui.Node{ID: "project", Type: "text", Bindings: map[string]string{"text": "/@vars/project/name"}, Repeat: &sdui.Repeat{Items: "/projects", As: "project", Key: "/id"}}), Data: map[string]any{"projects": []any{map[string]any{"id": "design", "name": "Design the screen"}, map[string]any{"id": "build", "name": "Connect your data"}, map[string]any{"id": "ship", "name": "Ship with confidence"}}}},
		{ID: "events", Title: "Events · inert action contract", Screen: screen("events", sdui.Node{ID: "action-result", Type: "region", Props: map[string]any{"label": "Action result"}, Children: []sdui.Node{text("action-help", "Events are validated here, but preview actions never execute."), {ID: "action-button", Type: "button", Props: map[string]any{"label": "Save (preview only)"}, Event: &sdui.Event{On: "click", Action: "save", Target: "action-result"}}}}), Data: map[string]any{}},
	}
}
