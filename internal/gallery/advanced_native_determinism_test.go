package uiexamples

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"testing"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"golang.org/x/net/html"
)

// nativeFloatCase pins the fixture-derived float values of one native
// component. The golden digest and the decimal grid together prove that the
// rendered values are byte-identical on every CPU architecture: the digest
// fixes the exact bytes, and the grid rejects any raw architecture-dependent
// float that would drift between arm64 and amd64.
type nativeFloatCase struct {
	chapter string
	name    string
	source  string
	scale   float64
	extract func(t *testing.T, doc *html.Node) (string, []float64)
	want    string
}

func nativeAttr(node *html.Node, key string) (string, bool) {
	for _, attr := range node.Attr {
		if attr.Key == key {
			return attr.Val, true
		}
	}
	return "", false
}

func nativeFindAll(root *html.Node, tag, key string) []*html.Node {
	var found []*html.Node
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == tag && (key == "" || nativeHasAttr(node, key)) {
			found = append(found, node)
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return found
}

func nativeHasAttr(node *html.Node, key string) bool {
	_, ok := nativeAttr(node, key)
	return ok
}

// nativeFloatsJSON reads every number of a JSON fixture payload in document
// order, so the digest covers the exact bytes the component renders.
func nativeFloatsJSON(t *testing.T, raw string) (string, []float64) {
	t.Helper()
	var values []float64
	var points []map[string]any
	if err := json.Unmarshal([]byte(raw), &points); err == nil {
		for _, point := range points {
			at, ok := point["at"].([]any)
			if !ok {
				t.Fatal("embedding point lost its coordinates")
			}
			for _, axis := range at {
				number, ok := axis.(float64)
				if !ok {
					t.Fatalf("embedding coordinate is not a number: %v", axis)
				}
				values = append(values, number)
			}
		}
		return raw, values
	}
	var vertices [][]float64
	if err := json.Unmarshal([]byte(raw), &vertices); err == nil {
		for _, vertex := range vertices {
			values = append(values, vertex...)
		}
		return raw, values
	}
	var peaks []float64
	if err := json.Unmarshal([]byte(raw), &peaks); err != nil {
		t.Fatalf("fixture payload is not numeric JSON: %v", err)
	}
	return raw, peaks
}

func nativeSpectrumLevels(t *testing.T, doc *html.Node) (string, []float64) {
	t.Helper()
	bars := nativeFindAll(doc, "i", "data-native-spectrum-bar")
	if len(bars) != 40 {
		t.Fatalf("spectrum has %d bars, want 40", len(bars))
	}
	var raw strings.Builder
	var values []float64
	for _, bar := range bars {
		value, ok := nativeAttr(bar, "data-native-level")
		if !ok {
			t.Fatal("spectrum bar lost its level")
		}
		raw.WriteString(value + ";")
		parsed, err := strconv.ParseFloat(value, 64)
		if err != nil {
			t.Fatalf("spectrum level is not a number: %q", value)
		}
		values = append(values, parsed)
	}
	return raw.String(), values
}

func nativeFloatCases() []nativeFloatCase {
	return []nativeFloatCase{
		{
			chapter: "generative", name: "AudioGenerationPlayer", source: "generative/AudioGenerationPlayer", scale: 1e6,
			want: "7782fb07a8bada1b3461effe8dad572e39eed68715027c1d30f99fb9ac619c98",
			extract: func(t *testing.T, doc *html.Node) (string, []float64) {
				t.Helper()
				waves := nativeFindAll(doc, "svg", "data-native-generated-wave")
				if len(waves) != 1 {
					t.Fatalf("generated audio wave not found: %d", len(waves))
				}
				var raw strings.Builder
				var values []float64
				for _, rect := range nativeFindAll(waves[0], "rect", "") {
					for _, key := range []string{"y", "height"} {
						value, ok := nativeAttr(rect, key)
						if !ok {
							t.Fatalf("generated audio bar lost %s", key)
						}
						raw.WriteString(key + "=" + value + ";")
						parsed, err := strconv.ParseFloat(value, 64)
						if err != nil {
							t.Fatalf("generated audio %s is not a number: %q", key, value)
						}
						values = append(values, parsed)
					}
				}
				return raw.String(), values
			},
		},
		{
			chapter: "generative", name: "EmbeddingVisualizer", source: "generative/EmbeddingVisualizer", scale: 1e5,
			want: "a807305f0c08b871ca1a31cc217f923de21271a07e968e5159db1643b355cb41",
			extract: func(t *testing.T, doc *html.Node) (string, []float64) {
				t.Helper()
				sections := nativeFindAll(doc, "section", "data-native-embedding")
				if len(sections) != 1 {
					t.Fatalf("embedding plot not found: %d", len(sections))
				}
				raw, ok := nativeAttr(sections[0], "data-points")
				if !ok {
					t.Fatal("embedding plot lost its points")
				}
				return nativeFloatsJSON(t, raw)
			},
		},
		{
			chapter: "media", name: "3DModelViewer", source: "media/3DModelViewer", scale: 1e6,
			want: "b2a602e5974fb9a4c5352358f29e8b49c331777ad4d616f36dc6ee54c1d0597e",
			extract: func(t *testing.T, doc *html.Node) (string, []float64) {
				t.Helper()
				canvases := nativeFindAll(doc, "canvas", "data-native-model")
				if len(canvases) != 1 {
					t.Fatalf("model canvas not found: %d", len(canvases))
				}
				raw, ok := nativeAttr(canvases[0], "data-vertices")
				if !ok {
					t.Fatal("model canvas lost its vertices")
				}
				return nativeFloatsJSON(t, raw)
			},
		},
		{
			chapter: "media", name: "AudioWaveform", source: "media/AudioWaveform", scale: 1e6,
			want: "a6ffef67d07f90e039efc7fabc50895f7a409415e47e42dcaed903270ad91796",
			extract: func(t *testing.T, doc *html.Node) (string, []float64) {
				t.Helper()
				sections := nativeFindAll(doc, "section", "data-native-waveform")
				if len(sections) != 1 {
					t.Fatalf("waveform not found: %d", len(sections))
				}
				raw, ok := nativeAttr(sections[0], "data-peaks")
				if !ok {
					t.Fatal("waveform lost its peaks")
				}
				return nativeFloatsJSON(t, raw)
			},
		},
		{
			chapter: "media", name: "AudioSpectrum", source: "media/AudioSpectrum", scale: 1e4,
			want: "8aa00691239fd5eb213a07c0d414b4808a23284bbc203fd8062adf4c07696a4e",
			extract: func(t *testing.T, doc *html.Node) (string, []float64) {
				t.Helper()
				return nativeSpectrumLevels(t, doc)
			},
		},
		{
			// media/Visualizer is the AudioSpectrum alias and shares its fixture.
			chapter: "media", name: "Visualizer", source: "media/AudioSpectrum", scale: 1e4,
			want: "8aa00691239fd5eb213a07c0d414b4808a23284bbc203fd8062adf4c07696a4e",
			extract: func(t *testing.T, doc *html.Node) (string, []float64) {
				t.Helper()
				return nativeSpectrumLevels(t, doc)
			},
		},
	}
}

// TestNativeFloatFixturesAreArchitectureStable proves that the six native
// components whose fixtures embed computed floats render identical bytes on
// every CPU architecture. arm64 contracts multiply-add into FMA while amd64
// does not, so the raw trig results differ in the last ULP between machines;
// the committed catalogue bytes must not.
func TestNativeFloatFixturesAreArchitectureStable(t *testing.T) {
	tpl, err := ui.NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	sources := map[string]map[string]any{}
	for _, fixture := range advancedNativeCases() {
		sources[fixture.Component.Chapter+"/"+fixture.Component.Name] = fixture.Component.Props
	}
	for _, testCase := range nativeFloatCases() {
		t.Run(testCase.chapter+"/"+testCase.name, func(t *testing.T) {
			props, ok := sources[testCase.source]
			if !ok {
				t.Fatalf("missing fixture %s", testCase.source)
			}
			var output bytes.Buffer
			if err := ui.RenderComponent(tpl, &output, ui.Component{Chapter: testCase.chapter, Name: testCase.name, ID: "native-determinism", Props: props}); err != nil {
				t.Fatal(err)
			}
			doc, err := html.Parse(strings.NewReader(output.String()))
			if err != nil {
				t.Fatal(err)
			}
			raw, values := testCase.extract(t, doc)
			if len(values) == 0 {
				t.Fatal("component rendered no float values")
			}
			for _, value := range values {
				if residual := math.Abs(value*testCase.scale - math.Round(value*testCase.scale)); residual > 1e-6 {
					t.Fatalf("value %v is not on the %g grid, residual %g; the fixture is not architecture-stable", value, testCase.scale, residual)
				}
			}
			digest := sha256.Sum256([]byte(raw))
			if got := hex.EncodeToString(digest[:]); got != testCase.want {
				t.Fatalf("rendered values changed:\n got %s\nwant %s", got, testCase.want)
			}
		})
	}
}
