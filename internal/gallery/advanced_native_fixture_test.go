package uiexamples

import (
	"bytes"
	"encoding/json"
	"maps"
	"strconv"
	"strings"
	"testing"

	"golang.org/x/net/html"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func TestNativeDeviceSourceFixtures(t *testing.T) {
	fixtures := map[string]map[string]any{}
	for _, fixture := range advancedNativeCases() {
		if fixture.Component.Chapter == "media" {
			fixtures[fixture.Component.Name] = fixture.Component.Props
		}
	}
	recorder := fixtures["ScreenRecorderControls"]
	if recorder["Recording"] != "idle" || recorder["Microphone"] != true || recorder["Camera"] != false {
		t.Fatal("recorder initial state differs from source")
	}
	camera := fixtures["CameraPreview"]
	examples := camera["PreviewExamples"].([]map[string]any)
	if len(examples) != 2 || examples[0]["URL"] != "/assets/ely/native-camera.jpg" || examples[1]["URL"] != "" || examples[1]["CameraName"] != "" {
		t.Fatal("camera source must contain the olive frame and unnamed off preview")
	}
	if _, err := ui.Files.ReadFile("assets/ely/native-camera.jpg"); err != nil {
		t.Fatal(err)
	}
	model := fixtures["3DModelViewer"]
	var vertices [][]float64
	var faces [][]int
	if err := json.Unmarshal([]byte(model["Vertices"].(string)), &vertices); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(model["Faces"].(string)), &faces); err != nil {
		t.Fatal(err)
	}
	if len(vertices) != 56*24 || len(faces) != 56*24 || vertices[0][0] != 1.38 || vertices[6][1] != .38 || model["URL"] != "" {
		t.Fatal("torus must preserve source mesh resolution, radii, and local frame rendering")
	}
	for _, face := range faces {
		if len(face) != 4 {
			t.Fatal("source torus uses quads")
		}
		for _, index := range face {
			if index < 0 || index >= len(vertices) {
				t.Fatal("invalid mesh index")
			}
		}
	}
}

func TestNativeReferenceFixturesKeepSemanticValues(t *testing.T) {
	server, err := New()
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]AdvancedCase{}
	for _, fixture := range advancedNativeCases() {
		fixtures[fixture.Component.Chapter+"/"+fixture.Component.Name] = fixture
	}
	render := func(name, alias string) string {
		t.Helper()
		fixture := fixtures[name]
		component := fixture.Component
		component.Name = alias
		component.ID = "native-reference-fixture"
		var output bytes.Buffer
		if err := ui.RenderComponent(server.templates, &output, component); err != nil {
			t.Fatal(err)
		}
		return output.String()
	}
	motion := render("theme/Motion", "Spring")
	if !strings.Contains(motion, "damping 0.75") || strings.Count(motion, "data-native-motion-track") != 3 || strings.Count(motion, "data-native-motion-dot") != 3 {
		t.Fatal("motion fixture does not preserve the source tracks")
	}
	theme := fixtures["theme/ThemeEditor"].Component
	theme.Props = maps.Clone(theme.Props)
	theme.ID = "caller-theme"
	theme.Props["Action"] = "save-appearance"
	theme.Props["ActionLabel"] = "Save appearance"
	theme.Props["Density"] = "compact"
	theme.Props["Radius"] = .75
	theme.Props["FontScale"] = 1.25
	theme.Props["HighContrast"] = true
	theme.Props["ReducedMotion"] = true
	theme.Props["Tokens"] = "--caller-surface: #123456;"
	var themeOutput bytes.Buffer
	if err := ui.RenderComponent(server.templates, &themeOutput, theme); err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{`data-ely-submit="save-appearance"`, `value="compact" selected`, `value="0.75"`, `value="1.25"`, `--caller-surface: #123456;`} {
		if !strings.Contains(themeOutput.String(), value) {
			t.Fatalf("theme editor lost caller value %q", value)
		}
	}
	themeDoc, err := html.Parse(strings.NewReader(themeOutput.String()))
	if err != nil {
		t.Fatal(err)
	}
	foundSwitches := map[string]bool{}
	for node := range themeDoc.Descendants() {
		if node.Data != "input" {
			continue
		}
		attrs := map[string]string{}
		for _, a := range node.Attr {
			attrs[a.Key] = a.Val
		}
		name := attrs["name"]
		if name != "highContrast" && name != "reducedMotion" {
			continue
		}
		_, checked := attrs["checked"]
		_, hook := attrs["data-native-theme-toggle"]
		if !checked || !hook || attrs["role"] != "switch" || attrs["type"] != "checkbox" {
			t.Fatalf("invalid source caller switch %s: %v", name, attrs)
		}
		foundSwitches[name] = true
	}
	if len(foundSwitches) != 2 {
		t.Fatal("missing source caller switches")
	}
	locale := render("i18n/LocaleNumber", "LocaleDate")
	doc, err := html.Parse(strings.NewReader(locale))
	if err != nil {
		t.Fatal(err)
	}
	numbers := 0
	for node := range doc.Descendants() {
		if node.Type != html.ElementNode || node.Data != "output" {
			continue
		}
		for _, attr := range node.Attr {
			if attr.Key == "data-value" {
				numbers++
				value, err := strconv.ParseFloat(attr.Val, 64)
				if err != nil || value != -1234567.891 {
					t.Fatalf("locale changed caller number: %q (%v)", attr.Val, err)
				}
			}
		}
	}
	if numbers != 7 {
		t.Fatalf("locale has %d numeric outputs, want seven source locales", numbers)
	}
	for _, value := range []string{`datetime="2026-09-01T00:00:00Z"`, `data-locale="en-US"`, `data-locale="en-GB"`, `data-locale="de-DE"`, `data-locale="fr-FR"`, `data-locale="ja-JP"`, `data-locale="zh-CN"`, `data-locale="he-IL"`} {
		if !strings.Contains(locale, value) {
			t.Fatalf("locale fixture lost %q", value)
		}
	}
	export := render("misc/ExportDialog", "ExportDialog")
	for _, value := range []string{`data-native-dialog-open`, `data-ely-submit="export"`, "Export…", "JSON"} {
		if !strings.Contains(export, value) {
			t.Fatalf("export fixture lost %q", value)
		}
	}
	importDialog := render("misc/ExportDialog", "CSVImporter")
	for _, value := range []string{`data-ely-submit="import-csv"`, `accept=".csv,text/csv"`, "Ada Lovelace", `data-required="true"`, `data-csv-headed`, `data-misc-error`, `Lin, Wei`} {
		if !strings.Contains(importDialog, value) {
			t.Fatalf("CSV fixture lost %q", value)
		}
	}
	renderMedia := func(volume any, includeVolume bool) string {
		t.Helper()
		fixture := fixtures["media/AudioPlayer"]
		component := fixture.Component
		component.ID = "native-media-volume"
		props := make(map[string]any, len(component.Props)+1)
		for key, value := range component.Props {
			props[key] = value
		}
		if includeVolume {
			props["Volume"] = volume
		} else {
			delete(props, "Volume")
		}
		component.Props = props
		var output bytes.Buffer
		if err := ui.RenderComponent(server.templates, &output, component); err != nil {
			t.Fatal(err)
		}
		return output.String()
	}
	if muted := renderMedia(0, true); !strings.Contains(muted, `name="volume" min="0" max="1" step=".05" value="0"`) {
		t.Fatalf("explicit muted volume rendered incorrectly: %s", muted)
	}
	if defaultVolume := renderMedia(nil, false); !strings.Contains(defaultVolume, `name="volume" min="0" max="1" step=".05" value="1"`) {
		t.Fatalf("missing media volume did not default to one: %s", defaultVolume)
	}
	localeLayout := render("i18n/I18nProvider", "I18nProvider")
	for _, value := range []string{`class="ely-native-i18n-values"`, `data-native-formatted`, `data-native-formatted-date`} {
		if !strings.Contains(localeLayout, value) {
			t.Fatalf("locale layout lost %q", value)
		}
	}
	if strings.Count(localeLayout, `data-native-message=`) != 4 || !strings.Contains(localeLayout, `value="he-IL"`) || !strings.Contains(localeLayout, `datetime="2026-09-01T00:00:00Z"`) {
		t.Fatal("I18nProvider lost source catalogs, messages, or date")
	}
	shape := render("theme/Shape", "Shape")
	if strings.Count(shape, `data-native-shape=`) != 4 || strings.Count(shape, `data-native-elevation=`) != 3 || !strings.Contains(shape, `data-native-radius="6px"`) {
		t.Fatal("shape lost four source radii or three elevations")
	}
	if strings.Count(render("theme/ThemeEditor", "ThemeEditor"), `data-native-theme-color=`) != 12 {
		t.Fatal("theme editor lost source color rows")
	}
	if strings.Count(render("theme/Platform Style", "Platform Style"), `data-native-platform-icon`) != 4 {
		t.Fatal("platform fixture lost source file icon examples")
	}
	qr := render("misc/QRCodeScanner", "QRCodeScanner")
	if !strings.Contains(qr, `class="ely-misc-scan-frame"`) || !strings.Contains(qr, `<svg`) || !strings.Contains(qr, `data-misc-scan-result>https://example.com/ely`) {
		t.Fatal("QR scanner lost contained scanner composition")
	}
	model := render("media/3DModelViewer", "3DModelViewer")
	if !strings.Contains(model, `data-native-model`) || !strings.Contains(model, `data-mesh-color="#c4baac"`) || !strings.Contains(model, `data-projection="perspective"`) || !strings.Contains(model, `width="960" height="640"`) {
		t.Fatal("3D model lost local canvas mesh")
	}
	converter := render("misc/UnitConverter", "UnitConverter")
	for _, value := range []string{`data-category="Length"`, `data-from="Meter"`, `data-to="Foot"`, `value="1"`, `data-slot="select"`} {
		if !strings.Contains(converter, value) {
			t.Fatalf("unit converter fixture lost %q", value)
		}
	}
	for _, palette := range []struct {
		key, alias, marker string
		want               int
	}{
		{"theme/Surfaces", "Surfaces", `class="ely-native-swatch"`, 7},
		{"theme/Surfaces", "ColorTokens", `class="ely-native-swatch"`, 7},
		{"theme/Ink", "Ink", `class="ely-native-swatch"`, 6},
		{"theme/Signals", "Signals", `class="ely-native-signal-pill"`, 4},
		{"theme/Series", "Series", `data-native-swatch=`, 8},
		{"theme/Syntax", "Syntax", `data-native-syntax-color=`, 13},
	} {
		got := render(palette.key, palette.alias)
		if count := strings.Count(got, palette.marker); count != palette.want {
			t.Fatalf("%s has %d source specimens, want %d", palette.key, count, palette.want)
		}
	}
	if got := render("theme/Type", "Type"); strings.Count(got, `data-native-type-size=`) != 8 || !strings.Contains(got, "Display 32") || !strings.Contains(got, "Small 12") || !strings.Contains(got, "Caption 11") {
		t.Fatal("type fixture does not preserve the eight source specimens")
	}
	for _, check := range []struct{ key, alias, want string }{
		{"generative/GenerationQueue", "GenerationQueue", `class="ely-native-generation-queue"`},
		{"generative/GenerationGrid", "GenerationGrid", `data-native-outcome="failed"`},
		{"generative/VariationPicker", "VariationPicker", `class="ely-native-variation-picker"`},
		{"generative/TTSVoicePicker", "TTSVoicePicker", `class="ely-native-voice-picker"`},
		{"generative/DatasetViewer", "DatasetViewer", `class="ely-native-dataset"`},
		{"generative/PromptDiff", "PromptDiff", `data-native-version-diff`},
		{"media/VideoTimeline", "VideoTimeline", `class="ely-native-video-timeline"`},
		{"media/Playlist", "Playlist", `Aster Quartet`},
	} {
		if got := render(check.key, check.alias); !strings.Contains(got, check.want) {
			t.Fatalf("%s fixture lost %q", check.key, check.want)
		}
	}
	if strings.Contains(render("media/VideoTimeline", "VideoTimeline"), " style=") {
		t.Fatal("video timeline emits an inline style under gallery CSP")
	}
	videoPlayer := render("media/VideoPlayer", "VideoPlayer")
	for _, value := range []string{`data-native-video-player`, `data-native-caption-track=`, `data-native-caption-toggle`, `data-native-fullscreen`, `data-native-position="34"`, `data-native-video-frame`, `/assets/ely/native-generative/atrium-stair.jpg`} {
		if !strings.Contains(videoPlayer, value) {
			t.Fatalf("video player fixture lost %q", value)
		}
	}
	audioPlayer := render("media/AudioPlayer", "AudioPlayer")
	for _, value := range []string{`class="ely-native-audio-player"`, `class="ely-native-audio-cover"`, `Tall Windows`, `Aster Quartet`, `data-native-remaining-time`, `data-ely-action="previous-track"`, `data-ely-action="next-track"`} {
		if !strings.Contains(audioPlayer, value) {
			t.Fatalf("audio player fixture lost %q", value)
		}
	}
	var peaks []float64
	if err := json.Unmarshal([]byte(fixtures["media/AudioWaveform"].Component.Props["Peaks"].(string)), &peaks); err != nil {
		t.Fatal(err)
	}
	if len(peaks) != 180 || peaks[0] != 0 || peaks[179] != 0 || !strings.Contains(render("media/AudioWaveform", "AudioWaveform"), `data-peaks=`) {
		t.Fatal("waveform lost 180 source peaks and faded ends")
	}
	if got := strings.Count(render("media/AudioSpectrum", "AudioSpectrum"), `data-native-spectrum-bar`); got != 40 {
		t.Fatalf("spectrum has %d bars, want 40 source bands", got)
	}
	if got := strings.Count(render("media/Playlist", "Playlist"), `data-native-select=`); got != 5 {
		t.Fatalf("playlist has %d caller tracks, want 5", got)
	}
	for _, check := range []struct{ key, alias, want string }{
		{"media/ImageThumbnail", "ImageThumbnail", `class="ely-native-thumbnails"`},
		{"media/VideoTimeline", "VideoTimeline", `data-native-timeline-chapter="60"`},
		{"media/VideoThumbnailStrip", "VideoThumbnailStrip", `data-native-trim-handle="end"`},
		{"media/SubtitleEditor", "SubtitleEditor", `data-native-subtitle-add`},
		{"media/AudioWaveform", "AudioWaveform", `data-native-waveform`},
		{"media/AudioSpectrum", "AudioSpectrum", `data-native-spectrum-bar`},
		{"media/VolumeControl", "VolumeControl", `data-native-volume-control`},
		{"media/PlaybackSpeedControl", "PlaybackSpeedControl", `data-native-speed-menu`},
		{"media/MediaControls", "MediaControls", `data-native-transport-action="repeat"`},
	} {
		got := render(check.key, check.alias)
		if !strings.Contains(got, check.want) || strings.Contains(got, `data-native-media`) {
			t.Fatalf("%s did not render a standalone source-shaped control", check.key)
		}
	}
	for _, check := range []struct{ key, alias, want string }{
		{"theme/Series", "Series", `#B66946`},
		{"theme/Syntax", "Syntax", `#1E7777`},
		{"theme/ThemeEditor", "ThemeProvider", `class="ely-native-theme-editor"`},
		{"theme/ThemeImporter", "SyntaxThemes", `class="ely-native-theme-import"`},
		{"theme/Platform Style", "VibrancyBackground", `class="ely-native-platform"`},
		{"i18n/ColorBlindSafe Palette", "ColorBlindSafe Palette", `data-native-color-safe`},
	} {
		if got := render(check.key, check.alias); !strings.Contains(got, check.want) {
			t.Fatalf("%s fixture lost %q", check.key, check.want)
		}
	}
	for _, shell := range []struct{ key, want string }{
		{"shell/TitleBar", `class="ely-native-titlebar"`},
		{"shell/WindowDragRegion", `data-shell-drag data-action="drag-window"`},
		{"shell/WindowResizeBorder", `class="ely-native-window-specimen"`},
		{"shell/NativeMenu", `cx.set_menus(menus)`},
		{"shell/Toolbar", `role="separator"`},
		{"shell/ActivityBar", `class="ely-native-activity"`},
		{"shell/MultiWindow Manager", `class="ely-native-window-list"`},
		{"shell/QuickLauncher", `class="ely-native-launcher"`},
		{"shell/MiniWindow", `class="ely-native-mini-window"`},
		{"shell/OfflineIndicator", `class="ely-native-connectivity"`},
		{"shell/ZoomControl", `class="ely-native-zoom"`},
	} {
		if got := render(shell.key, strings.TrimPrefix(shell.key, "shell/")); !strings.Contains(got, shell.want) {
			t.Fatalf("%s fixture lost %q", shell.key, shell.want)
		}
	}
	for _, check := range []struct{ key, alias, want string }{
		{"shell/ColumnShell", "ColumnShell", `data-shell-column data-shell-width="240"`},
		{"media/ScreenRecorderControls", "ScreenRecorderControls", `class="ely-native-recorder"`},
		{"media/MicLevelMeter", "MicLevelMeter", `class="ely-native-mic-levels"`},
		{"media/DeviceSelector", "DeviceSelector", `class="ely-native-device-selectors"`},
		{"media/SubtitleEditor", "SubtitleEditor", `class="ely-native-subtitles"`},
		{"generative/ModelDownloadManager", "ModelDownloadManager", `class="ely-native-downloads"`},
		{"generative/FineTuneJobCard", "FineTuneJobCard", `data-train="[1.9,1.4,1.1,0.92,0.81,0.74]" data-held="[2,1.5,1.2,1.02,0.95,0.91]"`},
		{"tooling/A11yChecker", "A11yChecker", `data-tool-a11y-row`},
		{"tooling/IconBrowser", "IconBrowser", `data-tool-icon-option="search"`},
		{"tooling/ScreenshotTest Harness", "ScreenshotTest Harness", `--capture shots`},
		{"tooling/ComponentGallery", "ComponentGallery", `data-native-kind="ComponentGallery"`},
		{"tooling/PlaygroundPanel", "PlaygroundPanel", `data-tool-playground="button"`},
		{"rendering/RenderSurface", "RenderSurface", `data-tool-canvas role="img"`},
		{"media/3DModelViewer", "3DModelViewer", `data-mesh-color="#c4baac"`},
	} {
		if got := render(check.key, check.alias); !strings.Contains(got, check.want) {
			t.Fatalf("%s fixture lost %q", check.key, check.want)
		}
	}
}
