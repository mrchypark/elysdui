package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestCommunicationCompletionCallerState(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		chapter, name string
		props         map[string]any
		want, absent  []string
	}{
		{"chat", "StreamingText", map[string]any{"Content": "Caller text", "Status": "partial", "ReplayLabel": "Replay"}, []string{`data-ely-stream-status>partial</output>`, `replay-stream`, `data-ely-stream-caret`}, nil},
		{"agent", "ArtifactPanel", map[string]any{"Source": "<script>source</script>"}, []string{`<pre data-ely-artifact-source>&lt;script&gt;source&lt;/script&gt;</pre>`}, []string{`data-ely-artifact-view=`, `<script>`}},
		{"agent", "SandboxStatus", map[string]any{"CPU": 0, "MemoryUsed": 0, "MemoryLimit": 512}, []string{`max="1" value="0"`, `max="512" value="0"`}, nil},
		{"agent", "SandboxStatus", map[string]any{"Status": "starting"}, []string{`data-sandbox-state="starting"`}, []string{`<meter`}},
		{"agent", "ConnectorList", map[string]any{"Disabled": true, "Servers": []map[string]any{{"Value": "files", "Permission": "Read only", "ActionLabel": "Settings"}}}, []string{`configure-server`, `Read only`, `Settings`, `disabled`, `value="files"`}, nil},
		{"agent", "MemoryPanel", map[string]any{"Items": []map[string]any{{"Value": "note", "Content": "Keep this"}}}, []string{`data-ely-memory-count>1 memory</output>`, `forget-memory`}, nil},
		{"agent", "InterruptButton", map[string]any{}, []string{`data-agent-run-state="working"`, `aria-hidden="false"`, `aria-hidden="true"`}, nil},
		{"agent", "HumanInputRequest", map[string]any{"Question": "Continue?", "Answer": "Yes"}, []string{`data-ely-human-answer>Yes</output>`}, []string{`data-ely-human-ask`, `data-ely-submit="answer-input"`}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "completion", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q in %s", want, out.String())
				}
			}
			for _, absent := range tc.absent {
				if strings.Contains(out.String(), absent) {
					t.Errorf("unexpected %q in %s", absent, out.String())
				}
			}
		})
	}
}
