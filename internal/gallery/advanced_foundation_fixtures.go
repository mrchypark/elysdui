package uiexamples

import (
	"fmt"
	"time"

	"github.com/mrchypark/elysdui/ui/gohtmx"
)

// advancedFoundationCases gives the gallery one caller-owned case for every Foundation primary.
func advancedFoundationCases() []AdvancedCase {
	preview := map[string]map[string]any{
		"primitives/Image": {"Alt": "Loading picture"}, "primitives/Spacer": {"LeadingIcon": "menu", "TrailingIcon": "settings", "Code": "div().flex_1()"}, "primitives/Slot": {"IconSlotLabel": "slot: icon", "ButtonSlotLabel": "slot: button", "SlotIcon": "sparkles", "Label": "Save", "Value": "fn framed(body: impl IntoElement)"}, "primitives/FocusScope": {"Items": []string{"One", "Two", "Three"}}, "primitives/ClickOutside": {"Label": "Open panel", "Text": "Click anywhere else."}, "primitives/HoverArea": {"Label": "Pointer outside", "HoverInside": "Pointer inside", "Text": ".on_hover(…)"}, "primitives/Pressable": {"Label": "Press", "HoldingLabel": "Holding", "PressOutput": "taps 0 · holds 0"}, "primitives/KeyboardHandler": {"Text": "—", "Value": ".on_key_down(…)"}, "primitives/Measure": {"Label": "Measured bounds", "Text": "Text wraps to the width it gets. The box reports each new size once.", "MeasureNarrowLabel": "Widen", "MeasureWideLabel": "Narrow"}, "primitives/IntersectionObserver": {"Label": "Intersection observer viewport", "Text": "Marker", "ObserveOutside": "out of view"}, "primitives/Clipboard": {"Label": "Copy “Ely”", "Value": "Ely"}, "primitives/Tooltip Trigger": {"Label": "Save", "Text": "Save changes"},
		"typography/Blockquote": {"Value": "A rule and a softer ink."}, "typography/Highlight": {"Label": "Every draft", "Value": "needs one quiet emphasis"}, "typography/Truncate": {"Value": "One line, an ellipse at the end, its last text safely saved."}, "typography/LineClamp": {"Value": "Good interfaces are quiet. They leave room around each idea, use one voice for text, and save color for the moments that need it."}, "typography/MiddleEllipsis": {"Value": "~/Documents/GitHub/_typography/notes.md"}, "typography/EllipsisTooltip": {"Value": "Design review · Tuesday, with the whole team"}, "typography/Link": {"Label": "Read the guide", "Href": "#guide"}, "typography/ExternalLink": {"Label": "gpui.rs", "Href": "https://gpui.rs"}, "typography/RelativeTime": {"Value": "2026-10-11T09:30:00+09:00"}, "typography/DateTimeText": {"Value": "2026-10-11T09:30:00+09:00"}, "typography/NumberText": {"Value": "1234567.89"}, "typography/CurrencyText": {"Value": "1234.56", "Currency": "USD"}, "typography/PercentText": {"Value": "0.742"}, "typography/FileSizeText": {"Value": "1536000"}, "typography/DurationText": {"Value": "123.45"}, "typography/PluralText": {"Value": "1", "Unit": "file"}, "typography/CopyableText": {"Value": "ely_live_A9F26B", "Label": "Copy"}, "typography/SelectableText": {"Value": "Selection works on read-only text too: logs, messages, receipts."}, "typography/Emoji": {"Value": "✨", "Text": "Sparkles", "Alt": "Sparkles"}, "typography/AnimatedNumber": {"Value": "1284", "From": "0", "Duration": 300}, "typography/Typewriter": {"Value": "Write a calmer interface.", "Duration": 300}, "typography/GradientText": {"Value": "Quiet type"}, "typography/ShimmerText": {"Value": "Thinking through the request…"},
		"layout/Flex": {"Items": []string{"fixed", "flex_1", "fixed"}}, "layout/Grid": {"GridItems": []map[string]any{{"Label": "span 2", "Span": 2}, {"Label": "1", "Span": 1}, {"Label": "1", "Span": 1}, {"Label": "span 2", "Span": 2}}}, "layout/SimpleGrid": {"Items": []string{"Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Item 6", "Item 7"}}, "layout/Masonry": {"MasonryItems": []map[string]any{{"Label": "1", "Height": 72}, {"Label": "2", "Height": 120}, {"Label": "3", "Height": 56}, {"Label": "4", "Height": 96}, {"Label": "5", "Height": 140}, {"Label": "6", "Height": 64}, {"Label": "7", "Height": 88}, {"Label": "8", "Height": 110}}}, "layout/Center": {"Value": "Centered"}, "layout/Container": {"Value": "A centered column capped by a width token."}, "layout/Inset": {"Value": "content"}, "layout/Wrap": {"Items": []string{"design", "motion", "type", "color", "layout", "grid", "rhythm", "space"}}, "layout/Absolute": {"Before": "Top left", "Value": "Bottom right"}, "layout/Layer": {"Items": []string{"three layers", "", ""}}, "layout/StickyHeader": {"Title": "Today"}, "layout/SplitPane": {"Before": "Files", "NestedBefore": "Editor", "NestedAfter": "Terminal", "NestedLabel": "Resize editor and terminal", "Label": "Resize files and editor"}, "layout/ResizeHandle": {"Before": "", "After": "", "Label": "Resize panes"}, "layout/Collapsible": {"Label": "Collapse", "Text": "Content keeps its natural height. The frame grows to it, then lets go.", "Checked": true}, "layout/Accordion": {"Items": []string{"What is Ely?", "Does it animate?", "Can I theme it?"}}, "layout/Card": {"Title": "Storage", "Caption": "Across all workspaces", "Text": "42.8 GB of 100 GB", "SecondaryText": "Media takes the most room.", "SecondaryLabel": "Later", "Label": "Manage"}, "layout/Panel": {"Title": "Outline", "Items": []string{"fn render", "struct Theme"}, "Label": "…"}, "layout/Section": {"Title": "Members", "Text": "People who can open this workspace.", "ActionLabel": "+ Invite", "Items": []string{"Ada", "Grace", "Linus"}}, "layout/Group": {"Label": "Shipping address", "Items": []string{"Street", "City", "Postcode"}}, "layout/Frame": {"Value": "Framed content sits on the page tone."}, "layout/Well": {"Value": "Wells hold secondary material."}, "layout/Sidebar": {"Text": ""}, "layout/Drawer": {"Label": "Open drawer", "Title": "Drawer"}, "layout/Sheet": {"Label": "Open sheet", "Title": "Sheet"}, "layout/Page": {"Title": "Projects", "Text": "Everything your team is shipping."}, "layout/AppShell": {"Title": "The shell holds the frame. Your content fills the middle."}, "layout/MasterDetail": {"Items": []string{"Quarterly review", "Design sync", "Launch plan", "Hiring loop"}, "Text": "Quarterly review"}, "layout/Dock": {"Before": "Files", "Text": "Canvas: Drag a tab onto a zone.", "After": "Terminal"}, "layout/DockZone": {"Text": "Drag a tool onto the dock zone to place it there."}, "layout/FloatingPanel": {"Text": "Drag the title bar. It stays inside the window."}, "layout/Pane": {"Items": []string{"Pane 1", "Pane 2"}}, "layout/Workspace": {"Label": "Layout"}, "layout/Viewport": {"Value": "Content places itself with the transform; zoom stays between 0.1 and 8."},
	}
	lines := func(count int) []string {
		items := make([]string, count)
		for index := range items {
			items[index] = fmt.Sprintf("Line %02d · quiet content that scrolls", index+1)
		}
		return items
	}
	stories := map[string][]string{
		"primitives": {"Box", "Text", "Icon", "IconSet", "Svg", "Image", "Canvas", "Divider", "Spacer", "Portal", "Overlay", "Slot", "Show", "For", "Fragment", "VisuallyHidden", "FocusRing", "FocusScope", "ClickOutside", "HoverArea", "Pressable", "KeyboardHandler", "Measure", "IntersectionObserver", "Clipboard", "Tooltip Trigger"},
		"typography": {"Heading", "Title", "Paragraph", "Label", "Caption", "Overline", "Code", "Kbd", "KbdCombo", "Blockquote", "Highlight", "Truncate", "LineClamp", "MiddleEllipsis", "EllipsisTooltip", "Link", "ExternalLink", "RelativeTime", "DateTimeText", "NumberText", "CurrencyText", "PercentText", "FileSizeText", "DurationText", "PluralText", "CopyableText", "SelectableText", "Emoji", "Latex", "AnimatedNumber", "Typewriter", "GradientText", "ShimmerText"},
		"layout":     {"Stack", "Flex", "Grid", "SimpleGrid", "Masonry", "Center", "Container", "AspectRatio", "Inset", "Wrap", "Absolute", "Layer", "ScrollArea", "Scrollbar", "ScrollShadow", "ScrollToTop", "StickyHeader", "SplitPane", "ResizeHandle", "Collapsible", "Accordion", "Card", "Panel", "Section", "Group", "Frame", "Well", "Sidebar", "Drawer", "Sheet", "Page", "AppShell", "MasterDetail", "Dock", "DockZone", "FloatingPanel", "Pane", "Workspace", "Viewport"},
	}
	var cases []AdvancedCase
	for chapter, names := range stories {
		for index, name := range names {
			id := fmt.Sprintf("audit-%s-%d", chapter, index+1)
			props := map[string]any{
				"Title": name + " caller content", "Text": "Caller supplied text for " + id + ".", "Label": "Caller use " + name, "CloseLabel": "Caller close", "FieldLabel": "Caller value", "Name": "value", "Value": "<caller value " + id + ">", "Key": "K", "Required": index%5 == 0, "Disabled": index%11 == 0, "Checked": index%2 == 0,
				"Before": "Caller before " + id, "After": "Caller after " + id, "Alt": name + " caller alternative text", "Caption": "Caller supplied caption", "Citation": "Caller source", "DateTime": "2026-10-11T09:30:00+09:00", "Href": "#" + id, "Src": "/assets/sample.svg",
				"Items": []string{"Caller first " + name, "Caller second " + name, "Caller third " + name},
			}
			switch name {
			case "Image":
				props["PreviewExamples"] = []map[string]any{{"Images": []map[string]string{{"State": "loaded", "Label": "loaded", "Src": "/assets/ely/native-generative/atrium.jpg"}, {"State": "error", "Label": "failed"}, {"State": "empty", "Label": "empty"}}}}
			case "Card":
				card := map[string]any{"Title": "Storage", "Caption": "Across all workspaces", "Text": "42.8 GB of 100 GB", "SecondaryText": "Media takes the most room.", "SecondaryLabel": "Later", "Label": "Manage"}
				for key, value := range card {
					props[key] = value
				}
				props["PreviewExamples"] = []map[string]any{card}
			case "Panel":
				panel := map[string]any{"Title": "Outline", "Items": []string{"fn render", "struct Theme"}, "Label": "…"}
				for key, value := range panel {
					props[key] = value
				}
				props["PreviewExamples"] = []map[string]any{panel}
			case "Section":
				section := map[string]any{"Label": "", "Title": "Members", "Text": "People who can open this workspace.", "ActionLabel": "＋ Invite", "Items": []string{"Ada", "Grace", "Linus"}}
				for key, value := range section {
					props[key] = value
				}
				props["PreviewExamples"] = []map[string]any{section}
			case "Group":
				group := map[string]any{"Label": "Shipping address", "Items": []string{"Street", "City", "Postcode"}}
				for key, value := range group {
					props[key] = value
				}
				props["PreviewExamples"] = []map[string]any{group}
			case "AppShell":
				shell := map[string]any{"Title": "Ely — Projects", "SidebarItems": []map[string]any{{"Label": "Home", "Icon": "house"}, {"Label": "Inbox", "Icon": "inbox"}, {"Label": "Settings", "Icon": "settings"}}, "Text": "The shell holds the frame. Your content fills the middle.", "Status": "main · 3 changes · UTF-8"}
				for key, value := range shell {
					props[key] = value
				}
				props["PreviewExamples"] = []map[string]any{shell}
			case "FloatingPanel":
				floating := map[string]any{"X": 720, "Y": 160, "Label": "Show panel", "Title": "Inspector", "Text": "Floating panels sit above the page.", "Value": "Opacity 100%"}
				for key, value := range floating {
					props[key] = value
				}
				props["PreviewExamples"] = []map[string]any{floating}
			case "Dock":
				dock := map[string]any{"Before": "files panel", "Text": "Center. Drag a tab onto a zone.", "RightText": "search panel", "DockIcons": []string{"folder", "layers", "search"}, "BottomIcon": "terminal", "After": "Terminal", "AfterText": "terminal panel", "Items": []string{"Files", "Outline", "Search"}}
				for key, value := range dock {
					props[key] = value
				}
				props["PreviewExamples"] = []map[string]any{dock}
			case "DockZone":
				props["Text"], props["CaptionOnly"] = "Drag a tab across the dock above to see them.", true
				props["PreviewExamples"] = []map[string]any{{"Text": props["Text"], "CaptionOnly": true}}
			case "Pane":
				props["Items"] = []string{"1", "2"}
				props["PreviewExamples"] = []map[string]any{{"Items": props["Items"]}}
			case "Workspace":
				props["SaveLabel"], props["RestoreLabel"], props["Label"] = "Save layout", "Restore", ""
				props["PreviewExamples"] = []map[string]any{{"SaveLabel": "Save layout", "RestoreLabel": "Restore", "Label": ""}}
			case "Viewport":
				nodes := []map[string]any{{"Label": "Idea", "X": 60, "Y": 50, "Width": 140}, {"Label": "Draft", "X": 260, "Y": 110, "Width": 140}, {"Label": "Ship", "X": 460, "Y": 40, "Width": 120}}
				props["Label"], props["Nodes"], props["AfterText"] = "Canvas viewport", nodes, "Content places itself with the transform; zoom stays between 0.1 and 8."
				props["PreviewExamples"] = []map[string]any{{"Label": "Canvas viewport", "Nodes": nodes, "AfterText": props["AfterText"]}}
			case "Divider":
				props["Dividers"] = []map[string]string{
					{"Orientation": "horizontal"},
					{"Orientation": "horizontal", "Label": "or"},
					{"Orientation": "vertical", "Before": "Left", "After": "Right"},
				}
			case "Clipboard":
				props["PreviewExamples"] = []map[string]any{{"Label": "Copy “Ely”", "Value": "Ely", "PasteLabel": "Paste", "Code": "cx.write_to_clipboard(…)", "HideValue": true}}
			case "Container":
				props["PreviewExamples"] = []map[string]any{{"ContainerSpecimen": true, "Code": "Container::new(ContainerSize::Sm)"}}
			case "Canvas":
				props["Code"] = "canvas(prepaint, paint)"
			case "Slot":
				props["Label"], props["Value"] = "Save", "fn framed(body: impl IntoElement)"
			case "FocusRing":
				props["Value"] = "focus_ring()"
			case "Measure":
				props["PreviewExamples"] = []map[string]any{{"Label": "Measured bounds", "Text": "Text wraps to the width it gets. The box reports each new size once.", "MeasureNarrowLabel": "Widen", "MeasureWideLabel": "Narrow"}}
			case "HoverArea":
				props["Label"], props["HoverInside"], props["Text"] = "Pointer outside", "Pointer inside", ".on_hover(…)"
				props["PreviewExamples"] = []map[string]any{{"Label": "Pointer outside", "HoverInside": "Pointer inside", "Text": ".on_hover(…)"}}
			case "Pressable":
				props["Label"], props["HoldingLabel"], props["PressOutput"] = "Press", "Holding", "taps 0 · holds 0"
				props["PreviewExamples"] = []map[string]any{{"Label": "Press", "HoldingLabel": "Holding", "PressOutput": "taps 0 · holds 0"}}
			case "KeyboardHandler":
				props["Text"], props["Value"] = "—", ".on_key_down(…)"
				props["PreviewExamples"] = []map[string]any{{"Text": "—", "Value": ".on_key_down(…)"}}
			case "IntersectionObserver":
				props["Label"], props["Text"], props["ObserveOutside"] = "Intersection observer viewport", "Marker", "out of view"
				props["PreviewExamples"] = []map[string]any{{"Label": "Intersection observer viewport", "Text": "Marker", "ObserveOutside": "out of view"}}
			case "Box":
				props["Boxes"] = []map[string]string{{"Tone": "surface"}, {"Tone": "sunken"}}
				props["Code"] = "div()"
			case "Text":
				props["Runs"] = []map[string]any{{"Value": "Plain text, as a child."}, {"Value": "One accent, used once.", "Accent": true}}
				props["Code"] = "text()"
			case "Icon":
				props["SpecimenRows"] = true
				props["IconSamples"] = []map[string]any{{"Name": "sparkles", "Label": "12", "Size": 12}, {"Name": "sparkles", "Label": "14", "Size": 14}, {"Name": "sparkles", "Label": "16", "Size": 16}, {"Name": "sparkles", "Label": "20", "Size": 20}, {"Name": "sparkles", "Label": "24", "Size": 24}, {"Name": "sparkles", "Label": "32", "Size": 32}, {"Name": "circle-check", "Label": "fg", "Tone": "fg"}, {"Name": "circle-check", "Label": "muted", "Tone": "muted"}, {"Name": "circle-check", "Label": "focus", "Tone": "focus"}, {"Name": "circle-check", "Label": "success", "Tone": "success"}, {"Name": "circle-check", "Label": "warning", "Tone": "warning"}, {"Name": "circle-check", "Label": "danger", "Tone": "danger"}, {"Name": "custom-mark", "Label": "custom SVG", "Size": 24, "Tone": "accent"}}
			case "IconSet":
				props["Items"] = ui.FoundationIconNames()
			case "Svg":
				props["SvgSamples"] = []map[string]any{{"Name": "compass", "Label": "compass", "Size": 48, "Tone": "muted"}, {"Name": "compass", "Label": "rotated compass", "Size": 48, "Tone": "muted", "Rotate": 34}}
			case "Portal":
				props["Label"] = "Show note"
				props["Text"] = "Painted last, above other content."
				props["Value"] = "deferred(anchored())"
			case "Overlay":
				props["Label"] = "Show backdrop"
				props["Title"] = "Backdrop"
				props["Text"] = "Click outside to close."
			case "Show":
				props["Checked"] = true
				props["ShowLabel"], props["HideLabel"] = "Show", "Hide"
				props["Text"] = "Visible because the condition is true."
			case "For":
				props["Items"] = []string{"Draft", "Review", "Ship"}
			case "Fragment":
				props["Before"], props["Value"], props["After"], props["FragmentIcon"] = "", "two siblings, no wrapper", ".children([a, b])", "layers"
			case "Tooltip Trigger":
				items := []map[string]any{{"ID": "plain", "Icon": "copy", "Label": "Copy", "Text": "Copy"}, {"ID": "meta", "Icon": "search", "Label": "Search", "Text": "Search", "Meta": "⌘K"}, {"ID": "rich", "Icon": "info", "Label": "Rich content", "RichTitle": "Rich content", "RichText": "Any element fits here."}}
				props["TooltipItems"], props["FollowLabel"], props["FollowText"], props["TooltipNote"] = items, "Move across me", "No delay. I follow.", "Ely’s trigger waits 400ms by default; gpui’s waits 500ms."
				props["PreviewExamples"] = []map[string]any{{"TooltipItems": items, "FollowLabel": "Move across me", "FollowText": "No delay. I follow.", "TooltipNote": "Ely’s trigger waits 400ms by default; gpui’s waits 500ms."}}
			case "Blockquote":
				props["PreviewExamples"] = []map[string]any{{"Value": "Simplicity is not the absence of clutter. It is the right thing, in the right place."}}
			case "Highlight":
				props["Query"] = "Caller"
				props["PreviewExamples"] = []map[string]any{{"Text": "Quiet interfaces age well. Loud ones AGE fast.", "Query": "age"}}
			case "Truncate":
				props["PreviewExamples"] = []map[string]any{{"Before": "Note", "Value": "Good interfaces are quiet. They leave room around each idea, use one voice for text, and save color for the moments that need it. The rest is spacing.", "Width": 240}}
			case "LineClamp":
				props["PreviewExamples"] = []map[string]any{{"Value": "Good interfaces are quiet. They leave room around each idea, use one voice for text, and save color for the moments that need it. The rest is spacing.", "Width": 360, "Lines": 2}}
			case "MiddleEllipsis":
				props["PreviewExamples"] = []map[string]any{{"Value": "~/Documents/GitHub/Ely-GPUI-Components/src/typography/fit.rs", "Width": 280}}
			case "EllipsisTooltip":
				props["PreviewExamples"] = []map[string]any{{"Value": "Design review · Tuesday, with the full product team and guests", "Width": 240}}
			case "Link":
				props["PreviewExamples"] = []map[string]any{{"Before": "Read the", "Label": "style guide", "After": "before you start.", "Href": "#style-guide"}}
			case "ExternalLink":
				props["PreviewExamples"] = []map[string]any{{"Label": "gpui.rs", "Href": "https://www.gpui.rs"}}
			case "Emoji":
				props["Emojis"] = []map[string]any{{"Value": "✨", "Text": "sparkles", "Alt": "Sparkles"}, {"Value": "🌿", "Text": "herb", "Alt": "Herb"}, {"Value": "☕", "Text": "coffee", "Alt": "Coffee"}, {"Value": "✨", "Text": "xl", "Alt": "Sparkles", "Size": "xxl"}}
			case "RelativeTime":
				now := time.Now()
				props["Formats"] = []map[string]any{{"Label": "10 s", "Value": now.Add(-10 * time.Second).Format(time.RFC3339), "DateTime": now.Add(-10 * time.Second).Format(time.RFC3339)}, {"Label": "3 min", "Value": now.Add(-3 * time.Minute).Format(time.RFC3339), "DateTime": now.Add(-3 * time.Minute).Format(time.RFC3339)}, {"Label": "2 h", "Value": now.Add(-2 * time.Hour).Format(time.RFC3339), "DateTime": now.Add(-2 * time.Hour).Format(time.RFC3339)}, {"Label": "3 d", "Value": now.Add(-72 * time.Hour).Format(time.RFC3339), "DateTime": now.Add(-72 * time.Hour).Format(time.RFC3339)}}
			case "DateTimeText":
				props["Formats"] = []map[string]any{{"Label": "default", "Value": "2026-09-24T09:41:00Z", "DateTime": "2026-09-24T09:41:00Z"}, {"Label": "%Y-%m-%d", "Value": "2026-09-24T09:41:00Z", "DateTime": "2026-09-24T09:41:00Z", "Pattern": "%Y-%m-%d"}, {"Label": "%A %H:%M", "Value": "2026-09-24T09:41:00Z", "DateTime": "2026-09-24T09:41:00Z", "Pattern": "%A %H:%M"}}
			case "NumberText":
				props["Formats"] = []map[string]any{{"Label": "2 decimals", "Value": "1234567.891", "Decimals": 2}, {"Label": "integer", "Value": "42000"}, {"Label": "negative", "Value": "-1234.5", "Decimals": 1}}
			case "CurrencyText":
				props["Formats"] = []map[string]any{{"Label": "USD", "Value": "1234.5", "Currency": "USD"}, {"Label": "EUR", "Value": "-42", "Currency": "EUR"}, {"Label": "JPY", "Value": "1500.4", "Currency": "JPY"}, {"Label": "CHF", "Value": "9.99", "Currency": "CHF"}}
			case "PercentText":
				props["Formats"] = []map[string]any{{"Label": "plain", "Value": "0.1234", "Decimals": 2}, {"Label": "gain", "Value": "0.052", "Signed": true}, {"Label": "loss", "Value": "-0.031", "Signed": true}}
			case "CopyableText":
				props["Value"], props["Label"], props["CopyIcon"] = "ely_live_4f9a2c81d7", "Copy token", true
			case "SelectableText":
				props["Value"] = "Selection works on read-only text too: logs, messages, receipts."
			case "FileSizeText":
				props["Formats"] = []map[string]any{{"Label": "1536 B", "Value": "1536"}, {"Label": "3.2 GB", "Value": "3200000000"}, {"Label": "binary", "Value": "3221225472", "Binary": true}}
			case "DurationText":
				props["Formats"] = []map[string]any{{"Label": "clock", "Value": "5025", "DurationStyle": "clock"}, {"Label": "clock", "Value": "1425", "DurationStyle": "clock"}, {"Label": "compact", "Value": "245", "DurationStyle": "compact"}}
			case "PluralText":
				props["Formats"] = []map[string]any{{"Label": "1", "Value": "1", "Unit": "file", "OtherUnit": "files"}, {"Label": "12345", "Value": "12345", "Unit": "file", "OtherUnit": "files"}}
			case "Sidebar":
				props["SidebarItems"], props["Text"], props["Label"] = []map[string]any{{"Label": "Home", "Icon": "house"}, {"Label": "Inbox", "Icon": "inbox"}, {"Label": "Settings", "Icon": "settings"}}, "", "Collapse"
			case "Page":
				props["Title"], props["Text"], props["Items"], props["ActionLabel"] = "Projects", "Everything your team is shipping.", []string{"Atlas", "Beacon", "Compass"}, "＋ New project"
			case "MasterDetail":
				props["Items"], props["Text"], props["Caption"] = []string{"Quarterly review", "Design sync", "Launch plan", "Hiring loop"}, "Quarterly review", "Numbers, notes and the next three moves."
			case "Drawer":
				props["Label"], props["Text"], props["CloseLabel"] = "Open drawer", "Drawers hold short tasks close to where the hand already is.", "Close"
				props["PreviewExamples"] = []map[string]any{{"Items": nil, "HideTitle": true, "HideClose": true, "Caption": "Drag the handle down, or click the scrim."}}
			case "Sheet":
				props["Label"], props["Title"], props["Text"], props["Items"], props["CloseLabel"] = "Open sheet", "Filters", "Sheets keep context visible while a side task runs.", []string{"Status: open", "Owner: anyone"}, "Close"
				props["PreviewExamples"] = []map[string]any{{"Title": "Filters", "Caption": ""}}
			case "Accordion":
				accordion := []map[string]any{{"Label": "What is Ely?", "Text": "A component library for gpui, in light and dark."}, {"Label": "Does it animate?", "Text": "Where motion explains a change, and nowhere else."}, {"Label": "Can I theme it?", "Text": "Every color, size and radius comes from one token set."}}
				props["AccordionItems"] = accordion
				props["PreviewExamples"] = []map[string]any{{"AccordionItems": accordion}}
			case "SplitPane":
				props["Before"], props["NestedBefore"], props["NestedAfter"], props["NestedLabel"], props["Label"], props["Split"], props["NestedSplit"] = "files", "editor", "terminal", "Resize editor and terminal", "Resize files and editor", 30, 50
				props["PreviewExamples"] = []map[string]any{{"Before": "files", "NestedBefore": "editor", "NestedAfter": "terminal", "NestedLabel": "Resize editor and terminal", "Label": "Resize files and editor", "Split": 30, "NestedSplit": 50}}
			case "Latex":
				props["Latexes"], props["LatexSource"] = []map[string]any{{"Value": `e^{i\pi} + 1 = 0`, "Label": "euler"}, {"Value": `\sum_{k=1}^{n} k = \frac{n(n+1)}{2}`, "Label": "sum"}, {"Value": `x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`, "Label": "root"}}, `Latex::parse(r"e^{i\pi} + 1 = 0")?`
			case "Heading":
				headings := []map[string]any{{"Level": 1, "Value": "Quiet interfaces"}, {"Level": 2, "Value": "Quiet interfaces"}, {"Level": 3, "Value": "Quiet interfaces"}, {"Level": 4, "Value": "Quiet interfaces"}, {"Level": 5, "Value": "Quiet interfaces"}, {"Level": 6, "Value": "Quiet interfaces"}}
				props["PreviewExamples"] = []map[string]any{{"Headings": headings, "PreviewStack": true}}
			case "Title":
				props["PreviewExamples"] = []map[string]any{{"Value": "Quarterly review", "Text": "Numbers, notes and the next three moves."}}
			case "Paragraph":
				props["PreviewExamples"] = []map[string]any{{"Value": "Good interfaces are quiet. They leave room around each idea, use one voice for text, and save color for the moments that need it. The rest is spacing."}}
			case "Label":
				props["PreviewExamples"] = []map[string]any{{"Labels": []string{"Display name", "Workspace"}}}
			case "Caption":
				props["PreviewExamples"] = []map[string]any{{"Value": "Updated a moment ago · visible to your team"}}
			case "Overline":
				props["PreviewExamples"] = []map[string]any{{"Value": "Release notes", "Version": "Version 0.1"}}
			case "Code":
				props["PreviewExamples"] = []map[string]any{{"Before": "Run", "Value": "cargo run --example gallery", "After": "to open this window."}}
			case "Kbd":
				keycaps := []map[string]any{{"Label": "secondary-s", "Keys": []string{"Ctrl", "S"}}, {"Label": "shift-tab", "Keys": []string{"Shift", "Tab"}}, {"Label": "escape", "Keys": []string{"Esc"}}, {"Label": "enter", "Keys": []string{"Enter"}}}
				props["PreviewExamples"] = []map[string]any{{"Keycaps": keycaps}}
			case "KbdCombo":
				combos := []map[string]any{{"Label": "secondary-shift-p", "Groups": []map[string]any{{"Keys": []string{"Ctrl", "Shift", "P"}}}}, {"Label": "secondary-k secondary-s", "Groups": []map[string]any{{"Keys": []string{"Ctrl", "K"}}, {"Keys": []string{"Ctrl", "S"}}}}}
				props["PreviewExamples"] = []map[string]any{{"KeyCombos": combos}}
			case "Stack":
				stacks := []map[string]any{{"Label": "h_stack", "Variant": "HStack", "Items": []string{"A", "B", "C"}}, {"Label": "v_stack", "Variant": "VStack", "Items": []string{"A", "B"}}}
				props["Stacks"] = stacks
				props["PreviewExamples"] = []map[string]any{{"Stacks": stacks}}
			case "Flex":
				props["PreviewExamples"] = []map[string]any{{"Items": []string{"fixed", "flex_1", "fixed"}}}
			case "Grid":
				grid := []map[string]any{{"Label": "span 2", "Span": 2}, {"Label": "1", "Span": 1}, {"Label": "1", "Span": 1}, {"Label": "span 2", "Span": 2}}
				props["PreviewExamples"] = []map[string]any{{"GridItems": grid}}
			case "SimpleGrid":
				props["PreviewExamples"] = []map[string]any{{"Items": []string{"Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Item 6", "Item 7"}}}
			case "Masonry":
				masonry := []map[string]any{{"Label": "1", "Height": 72}, {"Label": "2", "Height": 120}, {"Label": "3", "Height": 56}, {"Label": "4", "Height": 96}, {"Label": "5", "Height": 140}, {"Label": "6", "Height": 64}, {"Label": "7", "Height": 88}, {"Label": "8", "Height": 110}}
				props["PreviewExamples"] = []map[string]any{{"MasonryItems": masonry}}
			case "AspectRatio":
				props["Aspects"] = []map[string]any{{"Ratio": 16.0 / 9.0, "Value": "16 : 9"}, {"Ratio": 1, "Value": "1 : 1"}}
			case "Inset":
				insets := []map[string]any{{"Label": "p_2", "Padding": 2, "Value": "content"}, {"Label": "p_6", "Padding": 6, "Value": "content"}}
				props["PreviewExamples"] = []map[string]any{{"InsetSamples": insets}}
			case "Wrap":
				props["PreviewExamples"] = []map[string]any{{"Items": []string{"design", "motion", "type", "color", "layout", "grid", "rhythm", "space"}}}
			case "Layer":
				layers := []map[string]any{{"Label": "three layers"}, {"Label": ""}, {"Label": ""}}
				props["PreviewExamples"] = []map[string]any{{"Layers": layers, "Value": "three layers"}}
			case "ScrollArea":
				props["Items"], props["Value"] = lines(24), "Scroll area"
			case "Scrollbar":
				props["Items"], props["Value"], props["Label"] = lines(30), "Scrollbar", "Scroll position"
			case "ScrollShadow":
				props["Items"], props["Value"] = lines(30), "Scroll shadow"
			case "ScrollToTop":
				props["Items"], props["Value"], props["Label"] = lines(40), "Scroll to top", "Scroll to top"
			case "StickyHeader":
				groups := []map[string]any{{"Label": "Today", "Items": lines(8)}, {"Label": "Yesterday", "Items": lines(8)}, {"Label": "Earlier", "Items": lines(8)}}
				props["StickyGroups"], props["Value"], props["Label"] = groups, "Sticky groups", "Scroll position"
			case "Frame":
				props["Value"] = "Framed content sits on the page tone."
			case "Well":
				props["Value"] = "Wells hold secondary material."
			case "AnimatedNumber":
				props["AnimatedNumbers"], props["Duration"] = []map[string]any{{"Label": "roll", "Mode": "roll", "Value": "1284", "Values": "1284,1917,12406,9998,10031", "Duration": 320}, {"Label": "count up", "Mode": "count", "Value": "4750.8", "Values": "4750.8,7092.9,45902.2,36992.6,37114.7", "Decimals": 1, "Duration": 320}}, 320
			case "Typewriter":
				props["TypewriterLines"], props["NextLabel"], props["Duration"] = []string{"Writing, one grapheme at a time.", "中文与 emoji ✨ 也按字形逐个出现。"}, "Next line", 960
			case "GradientText":
				props["Gradients"] = []map[string]any{{"Label": "ink to muted", "Value": "Quiet type", "Tone": "muted"}, {"Label": "ink to focus", "Value": "Quiet type", "Tone": "focus"}}
			case "ShimmerText":
				props["Value"] = "Thinking through the request…"
			}
			if _, composed := props["PreviewExamples"]; !composed {
				if example, ok := preview[chapter+"/"+name]; ok {
					props["PreviewExamples"] = []map[string]any{example}
				}
			}
			cases = append(cases, AdvancedCase{Family: "foundation", Component: ui.Component{Chapter: chapter, Name: name, ID: id, Props: props}})
		}
	}
	return cases
}
