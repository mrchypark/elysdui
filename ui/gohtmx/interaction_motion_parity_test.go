package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestInteractionMotionAndDirectCallerContracts(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		chapter, name string
		props         map[string]any
		want          []string
	}{
		{"motion", "Stagger", map[string]any{"Step": 90, "Items": []map[string]any{{"Label": "Caller row", "Value": "row"}}}, []string{`data-motion-step="90"`, `data-motion-key="row"`, `Caller row`}},
		{"motion", "AnimatePresence", map[string]any{"Items": []map[string]any{{"Label": "Existing", "Value": "caller-key"}}, "AddItems": []map[string]any{{"Label": "New caller", "Value": "new-key"}}, "AddLabel": "Append"}, []string{`data-motion-key="caller-key"`, `data-motion-remove`, `data-value="new-key"`, `>Append</button>`}},
		{"motion", "Flip", map[string]any{"Items": []map[string]any{{"Label": "Row", "Value": "stable"}}}, []string{`data-motion-key="stable"`, `data-interaction-flip-toggle`}},
		{"motion", "Reorder", map[string]any{"Items": []map[string]any{{"Label": "Locked", "Value": "locked", "Disabled": true}}}, []string{`data-interaction-value="locked" aria-disabled="true"`, `data-interaction-icon="grip-vertical"`}},
		{"motion", "Marquee", map[string]any{"Pace": 25, "Items": []map[string]any{{"Label": "Caller ticker"}}}, []string{`data-motion-pace="25"`, `Caller ticker`, `data-motion-marquee-copy`}},
		{"motion", "Ripple", map[string]any{"Label": "Press", "Confetti": true, "CelebrateLabel": "Win"}, []string{`data-motion-confetti`, `>Win</button>`}},
		{"motion", "Glow", map[string]any{"Content": "Focus", "PulseLabel": "Live stream"}, []string{`Focus`, `Live stream`, `ely-interaction__pulse`}},
		{"motion", "Blink", map[string]any{"Cues": true, "Value": 505, "Step": 10, "Error": "Caller failure"}, []string{`data-motion-flash="505"`, `data-motion-flash-step="10"`, `Caller failure`}},
		{"motion", "ParticleBackground", map[string]any{"Content": "Motes", "GradientLabel": "Drift"}, []string{`data-motion-particles`, `Motes`, `Drift`}},
		{"interaction", "Draggable", map[string]any{"Lanes": []map[string]any{{"Label": "Queue", "Value": "queue", "Items": []map[string]any{{"Label": "Caller task", "Value": "task"}}}, {"Label": "Done", "Value": "done"}}}, []string{`data-direct-lane="queue"`, `data-direct-lane="done"`, `data-interaction-value="task"`}},
		{"interaction", "Resizable", map[string]any{"Width": 180, "Height": 100, "MinWidth": 100, "MaxWidth": 500, "Shapes": true, "Angle": 90, "RotateSrc": "/caller.svg", "Items": []map[string]any{{"Value": "tile", "Selected": true}}, "SortItems": []map[string]any{{"Label": "Sortable", "Value": "sort"}}}, []string{`data-width="180"`, `data-min-width="100"`, `data-max-width="500"`, `data-direct-rotate="90"`, `src="/caller.svg"`, `data-direct-tile="tile" aria-selected="true"`, `data-interaction-value="sort"`}},
		{"interaction", "LongPress", map[string]any{"Label": "Caller press", "Threshold": 800, "Action": "hold-item", "PressAction": "press-item", "Gestures": true, "MinScale": 0.5, "MaxScale": 4}, []string{`data-interaction-confirm-threshold="800"`, `data-interaction-longpress="hold-item"`, `data-direct-press-action="press-item"`, `data-min-scale="0.5"`, `data-max-scale="4"`}},
		{"interaction", "Hotkeys", map[string]any{"Bindings": []map[string]any{{"Keys": "Ctrl+k Ctrl+x", "Action": "caller-command"}}}, []string{`data-direct-binding="Ctrl&#43;k Ctrl&#43;x"`, `data-action="caller-command"`, `data-direct-pending`}},
		{"interaction", "Undo", map[string]any{"Value": "17"}, []string{`>17</output>`, `data-interaction-undo disabled`, `data-interaction-redo disabled`}},
		{"interaction", "VirtualScroller", map[string]any{"Count": 20000, "RowHeight": 32, "RowPrefix": "Entry", "Panes": []map[string]any{{"Label": "Before", "Items": []map[string]any{{"Label": "Before row"}}}, {"Label": "After", "Items": []map[string]any{{"Label": "After row"}}}}}, []string{`data-direct-count="20000"`, `data-direct-row-height="32"`, `data-direct-prefix="Entry"`, `Before row`, `After row`}},
		{"interaction", "Autofocus", map[string]any{"Items": []map[string]any{{"Label": "Bold", "Value": "bold", "Icon": "bold"}}, "Options": []map[string]any{{"Label": "Caller choice", "Value": "choice", "Selected": true}}}, []string{`data-direct-toolbar`, `data-direct-fruit value="choice" aria-selected="true"`, `Caller choice`}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var body bytes.Buffer
			if err := RenderComponent(tpl, &body, Component{Chapter: tc.chapter, Name: tc.name, ID: "caller-motion", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(body.String(), want) {
					t.Errorf("missing %s in %s", want, body.String())
				}
			}
		})
	}
}
