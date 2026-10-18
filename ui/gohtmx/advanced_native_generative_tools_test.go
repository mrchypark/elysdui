package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestNativeGenerativeToolsCallerContracts(t *testing.T) {
	tpl := nativeTemplates(t)
	for _, tc := range []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"TTSVoicePicker", map[string]any{"Selected": "caller", "PlayAction": "caller-sample", "Action": "caller-speak", "Value": "Caller script", "Items": []map[string]any{{"Value": "caller", "Label": "Caller voice", "Tags": "Caller tags", "Selected": true}}}, []string{`data-selected="caller"`, `data-play-action="caller-sample"`, `data-ely-submit="caller-speak"`, `Caller script`, `Caller tags`, `name="voice" value="caller"`}},
		{"VideoGenerationTimeline", map[string]any{"URL": "/caller.webm", "Position": 0, "Selected": "shot", "ExtendAction": "caller-extend", "Frames": []map[string]any{{"Value": "shot", "Duration": 2.75, "Label": "Caller shot", "Status": "pending", "Progress": 0}}}, []string{`data-position="0"`, `data-duration="2.75"`, `data-native-shot="shot"`, `src="/caller.webm"`, `<video controls`, `data-ely-action="caller-extend"`, `<span>0%</span>`}},
		{"ModelCard", map[string]any{"Label": "Caller model", "Value": "model-key", "Maker": "Caller maker", "Content": "Caller description", "InUse": true, "Action": "caller-use", "Items": []map[string]any{{"Label": "Precision", "Content": "Q8"}}, "Tags": []string{"Caller tag"}}, []string{`data-in-use="true"`, `Caller maker`, `<dt>Precision</dt><dd>Q8</dd>`, `Caller tag`, `data-ely-action="caller-use" value="model-key" hidden`}},
		{"ModelDownloadManager", map[string]any{"Items": []map[string]any{{"Value": "job-key", "Label": "Caller download", "Status": "paused", "Progress": 12.345, "ResumeAction": "caller-resume", "Bytes": 123456789}}}, []string{`data-native-download="job-key"`, `data-state="paused" data-bytes="123456789"`, `value="12.345" max="100"`, `data-ely-action="caller-resume" value="job-key"`}},
		{"HardwareMonitor", map[string]any{"Items": []map[string]any{{"Label": "Caller GPU", "Progress": 23.456, "Content": "Caller detail", "History": "[0.1,0.2]"}}}, []string{`value="23.456"`, `data-values="[0.1,0.2]"`, `Caller detail`}},
		{"ModelStatus", map[string]any{"Items": []map[string]any{{"Label": "Caller model", "Status": "ready", "MemoryUsed": 123456789, "MemoryTotal": 999999999, "MemoryLabel": "Caller units"}}}, []string{`max="999999999" value="123456789"`, `Caller units`}},
		{"FineTuneJobCard", map[string]any{"Label": "Caller job", "Value": "Caller base", "Dataset": "Caller data", "Status": "running", "Epoch": 1, "Epochs": 4, "Progress": 0, "TrainLoss": "[2,1]", "HeldLoss": "[3,2]", "Action": "caller-cancel"}, []string{`data-epoch="1" data-epochs="4" data-progress="0"`, `Caller base · Caller data`, `data-train="[2,1]" data-held="[3,2]"`, `data-ely-action="caller-cancel"`}},
		{"DatasetViewer", map[string]any{"PageSize": 3, "Items": []map[string]any{{"Value": "row-key", "Label": "Caller prompt", "Content": "Caller answer", "Status": "Caller split", "Tokens": 123.45}}}, []string{`data-page-size="3"`, `data-native-sample="row-key"`, `data-tokens="123.45"`, `<dd>Caller answer</dd>`}},
		{"EmbeddingVisualizer", map[string]any{"Points": "[{" + `"key":"a","label":"Caller point","group":0,"at":[0.123,0,-0.3]}` + "]", "Groups": []string{"Caller group"}, "ThreeDimensions": true, "AspectRatio": 2}, []string{`data-three="true" data-ratio="2"`, `[0.123,0,-0.3]`, `Caller group`, `tabindex="0" data-native-embedding-plot`}},
		{"PromptPlayground", map[string]any{"Value": "Say {topic}", "Variables": "{\"topic\":\"Caller\"}", "Action": "caller-run", "Output": "Caller output", "Temperature": 0}, []string{`Say {topic}`, `data-action="caller-run"`, `data-values="{&#34;topic&#34;:&#34;Caller&#34;}"`, `value="0"`, `Caller output`}},
		{"PromptVersionHistory", map[string]any{"Chosen": 0, "RestoreAction": "caller-restore", "Items": []map[string]any{{"Value": "version-key", "Note": "Caller note", "Author": "Caller author", "When": "Caller time", "Content": "Caller words"}}}, []string{`data-chosen="0"`, `data-key="version-key" data-text="Caller words"`, `Caller author · Caller time`, `data-action="caller-restore"`}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "generative", Name: tc.name, ID: "caller-tools", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(out.String(), want) {
					t.Fatalf("missing %q in %s", want, out.String())
				}
			}
			if strings.Contains(out.String(), " style=") {
				t.Fatal("inline style violates gallery CSP")
			}
		})
	}
}
