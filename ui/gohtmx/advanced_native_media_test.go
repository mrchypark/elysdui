package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestNativeMediaCallerGeometryAndHostBoundaries(t *testing.T) {
	tpl := nativeTemplates(t)
	cases := []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"ImageCropper", map[string]any{"URL": "/caller.jpg", "Crop": `{"x":0,"y":0.2,"width":1,"height":0.6}`, "Ratio": 2.5, "Action": "commit-crop"}, []string{`data-ratio="2.5"`, `data-action="commit-crop"`, `&#34;height&#34;:0.6`, `data-native-crop-grip="nw"`, `src="/caller.jpg"`}},
		{"ImageAnnotator", map[string]any{"URL": "/caller.jpg", "Width": 1200, "Height": 800, "Marks": `[{"tool":"pin","at":[0.2,0.3],"color":2}]`, "Action": "commit-marks"}, []string{`width="1200" height="800"`, `data-action="commit-marks"`, `data-native-mark-redo`, `&#34;at&#34;:[0.2,0.3]`}},
		{"ImageUpload", map[string]any{"URL": "/picked.webp", "FileName": "caller.webp", "Crop": `{"x":0,"y":0,"width":1,"height":1}`, "Name": "photo", "Accept": "image/webp"}, []string{`name="photo"`, `accept="image/webp"`, `caller.webp`, `src="/picked.webp"`, `data-native-upload-remove`}},
		{"VideoPlayer", map[string]any{"URL": "/movie.webm", "FrameURL": "/poster.jpg", "Position": 0, "Loaded": 0, "Duration": 123.456, "PlayAction": "caller-play"}, []string{`<video data-native-media src="/movie.webm" poster="/poster.jpg"`, `data-native-position="0"`, `data-native-loaded="0"`, `data-native-duration="123.456"`, `data-ely-action="caller-play"`, `data-native-seek`}},
		{"AudioPlayer", map[string]any{"URL": "/audio.ogg", "Volume": 0, "Muted": true, "Position": .125, "Duration": 71.25, "PreviousAction": "caller-back"}, []string{`src="/audio.ogg"`, `data-native-level="0"`, `data-native-muted="true"`, `data-native-position="0.125"`, `data-native-duration="71.25"`, `data-ely-action="caller-back"`}},
		{"AudioWaveform", map[string]any{"Peaks": "[0,0.123456789,1]", "Duration": 123.45, "Position": 0}, []string{`data-peaks="[0,0.123456789,1]"`, `aria-valuemax="123.45"`, `aria-valuenow="0"`}},
		{"VideoThumbnailStrip", map[string]any{"Duration": 90, "TrimStart": 0, "TrimEnd": 0}, []string{`data-native-trim-start="0"`, `data-native-trim-end="0"`}},
		{"SubtitleEditor", map[string]any{"Items": []map[string]any{{"Value": "caller-cue", "Start": "00:01.125", "End": "00:02.875", "Content": "<caller>"}}, "HideApply": true}, []string{`data-key="caller-cue"`, `value="00:01.125"`, `&lt;caller&gt;`, `data-native-subtitle-add`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: "media", Name: tc.name, ID: "caller-media", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(out.String(), want) {
					t.Fatalf("lost caller contract %q", want)
				}
			}
			if strings.Contains(out.String(), " style=") {
				t.Fatal("inline style violates gallery CSP")
			}
		})
	}
	var out bytes.Buffer
	if err := RenderComponent(tpl, &out, Component{Chapter: "media", Name: "VideoPlayer", ID: "host-frames", Props: map[string]any{"FrameURL": "/host.jpg", "Position": 34}}); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out.String(), "<video") || !strings.Contains(out.String(), `data-native-video-frame src="/host.jpg"`) {
		t.Fatal("host frame must not substitute fabricated playback")
	}
}
