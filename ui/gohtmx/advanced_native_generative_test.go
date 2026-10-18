package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestNativeGenerativeCallerContracts(t *testing.T) {
	tpl := nativeTemplates(t)
	for _, tc := range []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"ImageGenerationPanel", map[string]any{"Name": "description", "Value": "Caller <prompt>", "NegativePrompt": "blur, caller words", "Seed": "00042", "Style": "caller-style", "AspectRatio": "7:3", "Action": "caller-generate", "EnhanceAction": "caller-enhance", "Options": []map[string]any{{"Value": "caller-style", "Label": "Caller style", "URL": "/caller.jpg"}}, "Ratios": []map[string]any{{"Value": "7:3", "Label": "Caller ratio"}}}, []string{`name="description"`, `Caller &lt;prompt&gt;`, `value="blur, caller words"`, `value="00042"`, `value="caller-style"`, `data-native-ratio="7:3"`, `data-ely-submit="caller-generate"`, `data-ely-action="caller-enhance"`}},
		{"ImageCompare", map[string]any{"BeforeURL": "/before.jpg", "AfterURL": "/after.jpg", "Compare": 0}, []string{`src="/before.jpg"`, `src="/after.jpg"`, `value="0" data-native-compare`}},
		{"GenerationQueue", map[string]any{"Items": []map[string]any{{"Value": "job-42", "Label": "Caller job", "Content": "Caller status", "Status": "running", "Progress": 0, "Action": "caller-cancel", "ActionLabel": "Cancel"}}}, []string{`data-native-item="job-42"`, `data-native-outcome="running"`, `data-native-job-progress="0"`, `data-ely-action="caller-cancel" value="job-42"`, `Caller status`}},
		{"GenerationGrid", map[string]any{"Items": []map[string]any{{"Value": "result-9", "Label": "Caller result", "URL": "/result.jpg", "OpenAction": "caller-open"}}}, []string{`data-ely-action="caller-open" value="result-9"`, `src="/result.jpg"`}},
		{"VariationPicker", map[string]any{"URL": "/hero.jpg", "Options": []map[string]any{{"Value": "choice", "Label": "Caller choice", "URL": "/choice.jpg", "Selected": true}}, "UpscaleAction": "caller-upscale"}, []string{`src="/hero.jpg"`, `value="choice" checked`, `src="/choice.jpg"`, `data-ely-action="caller-upscale"`}},
		{"ABCompareView", map[string]any{"Blind": true, "Verdict": 0, "Sides": []map[string]any{{"Label": "Caller model", "Content": "Caller result"}}}, []string{`data-blind="true" data-verdict="0"`, `data-model="Caller model"`, `Caller result`}},
		{"InpaintCanvas", map[string]any{"URL": "/mask.jpg", "BrushRadius": .123, "Strokes": `[{"points":[[0.2,0.3]],"radius":0.1,"erase":false}]`, "Erase": true, "Width": 400, "Height": 300, "MaskAction": "caller-mask"}, []string{`src="/mask.jpg"`, `data-brush-radius="0.123" data-erase="true"`, `width="400" height="300"`, `data-mask-action="caller-mask"`, `&#34;points&#34;:[[0.2,0.3]]`}},
		{"InpaintCanvas", map[string]any{}, []string{`data-mask-action="apply-mask"`}},
		{"AudioGenerationPlayer", map[string]any{"Duration": 0}, []string{`data-duration="0"`, `aria-valuemax="0"`}},
		{"AudioGenerationPlayer", map[string]any{"URL": "/caller.wav", "Duration": 73.25, "Position": 0, "Making": 0, "RegenerateAction": "caller-regenerate", "DownloadAction": "caller-download", "Samples": []map[string]any{{"X": 1.5, "Y": 2, "Width": 3, "Height": 4.5}}}, []string{`data-duration="73.25" data-position="0"`, `data-making="0"`, `src="/caller.wav"`, `data-ely-action="caller-regenerate" aria-label="Regenerate" disabled`, `data-ely-action="caller-download"`, `x="1.5" y="2" width="3" height="4.5"`}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "generative", Name: tc.name, ID: "caller-gen", Props: tc.props}); err != nil {
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
