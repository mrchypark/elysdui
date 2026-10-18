package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestNativeDeviceCallerContracts(t *testing.T) {
	tpl := nativeTemplates(t)
	for _, test := range []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"ScreenRecorderControls", map[string]any{"Recording": "paused", "Elapsed": 42.5, "Microphone": false, "Checked": true, "Camera": true, "Action": "caller-record", "PauseAction": "caller-pause", "ResumeAction": "caller-resume", "StopAction": "caller-stop", "MicAction": "caller-mic"}, []string{`data-recording="paused"`, `data-elapsed="42.5"`, `data-ely-action="caller-record"`, `data-ely-action="caller-resume"`, `data-ely-action="caller-stop"`, `aria-label="Microphone" aria-pressed="false"`, `aria-label="Camera" aria-pressed="true"`}},
		{"CameraPreview", map[string]any{"URL": "/caller.jpg", "Alt": "Caller image", "CameraName": "Caller camera", "AspectRatio": 2}, []string{`src="/caller.jpg"`, `alt="Caller image"`, `data-ratio="2"`, `>Caller camera</figcaption>`}},
		{"MicLevelMeter", map[string]any{"Items": []map[string]any{{"Label": "Caller microphone", "Progress": .12345, "Content": "Caller level"}}}, []string{`value="0.12345"`, `data-native-mic-segments`, `Caller microphone level`, `Caller level`}},
		{"DeviceSelector", map[string]any{"Items": []map[string]any{{"Value": "caller-input", "Label": "Caller input", "Chosen": "second", "Options": []map[string]any{{"Value": "first", "Label": "First", "Selected": true}, {"Value": "second", "Label": "Second"}}}, {"Value": "empty", "Label": "Empty", "Placeholder": "No device found"}}}, []string{`data-slot="select"`, `name="caller-input"`, `value="second" selected`, `name="empty" disabled`, `No device found`}},
		{"3DModelViewer", map[string]any{"Vertices": "[[0,0,0],[1,0,0],[0,1,0]]", "Faces": "[[0,1,2]]", "Width": 320, "Height": 200, "MeshColor": "#123456", "Wireframe": true, "Yaw": 0, "Pitch": 0, "Distance": 2, "URL": "/host-model.png"}, []string{`width="320" height="200"`, `data-yaw="0" data-pitch="0" data-distance="2"`, `data-vertices="[[0,0,0],[1,0,0],[0,1,0]]"`, `data-faces="[[0,1,2]]"`, `data-mesh-color="#123456"`, `data-wireframe="true"`, `src="/host-model.png"`}},
	} {
		t.Run(test.name, func(t *testing.T) {
			var output bytes.Buffer
			if err := RenderComponent(tpl, &output, Component{Chapter: "media", Name: test.name, ID: "caller-device", Props: test.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range test.want {
				if !strings.Contains(output.String(), want) {
					t.Fatalf("missing %q in %s", want, output.String())
				}
			}
			if strings.Contains(output.String(), " style=") {
				t.Fatal("inline style violates gallery CSP")
			}
		})
	}
}
