package uiexamples

import (
	"time"

	"github.com/mrchypark/ely-htmx"
)

// advancedCommunicationCases gives each communication story its own caller-owned data.
func advancedCommunicationCases() []AdvancedCase {
	definitions, err := ui.ComponentDefinitions()
	if err != nil {
		return nil
	}
	indexes := map[string]int{}
	var cases []AdvancedCase
	for _, definition := range definitions {
		if definition.Family != "communication" {
			continue
		}
		indexes[definition.Chapter]++
		id := "audit-" + definition.Chapter + "-" + itoa(indexes[definition.Chapter])
		props := map[string]any{
			"Title": "Northwind review", "Label": "Review", "Content": "Friday's review moves to 10:00 in the model room.", "Value": "25", "Name": "message", "Placeholder": "Write a message", "Required": indexes[definition.Chapter]%4 == 0, "Disabled": indexes[definition.Chapter]%13 == 0 && definition.Name != "TemperatureSlider" && definition.Name != "Pomodoro Timer",
			"Author": "Ana Lima", "Time": "09:30", "Count": 2, "Reaction": "♥", "Status": "Ready", "Progress": 45, "Max": 100, "Start": "2026-10-12T09:00", "End": "2026-10-12T10:00", "From": "ana@atrium.studio", "To": "team@atrium.studio", "Subject": "Friday's review moves to 10:00", "Quote": "The model room is ready.", "Payload": `{"path":"notes/review.md"}`, "Path": "notes/review.md", "Diff": "- draft\n+ reviewed", "Alt": "Northwind review preview", "URL": "/assets/sample.svg",
			"Items":   []map[string]any{{"Value": id + "-first", "Label": "Friday review", "Title": "Friday review", "Content": "Model room · 10:00"}, {"Value": id + "-second", "Label": "Plaster samples", "Title": "Plaster samples", "Content": "Ana Lima · 09:30"}},
			"Options": []map[string]any{{"Value": "open", "Label": "Open", "Selected": true}, {"Value": "closed", "Label": "Closed"}},
			"Context": []map[string]any{{"Value": "project:northwind", "Label": "Northwind"}, {"Value": "source:42", "Label": "Source 42"}}, "Commands": []map[string]any{{"Value": "/summarize", "Label": "/summarize"}},
			"Lanes": []map[string]any{{"Value": "todo", "Label": "To do", "Count": 1, "Cards": []map[string]any{{"Value": id + "-card", "Title": "Caller task", "Content": "Move only after host confirmation", "Priority": "High", "Due": "2026-10-14"}}}, {"Value": "done", "Label": "Done", "Count": 0}},
			"Due":   "2026-10-14", "Priority": "High", "Date": "2026-10-12", "Day": "12", "Until": "2026-10-12T13:00", "SendAt": "2026-10-12T14:00", "Events": []map[string]any{{"Value": id + "-event", "Label": "Caller event", "Start": "09:00", "End": "10:00"}},
		}
		switch definition.Name {
		case "ChatContainer":
			props["Title"], props["Label"], props["DateLabel"], props["TypingLabel"] = "Color and lift", "Color and lift conversation", "Friday, September 26", "Assistant is thinking…"
			props["Items"] = []map[string]any{{"Value": "m1", "Role": "user", "Avatar": "AP", "Author": "Ada", "Time": "09:28", "Content": "What does a lift do to a color?"}, {"Value": "m2", "Role": "assistant", "Avatar": "AI", "Author": "Assistant", "Time": "09:30", "Content": "A lift blends a color toward white. Half a lift sits midway between the color and white.", "Points": []string{"Caller structured point"}}, {"Value": "m3", "Role": "assistant", "Author": "Assistant", "Time": "09:31", "Content": "Dark themes use a smaller lift because saturated color reads louder there.", "Grouped": true}, {"Value": "m4", "Role": "user", "Avatar": "AP", "Author": "Ada", "Time": "09:32", "Content": "And a shade?"}}
			props["PreviewStack"] = true
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "ChatContainer"}}
		case "StreamingText":
			props["Paragraphs"] = []string{"A lift blends a color toward white. Half a lift sits midway between the color and white; a full lift is white itself.", "• In light, accents take half a lift.\n• In dark, they take more, so they read with the same weight."}
			props["ReplayLabel"] = "Replay the stream"
		case "CodeBlock":
			shortLines := []map[string]any{{"Spans": []map[string]any{{"Class": "keyword", "Text": "fn"}, {"Text": " lift"}, {"Class": "punctuation", "Text": "("}, {"Class": "type", "Text": "c: f32, t: f32"}, {"Class": "punctuation", "Text": ") -> f32 {"}}}, {"Spans": []map[string]any{{"Text": "    c + t * "}, {"Class": "number", "Text": "(1.0"}, {"Text": " - c)"}}}, {"Spans": []map[string]any{{"Class": "punctuation", "Text": "}"}}}}
			longLines := []map[string]any{{"Text": "/// Every accent in the library, lifted for its theme."}, {"Text": "pub struct Accents {"}, {"Text": "    base: Hsla,"}, {"Text": "    light: f32,"}, {"Text": "    dark: f32,"}, {"Text": "}"}, {"Text": ""}, {"Text": "impl Accents {"}, {"Text": "    pub fn new(base: Hsla) -> Self {"}, {"Text": "        Self { base, light: 0.5, dark: 0.62 }"}, {"Text": "    }"}, {"Text": ""}, {"Text": "    pub fn shown(&self, dark: bool) -> Hsla {"}, {"Text": "        let t = if dark { self.dark } else { self.light };"}, {"Hidden": true, "Text": "        lift(self.base, t)"}, {"Hidden": true, "Text": "    }"}, {"Hidden": true, "Text": ""}, {"Hidden": true, "Text": "    pub fn hover(&self, dark: bool) -> Hsla {"}, {"Hidden": true, "Text": "        lift(self.shown(dark), 0.08)"}, {"Hidden": true, "Text": "    }"}, {"Hidden": true, "Text": "}"}}
			auditLines := append(append([]map[string]any{}, shortLines...), map[string]any{"Hidden": true, "Spans": []map[string]any{{"Class": "comment", "Text": "// A full lift returns white."}}})
			props["Language"], props["ExactCopy"], props["Lines"], props["ShowMoreLabel"] = "rust", "fn lift(c: f32, t: f32) -> f32 {\n    c + t * (1.0 - c)\n}", auditLines, "Show more"
			props["Actions"] = []map[string]any{{"Label": "Run", "Action": "run-code"}, {"Label": "Apply", "Action": "apply-code"}, {"Label": "Download", "Action": "download-code"}}
			props["PreviewStack"] = true
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "CodeBlock", "Lines": shortLines, "Actions": props["Actions"]}, {"PreviewName": "CodeBlock", "Lines": longLines, "Actions": nil, "ShowMoreLabel": "Show 6 more lines", "ExactCopy": "pub struct Accents { … }"}}
		case "CitationBadge", "InlineCitation", "SourceCard", "SourceList", "SourcesPanel":
			props["Number"], props["Value"], props["SourceTitle"], props["SourceSite"] = 1, "palette-notes", "Palette notes", "elygpui.com"
			props["Content"], props["Href"] = "Dark themes need less lift because saturated color reads louder on a dark ground.", "https://elygpui.com"
			sources := []map[string]any{
				{"Number": 1, "Value": "light-dark", "SourceSite": "example.com", "SourceTitle": "Color, in light and dark", "Href": "https://example.com/color/light-and-dark", "Content": "How one accent reads the same on paper and on charcoal."},
				{"Number": 2, "Value": "gamma", "SourceSite": "example.org", "SourceTitle": "Gamma and the eye", "Href": "https://example.org/notes/gamma", "Content": "Why even steps in gamma space look even to the eye.", "Text": "A lift blends a color toward white, in gamma space."},
				{"Number": 3, "Value": "dark", "SourceSite": "example.net", "SourceTitle": "Designing dark themes", "Href": "https://example.net/dark-themes", "Content": "Lift surfaces rather than shade them; depth reads as light."},
			}
			sources[0]["Text"] = "Dark themes lift further."
			props["PreviewStack"], props["PreviewExamples"] = true, []map[string]any{{"Citations": []map[string]any{sources[1], sources[0], sources[2]}, "Sources": sources}}
		case "SearchProgress":
			props["Label"] = "Searching the web"
			props["Items"] = []map[string]any{{"Label": "Searching for lift in dark themes", "State": "done", "Documents": "12 documents"}, {"Label": "Reading 3 sources", "Content": "Palette and contrast notes", "State": "working", "Citations": 2}, {"Label": "Checking related threads", "State": "waiting"}}
			passage := []map[string]any{{"Text": "Accents in dark carry "}, {"Text": "more lift", "Match": true}, {"Text": " than in light, because a saturated color on charcoal "}, {"Text": "looks louder", "Match": true}, {"Text": " than the same color on paper."}}
			searchSteps := []map[string]any{{"Label": "Searching for “lift in dark themes”", "State": "done"}, {"Label": "Reading 3 sources", "State": "working"}, {"Label": "Writing the answer", "State": "waiting"}}
			props["PreviewStack"], props["PreviewExamples"] = true, []map[string]any{{"Items": searchSteps, "Results": []map[string]any{{"SourceSite": "example.net", "SourceTitle": "Designing dark themes", "Href": "https://example.net/dark-themes", "Date": "Sep 2026", "Content": "Lift surfaces rather than shade them; depth reads as light."}}, "Chunks": []map[string]any{{"FileName": "lift-notes.pdf", "Location": "Page 1 · Dark is not inverted", "Score": "0.86", "Runs": passage}, {"FileName": "a-long-name-for-the-lift-notes.pdf", "Location": "Page 1 · Dark is not inverted", "Score": "0.86", "Runs": passage, "Narrow": true}}}}
		case "ImageMessage":
			props["URL"], props["Alt"], props["Caption"], props["Width"], props["Height"] = "/assets/sample.svg", "Atrium study", "The atrium at noon", 960, 640
			props["FileName"], props["FileMeta"], props["Duration"], props["Href"] = "lift-notes.pdf", "482 KB · PDF", "00:42", "https://elygpui.com"
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "ImageMessage", "Width": 960, "Height": 640, "Caption": "The atrium at noon"}, {"PreviewName": "ImageMessage", "Width": 600, "Height": 400, "Caption": "In a narrow column, in its own shape"}, {"PreviewName": "ImageGrid", "Items": []map[string]any{{"URL": "/assets/sample.svg", "Alt": "Atrium study", "Label": "Atrium"}, {"URL": "/assets/sample-before.svg", "Alt": "Stair study", "Label": "Stair"}}}, {"PreviewName": "FileMessage"}, {"PreviewName": "AudioMessage"}, {"PreviewName": "VideoMessage"}, {"PreviewName": "LinkPreviewCard"}}
		case "QuoteReply":
			props["QuoteAuthor"], props["Quote"], props["QuoteValue"] = "Assistant", "A lift blends a color toward white. Half a lift sits midway between the color and white.", "assistant-lift"
			props["Label"], props["Name"], props["Placeholder"], props["Value"] = "Reply", "message", "Reply to Assistant", ""
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "QuoteReply"}}
		case "ErrorMessage":
			props["Title"], props["Status"] = "The answer stopped halfway", "Connection closed"
			props["Content"], props["Feedback"] = "The connection closed before the end. Nothing was lost.", true
			props["FeedbackReasons"] = []map[string]any{{"Value": "wrong", "Label": "Wrong"}, {"Value": "unclear", "Label": "Unclear"}, {"Value": "too-long", "Label": "Too long"}, {"Value": "missed", "Label": "Missed the point"}}
		case "ThinkingBlock":
			props["Content"], props["DurationLabel"], props["Open"] = "Start from the definition, then explain why dark surfaces need a smaller lift.", "Thought for 12 seconds", true
			props["PreviewStack"] = true
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "ThinkingBlock", "State": "complete", "Open": true}, {"PreviewName": "ThinkingBlock", "State": "working", "WorkingLabel": "Weighing dark theme contrast", "Open": true}, {"PreviewName": "ThinkingBlock", "State": "disclosed", "Title": "Reasoning"}}
		case "TemperatureSlider", "ParameterPanel", "SystemPromptEditor", "TokenCounter":
			props["Parameters"] = []map[string]any{{"Key": "temperature", "Label": "Temperature", "Value": "0.7", "Min": 0, "Max": 2, "Step": 0.1, "Hint": "Higher reads looser; lower, steadier."}, {"Key": "top_p", "Label": "Top p", "Value": "0.95", "Min": 0, "Max": 1, "Step": 0.05}, {"Key": "longest", "Label": "Longest answer, in tokens", "Value": "1024", "Min": 256, "Max": 8192, "Step": 256}}
			props["SystemPrompt"], props["SystemTokens"], props["SystemLimit"], props["TokenUsed"], props["TokenLimit"] = "Write plainly. Define terms before using them.", 400, 400, 183600, 200000
		case "ConversationList":
			props["Sections"] = []map[string]any{{"Label": "Pinned", "Items": []map[string]any{{"Value": "lift", "Label": "Color and lift", "Pinned": true, "Time": "Now", "Active": true}}}, {"Label": "Today", "Items": []map[string]any{{"Value": "shades", "Label": "Shades and surfaces", "Time": "09:30"}}}, {"Label": "Yesterday", "Items": []map[string]any{{"Value": "contrast", "Label": "Contrast notes", "Time": "Yesterday"}}}}
		case "FolderList", "ProjectList", "ProjectKnowledgePanel":
			projects := []map[string]any{{"Value": "component-library", "Label": "Component library", "Content": "24 conversations", "Expanded": true, "Children": []map[string]any{{"Value": "northwind-review", "Label": "Northwind review", "Content": "Today · 09:30"}, {"Value": "palette-lift", "Label": "Color and lift", "Content": "Yesterday"}}}, {"Value": "website", "Label": "The website", "Content": "9 conversations", "Children": []map[string]any{{"Value": "atrium-brief", "Label": "Atrium brief", "Content": "Monday"}}}, {"Value": "color-notes", "Label": "Color notes", "Content": "3 conversations"}}
			props["Label"], props["Items"] = "Projects", projects
			props["Files"], props["Used"], props["Capacity"] = []map[string]any{{"Value": "palette", "Name": "palette.md", "Content": "12 KB"}, {"Value": "lift", "Name": "lift-notes.pdf", "Content": "482 KB"}}, "494 KB", "2 MB"
			props["PreviewStack"] = true
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "FolderList", "Items": projects, "Files": props["Files"], "Used": props["Used"], "Capacity": props["Capacity"]}}
		case "SharedConversationView":
			props["Title"], props["Value"], props["SharedBy"], props["SharedAt"] = "Color and lift", "shared-lift", "Grace Lin", "3 hours ago"
			props["Items"] = []map[string]any{{"Role": "user", "Author": "Grace Lin", "Time": "09:28", "Content": "What does a lift do to a color?"}, {"Role": "assistant", "Author": "Assistant", "Time": "09:30", "Content": "A lift blends a color toward white. Half a lift sits midway between the color and white."}, {"Role": "user", "Author": "Grace Lin", "Time": "09:31", "Content": "And a shade?"}, {"Role": "assistant", "Author": "Assistant", "Time": "09:31", "Content": "A shade blends toward black the same way."}}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "SharedConversationView"}}
		case "WelcomeScreen", "SuggestionChips", "Greeting", "StarterPrompts", "CapabilityCards":
			props["Greeting"], props["UserName"], props["Name"], props["Label"], props["Placeholder"], props["Value"] = "Good morning,", "Ada", "message", "Message Ada", "How can I help?", ""
			props["Content"] = "Start a conversation, or choose a prompt."
			props["Suggestions"] = []map[string]any{{"Value": "Explain a lift", "Label": "Explain a lift"}, {"Value": "Review my palette", "Label": "Review my palette"}, {"Value": "Draft release notes", "Label": "Draft release notes"}}
			props["Capabilities"] = []map[string]any{{"Value": "Search the web for ", "Label": "Search the web", "Content": "Answers with sources you can open."}, {"Value": "Write code that ", "Label": "Write and run code", "Content": "Tries an idea before you use it."}, {"Value": "Read my file and ", "Label": "Read your files", "Content": "Pages and notes you attach."}}
			props["PreviewStack"], props["PreviewExamples"] = true, []map[string]any{{"PreviewName": "WelcomeScreen"}}
		case "FollowUpSuggestions":
			props["Author"], props["Content"] = "Assistant", "A lift blends a color toward white. Half a lift sits midway between the color and white."
			props["Items"] = []map[string]any{{"Value": "contrast", "Label": "How does it affect contrast?"}, {"Value": "shade", "Label": "What is a shade?"}, {"Value": "dark", "Label": "Why use less lift in dark themes?"}, {"Value": "example", "Label": "Show an example."}}
		case "PromptInput":
			props["Label"], props["Value"], props["Placeholder"], props["Rows"] = "Message", "Compare these two lifts in dark mode", "Ask anything, / for commands, @ for context", 5
			props["Attachments"] = []map[string]any{{"Value": "olive", "Name": "atrium-olive.jpg", "Content": "184 KB"}, {"Value": "notes", "Name": "lift-notes.pdf", "Content": "482 KB"}}
			props["Context"], props["Commands"] = []map[string]any{{"Value": "project:northwind", "Label": "Northwind brief"}}, []map[string]any{{"Value": "/summarize", "Label": "/summarize"}, {"Value": "/rewrite", "Label": "/rewrite"}}
			props["Model"], props["Models"], props["Temperature"] = "large", []map[string]any{{"Value": "large", "Label": "Ely Large"}, {"Value": "small", "Label": "Ely Small"}}, "0.7"
			props["PreviewStack"], props["PreviewExamples"] = true, []map[string]any{{"PreviewName": "PromptInput"}}
		case "ModelSelector":
			props["Value"], props["CurrentLabel"], props["ModelNote"] = "large", "Ely Large", "Best for hard problems"
			props["Options"] = []map[string]any{{"Value": "large", "Label": "Ely Large", "Content": "Best for hard problems", "Selected": true}, {"Value": "small", "Label": "Ely Small", "Content": "Fast for everyday work"}}
			props["Modes"] = []map[string]any{{"Value": "chat", "Label": "Chat", "Selected": true}, {"Value": "research", "Label": "Research"}, {"Value": "code", "Label": "Code"}}
			props["Tools"] = []map[string]any{{"Value": "web", "Label": "Web search", "Enabled": true}, {"Value": "code", "Label": "Run code"}, {"Value": "images", "Label": "Make images"}}
			props["Templates"] = []map[string]any{{"Value": "review-code", "Label": "Review this code", "Content": "Review the code below. List bugs first."}, {"Value": "explain", "Label": "Explain like a textbook", "Content": "Explain the idea below to a newcomer."}}
			props["PreviewStack"], props["PreviewExamples"] = true, []map[string]any{{"PreviewName": "ModelSelector"}}
		case "PromptLibrary":
			templates := []map[string]any{{"Value": "review-code", "Label": "Review the code", "Category": "Engineering", "Description": "List bugs and unclear decisions.", "Content": "Read the code below. List risks first, then explain unclear decisions."}, {"Value": "explain", "Label": "Explain a concept", "Category": "Writing", "Description": "Define terms before using them.", "Content": "Explain the idea below to a newcomer, one idea per paragraph."}, {"Value": "release", "Label": "Draft release notes", "Category": "Writing", "Description": "Turn changes into a release summary.", "Content": "Draft concise release notes from these changes."}}
			props["Title"], props["Content"], props["Value"], props["Templates"] = "Review the code", "Read the code below. List risks first, then explain unclear decisions.", "review-code", templates
			props["Categories"] = []map[string]any{{"Value": "Engineering", "Label": "Engineering"}, {"Value": "Writing", "Label": "Writing"}}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "PromptLibrary", "Templates": templates}}
		case "MathBlock":
			props["Formula"] = "c' = c + t(1 - c)"
			props["Label"] = "Color lift formula"
			props["Content"] = ""
			props["Caption"] = "Lift values"
			props["Columns"] = []string{"Theme", "Lift", "Reads as"}
			props["Rows"] = []map[string]any{{"Cells": []string{"Light", "0.50", "half toward white"}}, {"Cells": []string{"Dark", "0.62", "a little louder"}}}
			props["Diagram"] = "flowchart LR\n  c[Color] --> l[Lift]\n  l --> cp[c′]"
			props["Src"] = "/assets/communication-math-diagram.svg"
			props["Alt"] = "Diagram showing color flowing through lift to a lighter color"
			props["PreviewStack"] = true
			props["PreviewExamples"] = []map[string]any{
				{"PreviewName": "TableBlock"},
				{"PreviewName": "MathBlock"},
				{"PreviewName": "MermaidRenderer"},
			}
		case "BrowserPreview":
			props["URL"] = "https://elygpui.com/docs/browser-preview"
			props["PreviewURL"] = "/assets/sample.svg"
			props["Content"] = "Northwind project preview"
			props["ActionLabel"] = "Open"
			props["NextActionLabel"] = "Open next action"
			props["Frames"] = browserFrames()
			props["Steps"] = []map[string]any{{"Label": "Opened the documentation", "State": "done"}, {"Label": "Reading BrowserPreview", "State": "working"}, {"Label": "Waiting for the next action", "State": "waiting"}}
			props["PreviewStack"], props["PreviewExamples"] = true, []map[string]any{{"PreviewName": "BrowserPreview", "URL": "https://elygpui.com/docs/browser-preview", "PreviewURL": "/assets/sample.svg", "Alt": "Browser documentation", "Content": "BrowserPreview documentation", "Frames": browserFrames(), "Steps": props["Steps"], "NextActionLabel": "Next action"}}
		case "ParticipantTile":
			props["Items"] = messagingCallTiles()
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "VideoCallGrid"}}
		case "ScreenShareView":
			props["Presenter"], props["URL"], props["Alt"], props["Content"], props["Ratio"] = "Ana Lima", "/assets/communication/screen.jpg", "Ana Lima's shared forms screen", "", 1.6
			props["Items"] = []map[string]any{{"Label": "Ben Ito", "Avatar": "BI", "Muted": true}, {"Label": "Chloé Martin", "Avatar": "CM", "Speaking": true}}
		case "ReadReceipt":
			props["Content"], props["Status"] = "", "Sending"
			props["Receipts"] = []map[string]any{{"Status": "Sending"}, {"Status": "Sent"}, {"Status": "Delivered"}, {"Status": "Read"}, {"Status": "Read", "Readers": []map[string]any{{"Label": "Ana Lima", "Avatar": "AL"}, {"Label": "Ben Ito", "Avatar": "BI"}, {"Label": "Chloé Martin", "Avatar": "CM"}, {"Label": "Dev Rao", "Avatar": "DR"}}}}
		case "MemberList":
			props["Value"], props["Items"] = "chloe", messagingMemberProfiles()
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "MemberList"}}
		case "OnlineStatus":
			props["Items"] = []map[string]any{{"Presence": "online", "PresenceLabel": "Online"}, {"Presence": "away", "PresenceLabel": "Away"}, {"Presence": "busy", "PresenceLabel": "Busy"}, {"Presence": "offline", "PresenceLabel": "Offline"}}
		case "CallControls":
			props["Status"] = ""
			props["Title"], props["Value"], props["Duration"], props["Mic"], props["Camera"], props["Share"], props["Joined"], props["Disabled"] = "Huddle in # design", "design", "00:00", true, true, false, true, false
			props["People"] = []map[string]any{{"Label": "Ana Lima", "Avatar": "AL"}, {"Label": "Ben Ito", "Avatar": "BI"}, {"Label": "Chloé Martin", "Avatar": "CM"}}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "CallControls"}}
		case "IncomingCallDialog":
			props["Title"], props["Caller"], props["Avatar"], props["Content"], props["Value"], props["ActionLabel"], props["Disabled"] = "Ana Lima", "Ana Lima", "AL", "Incoming video call", "ana", "Ring", false
		case "StickerPicker":
			props["Packs"] = []map[string]any{{"Label": "Atrium", "Items": messagingStickers([]string{"arch", "stair", "column", "window"}, []string{"Arch", "Stair", "Column", "Window"})}, {"Label": "Garden", "Items": messagingStickers([]string{"olive", "sun", "stone", "sprout"}, []string{"Olive", "Sun", "Stone", "Sprout"})}}
			props["SentLabel"], props["SentTime"], props["Disabled"] = "You", "10:20", false
		case "GifPicker":
			props["Categories"], props["LocalResults"], props["SentLabel"], props["SentTime"], props["Disabled"] = []string{"Stair", "Olive", "Dunes", "Atrium"}, true, "You", "10:20", false
			props["Items"] = []map[string]any{{"Value": "stair-light", "Label": "Light on the stair", "URL": "/assets/communication/stair-light.gif", "Ratio": 1.5}, {"Value": "olive-breath", "Label": "The olive tree", "URL": "/assets/communication/olive-breath.gif", "Ratio": 1.5}, {"Value": "dunes-drift", "Label": "Dunes at dusk", "URL": "/assets/communication/dunes-drift.gif", "Ratio": 240.0 / 129.0}, {"Value": "atrium-fade", "Label": "The atrium, before and after", "URL": "/assets/communication/atrium-fade.gif", "Ratio": 200.0 / 133.0}}
			props["PreviewStack"], props["PreviewExamples"] = true, []map[string]any{{"PreviewName": "GifPicker"}, {"PreviewName": "GifPicker", "Loading": true, "Categories": nil, "Items": nil}}
		case "ToolCallCard":
			props["Tool"], props["Status"], props["Summary"], props["Took"], props["Arguments"], props["Result"], props["Error"], props["Value"] = "run_tests", "failed", "cargo test --lib theme", "12.4 s", `{ "command": "cargo test --lib theme" }`, "2 tests failed: lift_keeps_hue, dark_lifts_further", "Tests need attention before the host can continue.", "run-tests"
			props["PreviewStack"], props["PreviewExamples"] = true, []map[string]any{{"PreviewName": "ToolCallCard", "Status": "done", "Tool": "read_file", "Summary": "src/theme/palette.rs", "Took": "340 ms", "Arguments": `{ "path": "src/theme/palette.rs" }`, "Result": "pub const ACCENT_LIFT: f32 = 0.18;"}, {"PreviewName": "ToolCallCard", "Status": "working", "Tool": "web_search", "Summary": "oklch lift contrast", "Progress": 62, "Arguments": `{ "query": "oklch lift contrast" }`}, {"PreviewName": "ToolCallCard", "Status": "failed", "Tool": "run_tests", "Summary": "cargo test --lib theme", "Took": "12.4 s", "Arguments": `{ "command": "cargo test --lib theme" }`, "Result": "2 tests failed", "Error": "lift_keeps_hue, dark_lifts_further"}, {"PreviewName": "ToolCallCard", "Status": "waiting", "Tool": "write_file", "Summary": "src/theme/lift.rs", "Arguments": `{ "path": "src/theme/lift.rs" }`}, {"PreviewName": "ToolCallCard", "Status": "done", "Tool": "mcp__filesystem__read_multiple_files", "Summary": "3 files", "Took": "1.1 s", "Arguments": `{ "paths": ["src/theme/mod.rs"] }`}}
		case "ToolApprovalDialog":
			props["Tool"], props["Title"], props["Detail"], props["Payload"], props["Permission"] = "write_file", "write_file", "Writes a new file in src/theme.", `{ "path": "src/theme/lift.rs", "content": "pub fn lift(color, by)" }`, true
			props["PreviewStack"], props["PreviewExamples"] = true, []map[string]any{{"PreviewName": "PermissionPrompt", "Title": "Let the assistant write src/theme/lift.rs?", "Content": "write_file can replace this source file.", "Payload": props["Payload"]}}
		case "SubAgentTree":
			props["Label"] = "Agents"
			props["Items"] = []map[string]any{{"Value": "lead", "Label": "Lead: lift the dark theme", "Status": "working", "Progress": 62, "Open": true, "Children": []map[string]any{{"Value": "research", "Label": "Research: contrast in dark themes", "Status": "done", "Progress": 100}, {"Value": "code", "Label": "Code: change the lift", "Status": "working", "Progress": 45, "Open": true, "Children": []map[string]any{{"Value": "tests", "Label": "Tests: run the theme suite", "Status": "failed", "Progress": 100}, {"Value": "fix", "Label": "Fix: dark lifts further", "Status": "working", "Progress": 30}}}, {"Value": "notes", "Label": "Notes: write the release note", "Status": "waiting"}}}}
		case "FileChangeCard":
			props["Path"], props["Status"], props["Added"], props["Removed"], props["Summary"], props["Proposed"], props["Expanded"] = "src/theme/lift.rs", "proposed", 8, 2, "Adjust dark-theme lift behavior.", true, true
			props["Diff"] = "- let lift = 0.04;\n+ let lift = 0.18;"
			props["Changes"] = []map[string]any{{"Value": "lift", "Path": "src/theme/lift.rs", "Content": "8 additions, 2 removals", "Selected": true}, {"Value": "tests", "Path": "tests/theme_lift.rs", "Content": "3 assertions updated", "Selected": true}, {"Value": "notes", "Path": "docs/theme.md", "Content": "Release note", "Selected": false}}
		case "ArtifactPanel":
			props["Title"], props["Value"], props["Content"], props["Source"] = "Notes on lift", "v2", "# Notes on lift\n\nA lift blends a color toward white.", "# Notes on lift\n\nA lift blends a color toward white."
			props["Options"] = []map[string]any{{"Value": "v1", "Label": "1 / 3", "Content": "# Notes on lift\n\nFirst draft.", "Source": "# Notes on lift\n\nFirst draft."}, {"Value": "v2", "Label": "2 / 3", "Selected": true, "Content": "# Notes on lift\n\nA lift blends a color toward white.", "Source": "# Notes on lift\n\nA lift blends a color toward white."}, {"Value": "v3", "Label": "3 / 3", "Content": "# Notes on lift\n\nDark themes lift their accents further.", "Source": "# Notes on lift\n\nDark themes lift their accents further."}}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "ArtifactPanel"}, {"PreviewName": "ArtifactVersionSwitcher", "Title": "Notes on lift", "Options": props["Options"]}}
		case "SandboxStatus":
			props["Title"], props["Status"], props["CPU"], props["CPUText"], props["MemoryUsed"], props["MemoryLimit"], props["MemoryText"], props["Uptime"] = "python 3.12 · 2 vCPU", "ready", 0.18, "18%", 1240000000, 4294967296, "1.2 GiB of 4.0 GiB", "47m 0s"
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "SandboxStatus"}, {"PreviewName": "SandboxStatus", "Title": "node 22 · 1 vCPU", "Status": "starting", "Content": "Preparing sandbox."}}
		case "MemoryPanel":
			props["Title"], props["Label"], props["Placeholder"] = "Memory", "Remember", "Something to keep"
			props["Items"] = []map[string]any{{"Value": "memory-tone", "Content": "Prefers plain words and short sentences in notes.", "Source": "Design review", "Time": "3 days ago"}, {"Value": "memory-lift", "Content": "Dark themes lift accents by 18%; surfaces by 4%.", "Source": "Lift the dark theme", "Time": "5 hours ago"}}
			props["Checkpoints"] = []map[string]any{{"Value": "checkpoint-fixed", "Label": "Fixed the dark lift", "Time": "2m ago", "Files": 3, "Current": true}, {"Value": "checkpoint-tests", "Label": "Ran the tests", "Time": "9m ago", "Files": 2}, {"Value": "checkpoint-contrast", "Label": "Measured contrast", "Time": "32m ago", "Files": 0}}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "MemoryPanel"}, {"PreviewName": "CheckpointList", "Items": nil}, {"PreviewName": "Rewind", "Items": nil}}
		case "MCPServerList":
			servers := []map[string]any{{"Value": "files", "Label": "Filesystem", "Content": "npx @modelcontextprotocol/server-filesystem ~/ely", "Permission": "Read only", "State": "connected", "Tools": 11, "Enabled": true}, {"Value": "github", "Label": "GitHub", "Content": "https://api.githubcopilot.com/mcp", "ActionLabel": "Open setup", "State": "connected", "Tools": 38, "Enabled": true}, {"Value": "figma", "Label": "Figma", "Content": "Connecting to the desktop app…", "State": "connecting", "Tools": 0, "Enabled": true}, {"Value": "postgres", "Label": "Postgres", "Content": "Refused: password authentication failed", "State": "failed", "Tools": 0}, {"Value": "linear", "Label": "Linear", "Content": "https://mcp.linear.app/sse", "State": "off", "Tools": 24}}
			props["Title"], props["Label"], props["Servers"] = "Connected servers", "Connected servers", servers
			props["Tools"] = toolRegistryFixture()
			props["PreviewExamples"] = []map[string]any{
				{"PreviewName": "MCPServerList", "Title": "Connected servers", "Servers": servers},
				{"PreviewName": "ConnectorList", "Title": "Connectors", "Servers": servers},
				{"PreviewName": "ToolRegistry Panel", "Title": "Tool registry", "Tools": toolRegistryFixture()},
			}
		case "InterruptButton", "HumanInputRequest":
			props["Title"], props["Status"], props["Value"] = "Agent run", "working", "lift-dark-theme"
			props["Question"], props["Placeholder"] = "The dark accents read 4.1:1 on the card. Lift them to pass 4.5:1, or keep the brand color?", "Or write an answer"
			props["Choices"] = []map[string]any{{"Value": "Lift to 4.5:1", "Label": "Lift to 4.5:1"}, {"Value": "Keep the brand color", "Label": "Keep the brand color"}}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "InterruptButton"}, {"PreviewName": "HumanInputRequest", "Status": "waiting"}}
		case "TraceViewer", "TraceSpan", "EvalResultTable":
			// This story exercises selection and zoom; disabled behavior is checked separately.
			props["Disabled"] = false
			tracks := []map[string]any{{"Label": "Session", "Spans": []map[string]any{{"Value": "session", "Label": "lift the accents", "Start": 0, "End": 4200}}}, {"Label": "Turn", "Spans": []map[string]any{{"Value": "turn-1", "Label": "turn 1", "Start": 0, "End": 2600}, {"Value": "turn-2", "Label": "turn 2", "Start": 2600, "End": 4200}}}, {"Label": "Call", "Spans": []map[string]any{{"Value": "plan", "Label": "plan", "Start": 0, "End": 900}, {"Value": "read", "Label": "read_file", "Start": 950, "End": 1100}, {"Value": "edit", "Label": "edit", "Start": 1150, "End": 2600, "Selected": true}, {"Value": "tests", "Label": "run_tests", "Start": 2650, "End": 3900}, {"Value": "answer", "Label": "answer", "Start": 3950, "End": 4200}}}}
			props["Title"], props["Duration"], props["SelectedLabel"], props["Tracks"] = "Agent trace", 4600, "edit", tracks
			props["HideHeading"], props["HideControls"] = true, true
			props["Columns"] = []map[string]any{{"Value": "case", "Label": "Case"}, {"Value": "result", "Label": "Result"}, {"Value": "score", "Label": "Score"}, {"Value": "tokens", "Label": "Tokens"}, {"Value": "time", "Label": "Time"}}
			props["Rows"] = []map[string]any{{"Cells": []string{"Fix a failing test", "Pass", "96%", "18,400", "42.1 s"}}, {"Cells": []string{"Rename across files", "Pass", "91%", "9,800", "18.6 s"}}, {"Cells": []string{"Add a settings page", "Fail", "48%", "31,200", "96.4 s"}}, {"Cells": []string{"Explain a stack trace", "Pass", "88%", "4,100", "7.9 s"}}, {"Cells": []string{"Migrate a schema", "Fail", "62%", "22,700", "71.3 s"}}}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "TraceViewer"}, {"PreviewName": "EvalResultTable", "Title": "Evaluation results"}}
		case "TimeTracker":
			props["Value"], props["Task"], props["Total"] = "00:00", "", "2h 40m"
			props["Entries"] = []map[string]any{{"Value": "e1", "Label": "Client brief", "Seconds": 5700, "Display": "1h 35m"}, {"Value": "e2", "Label": "Site photos", "Seconds": 2400, "Display": "40m"}, {"Value": "e3", "Label": "Budget review", "Seconds": 1500, "Display": "25m"}}
		case "Pomodoro Timer":
			props["Value"], props["Progress"], props["Phase"] = "25:00", 0, "Focus"
		case "KanbanBoard":
			tasks := projectTasks()
			props["Title"] = "Studio tasks"
			props["Lanes"] = []map[string]any{{"Value": "todo", "Label": "Todo", "Status": "Todo", "Cards": []map[string]any{tasks[1], tasks[3], tasks[5]}}, {"Value": "doing", "Label": "In progress", "Status": "In progress", "Cards": []map[string]any{tasks[0], tasks[2]}}, {"Value": "done", "Label": "Done", "Status": "Done", "Cards": []map[string]any{tasks[4]}}}
		case "PriorityIndicator":
			props["Priorities"] = []string{"Urgent", "High", "Medium", "Low", "No priority"}
			props["Issues"] = []string{"ARC-41", "ENG-1204"}
		case "StatusSelect":
			props["Value"], props["TaskID"], props["Status"], props["Due"], props["AssigneeValue"] = "In progress", "brief", "In progress", "2026-10-12", "ana"
			props["Options"] = nil
			props["Assignees"] = projectPeople()
		case "TaskItem":
			props["Title"], props["Items"] = "Tasks", projectTasks()
		case "LabelManager":
			props["Items"] = projectLabels()
		case "DatabaseView":
			props["Title"], props["Items"], props["Today"] = "", projectTasks(), "2026-10-13"
			for _, item := range props["Items"].([]map[string]any) {
				if due, ok := item["Due"].(string); ok {
					date, _ := time.Parse("2006-01-02", due)
					item["DueLabel"] = date.Format("Jan 2")
				}
			}
		case "MilestoneProgress":
			props["Items"] = []map[string]any{{"Title": "Concept", "Start": "2026-09-03", "End": "2026-10-01", "Today": "2026-10-13", "Completed": 14, "Total": 14, "Progress": 100, "Status": "Done", "DueLabel": "Due Oct 1"}, {"Title": "Schematic design", "Start": "2026-09-29", "End": "2026-11-12", "Today": "2026-10-13", "Completed": 9, "Total": 20, "Progress": 45, "Status": "On track", "DueLabel": "30 days left"}, {"Title": "Permit set", "Start": "2026-09-13", "End": "2026-10-23", "Today": "2026-10-13", "Completed": 4, "Total": 16, "Progress": 25, "Status": "At risk", "DueLabel": "10 days left"}, {"Title": "Land survey", "Start": "2026-09-23", "End": "2026-10-11", "Today": "2026-10-13", "Completed": 7, "Total": 9, "Progress": 77.78, "Status": "Late", "DueLabel": "2 days late"}}
		case "WorkloadView":
			props["Unit"] = "pts"
			props["Items"] = []map[string]any{{"Label": "Chloé Martin", "Avatar": "CM", "Value": 12, "Capacity": 10}, {"Label": "Ana Lima", "Avatar": "AL", "Value": 7, "Capacity": 10}, {"Label": "Ben Ito", "Avatar": "BI", "Value": 9, "Capacity": 8}, {"Label": "Dev Rao", "Avatar": "DR", "Value": 4, "Capacity": 10}}
		case "EventCard":
			props["Chips"] = []map[string]any{{"Value": "review", "Label": "Design review", "Time": "11:00", "Hue": 3}, {"Value": "offsite", "Label": "Studio offsite", "Hue": 4}, {"Value": "night", "Label": "Night shoot", "Hue": 6}}
			props["Items"] = []map[string]any{{"Value": "review", "Title": "Design review", "Start": "11:00", "End": "12:00", "Location": "Model room", "Hue": 3}, {"Value": "night", "Title": "Night shoot", "Start": "Sun 21:00", "End": "Mon 02:00", "Location": "Atrium", "Hue": 6}, {"Value": "offsite", "Title": "Studio offsite", "Start": "Oct 15 – 17", "Hue": 4}}
		case "StatusSetter":
			props["Name"], props["Value"], props["Emoji"], props["ClearAfter"], props["Placeholder"], props["Disabled"] = "status", "", "", "Today", "What's your status?", false
			props["Suggestions"] = []map[string]any{{"Emoji": "📅", "Label": "In a meeting", "ClearAfter": "1 hour"}, {"Emoji": "🚌", "Label": "Commuting", "ClearAfter": "30 minutes"}, {"Emoji": "🤒", "Label": "Out sick", "ClearAfter": "Today"}, {"Emoji": "🌴", "Label": "On leave", "ClearAfter": "Don't clear"}}
			props["ClearOptions"] = []string{"Don't clear", "30 minutes", "1 hour", "4 hours", "Today", "This week"}
		case "AgentStepList":
			props["Items"] = []map[string]any{{"Value": "inspect", "Label": "Inspect reference", "Content": "Compare the gallery source", "Status": "complete"}, {"Value": "read", "Label": "Read palette", "Content": "3 files read", "Status": "done"}, {"Value": "search", "Label": "Search contrast", "Content": "Looking for sources", "Status": "working"}, {"Value": "write", "Label": "Write the lift", "Content": "Waiting for approval", "Status": "waiting"}, {"Value": "test", "Label": "Run tests", "Content": "Blocked by write", "Status": "failed"}}
		case "AvailabilityPicker":
			props["Label"] = ""
			props["Options"] = nil
			days := []map[string]any{}
			for _, day := range []int{14, 15, 16, 19, 20} {
				date := time.Date(2026, time.October, day, 0, 0, 0, 0, time.UTC)
				slots := []map[string]any{}
				for minute := 540; minute <= 960; minute += 30 {
					clock := date.Add(time.Duration(minute) * time.Minute).Format("15:04")
					slots = append(slots, map[string]any{"Value": date.Format("2006-01-02") + "T" + clock, "Label": clock})
				}
				days = append(days, map[string]any{"Date": date.Format("2006-01-02"), "Label": date.Format("Mon 2"), "Slots": slots})
			}
			props["Days"] = days
		case "MiniCalendar":
			props["Title"] = "October 2026"
			props["Items"] = calendarMonthFixture(id)
		case "SubtaskList":
			props["Title"], props["Completed"] = "Subtasks", 2
			props["Items"] = []map[string]any{{"Value": "measure", "Label": "Measure the room", "Done": true}, {"Value": "sketch", "Label": "Sketch two options", "Done": true}, {"Value": "price", "Label": "Price the fixtures"}, {"Value": "send", "Label": "Send to Chloé"}}
		case "TaskDetailPanel":
			for key, value := range projectTasks()[0] {
				props[key] = value
			}
			props["Options"] = nil
			props["Content"] = ""
			props["Assignees"] = projectPeople()
			props["Completed"] = 1
			props["Notes"] = "The client wants the brief before the site visit: scope, budget range and the three questions for the survey."
			props["Items"] = []map[string]any{{"Value": "gather", "Label": "Gather the client's notes", "Done": true}, {"Value": "draft", "Label": "Draft the scope"}, {"Value": "share", "Label": "Share for comments"}}
		case "ChannelList":
			props["Label"], props["Value"] = "Channels", "design"
			props["Sections"] = []map[string]any{
				{"Label": "Starred", "Items": []map[string]any{{"Value": "atrium", "Label": "atrium", "Pinned": true, "Unread": 4}}},
				{"Label": "Channels", "Items": []map[string]any{{"Value": "design", "Label": "design"}, {"Value": "general", "Label": "general", "Unread": 12}, {"Value": "launch", "Label": "launch", "Private": true}, {"Value": "random", "Label": "random", "Unread": 31, "Muted": true}}},
				{"Label": "Direct messages", "Items": messagingPeople()},
			}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "ChannelList"}}
		case "ChannelItem":
			props["Items"] = []map[string]any{{"Value": "design", "Label": "design", "Unread": 3}, {"Value": "launch", "Label": "launch", "Private": true}, {"Value": "random", "Label": "random", "Unread": 31, "Muted": true}, {"Value": "atrium", "Label": "atrium", "Pinned": true}}
			people := messagingPeople()
			people[0]["Unread"], people[1]["Unread"] = 1, 0
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "ChannelItem"}, {"PreviewName": "DirectMessageItem", "Items": people}}
		case "ChannelHeader":
			props["Title"], props["Value"] = "# design", "design"
			props["Content"] = "Where the atrium takes its shape: drawings, samples and the week's reviews"
			props["Actions"] = []map[string]any{{"Label": "12 members", "Action": "members", "Value": "design"}, {"Label": "3 pins", "Action": "pins", "Value": "design"}, {"Label": "Call", "Action": "start-call", "Value": "design"}}
		case "PinnedMessages":
			props["Items"] = []map[string]any{
				{"Value": "review", "Avatar": "AL", "Author": "Ana Lima", "Time": "3 hours ago", "Label": "Friday's review moves to 10:00, in the model room."},
				{"Value": "samples", "Avatar": "BI", "Author": "Ben Ito", "Time": "Yesterday", "Label": "Plaster samples are in the stair hall. Please leave notes on the backs."},
				{"Value": "brief", "Avatar": "CM", "Author": "Chloé Martin", "Time": "8 days ago", "Label": "The brief, final: light from above, one stair, olive trees by the windows."},
			}
		case "ChatMessage":
			props["DateLabel"], props["TypingLabel"] = "Today", "Dev Rao is typing…"
			props["Reaction"], props["Count"] = "👍", 3
			props["Reactions"] = []map[string]any{{"Value": "👍", "Count": 3}, {"Value": "🌿", "Count": 1, "Selected": true}}
			props["Messages"] = []map[string]any{
				{"Value": "m1", "Avatar": "AL", "Author": "Ana Lima", "Time": "09:02", "Content": "Morning. The plaster samples came in overnight."},
				{"Value": "m2", "Author": "Ana Lima", "Time": "09:03", "Content": "Three finishes: lime, tadelakt and a sanded gypsum.", "Grouped": true},
				{"Value": "m3", "Author": "Ana Lima", "Time": "09:05", "Content": "They're in the stair hall, along the left wall.", "Grouped": true},
				{"Value": "m4", "Avatar": "BI", "Author": "Ben Ito", "Time": "09:07", "Content": "I'll look before the review. Is the tadelakt sealed yet?"},
				{"Value": "m5", "Avatar": "AL", "Author": "Ana Lima", "Time": "09:21", "Content": "Not yet. It needs another day."},
				{"Value": "m6", "Avatar": "CM", "Author": "Chloé Martin", "Time": "09:34", "Content": messagingBrief, "Unread": true, "Reactions": props["Reactions"], "ThreadLabel": "3 replies · Last reply 2 hours ago"},
			}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "ChatMessage"}}
		case "MessageThread":
			props["Chat"], props["Value"], props["Label"], props["Placeholder"], props["Count"], props["LastReply"] = "# design", "", "Reply", "Reply…", 3, "2 hours ago"
			props["Root"] = map[string]any{"Value": "m6", "Avatar": "CM", "Author": "Chloé Martin", "Time": "09:34", "Content": messagingBrief}
			props["Repliers"] = []map[string]any{{"Avatar": "AL", "Label": "Ana Lima"}, {"Avatar": "BI", "Label": "Ben Ito"}}
			props["Items"] = []map[string]any{
				{"Value": "t1", "Avatar": "AL", "Author": "Ana Lima", "Time": "09:40", "Content": "By the south windows, where the stair takes its light."},
				{"Value": "t2", "Author": "Ana Lima", "Time": "09:41", "Content": "Two there, and one on the landing.", "Grouped": true},
				{"Value": "t3", "Avatar": "BI", "Author": "Ben Ito", "Time": "10:12", "Content": "Agreed. I'll move them on the plan."},
			}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "ThreadPanel"}}
		case "MailList":
			props["Items"] = []map[string]any{
				{"Value": "review", "Label": "Ana Lima", "Title": "Friday's review moves to 10:00", "Content": "We'll meet in the model room. Bring the plaster samples if they've dried.", "Time": "06:35", "Unread": true, "Selected": true},
				{"Value": "samples", "Label": "Ben Ito", "Title": "Plaster samples", "Content": "Three finishes are in the stair hall: lime, tadelakt and a sanded gypsum.", "Time": "05:12", "Unread": true, "Attachments": 3},
				{"Value": "brief", "Label": "Chloé Martin", "Title": "The brief, final", "Content": "Light from above, one stair, olive trees by the windows.", "Time": "Mon", "Starred": true},
				{"Value": "invoice", "Label": "Studio Office", "Title": "Invoice 2026-114", "Content": "Please find the invoice for the September model work attached.", "Time": "Sat", "Attachments": 1},
				{"Value": "press", "Label": "Dev Rao", "Title": "A visit from the press", "Content": "They'd like to see the atrium before the opening. Would the 14th work?", "Time": "Oct 4"},
				{"Value": "welcome", "Label": "Eli Park", "Title": "Welcome to the studio", "Content": "A few notes to start: where the models live, and who to ask.", "Time": "Sep 8, 2025", "Starred": true},
			}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "MailList", "ShowSearch": false}}
		case "MailboxList":
			props["Label"], props["Value"] = "Mailboxes", "inbox"
			props["Sections"] = []map[string]any{
				{"Label": "Mailboxes", "Items": []map[string]any{{"Value": "inbox", "Label": "Inbox", "Icon": "▱", "Unread": 12}, {"Value": "starred", "Label": "Starred", "Icon": "☆"}, {"Value": "snoozed", "Label": "Snoozed", "Icon": "◷"}, {"Value": "sent", "Label": "Sent", "Icon": "➤"}, {"Value": "drafts", "Label": "Drafts", "Icon": "▤", "Unread": 2}, {"Value": "archive", "Label": "Archive", "Icon": "▣"}, {"Value": "spam", "Label": "Spam", "Icon": "⊗", "Unread": 4}, {"Value": "trash", "Label": "Trash", "Icon": "♜"}}},
				{"Label": "Folders", "Items": []map[string]any{{"Value": "atrium", "Label": "Atrium", "Icon": "▱", "Unread": 3}, {"Value": "invoices", "Label": "Invoices", "Icon": "▱"}}},
				{"Label": "Labels", "Items": []map[string]any{{"Value": "clients", "Label": "Clients", "Hue": 0}, {"Value": "studio", "Label": "Studio", "Hue": 5}, {"Value": "press", "Label": "Press", "Hue": 3}}},
			}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "MailboxList"}}
		case "InboxZeroState":
			props["Title"], props["Content"], props["ActionLabel"], props["Action"], props["Value"] = "All caught up", "Nothing waits in your inbox. New mail lands here, newest first.", "Open the archive", "open-mailbox", "archive"
		case "MailReader":
			props["Subject"], props["Label"], props["From"], props["Email"], props["Avatar"], props["To"], props["Cc"], props["Time"], props["Value"] = "Friday's review moves to 10:00", "Ana Lima", "Ana Lima", "ana@atrium.studio", "AL", "You, Ben Ito", "Dev Rao", "Oct 13, 2026 · 06:35", "review"
			props["Actions"] = mailMessageActions(true)
			props["Paragraphs"] = []string{"Morning both,", "Friday's review moves to 10:00, in the model room. The client wants to see the stair at the scale we'll build it, so please bring the plaster samples if they've dried.", "The plan and a photo of the stair hall are attached. — Ana"}
			props["QuoteParagraphs"] = []string{"On Thursday, Ben Ito wrote:", "The samples are in the stair hall: lime, tadelakt and a sanded gypsum. The tadelakt needs another day."}
			props["Files"] = []map[string]any{{"Value": "plan", "Name": "atrium-plan.pdf", "Size": "2.4 MB"}, {"Value": "photo", "Name": "stair-hall.jpg", "Size": "3.1 MB"}}
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "MailReader"}}
		case "MailThreadView":
			props["Subject"] = "Plaster samples"
			props["Items"] = []map[string]any{
				{"Value": "s1", "Label": "Ben Ito", "Email": "ben@atrium.studio", "Avatar": "BI", "To": "You", "RelativeTime": "1 day ago", "Time": "Oct 12, 2026 · 00:47", "Snippet": "Three finishes are in the stair hall: lime, tadelakt and a sanded gypsum.", "Content": "Three finishes are in the stair hall: lime, tadelakt and a sanded gypsum. Leave notes on the backs.", "Actions": mailMessageActions(false)},
				{"Value": "s2", "Label": "Ana Lima", "Email": "ana@atrium.studio", "Avatar": "AL", "To": "You", "RelativeTime": "1 day ago", "Time": "Oct 12, 2026 · 04:47", "Content": "The lime reads warmest by the windows. Can we see it at dusk?", "Actions": mailMessageActions(false)},
				{"Value": "s3", "Label": "Chloé Martin", "Email": "chloe@atrium.studio", "Avatar": "CM", "To": "You", "RelativeTime": "5 hours ago", "Time": "Oct 13, 2026 · 01:47", "Content": "Dusk works. I'll bring the lamp we use for the model.", "Actions": mailMessageActions(false)},
				{"Value": "s4", "Label": "Ben Ito", "Email": "ben@atrium.studio", "Avatar": "BI", "To": "You", "RelativeTime": "40 minutes ago", "Time": "Oct 13, 2026 · 06:07", "Content": "The tadelakt is sealed. All three are ready for Friday.", "Actions": mailMessageActions(false)},
			}
		case "MailComposer":
			props["To"], props["Cc"], props["Bcc"], props["Subject"], props["Value"], props["Placeholder"], props["Required"], props["Disabled"] = "", "", "", "", "", "Write your message", false, false
			props["Contacts"] = []map[string]any{{"Label": "Ana Lima", "Email": "ana@atrium.studio"}, {"Label": "Ben Ito", "Email": "ben@atrium.studio"}, {"Label": "Chloé Martin", "Email": "chloe@atrium.studio"}, {"Label": "Dev Rao", "Email": "dev@atrium.studio"}}
			props["Files"] = []map[string]any{{"Value": "plan", "Name": "atrium-plan.pdf", "Size": "2.4 MB"}}
			props["Signature"] = "Chloé Martin\nLead designer · Atrium Studio"
			props["PreviewExamples"] = []map[string]any{{"PreviewName": "MailComposer"}}
		case "SignatureEditor":
			props["Name"], props["Value"], props["Label"] = "signature", "Chloé Martin\nLead designer · Atrium Studio", ""
		case "LabelPicker":
			props["Items"] = []map[string]any{{"Value": "clients", "Label": "Clients", "Hue": 0, "Selected": true}, {"Value": "studio", "Label": "Studio", "Hue": 5}, {"Value": "press", "Label": "Press", "Hue": 3, "Selected": true}, {"Value": "finance", "Label": "Finance", "Hue": 1}, {"Value": "site", "Label": "Site visits", "Hue": 2}, {"Value": "travel", "Label": "Travel", "Hue": 7}}
		case "SnoozePicker", "ScheduleSend":
			props["Until"], props["SendAt"], props["Value"], props["Disabled"] = "", "", "review", false
		case "CalendarMonthView":
			props["Title"] = "October 2026"
			props["Items"] = calendarMonthFixture(id)
		case "CalendarWeekView":
			props["Title"] = "Oct 12–18, 2026"
			props["Timezone"] = "KST"
			props["AllDayEvents"] = []map[string]any{{"Value": "offsite", "Label": "Studio offsite", "Column": 4, "Span": 3, "Hue": 4}}
			props["Days"] = calendarWeekDays()
			props["TimeGrid"] = calendarWeekTimeGrid()
		case "CalendarDayView":
			props["Title"] = "Tuesday, October 13, 2026"
			props["DayLabel"] = "Tue 13"
			props["DayName"], props["DayNumber"] = "Tue", 13
			props["Timezone"] = "KST"
			props["OverlayTimezone"] = "JST"
			props["TimeGrid"] = calendarDayTimeGrid()
		case "AgendaView":
			items := []map[string]any{}
			for i, event := range calendarSourceEvents()[:5] {
				item := map[string]any{"Value": event["Value"], "Label": event["Label"], "Hue": event["Hue"], "Start": event["Time"], "End": event["End"].(string)[11:]}
				if i == 0 {
					item["Heading"] = "Today · Tuesday, October 13"
				}
				if i == 1 {
					item["Content"] = "Model room"
				}
				items = append(items, item)
			}
			for _, day := range []int{15, 16, 17} {
				items = append(items, map[string]any{"Heading": time.Date(2026, time.October, day, 0, 0, 0, 0, time.UTC).Format("Monday, January 2"), "Value": "offsite", "Label": "Studio offsite", "Start": "Oct 15 – 17", "Hue": 4})
			}
			for _, day := range []int{18, 19} {
				items = append(items, map[string]any{"Heading": time.Date(2026, time.October, day, 0, 0, 0, 0, time.UTC).Format("Monday, January 2"), "Value": "night", "Label": "Night shoot", "Start": "Sun 21:00 – Mon 02:00", "Content": "Atrium", "Hue": 6})
			}
			props["Items"] = items
		case "EventPopover":
			props["Title"], props["Value"], props["Start"], props["End"], props["Location"], props["Content"] = "Design review", "review", "11:00", "12:00", "Model room", ""
			props["Items"] = nil
			props["ShowEdit"], props["ShowDelete"] = true, true
			props["Hue"] = 3
			props["AttendeeSummary"] = "5 guests · 2 going · 1 maybe · 1 declined · 1 waiting"
			props["Attendees"] = []map[string]any{{"Name": "Chloé Martin", "Email": "chloe@atrium.studio", "Avatar": "CM", "Organizer": true, "Answer": "Going"}, {"Name": "Ana Lima", "Email": "ana@atrium.studio", "Avatar": "AL", "Answer": "Going"}, {"Name": "Ben Ito", "Email": "ben@atrium.studio", "Avatar": "BI", "Answer": "Maybe"}, {"Name": "Dev Rao", "Email": "dev@atrium.studio", "Avatar": "DR", "Answer": "Waiting"}, {"Name": "Eli Park", "Email": "eli@atrium.studio", "Avatar": "EP", "Answer": "Declined"}}
		case "YearView":
			props["Title"] = "2026"
			props["Months"] = calendarYearFixture()
		case "EventEditor":
			props["Title"], props["Start"], props["End"], props["Location"] = "Design review", "2026-10-13T11:00", "2026-10-13T12:00", "Model room"
			props["Frequency"], props["Hue"], props["Reminders"] = "Weekly", 3, []int{10, 1440}
			weekdays := []map[string]any{}
			for i, label := range []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"} {
				weekdays = append(weekdays, map[string]any{"Value": i, "Label": label, "Selected": i == 0 || i == 3})
			}
			props["Weekdays"] = weekdays
			props["Notes"] = ""
			props["ShowCancel"] = true
			props["ShowDelete"] = true
		}
		if definition.Chapter == "project" && definition.Name != "GanttChart" && definition.Name != "Burndown Chart" {
			props["Disabled"] = false
		}
		if definition.Chapter == "calendar" {
			props["Today"], props["Date"], props["Disabled"] = "2026-10-13", "2026-10-13", false
		}
		cases = append(cases, AdvancedCase{Family: "communication", Component: ui.Component{Chapter: definition.Chapter, Name: definition.Name, ID: id, Props: props}})
	}
	return cases
}

func mailMessageActions(all bool) []map[string]any {
	actions := []map[string]any{{"Action": "reply", "Label": "Reply", "Icon": "↶"}}
	if all {
		actions = append(actions, map[string]any{"Action": "reply-all", "Label": "Reply all", "Icon": "↞"})
	}
	return append(actions, map[string]any{"Action": "forward", "Label": "Forward", "Icon": "↪"})
}

func messagingStickers(keys, labels []string) []map[string]any {
	items := make([]map[string]any, len(keys))
	for i, key := range keys {
		items[i] = map[string]any{"Value": key, "Label": labels[i], "URL": "/assets/communication/" + key + ".png"}
	}
	return items
}

func messagingCallTiles() []map[string]any {
	return []map[string]any{
		{"Value": "ana", "Label": "Ana Lima", "URL": "/assets/communication/atrium-stair.jpg", "Speaking": true},
		{"Value": "ben", "Label": "Ben Ito", "Avatar": "BI", "Muted": true},
		{"Value": "you", "Label": "You", "URL": "/assets/communication/atrium-olive.jpg"},
		{"Value": "chloe", "Label": "Chloé Martin", "Avatar": "CM"},
		{"Value": "dev", "Label": "Dev Rao", "Avatar": "DR", "Muted": true},
	}
}

func messagingMemberProfiles() []map[string]any {
	people := []map[string]any{
		{"Value": "ana", "Label": "Ana Lima", "Avatar": "AL", "Presence": "away", "PresenceLabel": "Away", "StatusText": "🌴 Back on Monday", "JobTitle": "Architect", "Zone": "Europe/Lisbon"},
		{"Value": "ben", "Label": "Ben Ito", "Avatar": "BI", "Presence": "online", "PresenceLabel": "Online", "Role": "Admin", "JobTitle": "Structural engineer", "Zone": "Asia/Tokyo"},
		{"Value": "chloe", "Label": "Chloé Martin", "Avatar": "CM", "Presence": "busy", "PresenceLabel": "Busy", "StatusText": "🎧 Drawing the stair", "JobTitle": "Lead designer", "Zone": "Europe/Paris"},
		{"Value": "dev", "Label": "Dev Rao", "Avatar": "DR", "Presence": "offline", "PresenceLabel": "Offline", "JobTitle": "Model maker", "Zone": "Asia/Kolkata"},
		{"Value": "eli", "Label": "Eli Park", "Avatar": "EP", "Presence": "online", "PresenceLabel": "Online", "Role": "Owner", "JobTitle": "Principal", "Zone": "America/New_York"},
		{"Value": "farah", "Label": "Farah Haddad", "Avatar": "FH", "Presence": "offline", "PresenceLabel": "Offline", "JobTitle": "Landscape architect", "Zone": "Asia/Dubai"},
	}
	for _, person := range people {
		person["Actions"] = []map[string]any{{"Label": "Message", "Action": "message-member"}, {"Label": "Call", "Action": "call-member"}}
	}
	return people
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	var digits [20]byte
	i := len(digits)
	for value > 0 {
		i--
		digits[i] = byte('0' + value%10)
		value /= 10
	}
	return string(digits[i:])
}

func calendarSourceEvents() []map[string]any {
	return []map[string]any{
		{"Value": "standup", "Label": "Studio stand-up", "Date": "2026-10-13", "Time": "09:30", "Start": "2026-10-13T09:30", "End": "2026-10-13T09:45", "Minutes": 15, "Hue": 0},
		{"Value": "review", "Label": "Design review", "Date": "2026-10-13", "Time": "11:00", "Start": "2026-10-13T11:00", "End": "2026-10-13T12:00", "Minutes": 60, "Hue": 3, "Caption": "11:00 – 12:00 · Model room"},
		{"Value": "lunch", "Label": "Lunch with Ana", "Date": "2026-10-13", "Time": "12:30", "Start": "2026-10-13T12:30", "End": "2026-10-13T13:30", "Minutes": 60, "Hue": 5, "Caption": "12:30 – 13:30"},
		{"Value": "samples", "Label": "Plaster samples", "Date": "2026-10-13", "Time": "15:00", "Start": "2026-10-13T15:00", "End": "2026-10-13T16:00", "Minutes": 60, "Hue": 2, "Caption": "15:00 – 16:00"},
		{"Value": "client", "Label": "Client call", "Date": "2026-10-13", "Time": "17:00", "Start": "2026-10-13T17:00", "End": "2026-10-13T17:30", "Minutes": 30, "Hue": 1},
		{"Value": "print", "Label": "Print run", "Date": "2026-10-04", "Time": "10:00", "Hue": 2},
		{"Value": "crit", "Label": "Crit", "Date": "2026-10-10", "Time": "14:00", "Hue": 3},
		{"Value": "offsite", "Label": "Studio offsite", "Date": "2026-10-15", "Span": 3, "Hue": 4},
		{"Value": "night", "Label": "Night shoot", "Date": "2026-10-18", "Span": 1, "Hue": 6},
		{"Value": "night", "Label": "Night shoot", "Date": "2026-10-19", "Span": 1, "Hue": 6},
		{"Value": "trip", "Label": "Site visit · Lisbon", "Date": "2026-10-22", "Span": 4, "Hue": 7},
		{"Value": "trip", "Label": "Site visit · Lisbon", "Date": "2026-10-26", "Span": 1, "Hue": 7},
		{"Value": "models", "Label": "Model photos", "Date": "2026-10-24", "Time": "10:00", "Hue": 0},
		{"Value": "launch", "Label": "Launch", "Date": "2026-10-31", "Span": 1, "Hue": 1},
	}
}
func calendarMonthFixture(prefix string) []map[string]any {
	days := []map[string]any{}
	for i := 0; i < 35; i++ {
		date := time.Date(2026, time.September, 28+i, 0, 0, 0, 0, time.UTC)
		key := date.Format("2006-01-02")
		item := map[string]any{"Value": prefix + key, "Date": key, "Day": date.Day(), "Outside": date.Month() != time.October, "Today": key == "2026-10-13"}
		events := []map[string]any{}
		for _, event := range calendarSourceEvents() {
			if event["Date"] == key {
				events = append(events, event)
			}
		}
		item["Events"] = events
		days = append(days, item)
	}
	return days
}

func browserFrames() []map[string]any {
	return []map[string]any{
		{"Value": "brief", "Label": "Brief", "Src": "/assets/sample.svg", "Alt": "Northwind project brief", "Caption": "Project brief", "Active": true},
		{"Value": "permission", "Label": "Permission", "Src": "/assets/sample-before.svg", "Alt": "Tool permission request", "Caption": "Review tool permission"},
	}
}

func toolRegistryFixture() []map[string]any {
	return []map[string]any{
		{"Value": "files.read", "Label": "files.read", "Content": "Read project files", "Access": "allow"},
		{"Value": "github.create_issue", "Label": "github.create_issue", "Content": "Create a project issue", "Access": "ask"},
		{"Value": "shell.exec", "Label": "shell.exec", "Content": "Run a local command", "Access": "deny"},
	}
}

func calendarWeekDays() []map[string]any {
	days := []map[string]any{}
	for i := 12; i <= 18; i++ {
		date := time.Date(2026, time.October, i, 0, 0, 0, 0, time.UTC)
		days = append(days, map[string]any{"Date": date.Format("2006-01-02"), "Label": date.Format("Mon 2"), "Weekday": date.Format("Mon"), "Day": date.Day(), "Today": i == 13})
	}
	return days
}
func calendarWeekTimeGrid() []map[string]any {
	rows := []map[string]any{}
	for minute := 0; minute < 24*60; minute += 30 {
		clock := time.Date(2026, time.October, 13, minute/60, minute%60, 0, 0, time.UTC).Format("15:04")
		cells := []map[string]any{}
		for _, day := range calendarWeekDays() {
			cell := map[string]any{"Date": day["Date"]}
			for _, event := range calendarSourceEvents() {
				if event["Date"] == day["Date"] && event["Time"] == clock {
					cell["Events"] = []map[string]any{event}
				}
			}
			if day["Date"] == "2026-10-18" && clock == "21:00" {
				cell["Events"] = []map[string]any{{"Value": "night", "Label": "Night shoot", "Start": "2026-10-18T21:00", "End": "2026-10-19T02:00", "Minutes": 180, "Hue": 6, "Caption": "21:00 – 02:00 · Atrium"}}
			}
			cells = append(cells, cell)
		}
		rows = append(rows, map[string]any{"Time": clock, "Cells": cells})
	}
	return rows
}

func calendarDayTimeGrid() []map[string]any {
	rows := calendarWeekTimeGrid()
	for _, row := range rows {
		row["Cells"] = []map[string]any{row["Cells"].([]map[string]any)[1]}
		row["OverlayTime"] = row["Time"]
	}
	return rows
}

func calendarYearFixture() []map[string]any {
	months := []map[string]any{}
	for month := time.January; month <= time.December; month++ {
		first := time.Date(2026, month, 1, 0, 0, 0, 0, time.UTC)
		days := time.Date(2026, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
		weeks := make([]map[string]any, 0, 6)
		day := 1
		for week := 0; week < 6 && day <= days; week++ {
			cells := make([]map[string]any, 0, 7)
			for weekday := 0; weekday < 7; weekday++ {
				cell := map[string]any{}
				if (week > 0 || weekday >= (int(first.Weekday())+6)%7) && day <= days {
					date := time.Date(2026, month, day, 0, 0, 0, 0, time.UTC)
					cell["Day"] = itoa(day)
					cell["Date"] = date.Format("2006-01-02")
					for _, event := range calendarSourceEvents() {
						start, _ := time.Parse("2006-01-02", event["Date"].(string))
						span, _ := event["Span"].(int)
						if span < 1 {
							span = 1
						}
						if !date.Before(start) && date.Before(start.AddDate(0, 0, span)) {
							cell["Marked"], cell["Hue"] = true, event["Hue"]
							break
						}
					}
					day++
				}
				cells = append(cells, cell)
			}
			weeks = append(weeks, map[string]any{"Days": cells})
		}
		months = append(months, map[string]any{"Label": first.Month().String(), "Weeks": weeks})
	}
	return months
}

const messagingBrief = "Pinned the brief: light from above, one stair, olive trees by the windows. Thoughts on where the trees go?"

func messagingPeople() []map[string]any {
	return []map[string]any{
		{"Value": "ana", "Label": "Ana Lima", "Avatar": "AL", "Presence": "online"},
		{"Value": "ben", "Label": "Ben Ito", "Avatar": "BI", "Presence": "away", "Unread": 2},
		{"Value": "chloe", "Label": "Chloé Martin", "Avatar": "CM", "Presence": "busy"},
		{"Value": "dev", "Label": "Dev Rao", "Avatar": "DR", "Presence": "offline"},
	}
}

func projectPeople() []map[string]any {
	return []map[string]any{{"Value": "chloe", "Label": "Chloé Martin"}, {"Value": "ana", "Label": "Ana Lima"}, {"Value": "ben", "Label": "Ben Ito"}, {"Value": "dev", "Label": "Dev Rao"}}
}
func projectLabels() []map[string]any {
	return []map[string]any{{"Value": "client", "Label": "Client", "Hue": 0}, {"Value": "site", "Label": "Site", "Hue": 5}, {"Value": "render", "Label": "Render", "Hue": 4}, {"Value": "budget", "Label": "Budget", "Hue": 2}}
}
func projectTasks() []map[string]any {
	labels := projectLabels()
	return []map[string]any{
		{"Value": "brief", "Title": "Write the client brief", "Issue": "ARC-41", "Status": "In progress", "Priority": "Urgent", "Start": "2026-10-04", "Due": "2026-10-12", "DueLabel": "Yesterday", "Overdue": true, "Assignee": "Ana Lima", "AssigneeValue": "ana", "Avatar": "AL", "Labels": []map[string]any{labels[0]}},
		{"Value": "samples", "Title": "Order plaster samples", "Issue": "ARC-44", "Status": "Todo", "Priority": "High", "Start": "2026-10-10", "Due": "2026-10-13", "DueLabel": "Today", "Assignee": "Ben Ito", "Avatar": "BI", "Labels": []map[string]any{labels[3]}},
		{"Value": "model", "Title": "Photograph the site model", "Issue": "ARC-38", "Status": "In review", "Priority": "Medium", "Start": "2026-10-08", "Due": "2026-10-16", "DueLabel": "Fri", "Assignee": "Chloé Martin", "Avatar": "CM", "Labels": []map[string]any{labels[1], labels[2]}},
		{"Value": "budget", "Title": "Revise the lighting budget", "Issue": "ARC-47", "Status": "Todo", "Priority": "Low", "Due": "2026-10-25", "DueLabel": "Oct 25"},
		{"Value": "survey", "Title": "Book the land survey", "Issue": "ARC-29", "Status": "Done", "Done": true, "Priority": "Medium", "Start": "2026-09-27", "Due": "2026-10-09", "DueLabel": "Oct 9", "Assignee": "Dev Rao", "Avatar": "DR", "Labels": []map[string]any{labels[1]}},
		{"Value": "archive", "Title": "Archive last year's renders", "Issue": "ARC-17", "Status": "Backlog", "Priority": "No priority"},
	}
}
