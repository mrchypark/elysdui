package uiexamples

import (
	"fmt"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"strings"
)

// Pinned to Ely 49ed1f84056fa13347d68801b479a4a5a8e03b53, theme/palette.rs.
var nativeToolingPalette = map[string][2]string{
	"bg":                 {"#fcfaf7", "#252525"},
	"surface":            {"#ffffff", "#2c2c2c"},
	"sunken":             {"#f6f4f1", "#202020"},
	"overlay":            {"#ffffff", "#323232"},
	"hover":              {"#f2f0ed", "#383838"},
	"active":             {"#e9e7e5", "#3f3f3f"},
	"border":             {"#e1dfdd", "#3f3f3f"},
	"border_strong":      {"#cccac8", "#555555"},
	"fg":                 {"#181613", "#f3f1f0"},
	"fg_muted":           {"#605d5a", "#c4c2c0"},
	"fg_subtle":          {"#696764", "#acaaa8"},
	"fg_disabled":        {"#acaaa8", "#5c5a58"},
	"accent":             {"#181613", "#f3f1f0"},
	"accent_hover":       {"#302d2b", "#d9d7d5"},
	"on_accent":          {"#fcfaf7", "#252525"},
	"on_media":           {"#ffffff", "#ffffff"},
	"focus":              {"#3772bb", "#69a1e8"},
	"link":               {"#2863ab", "#7eb1f3"},
	"selection":          {"#3772bb33", "#69a1e84d"},
	"success":            {"#267b4c", "#6bbc89"},
	"warning":            {"#a25f12", "#e8b45e"},
	"danger":             {"#ba3e38", "#e5756e"},
	"info":               {"#2e69b2", "#77abec"},
	"success_subtle":     {"#e7f9ec", "#182c1f"},
	"warning_subtle":     {"#fef2dd", "#342611"},
	"danger_subtle":      {"#ffefec", "#3a1d1b"},
	"info_subtle":        {"#ebf4ff", "#19273a"},
	"backdrop":           {"#18161352", "#00000080"},
	"media_backdrop":     {"#0e0d0bf8", "#000000f8"},
	"shimmer":            {"#ffffffb3", "#ffffff10"},
	"glass":              {"#fcfaf7b8", "#252525b8"},
	"shadow":             {"#181613", "#000000"},
	"tooltip_bg":         {"#181613", "#4a4a4a"},
	"tooltip_fg":         {"#fcfaf7", "#f3f1f0"},
	"paper":              {"#ffffff", "#f3f1f0"},
	"ink":                {"#181613", "#181613"},
	"syntax_keyword":     {"#714ca6", "#bba3e8"},
	"syntax_string":      {"#317a45", "#8ac596"},
	"syntax_number":      {"#a3591b", "#eaab78"},
	"syntax_comment":     {"#696764", "#acaaa8"},
	"syntax_function":    {"#2863ab", "#85b6e9"},
	"syntax_type_name":   {"#1e7777", "#84c9c8"},
	"syntax_constant":    {"#aa5529", "#eda382"},
	"syntax_property":    {"#a14759", "#e29fa9"},
	"syntax_tag":         {"#a14759", "#e29fa9"},
	"syntax_attribute":   {"#9f5d12", "#e1b671"},
	"syntax_operator":    {"#605d5a", "#afadab"},
	"syntax_punctuation": {"#605d5a", "#afadab"},
	"syntax_variable":    {"#181613", "#f3f1f0"},
	"chart_0":            {"#5182c1", "#79a7e2"},
	"chart_1":            {"#009589", "#4eb9ad"},
	"chart_2":            {"#aa732b", "#cd995c"},
	"chart_3":            {"#b8636b", "#dc8a90"},
	"chart_4":            {"#8572bb", "#a998dd"},
	"chart_5":            {"#539156", "#7cb57d"},
	"chart_6":            {"#b66946", "#d9906f"},
	"chart_7":            {"#138db1", "#56b2d4"},
	"ansi_0":             {"#181613", "#3f3f3f"},
	"ansi_1":             {"#a34942", "#e1897f"},
	"ansi_2":             {"#287c42", "#6fb880"},
	"ansi_3":             {"#8c5f00", "#c99d4e"},
	"ansi_4":             {"#346aac", "#74a7e8"},
	"ansi_5":             {"#875093", "#c38ecf"},
	"ansi_6":             {"#007c84", "#35b9c0"},
	"ansi_7":             {"#acaaa8", "#afadab"},
	"ansi_8":             {"#605d5a", "#5c5a58"},
	"ansi_9":             {"#bd6158", "#fda297"},
	"ansi_10":            {"#439458", "#89d298"},
	"ansi_11":            {"#a57710", "#e3b667"},
	"ansi_12":            {"#4c82c6", "#8dc1ff"},
	"ansi_13":            {"#a067ac", "#dda7ea"},
	"ansi_14":            {"#00959c", "#56d3da"},
	"ansi_15":            {"#cccac8", "#f3f1f0"},
}

func nativeToolingToken(name string) string { return "--" + strings.ReplaceAll(name, "_", "-") }
func nativeToolingColors(names []string, prefix string) []map[string]any {
	out := make([]map[string]any, 0, len(names))
	for _, name := range names {
		key := prefix + name
		pair := nativeToolingPalette[key]
		label := "colors." + name
		switch prefix {
		case "syntax_":
			label = "colors.syntax." + name
		case "chart_":
			for i, v := range strings.Fields("Blue Teal Ochre Rose Violet Green Rust Cyan") {
				if fmt.Sprint(i) == name {
					label = fmt.Sprintf("colors.hue(%d) %s", i, v)
				}
			}
		case "ansi_":
			for i, v := range []string{"black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "bright black", "bright red", "bright green", "bright yellow", "bright blue", "bright magenta", "bright cyan", "bright white"} {
				if fmt.Sprint(i) == name {
					label = fmt.Sprintf("colors.ansi[%d] %s", i, v)
				}
			}
		}
		out = append(out, map[string]any{"Label": label, "Token": nativeToolingToken(key), "Light": pair[0], "Dark": pair[1]})
	}
	return out
}
func nativeToolingGroups() []map[string]any {
	groups := []map[string]any{
		{"Label": "Colors", "Items": nativeToolingColors(strings.Fields("bg surface sunken overlay hover active border border_strong fg fg_muted fg_subtle fg_disabled accent accent_hover on_accent on_media focus link selection success warning danger info success_subtle warning_subtle danger_subtle info_subtle backdrop media_backdrop shimmer glass shadow tooltip_bg tooltip_fg paper ink"), "")},
		{"Label": "Syntax", "Items": nativeToolingColors(strings.Fields("keyword string number comment function type_name constant property tag attribute operator punctuation variable"), "syntax_")},
		{"Label": "Chart", "Items": nativeToolingColors(strings.Fields("0 1 2 3 4 5 6 7"), "chart_")},
		{"Label": "Terminal", "Items": nativeToolingColors(strings.Fields("0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15"), "ansi_")},
	}
	for _, scale := range []struct {
		label, kind, names string
		values             []int
	}{
		{"Type", "type", "Xs Sm Base Md Lg Xl Xxl Display", []int{11, 12, 13, 14, 16, 20, 24, 32}},
		{"Radii", "radius", "Sm Md Lg Xl", []int{4, 6, 8, 12}},
		{"Controls", "control", "Sm Md Lg", []int{24, 28, 32}},
		{"Icons", "icon", "Xs Sm Md Lg Xl Xxl", []int{12, 14, 16, 20, 24, 32}},
		{"Avatars", "avatar", "Xs Sm Md Lg Xl", []int{20, 24, 32, 40, 56}},
		{"Containers", "container", "Sm Md Lg", []int{640, 960, 1200}},
	} {
		items := []map[string]any{}
		for i, name := range strings.Fields(scale.names) {
			items = append(items, map[string]any{"Label": map[string]string{"type": "TextSize", "radius": "Radius", "control": "ControlSize", "icon": "IconSize", "avatar": "AvatarSize", "container": "ContainerSize"}[scale.kind] + "::" + name, "Kind": scale.kind, "Value": scale.values[i]})
		}
		groups = append(groups, map[string]any{"Label": scale.label, "Items": items})
	}
	groups = append(groups, map[string]any{"Label": "Elevation", "Items": []map[string]any{{"Label": "Elevation::Raised", "Kind": "elevation", "Sample": "raised"}, {"Label": "Elevation::Floating", "Kind": "elevation", "Sample": "floating"}, {"Label": "Elevation::Modal", "Kind": "elevation", "Sample": "modal"}}})
	items := []map[string]any{}
	for _, n := range []int{1, 2, 3, 4, 6, 8} {
		items = append(items, map[string]any{"Label": fmt.Sprintf("gap_%d", n), "Kind": "spacing", "Value": n * 4})
	}
	groups = append(groups, map[string]any{"Label": "Spacing", "Items": items})
	return groups
}
func nativeToolingContrastPairs() []map[string]any {
	out := []map[string]any{}
	add := func(front, back string, need float64) {
		f, b := nativeToolingPalette[front], nativeToolingPalette[back]
		out = append(out, map[string]any{"Label": front + " / " + back, "Foreground": f[0], "DarkForeground": f[1], "Background": b[0], "DarkBackground": b[1], "ForegroundToken": nativeToolingToken(front), "BackgroundToken": nativeToolingToken(back), "Need": need})
	}
	for _, front := range strings.Fields("fg fg_muted fg_subtle") {
		for _, back := range strings.Fields("bg surface sunken overlay hover active") {
			add(front, back, 4.5)
		}
	}
	for _, back := range strings.Fields("bg surface sunken") {
		add("link", back, 4.5)
	}
	for _, back := range strings.Fields("accent accent_hover") {
		add("on_accent", back, 4.5)
	}
	add("tooltip_fg", "tooltip_bg", 4.5)
	for _, front := range strings.Fields("success warning danger info") {
		add(front, "bg", 4.5)
		add(front, front+"_subtle", 4.5)
	}
	for _, front := range strings.Fields("keyword string number comment function type_name constant property tag attribute operator punctuation variable") {
		for _, back := range strings.Fields("surface sunken hover") {
			add("syntax_"+front, back, 4.5)
		}
	}
	add("focus", "bg", 3)
	add("focus", "surface", 3)
	for _, hue := range strings.Fields("0 1 2 3 4 5 6 7") {
		add("chart_"+hue, "bg", 3)
	}
	return out
}

// Call after generic fixture overrides, immediately before appending the case.
// This changes gallery examples only; reusable templates retain caller props.
func nativeToolingProps(chapter, name string, props map[string]any) {
	if chapter != "tooling" && chapter != "rendering" {
		return
	}
	switch name {
	case "InspectorOverlay", "FPSMeter", "RenderCounter", "EventLogger", "DesignTokenViewer", "IconBrowser", "A11yChecker", "ScreenshotTest Harness", "ComponentGallery", "PlaygroundPanel", "RenderSurface":
	default:
		return
	}
	for _, key := range []string{"Title", "Description", "Label", "Value", "Content", "Action", "Items", "Options", "Disabled", "Required", "Preview"} {
		delete(props, key)
	}
	props["Kind"] = name
	props["HideHeader"] = true
	switch name {
	case "InspectorOverlay":
		props["ReleaseOnly"] = true
		props["Content"] = "A box to pick"
	case "FPSMeter":
		props["Label"] = "Measure"
	case "RenderCounter":
		props["Items"] = []map[string]any{{"Label": "Page", "Value": "page", "Count": 0}, {"Label": "This view", "Value": "view", "Count": 0, "Redraw": true}}
	case "EventLogger":
		props["Placeholder"] = "Type here"
	case "DesignTokenViewer":
		props["Groups"] = nativeToolingGroups()
	case "IconBrowser":
		props["Value"] = "search"
		props["Icons"] = ui.FoundationIconNames()
	case "A11yChecker":
		props["Items"] = nativeToolingContrastPairs()
	case "ScreenshotTest Harness":
		props["Command"] = "cargo run --example gallery -- --page tooling --capture shots"
	case "ComponentGallery":
		props["Label"] = "Component gallery"
		props["Content"] = "Browse the available component examples."
		props["Items"] = []map[string]any{
			{"Label": "Foundation", "Content": "Primitives and layout", "URL": "/gallery/foundation"},
			{"Label": "Media", "Content": "Images, playback, and devices", "URL": "/gallery/media"},
			{"Label": "Tooling", "Content": "Inspection and catalogues", "URL": "/gallery/tooling"},
		}
	case "PlaygroundPanel":
		choice := func(name string, values []string, selected string) map[string]any {
			options := []map[string]any{}
			for _, v := range values {
				options = append(options, map[string]any{"Label": v, "Value": strings.ToLower(v), "Selected": strings.EqualFold(v, selected)})
			}
			return map[string]any{"Name": name, "Type": "choice", "Options": options}
		}
		props["Playgrounds"] = []map[string]any{
			{"Value": "button", "Preview": "button", "Knobs": []map[string]any{choice("variant", strings.Fields("Primary Secondary Outline Ghost Danger"), "Primary"), choice("size", strings.Fields("Sm Md Lg"), "Md"), {"Name": "disabled", "Type": "toggle", "Value": false}, {"Name": "loading", "Type": "toggle", "Value": false}}},
			{"Value": "ring", "Preview": "ring", "Knobs": []map[string]any{{"Name": "value", "Type": "number", "Min": 0, "Max": 1, "Step": .01, "Value": .62}, {"Name": "percent", "Type": "toggle", "Value": true}}},
		}
	case "RenderSurface":
		props["Field"] = true
		props["Width"] = 720
		props["Ratio"] = 2
		props["Position"] = .2
		props["Label"] = "Contour field"
	}
}
