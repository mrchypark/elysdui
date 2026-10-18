package uiexamples

import (
	"encoding/json"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"testing"
)

func TestNativeGenerativeSourceFixtures(t *testing.T) {
	fixtures := map[string]map[string]any{}
	for _, fixture := range advancedNativeCases() {
		if fixture.Component.Chapter == "generative" {
			fixtures[fixture.Component.Name] = fixture.Component.Props
		}
	}
	panel := fixtures["ImageGenerationPanel"]
	if panel["Value"] != "a spiral staircase in a white atrium" || panel["NegativePrompt"] != "blurry,watermark,people" || panel["Seed"] != "2710" || panel["Style"] != "photo" || panel["AspectRatio"] != "3:2" {
		t.Fatal("source panel values changed")
	}
	presets := panel["Options"].([]map[string]any)
	if len(presets) != 6 || len(panel["Ratios"].([]map[string]any)) != 5 {
		t.Fatal("source six presets or five ratios lost")
	}
	for _, preset := range presets {
		if url, ok := preset["URL"].(string); ok {
			if _, err := ui.Files.ReadFile(url[1:]); err != nil {
				t.Fatal(err)
			}
		}
	}
	jobs := fixtures["GenerationQueue"]["Items"].([]map[string]any)
	if len(jobs) != 5 {
		t.Fatal("source five jobs lost")
	}
	for i, state := range []string{"done", "running", "queued", "queued", "failed"} {
		if jobs[i]["Status"] != state {
			t.Fatalf("job %d lost %s", i, state)
		}
	}
	if jobs[1]["Progress"] != 62 || jobs[4]["Value"] != "tide" || jobs[4]["Content"] != "Failed · out of memory on the GPU" {
		t.Fatal("source progress or failure changed")
	}
	grid := fixtures["GenerationGrid"]
	tiles := grid["Items"].([]map[string]any)
	if len(tiles) != 4 || tiles[2]["Progress"] != 40 || tiles[3]["Content"] != "Stopped by the content filter" {
		t.Fatal("source result outcomes changed")
	}
	if grid["PreviewExamples"].([]map[string]any)[1]["PreviewName"] != "ImageCompare" {
		t.Fatal("image comparison must render its alias")
	}
	variations := fixtures["VariationPicker"]
	if len(variations["Options"].([]map[string]any)) != 4 || variations["Blind"] != true || variations["PreviewExamples"].([]map[string]any)[1]["PreviewName"] != "ABCompareView" {
		t.Fatal("source variations or blind comparison changed")
	}
	var strokes []struct {
		Points [][2]float64
		Radius float64
		Erase  bool
	}
	if err := json.Unmarshal([]byte(fixtures["InpaintCanvas"]["Strokes"].(string)), &strokes); err != nil {
		t.Fatal(err)
	}
	if len(strokes) != 1 || len(strokes[0].Points) != 5 || strokes[0].Radius != .07 || strokes[0].Erase || strokes[0].Points[0] != [2]float64{.07, .18} {
		t.Fatal("source tree mask lost")
	}
	audio := fixtures["AudioGenerationPlayer"]
	if audio["Duration"] != 32 || audio["Position"] != 12 || audio["URL"] != "" || len(audio["Samples"].([]map[string]any)) != 56 {
		t.Fatal("source generated audio peaks/time changed or fabricated audio added")
	}
	making := audio["PreviewExamples"].([]map[string]any)[1]
	if making["Making"] != .45 || making["Duration"] != 45 {
		t.Fatal("source making preview lost")
	}
}

func TestNativeGenerativeRemainderSourceFixtures(t *testing.T) {
	fixtures := map[string]map[string]any{}
	for _, fixture := range advancedNativeCases() {
		if fixture.Component.Chapter == "generative" {
			fixtures[fixture.Component.Name] = fixture.Component.Props
		}
	}
	voice := fixtures["TTSVoicePicker"]
	voices := voice["Items"].([]map[string]any)
	if len(voices) != 4 || voices[3]["Value"] != "ines" || voice["Selected"] != "iris" || voice["HideScript"] != true {
		t.Fatal("source four voices lost")
	}
	video := fixtures["VideoGenerationTimeline"]
	shots := video["Frames"].([]map[string]any)
	if len(shots) != 4 || video["Position"] != 3.2 || video["URL"] != "" {
		t.Fatal("shot timeline data lost or fabricated video added")
	}
	for i, duration := range []int{5, 4, 6, 4} {
		if shots[i]["Duration"] != duration {
			t.Fatal("shot duration changed")
		}
	}
	if shots[2]["Progress"] != 35 || shots[3]["Content"] != "timed out" {
		t.Fatal("pending/failed shot outcomes lost")
	}
	model := fixtures["ModelCard"]
	if model["Label"] != "Orchid 8B" || model["InUse"] != true || model["PreviewExamples"].([]map[string]any)[1]["Label"] != "Juniper 70B" {
		t.Fatal("source two model cards lost")
	}
	downloads := fixtures["ModelDownloadManager"]["Items"].([]map[string]any)
	if len(downloads) != 5 {
		t.Fatal("source five downloads lost")
	}
	for i, status := range []string{"fetching", "paused", "queued", "failed", "done"} {
		if downloads[i]["Status"] != status {
			t.Fatal("download state changed")
		}
	}
	status := fixtures["ModelStatus"]
	if len(status["Items"].([]map[string]any)) != 3 || len(status["Readings"].([]map[string]any)) != 3 || status["PreviewExamples"].([]map[string]any)[1]["PreviewName"] != "HardwareMonitor" {
		t.Fatal("model/hardware source compositions lost")
	}
	tune := fixtures["FineTuneJobCard"]
	if tune["Epoch"] != 2 || tune["Epochs"] != 3 || tune["Progress"] != 64 || tune["TrainLoss"] != "[1.9,1.4,1.1,0.92,0.81,0.74]" {
		t.Fatal("source epoch/loss data changed")
	}
	samples := fixtures["DatasetViewer"]["Items"].([]map[string]any)
	if len(samples) != 12 || samples[0]["Tokens"] != 38 || samples[11]["Content"] != "Ottawa." || fixtures["DatasetViewer"]["PageSize"] != 5 {
		t.Fatal("source twelve samples/five-row page lost")
	}
	var points []struct {
		Key   string
		Group int
		At    [3]float64
	}
	if err := json.Unmarshal([]byte(fixtures["EmbeddingVisualizer"]["Points"].(string)), &points); err != nil {
		t.Fatal(err)
	}
	if len(points) != 64 {
		t.Fatal("source 64 points lost")
	}
	groups := [4]int{}
	for _, point := range points {
		if point.Group < 0 || point.Group > 3 {
			t.Fatal("invalid group")
		}
		groups[point.Group]++
		for _, axis := range point.At {
			if axis < -1 || axis > 1 {
				t.Fatal("point outside source space")
			}
		}
	}
	if groups != [4]int{16, 16, 16, 16} {
		t.Fatal("source topic distribution lost")
	}
	if fixtures["PromptPlayground"]["Value"] != "Write three short notes on {topic} in a {tone} voice." || fixtures["PromptPlayground"]["Output"] != "" {
		t.Fatal("source template changed or output fabricated")
	}
	versions := fixtures["PromptDiff"]["Items"].([]map[string]any)
	if len(versions) != 4 || versions[1]["Value"] != "v3" || fixtures["PromptDiff"]["Chosen"] != 1 {
		t.Fatal("source chosen prompt version lost")
	}
}
