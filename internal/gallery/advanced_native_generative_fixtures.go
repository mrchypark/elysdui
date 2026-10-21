package uiexamples

import (
	"encoding/json"
	"math"
	"strconv"
)

func nativeEmbeddingPoints() string {
	noise := func(seed uint32) float32 {
		x := (seed + 1) * 0x9E3779B9
		x ^= x >> 16
		x *= 0x7FEB352D
		x ^= x >> 15
		x *= 0x846CA68B
		x ^= x >> 16
		return float32(x) / float32(math.MaxUint32)
	}
	middles := [][3]float32{{-.5, .4, .2}, {.45, .35, -.3}, {.1, -.5, .4}, {-.3, -.2, -.5}}
	points := make([]map[string]any, 64)
	for i := range points {
		at := [3]float32{}
		for axis := range at {
			seed := uint32(i*6 + axis*2)
			// Quantize onto a fixed grid: arm64 contracts this multiply-add into
			// FMA while amd64 does not, so the raw float32 differs in the last ULP
			// between architectures and the committed fixture bytes must not.
			at[axis] = float32(nativeQuantize(float64(middles[i%4][axis]+(noise(seed)+noise(seed+1)-1)*.3), 1e5))
		}
		points[i] = map[string]any{"key": "note-" + strconv.Itoa(i), "label": "Note " + strconv.Itoa(i+1), "group": i % 4, "at": at}
	}
	encoded, _ := json.Marshal(points)
	return string(encoded)
}

func nativeGenerativeRemainder(name string, p map[string]any) {
	single := []map[string]any{{"Title": ""}}
	switch name {
	case "TTSVoicePicker":
		p["Selected"], p["Playing"], p["HideScript"] = "iris", "", true
		p["Items"] = []map[string]any{
			{"Value": "iris", "Label": "Iris", "Content": "Warm and unhurried, for long reads", "TagItems": []string{"English", "US"}, "Selected": true},
			{"Value": "theo", "Label": "Theo", "Content": "Bright and quick, for product tours", "TagItems": []string{"English", "UK"}},
			{"Value": "mei", "Label": "Mei", "Content": "Calm, with clear diction", "TagItems": []string{"Mandarin", "English"}},
			{"Value": "ines", "Label": "Inés", "Content": "Soft, close to the microphone", "TagItems": []string{"Spanish"}},
		}
		p["PreviewExamples"] = single
	case "VideoGenerationTimeline":
		p["Position"], p["Selected"], p["URL"] = 3.2, "s1", ""
		p["Frames"] = []map[string]any{
			{"Value": "s1", "Time": 0, "Duration": 5, "Label": "a slow pan across a white atrium", "Status": "done", "URL": "/assets/ely/native-generative/atrium.jpg", "Selected": true},
			{"Value": "s2", "Time": 5, "Duration": 4, "Label": "light moves over the stair", "Status": "done", "URL": "/assets/ely/native-generative/atrium-stair.jpg"},
			{"Value": "s3", "Time": 9, "Duration": 6, "Label": "dusk over the dunes", "Status": "pending", "Progress": 35},
			{"Value": "s4", "Time": 15, "Duration": 4, "Label": "grass bends in the wind", "Status": "failed", "Content": "timed out"},
		}
		p["PreviewExamples"] = single
	case "ModelCard":
		facts := func(size string) []map[string]any {
			return []map[string]any{{"Label": "Parameters", "Content": size}, {"Label": "Context", "Content": "128K tokens"}, {"Label": "License", "Content": "Apache-2.0"}}
		}
		p["Label"], p["Maker"], p["Content"], p["Value"], p["InUse"] = "Orchid 8B", "Orchid Labs", "Writes and reasons in plain words; runs on one card.", "orchid", true
		p["Items"], p["Tags"], p["Action"], p["ActionLabel"] = facts("8B"), []string{"Tools", "Vision"}, "use-model", "Use"
		p["PreviewExamples"] = []map[string]any{{"Title": ""}, {"Title": "", "Label": "Juniper 70B", "Maker": "Juniper Co", "Content": "Long, careful answers for research and code.", "Value": "juniper", "InUse": false, "Items": facts("70B"), "Tags": []string{"Tools"}}}
	case "ModelDownloadManager":
		action := func(key, kind, label, icon string) map[string]any {
			return map[string]any{"Value": key, "Kind": kind, "Action": kind + "-download", "Label": label, "Icon": icon}
		}
		p["Items"] = []map[string]any{
			{"Value": "orchid", "Label": "Orchid 8B · Q4", "Status": "fetching", "Bytes": 4900000000, "Rate": 38000000, "Progress": 43, "Content": "2.1 GB of 4.9 GB · 38 MB/s · about 1m 13s left", "Actions": []map[string]any{action("orchid", "pause", "Pause", "pause"), action("orchid", "resume", "Resume", "play"), action("orchid", "cancel", "Cancel", "x")}},
			{"Value": "juniper", "Label": "Juniper 70B · Q4", "Status": "paused", "Bytes": 39000000000, "Progress": 12, "Content": "Paused at 12% · 4.7 GB of 39 GB", "Actions": []map[string]any{action("juniper", "pause", "Pause", "pause"), action("juniper", "resume", "Resume", "play"), action("juniper", "cancel", "Cancel", "x")}},
			{"Value": "voice", "Label": "Iris voice pack", "Status": "queued", "Bytes": 310000000, "Content": "Queued", "Actions": []map[string]any{action("voice", "cancel", "Cancel", "x")}},
			{"Value": "embed", "Label": "Lichen embeddings", "Status": "failed", "Bytes": 640000000, "Content": "Failed · the disk is full", "Actions": []map[string]any{action("embed", "retry", "Retry", ""), action("embed", "delete", "Remove", "x")}},
			{"Value": "tiny", "Label": "Orchid 1B · Q8", "Status": "done", "Bytes": 1300000000, "Content": "1.3 GB", "Actions": []map[string]any{action("tiny", "delete", "Delete from this machine", "trash-2")}},
		}
		p["PreviewExamples"] = single
	case "ModelStatus":
		p["Items"] = []map[string]any{{"Value": "orchid", "Label": "Orchid 8B", "Status": "ready", "Content": "Loaded", "MemoryUsed": 7800000000, "MemoryTotal": 24000000000, "MemoryLabel": "7.8 GB of 24 GB"}, {"Value": "juniper", "Label": "Juniper 70B", "Status": "loading", "Progress": 62, "Content": "Loading · 62%"}, {"Value": "iris", "Label": "Iris voice", "Status": "idle", "Content": "Not loaded"}}
		p["Readings"] = []map[string]any{{"Label": "GPU", "Progress": 72, "Content": "72%", "History": "[0.2,0.35,0.6,0.55,0.7,0.8,0.72]"}, {"Label": "GPU memory", "Progress": 93, "Content": "22.3 GB of 24 GB", "History": "[0.5,0.6,0.8,0.9,0.92,0.93,0.93]"}, {"Label": "CPU", "Progress": 31, "Content": "31%", "History": "[0.4,0.3,0.25,0.35,0.3,0.28,0.31]"}}
		p["PreviewExamples"] = []map[string]any{{"Title": ""}, {"Title": "", "PreviewName": "HardwareMonitor"}}
	case "FineTuneJobCard":
		p["Label"], p["Value"], p["Dataset"], p["Status"] = "Plain-words tone", "Orchid 8B", "notes-2026.jsonl · 1,240 examples", "running"
		p["Epoch"], p["Epochs"], p["Progress"], p["Action"], p["ActionLabel"] = 2, 3, 64, "cancel-tune", "Cancel"
		p["TrainLoss"], p["HeldLoss"] = "[1.9,1.4,1.1,0.92,0.81,0.74]", "[2,1.5,1.2,1.02,0.95,0.91]"
		p["PreviewExamples"] = []map[string]any{{"Title": ""}, {"Title": "", "Label": "Support replies", "Value": "Juniper 70B", "Dataset": "tickets.jsonl · 8,900 examples", "Status": "done", "TrainLoss": "[1.6,1.1,0.8,0.62,0.55,0.51]", "HeldLoss": "[1.7,1.2,0.9,0.74,0.69,0.68]", "Action": "open-tuned-model", "ActionLabel": "Open"}}
	case "DatasetViewer":
		p["HideFilter"], p["PageSize"] = true, 5
		p["Items"] = nativeDatasetSamples()
		p["PreviewExamples"] = single
	case "EmbeddingVisualizer":
		p["Points"], p["Groups"], p["ThreeDimensions"], p["Label"] = nativeEmbeddingPoints(), []string{"Recipes", "Travel", "Finance", "Code"}, false, "Notes by topic"
		p["PreviewExamples"] = []map[string]any{{"Title": ""}, {"Title": "", "ThreeDimensions": true}}
	case "PromptPlayground":
		p["HideTemperature"], p["HideRuns"] = true, true
		p["Value"], p["Action"], p["ActionLabel"] = "Write three short notes on {topic} in a {tone} voice.", "run-prompt", "Run"
		p["Variables"], p["Running"], p["Output"] = "{}", false, ""
		delete(p, "Temperature")
		p["PreviewExamples"] = single
	case "PromptDiff":
		p["Chosen"] = 1
		p["Items"] = []map[string]any{
			{"Value": "v4", "Note": "Offer the next step", "Author": "Theo", "When": "3 hours ago", "Content": "You answer support questions. Write plain, short replies. Say sorry once. Offer the next step."},
			{"Value": "v3", "Note": "Sorry once, not every line", "Author": "Theo", "When": "1 day ago", "Content": "You answer support questions. Write plain, short replies. Say sorry once."},
			{"Value": "v2", "Note": "Plain words", "Author": "Mira", "When": "2 days ago", "Content": "You answer support questions. Write plain replies. Always say sorry."},
			{"Value": "v1", "Note": "First draft", "Author": "Mira", "When": "4 days ago", "Content": "You are a helpful assistant. Always say sorry."},
		}
		p["PreviewExamples"] = single
	}
}

func nativeDatasetSamples() []map[string]any {
	return []map[string]any{
		{"Value": "sample-0", "Label": "Summarize the meeting notes in two lines.", "Content": "The launch moves to May. Design owns the new onboarding flow.", "Status": "Train", "Tokens": 38},
		{"Value": "sample-1", "Label": "Turn this list into a friendly reminder.", "Content": "A quick note: the lab closes at six on Friday. Please take your samples home.", "Status": "Train", "Tokens": 41},
		{"Value": "sample-2", "Label": "Translate 'good morning' into Spanish.", "Content": "Buenos días.", "Status": "Train", "Tokens": 12},
		{"Value": "sample-3", "Label": "Write a subject line for a refund email.", "Content": "Your refund is on its way", "Status": "Held out", "Tokens": 17},
		{"Value": "sample-4", "Label": "Explain a mutex to a new engineer.", "Content": "A mutex lets one thread touch shared data at a time. The others wait their turn.", "Status": "Train", "Tokens": 36},
		{"Value": "sample-5", "Label": "Suggest a name for a hiking app.", "Content": "Trailhead", "Status": "Train", "Tokens": 11},
		{"Value": "sample-6", "Label": "Rewrite without jargon: 'We will leverage synergies.'", "Content": "We will work together.", "Status": "Held out", "Tokens": 24},
		{"Value": "sample-7", "Label": "List three checks before a deploy.", "Content": "Tests pass. Migrations run. Someone is on call.", "Status": "Train", "Tokens": 29},
		{"Value": "sample-8", "Label": "Answer in one word: is 91 prime?", "Content": "No.", "Status": "Held out", "Tokens": 13},
		{"Value": "sample-9", "Label": "Draft a two-line product update.", "Content": "Search is twice as fast. Filters now remember your last choice.", "Status": "Train", "Tokens": 33},
		{"Value": "sample-10", "Label": "Give a calm reply to an angry customer.", "Content": "I'm sorry for the trouble. I've refunded the order and will check in tomorrow.", "Status": "Train", "Tokens": 40},
		{"Value": "sample-11", "Label": "Name the capital of Canada.", "Content": "Ottawa.", "Status": "Held out", "Tokens": 10},
	}
}
