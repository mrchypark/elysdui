package uiexamples

import (
	"encoding/json"
	"math"
	"strconv"
	"strings"

	"github.com/mrchypark/elysdui/ui/gohtmx"
)

func nativePreviewValue(chapter, name string) string {
	values := map[string]string{
		"TitleBar": "Ely — Project notes", "ColumnShell": "Project notes", "WindowDragRegion": "Draft document", "WindowResizeBorder": "Resizable workspace", "NativeMenu": "File menu", "Toolbar": "Edit tools", "StatusBar": "Ln 12, Col 8", "ActivityBar": "Explorer", "TabBar": "Quarterly review", "SplashScreen": "Loading workspace", "AboutDialog": "Ely 0.2.0", "TrayIcon": "Sync complete", "DockBadge": "3 unread", "SystemNotification": "Build finished", "MultiWindow Manager": "Open windows", "WindowSwitcher": "Project notes", "QuickLauncher": "Open command", "MiniWindow": "Focus timer", "UpdateBanner": "Version 0.2.0", "UpdateDialog": "Ely 0.2.0 is available", "CrashReporter": "Unexpected quit", "OfflineIndicator": "Offline", "ZoomControl": "100%",
		"ImageGenerationPanel": "A sunlit stairwell in warm stone", "GenerationQueue": "Draft stairwell", "GenerationGrid": "Stairwell variations", "VariationPicker": "Architectural variation", "InpaintCanvas": "Repair highlighted wall", "AudioGenerationPlayer": "Gentle ambient loop", "TTSVoicePicker": "Welcome to the review", "VideoGenerationTimeline": "Stairwell sequence", "ModelCard": "Lumen 7B", "ModelDownloadManager": "Lumen 7B download", "ModelStatus": "Loaded models", "FineTuneJobCard": "Support replies", "DatasetViewer": "Training samples", "PromptPlayground": "Write three short notes", "PromptDiff": "Prompt revision",
		"ImageViewer": "Stairwell reference", "ImageThumbnail": "Scene thumbnails", "ImageCropper": "Stairwell crop", "ImageUpload": "architectural-reference.svg", "ImageAnnotator": "Stairwell annotations", "VideoPlayer": "Stairwell video", "VideoTimeline": "Scene timeline", "VideoThumbnailStrip": "Scene frames", "SubtitleEditor": "Caption track", "AudioPlayer": "Field recording", "AudioWaveform": "Audio waveform", "AudioSpectrum": "Audio spectrum", "VolumeControl": "Volume", "PlaybackSpeedControl": "Playback speed", "MediaControls": "Media controls", "Playlist": "Opening scene", "ScreenRecorderControls": "Screen recorder", "CameraPreview": "Studio camera", "MicLevelMeter": "Microphone input", "DeviceSelector": "Desk microphone", "3DModelViewer": "Torus model",
		"ThemeEditor": "--surface-canvas", "ThemeImporter": "theme.json", "Platform Style": "macOS", "I18nProvider": "Locale catalog", "LocaleNumber": "Localized number", "RTL layout": "Arabic layout", "SkipLink": "Skip to content", "ColorBlindSafe Palette": "Color-safe series", "Clock": "Seoul time", "Stopwatch": "00:00.0", "Calculator": "2 + 3 × 4", "UnitConverter": "3 metres", "QRCodeScanner": "ely://review/quiet", "Captcha": "Verification", "BarcodeDisplay": "978020137962", "Poll": "Review location", "Quiz": "Accessibility check", "ChangeLog Viewer": "Release notes", "LicenseViewer": "MIT License", "Terms": "Terms of service", "ExportDialog": "Export the table", "PrintButton": "Print report", "InspectorOverlay": "Selected node", "FPSMeter": "60 fps", "RenderCounter": "42 renders", "EventLogger": "Pointer events", "DesignTokenViewer": "Theme tokens", "IconBrowser": "search", "A11yChecker": "Contrast pairs", "ScreenshotTest Harness": "Gallery capture", "ComponentGallery": "Component gallery", "PlaygroundPanel": "Save changes", "RenderSurface": "Host drawing surface",
	}
	if value, ok := values[name]; ok {
		return value
	}
	return chapter + " specimen"
}

// nativeQuantize rounds a computed fixture float onto a fixed decimal grid.
// The committed catalogue bytes must match on every CPU architecture, and
// arm64 contracts multiply-add into FMA while amd64 does not, so raw trig
// results differ in the last ULP between machines. Quantizing the stored
// value keeps the rounding far coarser than that drift.
func nativeQuantize(v, scale float64) float64 {
	return math.Round(v*scale) / scale
}

func nativeTorusMesh() (string, string) {
	const majorSteps, minorSteps = 56, 24
	vertices := make([][]float64, 0, majorSteps*minorSteps)
	faces := make([][]int, 0, majorSteps*minorSteps)
	for major := 0; major < majorSteps; major++ {
		angle := float64(major) * 2 * math.Pi / majorSteps
		for minor := 0; minor < minorSteps; minor++ {
			inner := float64(minor) * 2 * math.Pi / minorSteps
			radius := 1 + .38*math.Cos(inner)
			vertices = append(vertices, []float64{
				nativeQuantize(radius*math.Cos(angle), 1e6),
				nativeQuantize(.38*math.Sin(inner), 1e6),
				nativeQuantize(radius*math.Sin(angle), 1e6),
			})
		}
	}
	for major := 0; major < majorSteps; major++ {
		for minor := 0; minor < minorSteps; minor++ {
			nextMajor, nextMinor := (major+1)%majorSteps, (minor+1)%minorSteps
			faces = append(faces, []int{major*minorSteps + minor, nextMajor*minorSteps + minor, nextMajor*minorSteps + nextMinor, major*minorSteps + nextMinor})
		}
	}
	vertexJSON, _ := json.Marshal(vertices)
	faceJSON, _ := json.Marshal(faces)
	return string(vertexJSON), string(faceJSON)
}

// advancedNativeCases supplies one caller-owned instance for every native primary.
func advancedNativeCases() []AdvancedCase {
	const stories = `shell|TitleBar
shell|ColumnShell
shell|WindowControls
shell|WindowDragRegion
shell|WindowResizeBorder
shell|NativeMenu
shell|Toolbar
shell|StatusBar
shell|ActivityBar
shell|TabBar
shell|SplashScreen
shell|AboutDialog
shell|TrayIcon
shell|DockBadge
shell|SystemNotification
shell|MultiWindow Manager
shell|WindowSwitcher
shell|QuickLauncher
shell|MiniWindow
shell|UpdateBanner
shell|UpdateDialog
shell|CrashReporter
shell|OfflineIndicator
shell|ZoomControl
generative|ImageGenerationPanel
generative|GenerationQueue
generative|GenerationGrid
generative|VariationPicker
generative|InpaintCanvas
generative|AudioGenerationPlayer
generative|TTSVoicePicker
generative|VideoGenerationTimeline
generative|ModelCard
generative|ModelDownloadManager
generative|ModelStatus
generative|FineTuneJobCard
generative|DatasetViewer
generative|EmbeddingVisualizer
generative|PromptPlayground
generative|PromptDiff
media|ImageViewer
media|ImageThumbnail
media|ImageCropper
media|ImageUpload
media|ImageAnnotator
media|VideoPlayer
media|VideoTimeline
media|VideoThumbnailStrip
media|SubtitleEditor
media|AudioPlayer
media|AudioWaveform
media|AudioSpectrum
media|VolumeControl
media|PlaybackSpeedControl
media|MediaControls
media|Playlist
media|ScreenRecorderControls
media|CameraPreview
media|MicLevelMeter
media|DeviceSelector
media|3DModelViewer
theme|Surfaces
theme|Ink
theme|Signals
theme|Series
theme|Syntax
theme|Type
theme|Shape
theme|Motion
theme|ThemeEditor
theme|ThemeImporter
theme|Platform Style
i18n|I18nProvider
i18n|LocaleNumber
i18n|RTL layout
i18n|SkipLink
i18n|ColorBlindSafe Palette
misc|Clock
misc|Stopwatch
misc|Calculator
misc|UnitConverter
misc|QRCodeScanner
misc|Captcha
misc|BarcodeDisplay
misc|Poll
misc|Quiz
misc|ChangeLog Viewer
misc|LicenseViewer
misc|Terms
misc|ExportDialog
misc|WebView
misc|IframeEmbed
misc|PrintButton
tooling|InspectorOverlay
tooling|FPSMeter
tooling|RenderCounter
tooling|EventLogger
tooling|DesignTokenViewer
tooling|IconBrowser
tooling|A11yChecker
tooling|ScreenshotTest Harness
tooling|ComponentGallery
tooling|PlaygroundPanel
rendering|RenderSurface`
	lines := strings.Split(stories, "\n")
	cases := make([]AdvancedCase, 0, len(lines))
	themeItems := map[string][]map[string]any{
		"Surfaces": {{"Label": "bg", "Value": "#FCFAF7", "Color": "#FCFAF7"}, {"Label": "surface", "Value": "#FFFFFF", "Color": "#FFFFFF"}, {"Label": "sunken", "Value": "#F6F4F1", "Color": "#F6F4F1"}, {"Label": "hover", "Value": "#F2F0ED", "Color": "#F2F0ED"}, {"Label": "active", "Value": "#E9E7E5", "Color": "#E9E7E5"}, {"Label": "border", "Value": "#E1DFDD", "Color": "#E1DFDD"}, {"Label": "border strong", "Value": "#CCCAC8", "Color": "#CCCAC8"}},
		"Ink":      {{"Label": "fg", "Value": "#181613", "Color": "#181613"}, {"Label": "muted", "Value": "#605D5A", "Color": "#605D5A"}, {"Label": "subtle", "Value": "#696764", "Color": "#696764"}, {"Label": "disabled", "Value": "#ACAAA8", "Color": "#ACAAA8"}, {"Label": "accent", "Value": "#181613", "Color": "#181613"}, {"Label": "focus", "Value": "#3772BB", "Color": "#3772BB"}, {"Label": "link", "Value": "#2863AB", "Color": "#2863AB"}},
		"Signals":  {{"Label": "success", "Value": "#267B4C", "Color": "#267B4C", "Content": "#E7F9EC"}, {"Label": "warning", "Value": "#A25F12", "Color": "#A25F12", "Content": "#FEF2DD"}, {"Label": "danger", "Value": "#BA3E38", "Color": "#BA3E38", "Content": "#FFEFEC"}, {"Label": "info", "Value": "#2E69B2", "Color": "#2E69B2", "Content": "#EBF4FF"}},
		"Series":   {{"Label": "1", "Value": "#5182C1", "Color": "#5182C1"}, {"Label": "2", "Value": "#009589", "Color": "#009589"}, {"Label": "3", "Value": "#AA732B", "Color": "#AA732B"}, {"Label": "4", "Value": "#B8636B", "Color": "#B8636B"}, {"Label": "5", "Value": "#8572BB", "Color": "#8572BB"}, {"Label": "6", "Value": "#539156", "Color": "#539156"}, {"Label": "7", "Value": "#B66946", "Color": "#B66946"}, {"Label": "8", "Value": "#138DB1", "Color": "#138DB1"}},
		"Syntax":   {{"Label": "Keyword", "Value": "#714CA6", "Color": "#714CA6", "Content": "fn "}, {"Label": "Function", "Value": "#2863AB", "Color": "#2863AB", "Content": "answer"}, {"Label": "Punctuation", "Value": "#605D5A", "Color": "#605D5A", "Content": "() { "}, {"Label": "Operator", "Value": "#605D5A", "Color": "#605D5A", "Content": "-> "}, {"Label": "Type", "Value": "#1E7777", "Color": "#1E7777", "Content": "Result "}, {"Label": "Variable", "Value": "#181613", "Color": "#181613", "Content": "config"}, {"Label": "Property", "Value": "#A14759", "Color": "#A14759", "Content": ".answer "}, {"Label": "Constant", "Value": "#AA5529", "Color": "#AA5529", "Content": "DEFAULT; "}, {"Label": "Number", "Value": "#A3591B", "Color": "#A3591B", "Content": "42 "}, {"Label": "Comment", "Value": "#696764", "Color": "#696764", "Content": "// truth\n"}, {"Label": "Tag", "Value": "#A14759", "Color": "#A14759", "Content": "<entry"}, {"Label": "Attribute", "Value": "#9F5D12", "Color": "#9F5D12", "Content": " kind="}, {"Label": "String", "Value": "#317A45", "Color": "#317A45", "Content": "\"quiet\">"}},
		"Type":     {{"Label": "Display 32", "Value": "32px", "Content": "Quiet interfaces age well.", "Size": "display"}, {"Label": "Heading 24", "Value": "24px", "Content": "Quiet interfaces age well.", "Size": "heading"}, {"Label": "Title 20", "Value": "20px", "Content": "Quiet interfaces age well.", "Size": "title"}, {"Label": "Subtitle 16", "Value": "16px", "Content": "Quiet interfaces age well.", "Size": "subtitle"}, {"Label": "Body large 14", "Value": "14px", "Content": "Quiet interfaces age well.", "Size": "body-lg"}, {"Label": "Body 13", "Value": "13px", "Content": "Quiet interfaces age well.", "Size": "body"}, {"Label": "Small 12", "Value": "12px", "Content": "Quiet interfaces age well.", "Size": "small"}, {"Label": "Caption 11", "Value": "11px", "Content": "Quiet interfaces age well.", "Size": "caption"}},
		"Shape":    {{"Label": "Sm", "Value": "4px", "Size": "sm"}, {"Label": "Md", "Value": "6px", "Size": "md"}, {"Label": "Lg", "Value": "8px", "Size": "lg"}, {"Label": "Xl", "Value": "12px", "Size": "xl"}},
		"Motion":   {{"Label": "ease out cubic", "Curve": "ease-out", "Value": "1 - (1 - t)^3"}, {"Label": "ease in out cubic", "Curve": "ease-in-out", "Value": "cubic"}, {"Label": "spring · damping 0.75", "Curve": "spring", "Value": "damping 0.75"}},
	}
	for index, line := range lines {
		part := strings.SplitN(line, "|", 2)
		props := map[string]any{
			"Title":        part[1] + " audit instance",
			"Description":  "",
			"Label":        nativePreviewValue(part[0], part[1]),
			"Name":         "native_value",
			"Value":        nativePreviewValue(part[0], part[1]),
			"Action":       "apply",
			"ActionLabel":  "Apply caller data",
			"Min":          0,
			"Max":          100,
			"URL":          "/assets/ely/native-architecture.svg",
			"Alt":          "Caller supplied media " + strconv.Itoa(index+1),
			"TimeZone":     "Asia/Seoul",
			"Rates":        "{\"first\":1,\"second\":2}",
			"Vertices":     "[[-80,-60,0],[80,-60,0],[0,80,0],[0,0,120]]",
			"Faces":        "[[0,1,2],[0,1,3],[1,2,3],[2,0,3]]",
			"CorrectValue": "first",
			"BeforeURL":    "/assets/sample-before.svg",
			"BeforeAlt":    "Caller before image",
			"AfterURL":     "/assets/ely/native-architecture.svg",
			"AfterAlt":     "Caller after image",
			"Compare":      50,
			"Samples": []map[string]any{
				{"X": 5, "Y": 12, "Width": 8, "Height": 18},
				{"X": 20, "Y": 4, "Width": 8, "Height": 34},
				{"X": 35, "Y": 16, "Width": 8, "Height": 14},
			},
			"FrameTimes": "0,1",
			"Frames": []map[string]any{
				{"Time": 0, "URL": "/assets/ely/native-architecture.svg", "Alt": "Stairwell frame zero"},
				{"Time": 1, "URL": "/assets/ely/native-architecture.svg", "Alt": "Stairwell frame one"},
			},
			"Options": []map[string]any{
				{"Value": "standard", "Label": "Standard", "Selected": true, "Percent": 60},
				{"Value": "detailed", "Label": "Detailed", "Percent": 40},
			},
			"Items": []map[string]any{
				{"Value": "primary", "Label": "Primary item", "Content": "Ready", "URL": "/assets/ely/native-architecture.svg", "Alt": "Architectural reference", "Progress": 25},
				{"Value": "secondary", "Label": "Secondary item", "Content": "Queued", "URL": "/assets/sample-before.svg", "Alt": "Architectural variation", "Progress": 75},
			},
		}
		switch part[0] {
		case "shell":
			props["Items"] = []map[string]any{{"Value": "files", "Label": "Project files", "Content": "4 changed"}, {"Value": "outline", "Label": "Document outline", "Content": "3 headings"}}
		case "generative":
			props["Items"] = []map[string]any{{"Value": "draft", "Label": "Draft generation", "Content": "Ready", "URL": "/assets/ely/native-architecture.svg", "Alt": "Sunlit stairwell draft", "Progress": 25}, {"Value": "queue", "Label": "Queued generation", "Content": "Waiting", "URL": "/assets/sample-before.svg", "Alt": "Warm stone variation", "Progress": 75}}
		case "media":
			props["Items"] = []map[string]any{{"Value": "opening", "Label": "Opening scene", "Content": "00:00", "URL": "/assets/ely/native-architecture.svg", "Alt": "Opening stairwell frame", "Progress": 25}, {"Value": "closing", "Label": "Closing scene", "Content": "00:06", "URL": "/assets/sample-before.svg", "Alt": "Closing stairwell frame", "Progress": 75}}
		case "theme":
			props["Items"] = []map[string]any{{"Value": "canvas", "Label": "Canvas", "Content": "#ffffff"}, {"Value": "raised", "Label": "Raised surface", "Content": "#f5f5f5"}}
		case "i18n":
			props["Items"] = []map[string]any{{"Value": "docs", "Label": "Docs", "Content": "12 KB"}, {"Value": "photos", "Label": "Photos", "Content": "3.1 MB"}}
		case "misc":
			props["Items"] = []map[string]any{{"Value": "today", "Label": "Today", "Content": "Updated now"}, {"Value": "history", "Label": "History", "Content": "Updated yesterday"}}
		case "tooling":
			props["Items"] = []map[string]any{{"Value": "budget", "Label": "Frame budget", "Content": "16.7 ms", "Progress": 55}, {"Value": "pointer", "Label": "Pointer move", "Content": "No local events", "Progress": 82}}
		}
		if index%17 == 0 {
			props["Disabled"] = true
		}
		if part[0] == "i18n" && part[1] == "RTL layout" {
			props["RTL"] = true
		}
		if part[0] == "i18n" {
			props["Locale"] = "en-US"
			props["Value"] = 1234567.89
			props["Date"] = "2024-09-24T00:00:00Z"
			props["Options"] = []map[string]any{{"Value": "en-US", "Label": "English (United States)", "Selected": true}, {"Value": "ko-KR", "Label": "한국어 (대한민국)"}, {"Value": "ar", "Label": "العربية"}}
			props["Messages"] = []string{"Welcome Ada", "1,204 files in Docs", "Last saved 9/24/2024"}
			props["Items"] = []map[string]any{{"Label": "Docs", "Content": "12 KB"}, {"Label": "Photos", "Content": "3.1 MB"}}
			if part[1] == "RTL layout" {
				props["Locale"] = "ar"
				props["Options"] = []map[string]any{{"Value": "en-US", "Label": "English (United States)"}, {"Value": "ko-KR", "Label": "한국어 (대한민국)"}, {"Value": "ar", "Label": "العربية", "Selected": true}}
			}
		}
		if values, ok := themeItems[part[1]]; ok {
			props["Items"] = values
		}
		if part[0] == "theme" && part[1] == "Shape" {
			props["Elevations"] = []map[string]any{{"Label": "Raised", "Value": "raised"}, {"Label": "Floating", "Value": "floating"}, {"Label": "Modal", "Value": "modal"}}
		}
		if part[0] == "theme" && (part[1] == "ThemeImporter" || part[1] == "SyntaxThemes") {
			props["Action"], props["ActionLabel"] = "import-theme", "Apply"
			props["Tokens"] = `{"name":"Ely","type":"light","colors":{"editor.background":"#FCFAF7"}}`
			props["BaseTokens"] = "--surface: #FFFFFF;\n--caller-spacing: 7px;"
			scopes := []string{"keyword", "string", "constant.numeric", "comment", "entity.name.function", "entity.name.type", "constant.language", "variable.other.property", "entity.name.tag", "entity.other.attribute-name", "keyword.operator", "punctuation", "variable"}
			options := []map[string]any{}
			for i, palette := range []struct {
				name   string
				colors []string
			}{
				{"Ely", []string{"#714ca6", "#317a45", "#a3591b", "#696764", "#2863ab", "#1e7777", "#aa5529", "#a14759", "#a14759", "#9f5d12", "#605d5a", "#605d5a", "#181613"}},
				{"Quiet", []string{"#3d3a36", "#5b6f4a", "#7a5a3a", "#9a9793", "#2f2c29", "#4f5b66", "#7a5a3a", "#5a5550", "#4f5b66", "#7a5a3a", "#6b6865", "#8a8784", "#181613"}},
				{"Paper", []string{"#8a4f2b", "#5f7a3a", "#9a6a1f", "#a39a8c", "#3d5a80", "#2f6f6a", "#9a6a1f", "#7a4b5c", "#7a4b5c", "#8a4f2b", "#6f6a62", "#8f887e", "#2a2622"}},
			} {
				rules := []map[string]any{}
				for index, scope := range scopes {
					rules = append(rules, map[string]any{"scope": scope, "settings": map[string]string{"foreground": palette.colors[index]}})
				}
				encoded, _ := json.Marshal(map[string]any{"name": palette.name, "type": "light", "colors": map[string]string{}, "tokenColors": rules})
				options = append(options, map[string]any{"Value": strings.ToLower(palette.name), "Label": palette.name, "Selected": i == 0, "Tokens": string(encoded)})
			}
			props["Options"] = options
		}
		if part[0] == "theme" && (part[1] == "ThemeEditor" || part[1] == "ThemeProvider") {
			props["Action"], props["ActionLabel"] = "apply-theme", "Apply theme"
			props["Density"], props["Radius"], props["FontScale"] = "standard", 1, 1
			colors := []map[string]any{{"Label": "Background", "Token": "--bg", "Color": "#FCFAF7"}, {"Label": "Surface", "Token": "--surface", "Color": "#FFFFFF"}, {"Label": "Border", "Token": "--border", "Color": "#E1DFDD"}, {"Label": "Text", "Token": "--fg", "Color": "#181613"}, {"Label": "Quiet text", "Token": "--fg-muted", "Color": "#605D5A"}, {"Label": "Accent", "Token": "--accent", "Color": "#181613"}, {"Label": "On accent", "Token": "--on-accent", "Color": "#FFFFFF"}, {"Label": "Focus", "Token": "--focus", "Color": "#3772BB"}, {"Label": "Link", "Token": "--link", "Color": "#2863AB"}, {"Label": "Success", "Token": "--success", "Color": "#267B4C"}, {"Label": "Warning", "Token": "--warning", "Color": "#A25F12"}, {"Label": "Danger", "Token": "--danger", "Color": "#BA3E38"}}
			var tokens strings.Builder
			for _, color := range colors {
				tokens.WriteString(color["Token"].(string) + ": " + color["Color"].(string) + ";\n")
			}
			props["Tokens"], props["Colors"] = tokens.String(), colors
			props["PreviewExamples"] = []map[string]any{{"Title": ""}}
		}
		if part[0] == "theme" && part[1] == "Platform Style" {
			props["Platform"] = "macOS"
			props["Action"], props["ActionLabel"] = "open-vibrancy", "Open a frosted window"
			props["Items"] = []map[string]any{{"Label": "Cargo.toml", "Icon": "file-cog", "OwnerIcon": "package"}, {"Label": "README.md", "Icon": "file-text", "OwnerIcon": "book-open"}, {"Label": "main.rs", "Icon": "file-code", "OwnerIcon": "braces"}, {"Label": "logo.svg", "Icon": "file-image"}}
		}
		if part[0] == "i18n" && part[1] == "I18nProvider" {
			props["Options"] = []map[string]any{{"Value": "en-US", "Label": "English (US)"}, {"Value": "en-GB", "Label": "English (UK)"}, {"Value": "de-DE", "Label": "Deutsch"}, {"Value": "fr-FR", "Label": "Français"}, {"Value": "ja-JP", "Label": "日本語"}, {"Value": "zh-CN", "Label": "中文"}, {"Value": "he-IL", "Label": "עברית"}}
			catalogs := map[string]map[string]string{}
			for tag, lines := range map[string][]string{
				"en-US": {"Welcome back, {name}", "{count} files in {folder}", "Last saved {date}", "{change}% since yesterday"},
				"en-GB": {"Welcome back, {name}", "{count} files in {folder}", "Last saved {date}", "{change}% since yesterday"},
				"de-DE": {"Willkommen zurück, {name}", "{count} Dateien in {folder}", "Zuletzt gespeichert am {date}", "{change} % seit gestern"},
				"fr-FR": {"Bon retour, {name}", "{count} fichiers dans {folder}", "Enregistré le {date}", "{change}\u202f% depuis hier"},
				"ja-JP": {"おかえりなさい、{name}さん", "{folder}に{count}個のファイル", "最終保存：{date}", "昨日から{change}%"},
				"zh-CN": {"欢迎回来，{name}", "{folder}中有{count}个文件", "上次保存于{date}", "较昨日{change}%"},
				"he-IL": {"ברוך שובך, {name}", "{count} קבצים ב־{folder}", "נשמר לאחרונה ב־{date}", "{change}% מאז אתמול"},
			} {
				catalogs[tag] = map[string]string{"welcome": lines[0], "files": lines[1], "saved": lines[2], "change": lines[3]}
			}
			encoded, _ := json.Marshal(catalogs)
			props["Catalogs"] = string(encoded)
			props["Date"], props["TimeZone"] = "2026-09-01T00:00:00Z", "UTC"
			props["MessageItems"] = []map[string]any{{"Key": "welcome", "Args": `{"name":"Ada"}`, "Content": "Welcome back, Ada"}, {"Key": "files", "Args": `{"count":{"number":1204,"decimals":0},"folder":"Docs"}`, "Content": "1,204 files in Docs"}, {"Key": "saved", "Args": `{"date":{"date":"2026-09-01T00:00:00Z"}}`, "Content": "Last saved 9/1/26"}, {"Key": "change", "Args": `{"change":{"number":-3.5,"decimals":1}}`, "Content": "-3.5% since yesterday"}}
			props["PreviewExamples"] = []map[string]any{{"Title": ""}}
		}
		if part[0] == "theme" && part[1] == "Surfaces" {
			lightSurfaces := themeItems["Surfaces"]
			darkSurfaces := []map[string]any{{"Label": "bg", "Value": "#252525", "Color": "#252525"}, {"Label": "surface", "Value": "#2C2C2C", "Color": "#2C2C2C"}, {"Label": "sunken", "Value": "#202020", "Color": "#202020"}, {"Label": "hover", "Value": "#383838", "Color": "#383838"}, {"Label": "active", "Value": "#3F3F3F", "Color": "#3F3F3F"}, {"Label": "border", "Value": "#3F3F3F", "Color": "#3F3F3F"}, {"Label": "border strong", "Value": "#555555", "Color": "#555555"}}
			props["PreviewExamples"] = []map[string]any{{"Title": "Light surfaces", "Items": lightSurfaces}, {"Title": "Dark surfaces", "Items": darkSurfaces}}
		}
		if part[0] == "i18n" && part[1] == "LocaleNumber" {
			props["Value"], props["Decimals"] = -1234567.891, 2
			props["Date"], props["TimeZone"] = "2026-09-01T00:00:00Z", "UTC"
			props["Options"] = []map[string]any{{"Value": "en-US", "Label": "English (US)"}, {"Value": "en-GB", "Label": "English (UK)"}, {"Value": "de-DE", "Label": "Deutsch"}, {"Value": "fr-FR", "Label": "Français"}, {"Value": "ja-JP", "Label": "日本語"}, {"Value": "zh-CN", "Label": "中文"}, {"Value": "he-IL", "Label": "עברית"}}
			props["PreviewExamples"] = []map[string]any{{"Title": ""}}
		}
		if part[0] == "i18n" && part[1] == "RTL layout" {
			props["Locale"], props["RTL"] = "en-US", false
			props["Items"] = []map[string]any{{"Label": "Docs", "Content": "12 KB", "Icon": "file"}, {"Label": "Photos", "Content": "3.1 MB", "Icon": "file"}}
			props["PreviewExamples"] = []map[string]any{{"Title": ""}}
		}
		if part[0] == "i18n" && part[1] == "SkipLink" {
			props["Items"] = []map[string]any{{"Label": "Home", "Action": "home"}, {"Label": "Docs", "Action": "docs"}, {"Label": "Pricing", "Action": "pricing"}, {"Label": "Blog", "Action": "blog"}, {"Label": "About", "Action": "about"}}
			props["Content"] = "The main part starts here."
			props["Action"], props["ActionLabel"] = "read-guide", "Read the guide"
			props["PreviewExamples"] = []map[string]any{{"Title": ""}}
		}
		if part[0] == "i18n" && part[1] == "ColorBlindSafe Palette" {
			props["Items"] = []map[string]any{{"Label": "Blue", "Color": "#5182C1", "SafeColor": "#0240B1"}, {"Label": "Teal", "Color": "#009589", "SafeColor": "#08A399"}, {"Label": "Ochre", "Color": "#AA732B", "SafeColor": "#CD8017"}, {"Label": "Rose", "Color": "#B8636B", "SafeColor": "#844954"}, {"Label": "Violet", "Color": "#8572BB", "SafeColor": "#A276E3"}, {"Label": "Green", "Color": "#539156", "SafeColor": "#184606"}, {"Label": "Rust", "Color": "#B66946", "SafeColor": "#B84F10"}, {"Label": "Cyan", "Color": "#138DB1", "SafeColor": "#20789D"}}
			props["PreviewExamples"] = []map[string]any{{"Title": ""}}
		}
		if part[1] == "WindowControls" {
			props["Items"] = []map[string]any{{"Value": "close", "Label": "Close", "Action": "close"}, {"Value": "minimize", "Label": "Minimize", "Action": "minimize"}, {"Value": "maximize", "Label": "Maximize", "Action": "maximize"}}
		}
		if part[0] == "generative" {
			switch part[1] {
			case "ImageGenerationPanel":
				props["Value"], props["Name"] = "a spiral staircase in a white atrium", "prompt"
				props["NegativePrompt"], props["AspectRatio"], props["Seed"], props["Style"] = "blurry,watermark,people", "3:2", "2710", "photo"
				props["Action"], props["ActionLabel"] = "generate", "Generate"
				props["Options"] = []map[string]any{{"Value": "none", "Label": "None"}, {"Value": "photo", "Label": "Photographic", "URL": "/assets/ely/native-generative/photographic.jpg", "Selected": true}, {"Value": "mono", "Label": "Monochrome", "URL": "/assets/ely/native-generative/monochrome.jpg"}, {"Value": "line", "Label": "Line art", "URL": "/assets/ely/native-generative/line-art.jpg"}, {"Value": "wash", "Label": "Watercolor", "URL": "/assets/ely/native-generative/watercolor.jpg"}, {"Value": "film", "Label": "Cinematic", "URL": "/assets/ely/native-generative/cinematic.jpg"}}
				props["Ratios"] = []map[string]any{{"Value": "1:1"}, {"Value": "4:5"}, {"Value": "3:2"}, {"Value": "16:9"}, {"Value": "9:16"}}
				props["PreviewExamples"] = []map[string]any{{"Title": ""}}
			case "GenerationQueue":
				props["Items"] = []map[string]any{
					{"Value": "stair", "Label": "a spiral staircase in a white atrium", "Content": "Done in 34s", "Status": "done", "URL": "/assets/ely/native-generative/atrium-stair.jpg", "Alt": "Spiral staircase", "Action": "remove-generation", "ActionLabel": "Remove"},
					{"Value": "dunes", "Label": "dunes at dusk, grass in the wind, a low sun", "Content": "62% · about 12s left", "Status": "running", "Progress": 62, "Action": "cancel-generation", "ActionLabel": "Cancel"},
					{"Value": "olive", "Label": "an olive tree in a limestone courtyard", "Content": "Queued · next", "Status": "queued", "Action": "cancel-generation", "ActionLabel": "Cancel"},
					{"Value": "hall", "Label": "a long hall of arches, noon light", "Content": "Queued · 1 ahead", "Status": "queued", "Action": "cancel-generation", "ActionLabel": "Cancel"},
					{"Value": "tide", "Label": "a tide pool at low water, pale rocks", "Content": "Failed · out of memory on the GPU", "Status": "failed", "Action": "retry-generation", "ActionLabel": "Retry", "RemoveAction": "remove-generation"},
				}
				props["PreviewExamples"] = []map[string]any{{"Title": ""}}
			case "GenerationGrid":
				props["Items"] = []map[string]any{{"Value": "atrium", "Label": "Atrium", "Status": "done", "URL": "/assets/ely/native-generative/atrium.jpg", "Alt": "White atrium"}, {"Value": "dunes", "Label": "Dunes", "Status": "done", "URL": "/assets/ely/native-generative/dunes.jpg", "Alt": "Dunes at dusk"}, {"Value": "pending", "Label": "Pending result", "Status": "pending", "Progress": 40}, {"Value": "failed", "Label": "Failed result", "Status": "failed", "Content": "Stopped by the content filter", "Action": "retry-generation", "ActionLabel": "Retry"}}
				props["BeforeURL"], props["AfterURL"] = "/assets/ely/native-generative/atrium-before.jpg", "/assets/ely/native-generative/atrium.jpg"
				props["BeforeAlt"], props["AfterAlt"] = "Original atrium", "Upscaled atrium"
				props["PreviewExamples"] = []map[string]any{{"Title": ""}, {"Title": "", "PreviewName": "ImageCompare"}}
			case "VariationPicker":
				props["Label"], props["Alt"], props["URL"] = "Atrium variations", "Selected atrium variation", "/assets/ely/native-generative/atrium.jpg"
				props["Options"] = []map[string]any{{"Value": "atrium", "Label": "Atrium", "URL": "/assets/ely/native-generative/atrium.jpg", "Selected": true}, {"Value": "olive", "Label": "Olive court", "URL": "/assets/ely/native-camera.jpg"}, {"Value": "stair", "Label": "Stone stair", "URL": "/assets/ely/native-generative/atrium-stair.jpg"}, {"Value": "before", "Label": "Original", "URL": "/assets/ely/native-generative/atrium-before.jpg"}}
				props["Blind"] = true
				props["Sides"] = []map[string]any{{"Label": "Orchid 3", "Content": "Morning light pools on a limestone stair as it turns up into a white atrium."}, {"Label": "Juniper 2", "Content": "A white spiral stair rises through a quiet atrium, each step catching the first light."}}
				props["PreviewExamples"] = []map[string]any{{"Title": ""}, {"Title": "", "PreviewName": "ABCompareView"}}
			case "InpaintCanvas":
				props["URL"], props["Alt"] = "/assets/ely/native-camera.jpg", "Olive tree to mask"
				props["Strokes"] = `[{"points":[[0.07,0.18],[0.12,0.34],[0.09,0.52],[0.13,0.7],[0.1,0.86]],"radius":0.07,"erase":false}]`
				props["BrushRadius"], props["Erase"], props["HideApply"] = .05, false, true
				props["PreviewExamples"] = []map[string]any{{"Title": ""}}
			case "AudioGenerationPlayer":
				props["Label"], props["Artist"] = "rain on a limestone courtyard, far thunder, a slow piano", "Orchid Audio"
				props["Duration"], props["Position"], props["URL"], props["WaveViewBox"] = 32, 12, "", "0 0 168 28"
				samples := make([]map[string]any, 56)
				for i := range samples {
					peak := math.Min(1, .15+.8*math.Sin(float64(i)/55*math.Pi)*(.6+.4*float64(i*7%11)/10))
					samples[i] = map[string]any{"X": float64(i) * 3, "Y": nativeQuantize(14-peak*14, 1e6), "Width": 2, "Height": nativeQuantize(peak*28, 1e6)}
				}
				props["Samples"] = samples
				props["PreviewExamples"] = []map[string]any{{"Title": ""}, {"Title": "", "Label": "a cello under a high window, morning", "Duration": 45, "Position": 0, "Making": .45}}
			}
			nativeGenerativeRemainder(part[1], props)
		}

		if part[0] == "tooling" {
			props["Value"], props["Status"] = "60 fps", "Ready"
			props["Items"] = []map[string]any{{"Value": "0 ms", "Label": "Frame budget", "Content": "16.7 ms", "Progress": 55}, {"Value": "16 ms", "Label": "Pointer move", "Content": "No local events", "Progress": 82}}
		}
		if part[1] == "IconBrowser" {
			props["Value"] = "search"
			props["Icons"] = ui.FoundationIconNames()[:18]
		}
		if part[1] == "A11yChecker" {
			props["Items"] = []map[string]any{{"Label": "Light foreground / canvas", "Foreground": "#181613", "Background": "#FCFAF7"}, {"Label": "Light muted / raised", "Foreground": "#605D5A", "Background": "#FFFFFF"}, {"Label": "Light focus / canvas", "Foreground": "#3772BB", "Background": "#FCFAF7"}, {"Label": "Light blue / canvas", "Foreground": "#5182C1", "Background": "#FCFAF7"}, {"Label": "Dark foreground / canvas", "Foreground": "#F3F1F0", "Background": "#252525"}, {"Label": "Dark muted / raised", "Foreground": "#C4C2C0", "Background": "#2C2C2C"}, {"Label": "Dark focus / canvas", "Foreground": "#69A1E8", "Background": "#252525"}, {"Label": "Dark blue / canvas", "Foreground": "#79A7E2", "Background": "#252525"}}
		}
		if part[1] == "ScreenshotTest Harness" {
			props["Value"] = "cargo run --example gallery -- --page tooling --capture shots"
			props["Content"] = "Captures each page and scripted state with reduced motion."
		}
		if part[1] == "ComponentGallery" {
			props["Label"] = "Component gallery"
			props["Items"] = []map[string]any{{"Label": "Foundation", "Content": "Primitives and layout", "URL": "/gallery/foundation"}, {"Label": "Media", "Content": "Images, playback, and devices", "URL": "/gallery/media"}, {"Label": "Tooling", "Content": "Inspection and catalogues", "URL": "/gallery/tooling"}}
		}
		if part[1] == "PlaygroundPanel" {
			props["Action"], props["ActionLabel"], props["PreviewLabel"] = "update-preview", "Update preview", "Save changes"
			props["Options"] = []map[string]any{{"Value": "primary", "Label": "Primary", "Selected": true}, {"Value": "secondary", "Label": "Secondary"}, {"Value": "outline", "Label": "Outline"}, {"Value": "ghost", "Label": "Ghost"}, {"Value": "danger", "Label": "Danger"}}
		}
		if part[0] == "shell" {
			nativeShellFixtures(part[1], props)
		}
		if part[1] == "RenderSurface" {
			props["Content"] = "A host drawing callback paints this surface."
		}
		if part[0] == "media" {
			nativeMediaFixtures(part[1], props)
		}
		if part[1] == "Clock" {
			props["Items"] = []map[string]any{{"Label": "Seoul", "Content": "KST"}, {"Label": "London", "Content": "GMT"}, {"Label": "New York", "Content": "EST"}}
		}
		if part[1] == "Calculator" {
			props["CalculatorKeys"] = []string{"7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "+"}
		}
		if part[1] == "Captcha" {
			props["Challenge"] = "A7K9"
		}
		if part[1] == "UnitConverter" {
			props["Value"], props["Rates"] = 3, `{"meter":1,"foot":3.28084}`
			props["FromOptions"] = []map[string]any{{"Value": "meter", "Label": "Metres", "Selected": true}, {"Value": "foot", "Label": "Feet"}}
			props["ToOptions"] = []map[string]any{{"Value": "meter", "Label": "Metres"}, {"Value": "foot", "Label": "Feet", "Selected": true}}
		}
		if part[1] == "Poll" {
			props["Label"] = "Where should the review happen?"
			props["Options"] = []map[string]any{{"Value": "studio", "Label": "Studio", "Selected": true, "Percent": 60}, {"Value": "remote", "Label": "Remote", "Percent": 40}}
		}
		if part[1] == "ScreenRecorderControls" {
			props["Label"], props["Content"], props["Action"], props["ActionLabel"], props["Checked"] = "Screen recorder", "0:00", "record", "Record", true
			props["Recording"], props["Microphone"], props["Camera"] = "idle", true, false
			props["PreviewExamples"] = []map[string]any{{"Title": ""}}
		}
		if part[1] == "CameraPreview" {
			props["Label"], props["CameraName"], props["Alt"] = "Studio camera", "Studio camera", "Studio camera frame"
			props["URL"], props["AspectRatio"] = "/assets/ely/native-camera.jpg", 1.5
			props["PreviewExamples"] = []map[string]any{{"Title": "", "URL": "/assets/ely/native-camera.jpg", "Alt": "Studio camera frame", "CameraName": "Studio camera"}, {"Title": "", "URL": "", "Alt": "Camera off", "Label": "Camera preview", "CameraName": ""}}
		}
		if part[1] == "MicLevelMeter" {
			props["Label"] = "Microphone input"
			props["Items"] = []map[string]any{{"Label": "Quiet", "Progress": .30}, {"Label": "Speaking", "Progress": .84}, {"Label": "Too loud", "Progress": .98}}
			props["PreviewExamples"] = []map[string]any{{"Title": ""}}
		}
		if part[1] == "DeviceSelector" {
			props["Label"] = "Input and output devices"
			props["Items"] = []map[string]any{
				{"Label": "Microphone", "Value": "microphone", "Icon": "mic", "Chosen": "mic-desk", "Placeholder": "Choose a microphone", "Options": []map[string]any{{"Value": "mic-desk", "Label": "Desk microphone", "Selected": true}, {"Value": "mic-headset", "Label": "Headset"}}},
				{"Label": "Camera", "Value": "camera", "Icon": "video", "Chosen": "cam-studio", "Placeholder": "Choose a camera", "Options": []map[string]any{{"Value": "cam-studio", "Label": "Studio camera", "Selected": true}}},
				{"Label": "Speaker", "Value": "speaker", "Icon": "volume-2", "Disabled": true, "Placeholder": "No speaker found"},
			}
			props["PreviewExamples"] = []map[string]any{{"Title": ""}}
		}
		if part[1] == "3DModelViewer" {
			props["Vertices"], props["Faces"] = nativeTorusMesh()
			props["MeshColor"], props["Projection"], props["URL"] = "#c4baac", "perspective", ""
			props["Width"], props["Height"], props["AspectRatio"] = 960, 640, 1.5
			props["PreviewExamples"] = []map[string]any{{"Title": ""}}
		}
		if part[1] == "DesignTokenViewer" {
			props["Items"] = []map[string]any{{"Label": "Canvas", "Value": "--surface-canvas", "Content": "#FCFAF7", "Color": "#FCFAF7"}, {"Label": "Raised", "Value": "--surface-raised", "Content": "#FFFFFF", "Color": "#FFFFFF"}, {"Label": "Ink", "Value": "--ink-primary", "Content": "#181613", "Color": "#181613"}, {"Label": "Focus", "Value": "--focus", "Content": "#3772BB", "Color": "#3772BB"}}
		}
		if part[0] == "misc" {
			nativeMiscFixtures(part[1], props)
		}
		nativeThemeModeFixtures(part[0], part[1], props)
		nativeToolingProps(part[0], part[1], props)
		cases = append(cases, AdvancedCase{Component: ui.Component{Chapter: part[0], Name: part[1], ID: "audit-" + part[0] + "-" + strconv.Itoa(index+1), Props: props}, Family: "native"})
	}
	return cases
}
