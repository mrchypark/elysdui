package uiexamples

import (
	"encoding/json"
	"fmt"
	"math"
)

// Exact gallery datasets at 49ed1f8; playback remains a host responsibility.
func nativeMediaFixtures(name string, props map[string]any) {
	p := map[string]any{}
	image := func(name string) string { return "/assets/ely/native-generative/" + name + ".jpg" }
	cues := []map[string]any{{"Value": "cue-1", "Start": "00:02.000", "End": "00:09.000", "Content": "Morning comes in through the tall window."}, {"Value": "cue-2", "Start": "00:31.000", "End": "00:38.000", "Content": "Light falls on the stair.", "Active": true}, {"Value": "cue-3", "Start": "01:01.000", "End": "01:10.000", "Content": "The shadow walks the length of the hall."}}
	switch name {
	case "ImageViewer":
		p = map[string]any{"URL": image("atrium"), "Alt": "An atrium, noon"}
	case "ImageThumbnail":
		items := []map[string]any{}
		for i, row := range [][4]string{{"atrium", "An atrium, noon", "", "1.5"}, {"dunes", "Dunes at first light", "", "1.5"}, {"olive", "An olive tree by the stair", "HDR", "1.5"}, {"dunes-grass", "Grass on the ridge", "", "1.5"}, {"dunes-square", "The long shadow", "+2", "1"}} {
			url := image(row[0])
			if i == 2 {
				url = "/assets/ely/native-camera.jpg"
			}
			items = append(items, map[string]any{"Value": row[0], "URL": url, "Alt": row[1], "Caption": row[1], "Content": row[2], "Ratio": row[3], "Selected": i == 0, "Action": "open-image"})
		}
		p["Items"] = items
	case "ImageCropper":
		p = map[string]any{"URL": image("atrium"), "Alt": "An atrium, noon", "Ratio": 1.5, "Crop": `{"x":0.12,"y":0.1,"width":0.7,"height":0.75}`, "HideApply": true, "Options": []map[string]any{{"Value": "free", "Label": "Free", "Selected": true}, {"Value": "1:1", "Label": "1:1"}, {"Value": "4:3", "Label": "4:3"}, {"Value": "16:9", "Label": "16:9"}}}
	case "ImageUpload":
		p = map[string]any{"URL": image("dunes"), "Alt": "Dunes at first light", "FileName": "dunes.jpg", "Ratio": 1.5, "AspectRatio": "1:1", "Crop": `{"x":0.16666666666666666,"y":0,"width":0.6666666666666666,"height":1}`}
	case "ImageAnnotator":
		p = map[string]any{"URL": image("atrium-stair"), "Alt": "The stone stair", "Width": 960, "Height": 640, "HideApply": true, "Marks": `[{"tool":"rectangle","from":[0.52,0.18],"to":[0.9,0.86],"color":0},{"tool":"arrow","from":[0.2,0.3],"to":[0.36,0.52],"color":2},{"tool":"pin","at":[0.3,0.72],"color":1}]`}
	case "VideoPlayer":
		p = map[string]any{"URL": "", "FrameURL": image("atrium-stair"), "Ratio": 1.5, "Duration": 90, "Position": 34, "Loaded": 72, "Captions": true, "Playing": false, "Speed": 1, "CaptionTrack": `[{"start":2,"end":9,"text":"Morning comes in through the tall window."},{"start":31,"end":38,"text":"Light falls on the stair."},{"start":61,"end":70,"text":"The shadow walks the length of the hall."}]`}
	case "VideoTimeline":
		p = map[string]any{"Duration": 90, "Position": 34, "Loaded": 72, "Items": []map[string]any{{"Time": 0, "Label": "Morning"}, {"Time": 30, "Label": "The stair"}, {"Time": 60, "Label": "The hall"}}}
	case "VideoThumbnailStrip":
		frames := make([]map[string]any, 8)
		urls := []string{image("atrium"), image("atrium-stair"), "/assets/ely/native-camera.jpg"}
		for i := range frames {
			frames[i] = map[string]any{"URL": urls[i*3/8], "Alt": fmt.Sprintf("Atrium frame %d", i+1)}
		}
		p = map[string]any{"Duration": 90, "Position": 34, "TrimStart": 12, "TrimEnd": 66, "Frames": frames}
	case "SubtitleEditor":
		cues[1]["Active"] = true
		p = map[string]any{"Position": "00:34.000", "Items": cues, "HideApply": true}
	case "AudioPlayer":
		p = map[string]any{"URL": "", "Title": "Tall Windows", "Artist": "Aster Quartet", "CoverURL": image("dunes-square"), "CoverAlt": "Dunes at first light", "Duration": 222, "Position": 64, "Playing": false, "Repeat": "all", "Volume": .7}
	case "AudioWaveform":
		peaks := make([]float64, 180)
		state := uint64(7)
		for i := range peaks {
			state = state*6364136223846793005 + 1442695040888963407
			noise := float32(float64(state>>33) / float64(uint64(1)<<31))
			fade := min(float32(min(i, 179-i))/10, 1)
			swell := float32(.55) + float32(.45)*float32(math.Sin(float64(float32(i)/23)))
			peaks[i] = nativeQuantize(float64(fade*swell*(.35+.65*noise)), 1e6)
		}
		encoded, _ := json.Marshal(peaks)
		p = map[string]any{"Duration": 222, "Position": 64, "Peaks": string(encoded)}
	case "AudioSpectrum":
		levels := make([]map[string]any, 40)
		for i := range levels {
			band := float32(i)
			beat := float32(math.Sin(float64(float32(64)*2.3+band*.7))) * float32(math.Cos(float64(float32(64)*.9+band*.31)))
			level := (1 - band/52) * (.3 + .35*(1+beat))
			levels[i] = map[string]any{"Height": nativeQuantize(float64(level)*100, 1e4)}
		}
		p["Samples"] = levels
	case "VolumeControl":
		p = map[string]any{"Volume": .7, "Muted": false}
	case "PlaybackSpeedControl":
		options := []map[string]any{}
		for _, v := range []float64{.5, .75, 1, 1.25, 1.5, 2} {
			options = append(options, map[string]any{"Value": v, "Label": fmt.Sprintf("%g×", v), "Selected": v == 1})
		}
		p = map[string]any{"Speed": 1, "SpeedOptions": options}
	case "MediaControls":
		p = map[string]any{"Playing": false, "Shuffle": false, "Repeat": "all"}
	case "Playlist":
		p["Items"] = []map[string]any{{"Value": "tall-windows", "Label": "Tall Windows", "Artist": "Aster Quartet", "Content": "03:42", "Selected": true}, {"Value": "stone-stair", "Label": "Stone Stair", "Artist": "Aster Quartet", "Content": "04:05"}, {"Value": "olive-court", "Label": "Olive Court", "Artist": "Lumen Trio", "Content": "02:58"}, {"Value": "dune-hours", "Label": "Dune Hours", "Artist": "Lumen Trio", "Content": "05:11"}, {"Value": "low-sun", "Label": "Low Sun", "Artist": "Marram", "Content": "03:27"}}
	default:
		return
	}
	if name == "ImageUpload" {
		p["Action"] = "upload"
	}
	if name == "SubtitleEditor" {
		p["Action"] = "save-subtitles"
	}
	// Discard generic demo text, not public caller props. Preview copies use the same source-specific data.
	for _, key := range []string{"Title", "Description", "Caption", "URL", "Items", "Options"} {
		delete(props, key)
	}
	for k, v := range p {
		props[k] = v
	}
	p["HideHeader"] = true
	props["HideHeader"] = true
	props["PreviewExamples"] = []map[string]any{p}
}
