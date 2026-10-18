package uiexamples

import (
	"encoding/json"
	"fmt"
	"github.com/mrchypark/elysdui/ui/gohtmx"
)

// Unicode 17 catalogue from the upstream gallery's emojis 0.9.0 dependency.
var galleryEmojiOptions = func() []map[string]any {
	data, err := Files.ReadFile("assets/emoji-catalogue.json")
	if err != nil {
		panic(err)
	}
	var options []map[string]any
	if err := json.Unmarshal(data, &options); err != nil {
		panic(err)
	}
	return options
}()

var galleryRegionalOptions = func() map[string][]map[string]any {
	data, err := Files.ReadFile("assets/regional-catalogues.json")
	if err != nil {
		panic(err)
	}
	var options map[string][]map[string]any
	if err := json.Unmarshal(data, &options); err != nil {
		panic(err)
	}
	return options
}()

func advancedFormsCases() []AdvancedCase {
	chapters, _ := ui.Catalogue()
	var cases []AdvancedCase
	for _, chapter := range chapters {
		if chapter.Slug != "forms" && chapter.Slug != "account" && chapter.Slug != "settings" && chapter.Slug != "onboarding" && chapter.Slug != "maps" {
			continue
		}
		for _, story := range chapter.Stories {
			options := []map[string]any{{"Value": "alpha", "Label": "Caller Alpha"}, {"Value": "beta", "Label": "Caller Beta"}}
			fields := []map[string]any{{"Name": "subject", "Label": "Caller subject", "Value": "Caller source", "Required": true, "Keywords": []string{"topic", "summary"}}, {"Name": "notes", "Label": "Caller notes", "Type": "textarea", "Value": "Caller notes", "Keywords": []string{"details", "summary"}}}
			props := map[string]any{
				"Title": "Caller " + story.Name, "Label": "Caller field", "Name": "caller_value", "Value": "alpha", "Text": "Caller source text", "Placeholder": "Caller placeholder", "Options": options,
				"Fields": fields, "ActionLabel": "Save caller data", "Email": "caller@example.test", "DisplayName": "Caller researcher", "PasswordLabel": "Example password", "Max": 5,
				"Items": []map[string]any{{"Value": "alpha", "Label": "Caller Alpha", "Text": "Caller first", "Key": "first", "Done": false, "Date": "2026-10-20", "Amount": "120", "Status": "Paid", "Email": "caller@example.test", "Role": "alpha", "Shortcut": "Ctrl+K", "Fields": fields}, {"Value": "beta", "Label": "Caller Beta", "Text": "Caller second", "Key": "second", "Done": true, "Fields": []map[string]any{{"Name": "method", "Label": "Caller method", "Value": "survey", "Required": true}}}},
			}
			switch story.Name {
			case "Input":
				props["PreviewExamples"] = []map[string]any{{"Examples": []map[string]any{{"Label": "Full name", "Value": "", "Placeholder": "Full name", "Width": "360"}, {"Label": "Small", "Value": "", "Size": "sm", "Placeholder": "Small", "Width": "200", "Dense": true}, {"Label": "Large", "Value": "", "Size": "lg", "Placeholder": "Large", "Width": "240", "Dense": true}, {"Label": "Disabled", "Value": "", "Placeholder": "Disabled", "Width": "200", "Disabled": true, "Dense": true}}}}
			case "TextArea":
				props["Label"], props["Value"], props["Placeholder"], props["Rows"], props["MaxWidth"] = "Notes", "", "Notes grow from three lines to six, then scroll.", 3, "420"
			case "PasswordInput":
				props["PreviewExamples"] = []map[string]any{{"Label": "Password", "Value": "", "Placeholder": "Password", "Width": "320", "Dense": true}}
			case "SearchInput":
				props["Hint"], props["Width"] = "Last recent search: nothing yet", "320"
				props["PreviewExamples"] = []map[string]any{{"Label": "Search docs", "Value": "", "Placeholder": "Search docs", "Hint": "Last recent search: nothing yet", "Width": "320", "Dense": true}}
			case "PinInput", "TwoFactorInput":
				props["PreviewExamples"] = []map[string]any{{"Label": "Six digits", "Value": "", "Items": []int{1, 2, 3, 4, 5, 6}}}
				props["Items"], props["Value"] = []int{1, 2, 3, 4, 5, 6}, "123456"
				if story.Name == "TwoFactorInput" {
					props["Label"], props["Text"], props["RecoveryAction"] = "Two-step sign-in", "Enter the six-digit code from your authenticator app.", "use-recovery-code"
				}
			case "Select":
				props["PreviewExamples"] = []map[string]any{{"Label": "View", "Value": "list", "Width": "240", "Options": []map[string]any{{"Value": "list", "Label": "List"}, {"Value": "board", "Label": "Board"}, {"Value": "calendar", "Label": "Calendar"}, {"Value": "gallery", "Label": "Gallery", "Disabled": true}}}, {"Label": "Disabled", "Value": "utc", "Width": "200", "Disabled": true, "Options": []map[string]any{{"Value": "utc", "Label": "UTC"}}}}
			case "MultiSelect":
				props["Options"] = append(options, map[string]any{"Value": "locked", "Label": "Disabled caller choice", "Disabled": true})
				cities := []map[string]any{{"Value": "ams", "Label": "Amsterdam"}, {"Value": "ber", "Label": "Berlin", "Selected": true}, {"Value": "cph", "Label": "Copenhagen"}, {"Value": "lis", "Label": "Lisbon"}, {"Value": "lon", "Label": "London"}, {"Value": "osl", "Label": "Oslo", "Selected": true}, {"Value": "par", "Label": "Paris"}, {"Value": "vie", "Label": "Vienna"}}
				props["PreviewExamples"] = []map[string]any{{"Label": "Cities", "Value": "ber,osl", "Placeholder": "Pick cities", "Width": "360", "Options": cities}}
			case "InputGroup":
				props["PreviewExamples"] = []map[string]any{{"Label": "Text addons", "Value": "", "Placeholder": "ely.dev", "Prefix": "https://", "Suffix": ".com"}, {"Label": "Copy control", "Value": "", "Placeholder": "0", "Suffix": "Copy", "SuffixAction": "copy"}}
			case "Checkbox":
				props["PreviewExamples"] = []map[string]any{{"ParentLabel": "All notifications", "ParentState": "mixed", "Options": []map[string]any{{"Value": "email", "Label": "Email", "Selected": true}, {"Value": "push", "Label": "Push"}}}}
			case "Radio":
				props["PreviewStack"] = true
				props["PreviewExamples"] = []map[string]any{{"Label": "Plan", "Caption": "plan", "Name": "plan", "Value": "pro", "Options": []map[string]any{{"Value": "free", "Label": "Free"}, {"Value": "pro", "Label": "Pro"}, {"Value": "team", "Label": "Team"}, {"Value": "enterprise", "Label": "Enterprise", "Disabled": true}}}, {"Label": "Density", "Caption": "density, in a row", "Name": "density", "Direction": "row", "Value": "standard", "Options": []map[string]any{{"Value": "compact", "Label": "Compact"}, {"Value": "standard", "Label": "Standard"}, {"Value": "comfortable", "Label": "Comfortable"}}}}
			case "CheckboxCard":
				props["PreviewStack"] = true
				props["PreviewExamples"] = []map[string]any{{"PreviewName": "RadioCard", "Name": "space", "Value": "personal", "Options": []map[string]any{{"Value": "personal", "Label": "Personal", "Text": "Just you. Notes stay on this Mac.", "Icon": "♙", "Selected": true}, {"Value": "team", "Label": "Team", "Text": "Shared with everyone you invite.", "Icon": "♙♙"}}}, {"Name": "backup", "Options": []map[string]any{{"Value": "backup", "Label": "Back up nightly", "Text": "Copies change sets to the cloud at 2 AM.", "Icon": "☁", "Selected": true}}}}
			case "Switch":
				props["PreviewExamples"] = []map[string]any{{"Items": []map[string]any{{"Label": "Wi-Fi", "Value": "wifi", "Done": true}, {"Label": "Bluetooth", "Value": "bluetooth"}, {"Label": "Flight mode", "Value": "flight", "Done": true, "Disabled": true}}}}
			case "ListBox":
				props["PreviewExamples"] = []map[string]any{{"Label": "Cities", "Value": "lis", "Size": "8", "Width": "240", "Options": []map[string]any{{"Value": "ams", "Label": "Amsterdam"}, {"Value": "ber", "Label": "Berlin"}, {"Value": "cph", "Label": "Copenhagen"}, {"Value": "lis", "Label": "Lisbon", "Selected": true}, {"Value": "lon", "Label": "London"}, {"Value": "osl", "Label": "Oslo"}, {"Value": "par", "Label": "Paris"}, {"Value": "vie", "Label": "Vienna"}}}}
			case "Combobox":
				props["Options"] = append(options, map[string]any{"Value": "locked", "Label": "Disabled caller choice", "Disabled": true})
				props["PreviewExamples"] = []map[string]any{{"Label": "City", "Placeholder": "Search cities", "Width": "260", "Options": []map[string]any{{"Value": "ams", "Label": "Amsterdam"}, {"Value": "ber", "Label": "Berlin"}, {"Value": "cph", "Label": "Copenhagen"}, {"Value": "lis", "Label": "Lisbon"}, {"Value": "lon", "Label": "London"}, {"Value": "osl", "Label": "Oslo"}, {"Value": "par", "Label": "Paris"}, {"Value": "vie", "Label": "Vienna"}}}, {"Label": "Label", "Placeholder": "Any label", "Width": "260", "Free": true, "Options": []map[string]any{{"Value": "design", "Label": "design"}, {"Value": "docs", "Label": "docs"}, {"Value": "infra", "Label": "infra"}, {"Value": "motion", "Label": "motion"}, {"Value": "release", "Label": "release"}}}}
			case "CascadeSelect":
				props["Options"] = []map[string]any{{"Label": "Caller parent", "Value": "parent", "Children": options}}
				world := []map[string]any{{"Label": "Americas", "Value": "am", "Children": []map[string]any{{"Label": "United States", "Value": "us", "Children": []map[string]any{{"Label": "New York", "Value": "nyc"}, {"Label": "San Francisco", "Value": "sfo"}}}, {"Label": "Brazil", "Value": "br", "Children": []map[string]any{{"Label": "São Paulo", "Value": "sao"}}}}}, {"Label": "Europe", "Value": "eu", "Children": []map[string]any{{"Label": "Portugal", "Value": "pt", "Children": []map[string]any{{"Label": "Lisbon", "Value": "lis"}, {"Label": "Porto", "Value": "opo"}}}, {"Label": "Germany", "Value": "de", "Children": []map[string]any{{"Label": "Berlin", "Value": "ber"}}}}}, {"Label": "Asia", "Value": "as", "Children": []map[string]any{{"Label": "Japan", "Value": "jp", "Children": []map[string]any{{"Label": "Tokyo", "Value": "tyo"}}}}}}
				props["PreviewExamples"] = []map[string]any{{"Label": "Office", "Value": "lis", "PathLabel": "Europe / Portugal / Lisbon", "SelectedPath": "eu,pt,lis", "Width": "320", "Options": world}}
			case "TransferList":
				props["PreviewExamples"] = []map[string]any{{"Label": "Cities", "SelectedLabel": "On the tour", "Name": "cities", "Size": 8, "Width": "560", "Options": []map[string]any{{"Value": "ams", "Label": "Amsterdam"}, {"Value": "ber", "Label": "Berlin"}, {"Value": "cph", "Label": "Copenhagen"}, {"Value": "lis", "Label": "Lisbon"}, {"Value": "lon", "Label": "London"}, {"Value": "osl", "Label": "Oslo"}, {"Value": "par", "Label": "Paris", "Selected": true}, {"Value": "vie", "Label": "Vienna"}}}}
			case "MentionInput":
				props["PreviewExamples"] = []map[string]any{{"Label": "", "Value": "", "Rows": 2, "Placeholder": "Write a note. @ for people, # for tags.", "Options": []map[string]any{{"Value": "ada", "Label": "Ada"}, {"Value": "alan", "Label": "Alan"}, {"Value": "release", "Label": "release"}, {"Value": "research", "Label": "research"}}}}
			case "TagInput":
				props["PreviewExamples"] = []map[string]any{{"Label": "", "Value": "rust,gpui", "Placeholder": "Add a tag", "ActionLabel": "Add a tag", "Compact": true}}
			case "KeyValueInput":
				items := []map[string]any{{"Key": "MAX_LOG", "Value": "1000"}, {"Key": "PORT", "Value": "8080"}, {"Key": "READ_ONLY", "Value": "true", "Disabled": true}}
				props["Items"], props["DisabledKeys"] = items, "READ_ONLY"
				props["PreviewExamples"] = []map[string]any{{"Label": "Environment", "Items": items, "ActionLabel": "Add", "DisabledKeys": "READ_ONLY"}}
			case "NumberInput", "ScrubInput", "CurrencyInput":
				props["Value"], props["Min"], props["Max"], props["Step"] = "3", "0", 10, "1"
				if story.Name == "NumberInput" {
					props["Label"], props["Value"], props["Min"], props["Max"], props["Dense"], props["Width"] = "Seats", "4", "1", 99, true, "220"
				}
				if story.Name == "ScrubInput" {
					props["Label"], props["Value"], props["Min"], props["Max"], props["Width"] = "X", "120", "-2000", 2000, "260"
					props["PreviewStack"] = true
					props["PreviewExamples"] = []map[string]any{{"Label": "X", "Value": "120", "Min": "-2000", "Max": 2000, "Width": "260"}, {"Label": "Opacity", "Value": "0.80", "Min": "0", "Max": 1, "Step": "0.01", "Width": "260"}}
				}
				if story.Name == "CurrencyInput" {
					props["PreviewExamples"] = []map[string]any{{"Label": "Currency", "Caption": "currency", "Name": "price", "Value": "1249.50", "Prefix": "$", "Min": "0", "Max": 1000000, "Step": "0.01", "Width": "200"}, {"PreviewName": "PercentInput", "Label": "Percent", "Caption": "percent", "Name": "tax", "Value": "8", "Prefix": "", "Suffix": "%", "Min": "0", "Max": 100, "Width": "160"}, {"PreviewName": "UnitInput", "Label": "Unit", "Caption": "unit", "Name": "gap", "Value": "16", "Prefix": "", "Suffix": "px", "Units": []string{"px", "%", "em"}, "Min": "0", "Max": 400, "Width": "180"}}
				}
			case "ChoiceChips":
				props["PreviewStack"] = true
				props["PreviewExamples"] = []map[string]any{{"Label": "", "AriaLabel": "Sort", "Name": "sort", "Value": "new", "Caption": "choice", "Options": []map[string]any{{"Value": "new", "Label": "Newest"}, {"Value": "top", "Label": "Popular"}, {"Value": "old", "Label": "Oldest"}}}, {"PreviewName": "FilterChips", "Label": "", "AriaLabel": "Teams", "Name": "teams", "Value": "design", "Caption": "filter", "Options": []map[string]any{{"Value": "design", "Label": "Design"}, {"Value": "eng", "Label": "Engineering"}, {"Value": "research", "Label": "Research"}, {"Value": "ops", "Label": "Operations", "Disabled": true}}}}
			case "Rating":
				props["PreviewExamples"] = []map[string]any{{"Label": "3 of 5", "AriaLabel": "Rating", "Name": "stars", "Value": "3", "Caption": "3 of 5", "Max": 5}, {"Label": "Read only", "AriaLabel": "Read only rating", "Name": "fixed", "Value": "4", "Caption": "read only", "Max": 5, "Disabled": true}}
			case "Slider":
				props["PreviewExamples"] = []map[string]any{{"Label": "Volume 40", "Name": "volume", "Value": "40", "Caption": "volume 40", "Min": "0", "Max": 100, "Width": "320"}, {"PreviewName": "RangeSlider", "Label": "Price 20 to 80", "Name": "price", "Value": "20", "End": "80", "Caption": "price 20 to 80", "Min": "0", "Max": 100, "Step": "5", "Width": "320"}, {"PreviewName": "VerticalSlider", "Label": "Level 60", "Name": "level", "Value": "60", "Caption": "level 60", "Min": "0", "Max": 100, "Step": "5", "Vertical": true}}
			case "Knob":
				props["PreviewExamples"] = []map[string]any{{"Label": "Gain 65", "Name": "gain", "Value": "65", "Caption": "gain 65", "Min": "0", "Max": 100}, {"PreviewName": "Dial", "Label": "Pan 0", "Name": "pan", "Value": "0", "Caption": "pan 0", "Min": "-50", "Max": 50}, {"PreviewName": "Stepper", "Label": "Guests", "Name": "guests", "Value": "2", "Caption": "guests", "Min": "1", "Max": 10}}
			case "EmailInput":
				props["Value"] = "caller@example.test"
				props["PreviewExamples"] = []map[string]any{{"Label": "Email", "Caption": "email", "Value": "", "Placeholder": "name@example.com", "Width": "280"}, {"PreviewName": "UrlInput", "Type": "url", "Label": "URL", "Caption": "url", "Value": "", "Placeholder": "https://", "Width": "280"}}
			case "PhoneInput":
				props["Value"], props["Mask"] = "01012345678", "###-####-####"
				props["PreviewExamples"] = []map[string]any{{"Label": "Phone", "Caption": "phone", "Value": "", "Country": "US", "Mask": "(999) 999-9999", "Placeholder": "(___) ___-____", "Width": "300", "Countries": []map[string]any{{"Value": "US", "Label": "🇺🇸 +1", "Mask": "(999) 999-9999"}, {"Value": "GB", "Label": "🇬🇧 +44", "Mask": "9999 999999"}, {"Value": "DE", "Label": "🇩🇪 +49", "Mask": "9999 9999999"}, {"Value": "FR", "Label": "🇫🇷 +33", "Mask": "9 99 99 99 99"}, {"Value": "JP", "Label": "🇯🇵 +81", "Mask": "99-9999-9999"}, {"Value": "CN", "Label": "🇨🇳 +86", "Mask": "999 9999 9999"}}}, {"PreviewName": "MaskedInput", "Label": "Masked code", "Caption": "masked: aa-9999", "Value": "", "Country": "", "Mask": "aa-9999", "Placeholder": "__-____", "Width": "200"}}
			case "PathInput":
				props["PreviewExamples"] = []map[string]any{{"Label": "Path", "Value": "", "Placeholder": "~/Projects", "ActionLabel": "Browse", "Action": "choose-path"}}
			case "RegexInput":
				props["Value"], props["Text"] = "Caller", "Caller source text"
				props["PreviewExamples"] = []map[string]any{{"Label": "Pattern", "Value": "^[a-z]+$", "Compact": true}}
			case "ExpressionInput":
				props["Value"], props["Variables"] = "price * quantity", map[string]any{"price": 8, "quantity": 3}
				props["PreviewExamples"] = []map[string]any{{"Label": "Formula", "Value": "price * qty", "Variables": map[string]any{"price": 12.5, "qty": 3}, "Compact": true}}
			case "HotkeyInput":
				props["PreviewExamples"] = []map[string]any{{"Label": "Shortcut", "Value": "⌘ K", "Placeholder": "Press keys", "Hint": "Records any key with its modifiers; Tab still moves focus."}}
			case "Calendar", "DatePicker", "RelativeDatePicker", "LocationPicker":
				props["Value"], props["End"], props["BaseDate"] = "2026-10-20", "2026-10-22", "2026-10-20"
				if story.Name == "Calendar" {
					props["Label"], props["Value"] = "", "2026-09-18"
				}
				if story.Name == "DatePicker" {
					props["PreviewExamples"] = []map[string]any{{"Label": "Date", "Caption": "date", "Value": "2026-10-02", "Width": "260"}, {"Label": "Range", "Caption": "range", "PreviewName": "DateRangePicker", "Value": "2026-09-14", "End": "2026-09-18", "Width": "260"}, {"Label": "Date and time", "Caption": "date and time", "PreviewName": "DateTimePicker", "Value": "", "Width": "260"}, {"Label": "Time, 15-minute steps", "Caption": "time, 15-minute steps", "PreviewName": "TimePicker", "Value": "09:30", "Width": "260"}}
				}
				if story.Name == "RelativeDatePicker" {
					props["Value"] = "Last 7 days"
					props["Options"] = []map[string]any{{"Label": "Today", "Value": "Today"}, {"Label": "Yesterday", "Value": "Yesterday"}, {"Label": "Last 7 days", "Value": "Last 7 days"}, {"Label": "Last 30 days", "Value": "Last 30 days"}, {"Label": "This month", "Value": "This month"}, {"Label": "Last month", "Value": "Last month"}, {"Label": "This quarter", "Value": "This quarter"}, {"Label": "This year", "Value": "This year"}}
					props["PreviewExamples"] = []map[string]any{{"Label": "relative", "Width": "260", "Value": "Last 7 days"}, {"Label": "time zone", "Width": "260", "PreviewName": "TimezoneSelect", "Value": "Europe/Lisbon", "Options": []map[string]any{{"Value": "Europe/Lisbon", "Label": "Europe/Lisbon"}, {"Value": "UTC", "Label": "UTC"}, {"Value": "America/New_York", "Label": "America/New_York"}, {"Value": "Asia/Seoul", "Label": "Asia/Seoul"}}}, {"Label": "duration 90 min", "Caption": "duration 90 min", "PreviewName": "DurationPicker", "Value": "5400", "DurationParts": []map[string]any{{"Name": "hours", "Label": "h", "Value": "1", "Max": "9999"}, {"Name": "minutes", "Label": "m", "Value": "30", "Max": "59"}}}}
				}
			case "MonthPicker":
				props["Value"] = "2026-10"
				props["PreviewExamples"] = []map[string]any{{"Label": "month", "Width": "200", "Value": "2026-09"}, {"Label": "quarter", "Width": "200", "PreviewName": "QuarterPicker", "Value": "Q3", "Year": "2026"}, {"Label": "year", "Width": "200", "PreviewName": "YearPicker", "Value": "2026"}, {"Label": "week", "Width": "200", "PreviewName": "WeekPicker", "Value": "2026-W39"}}
			case "CronEditor":
				props["Value"], props["Now"] = "*/5 * * * *", "2026-09-25T12:00:00Z"
				props["Presets"] = []map[string]any{{"Label": "Hourly", "Value": "0 * * * *"}, {"Label": "Daily at 9:00", "Value": "0 9 * * *"}, {"Label": "Weekdays at 9:00", "Value": "0 9 * * 1-5"}, {"Label": "Mondays at 9:00", "Value": "0 9 * * 1"}, {"Label": "Monthly", "Value": "0 0 1 * *"}}
				props["PreviewExamples"] = []map[string]any{{"Label": "", "Value": "", "Placeholder": "*/15 9-17 * * 1-5", "Caption": "CronRule::parse(\"0 9 * * 1-5\")?.next(now, 3)"}}
			case "ColorPicker":
				props["Label"], props["Value"] = "", "#3772bb"
				props["Options"] = []map[string]any{{"Label": "Caller green", "Value": "#228855"}, {"Label": "Caller coral", "Value": "#ef8a62"}}
				props["PreviewExamples"] = []map[string]any{{"Options": nil}}
			case "ColorSwatch":
				props["Label"], props["Value"], props["Options"] = "Color", "#335cff", []map[string]any{{"Label": "Blue", "Value": "#335cff"}, {"Label": "Green", "Value": "#228855"}, {"Label": "Coral", "Value": "#ef8a62"}, {"Label": "Gold", "Value": "#f3c969"}}
				palette := []map[string]any{{"Label": "Blue", "Value": "#5182c1"}, {"Label": "Teal", "Value": "#009589"}, {"Label": "Ochre", "Value": "#aa732b"}, {"Label": "Rose", "Value": "#b8636b"}, {"Label": "Violet", "Value": "#8572bb"}, {"Label": "Green", "Value": "#539156"}, {"Label": "Clay", "Value": "#b66946"}, {"Label": "Cyan", "Value": "#138db1"}}
				props["PreviewExamples"] = []map[string]any{{"PreviewName": "ColorPalette", "Label": "Color palette", "Value": "#5182c1", "Options": palette, "Caption": "palette"}, {"Label": "Swatches", "Options": nil, "Caption": "swatches", "Swatches": []map[string]any{{"Label": "Solid swatch", "Value": "#181613"}, {"Label": "Translucent swatch", "Value": "#3772bb66"}, {"Label": "Selected swatch", "Value": "#267b4c", "Selected": true}}}, {"PreviewName": "EyeDropper", "Label": "Eye dropper", "Options": nil, "ActionLabel": "Pick screen color", "Caption": "eye dropper"}}
			case "CodeInput":
				props["PreviewExamples"] = []map[string]any{{"Label": "code", "Value": "", "Placeholder": "cargo run --example gallery", "Width": "420"}, {"PreviewName": "JsonInput", "Label": "json", "Value": "", "Placeholder": `{ "name": "Ely" }`, "Width": "420"}}
			case "FontPicker":
				props["PreviewExamples"] = []map[string]any{{"Label": "", "Width": "420"}}
				props["Label"], props["Value"], props["Text"], props["Options"] = "Font", "Inter", "The quick brown fox jumps over the lazy dog.", []map[string]any{{"Label": "Inter", "Value": "Inter"}, {"Label": "Georgia", "Value": "Georgia"}, {"Label": "Courier New", "Value": "Courier New"}}
			case "IconPicker":
				icons := ui.FoundationIconNames()
				iconOptions := make([]map[string]any, 0, len(icons))
				for _, icon := range icons {
					iconOptions = append(iconOptions, map[string]any{"Label": icon, "Value": icon, "Icon": icon})
				}
				props["PreviewExamples"] = []map[string]any{{"Label": "", "Value": "sparkles", "Options": iconOptions}, {"PreviewName": "EmojiPicker", "Label": "", "Value": "✨", "Options": galleryEmojiOptions}}
			case "LanguageSelect":
				props["PreviewExamples"] = []map[string]any{{"Label": "Language", "Value": "zh", "Width": "260", "Options": galleryRegionalOptions["languages"]}, {"PreviewName": "CountrySelect", "Label": "Country", "Value": "CN", "Width": "260", "Options": galleryRegionalOptions["countries"]}, {"PreviewName": "CurrencySelect", "Label": "Currency", "Value": "CNY", "Width": "260", "Options": galleryRegionalOptions["currencies"]}, {"PreviewName": "CurrencyInput", "Label": "an amount in CNY", "Caption": "an amount in CNY", "Value": "1280.00", "Prefix": "¥", "Width": "260"}}
			case "GradientEditor":
				props["Start"], props["End"], props["Angle"] = "#181613", "#e9e7e5", 90
				props["PreviewExamples"] = []map[string]any{{"Compact": true}}
			case "FileInput":
				props["PreviewExamples"] = []map[string]any{{"Label": "Choose a file", "Caption": "one file", "Width": "260"}, {"Label": "Choose files", "Caption": "several", "Width": "260", "Multiple": true}, {"PreviewName": "DropZone", "Label": "Drop files", "Caption": "nothing dropped yet", "Width": "420", "Multiple": true, "Hint": "Any kind of file"}}
			case "SignaturePad":
				props["Value"] = "Caller signature"
				props["PreviewExamples"] = []map[string]any{{"Label": "", "Value": ""}}
			case "SettingsLayout":
				props["Title"], props["Placeholder"], props["Items"] = "Settings", "Search settings", []map[string]any{
					{"Label": "Appearance", "Fields": []map[string]any{
						{"Name": "theme", "Label": "Theme", "Type": "select", "Value": "system", "Options": []map[string]any{{"Value": "system", "Label": "System"}, {"Value": "dark", "Label": "Dark"}}, "Keywords": []string{"color", "appearance"}},
						{"Name": "font_size", "Label": "Font size", "Value": "14", "Keywords": []string{"text", "type"}},
					}},
					{"Label": "Privacy", "Fields": []map[string]any{{"Name": "analytics", "Label": "Analytics", "Type": "checkbox", "Keywords": []string{"tracking", "data"}}}},
				}
			case "Form":
				props["Label"], props["Description"], props["ResetLabel"], props["ActionLabel"] = "Profile", "How others see you.", "Discard", "Save"
				props["ArrayName"], props["ArrayLabel"], props["ArrayDescription"], props["ArrayPlaceholder"], props["AddLabel"] = "links", "Links", "Sites to show on your profile.", "https://", "Add link"
				props["Fields"] = []map[string]any{{"Name": "name", "Label": "Name", "Placeholder": "Ada Lovelace", "Required": true}, {"Name": "email", "Label": "Email", "Type": "email", "Placeholder": "ada@example.com", "Required": true, "Description": "We never share it."}, {"Name": "bio", "Label": "Bio", "Type": "textarea", "Placeholder": "A line about you", "Rows": 3, "Description": "Plain text, a few lines."}}
			case "InlineForm":
				props["Label"], props["ActionLabel"], props["Fields"] = "Newsletter", "Subscribe", []map[string]any{{"Name": "email", "Label": "Newsletter", "Type": "email", "Placeholder": "you@example.com", "Required": true}}
			case "AccountSwitcher":
				props["Label"], props["Value"], props["AddAction"], props["Items"] = "Accounts", "ada", "add-account", []map[string]any{{"Value": "ada", "Label": "Ada Lovelace", "Text": "ada@hey.com"}, {"Value": "home", "Label": "Ada Lovelace", "Text": "ada@atlas.dev"}}
			case "ApiKeyManager":
				props["CreateAction"], props["CreateLabel"], props["ActionLabel"], props["RevokeAction"], props["Fields"], props["Items"] = "create-api-key", "Create API key", "Create key", "revoke-api-key", []map[string]any{{"Name": "name", "Label": "Key name", "Placeholder": "Deploy", "Required": true}}, []map[string]any{{"Value": "ci", "Label": "CI", "Text": "Last used today", "Hint": "ely_live_…4f2a", "Time": "Made 3 Sep 2026"}, {"Value": "backup", "Label": "Backups", "Text": "Never used", "Hint": "ely_live_…91c0", "Time": "Made 12 Aug 2026"}}
			case "MagicLinkForm":
				props["Label"], props["Text"], props["Action"], props["ActionLabel"], props["OtherAction"], props["OtherLabel"] = "Sign in by email", "We will send a sign-in link to your inbox.", "send-magic-link", "Email me a sign-in link", "use-password", "Use password instead"
				props["PreviewExamples"] = []map[string]any{{"Label": "Sign in by email", "Email": "", "EmailPlaceholder": "you@example.com", "Action": "send-magic-link", "ActionLabel": "Email me a sign-in link", "OtherAction": "use-password", "OtherLabel": "Use password instead"}, {"PreviewName": "ForgotPassword", "Label": "Reset your password", "Text": "We will send a reset link to your inbox.", "Email": "", "EmailPlaceholder": "you@example.com", "Action": "send-password-reset", "ActionLabel": "Send reset link", "BackAction": "back-to-sign-in", "BackLabel": "Back to sign in"}}
			case "ProfileCard":
				profileFields := []map[string]any{{"Name": "name", "Label": "Name", "Value": "Ada Lovelace", "Required": true}, {"Name": "username", "Label": "Username", "Value": "ada"}, {"Name": "email", "Label": "Email", "Type": "email", "Value": "ada@atlas.dev", "Required": true}, {"Name": "bio", "Label": "Bio", "Type": "textarea", "Value": "Writes the notes that make machines do more than count."}, {"Name": "location", "Label": "Location", "Value": "London"}}
				props["Label"], props["DisplayName"], props["Role"], props["Presence"], props["Text"], props["Email"], props["Location"], props["Fields"], props["Options"] = "Profile", "Ada Lovelace", "Analyst, Atlas", "Online", "Writes the notes that make machines do more than count.", "ada@atlas.dev", "London", profileFields, []map[string]any{{"Label": "Message", "Value": "message", "Action": "message"}, {"Label": "View profile", "Value": "view", "Action": "view-profile"}}
				props["PreviewExamples"] = []map[string]any{{"Label": "Ada Lovelace", "DisplayName": "Ada Lovelace", "Role": "Analyst, Atlas", "Presence": "Online", "Text": "Writes the notes that make machines do more than count.", "Email": "ada@atlas.dev", "Location": "London", "Options": props["Options"], "Fields": []map[string]any{}}, {"PreviewName": "ProfileEditor", "DisplayName": "", "Role": "", "Presence": "", "Text": "", "Email": "", "Location": "", "Options": []map[string]any{}, "EditorLabel": "Edit profile", "Fields": profileFields, "Action": "save-profile", "ActionLabel": "Save profile"}}
			case "SessionList":
				props["Label"], props["Action"], props["ActionLabel"], props["OthersAction"], props["OthersLabel"], props["Items"] = "Signed-in sessions", "revoke-session", "Sign out", "sign-out-others", "Sign out other sessions", []map[string]any{{"Value": "phone", "Icon": "◫", "Label": "iPhone 17", "Text": "Ely for iOS", "Place": "Lisbon, Portugal", "Time": "2 hours ago"}, {"Value": "mac", "Icon": "▣", "Label": "MacBook Pro", "Text": "Ely 4.2", "Place": "Lisbon, Portugal", "Time": "Active now", "Current": true}, {"Value": "office", "Icon": "▣", "Label": "Office desktop", "Text": "Firefox 150", "Place": "Porto, Portugal", "Time": "3 days ago"}}
				props["CreateAction"], props["CreateLabel"], props["CreateActionLabel"], props["APIKeyFields"], props["APIKeys"] = "create-api-key", "Create API key", "Create key", []map[string]any{{"Name": "name", "Label": "Key name", "Placeholder": "Deploy", "Required": true}}, []map[string]any{{"Value": "ci", "Label": "CI", "Text": "Last used today", "Hint": "ely_live_…4f2a", "Time": "Made 3 Sep 2026"}, {"Value": "backup", "Label": "Backups", "Text": "Never used", "Hint": "ely_live_…91c0", "Time": "Made 12 Aug 2026"}}
			case "SubscriptionCard":
				quotas := []map[string]any{{"Label": "Seats", "Text": "9 of 12 seats", "Value": 9, "Max": 12}, {"Label": "Storage", "Text": "96.5 of 100 GB", "Value": 96.5, "Max": 100}, {"Label": "Automation runs", "Text": "1,240 of 2,000 runs", "Value": 1240, "Max": 2000}}
				paymentFields := []map[string]any{{"Name": "card_number", "Label": "Card number", "Value": "4242424242424242", "Required": true}, {"Name": "expiry", "Label": "Expiry", "Placeholder": "MM / YY", "Required": true}, {"Name": "cvc", "Label": "CVC", "Required": true}}
				props["Label"], props["Plan"], props["Standing"], props["Price"], props["Currency"], props["Items"], props["Options"] = "Pro", "Pro", "Active", "$20.00 / month", "USD", quotas, []map[string]any{{"Label": "Change plan", "Value": "change", "Action": "choose-plan"}, {"Label": "Cancel plan", "Value": "cancel", "Action": "cancel-plan"}}
				props["PreviewExamples"] = []map[string]any{{"Plan": "Pro", "Standing": "Active", "Price": "$20.00 / month", "Currency": "USD", "Items": quotas, "Options": props["Options"]}, {"PreviewName": "PaymentMethodForm", "Label": "Payment method", "Text": "Update the card used for your subscription.", "Fields": paymentFields, "Action": "update-payment-method", "ActionLabel": "Save payment method"}}
			case "OnboardingWizard":
				props["Label"], props["SkipAction"], props["Items"] = "Welcome", "skip-onboarding", []map[string]any{{"Label": "Name your workspace", "Text": "It shows in the sidebar and in every invitation.", "Fields": []map[string]any{{"Name": "workspace", "Label": "Workspace name", "Placeholder": "Acme", "Required": true}}}, {"Label": "Bring your team", "Text": "Add an address now, or later from Settings.", "Fields": []map[string]any{{"Name": "email", "Label": "Email", "Type": "email", "Placeholder": "name@example.com", "Required": true}}}, {"Label": "You're set", "Text": "Your workspace is ready. Press Finish to open it."}}
			case "Coachmark":
				props["Label"], props["Text"], props["ActionLabel"] = "New: keyboard shortcuts", "Press ? anywhere to see the shortcuts available here.", "Got it"
			case "Checklist":
				props["PreviewExamples"] = []map[string]any{{"Label": "Get started", "Items": []map[string]any{{"Label": "Add your photo", "Value": "photo", "Done": true}, {"Label": "Invite a teammate", "Value": "invite"}, {"Label": "Connect your calendar", "Value": "calendar"}, {"Label": "Learn the shortcuts", "Value": "shortcuts"}}}}
			case "HelpTooltip":
				props["Label"], props["Text"], props["ActionLabel"] = "Retention", "Deleted items stay 30 days before they are gone.", "Learn more"
			case "HelpPanel":
				props["Label"], props["Items"], props["FooterActions"] = "Help", []map[string]any{{"Value": "getting-started", "Label": "Getting started", "Text": "Invite your team and make your first project."}, {"Value": "billing", "Label": "Change billing", "Text": "Update payment details and plans."}, {"Value": "shortcuts", "Label": "Work from the keyboard", "Text": "Find shortcut keys for common actions."}}, []map[string]any{{"Label": "Contact support", "Action": "contact-support"}, {"Label": "Keyboard shortcuts", "Action": "open-shortcuts"}}
			case "KeyboardShortcutCheatsheet":
				props["Label"], props["Items"] = "Keyboard shortcuts", []map[string]any{{"Label": "Open search", "Shortcut": "Ctrl+K", "Text": "Find anything."}, {"Label": "Show shortcuts", "Shortcut": "?", "Text": "See every shortcut."}}
			case "FeedbackWidget":
				props["Label"], props["Placeholder"], props["ActionLabel"], props["Options"] = "Feedback", "Tell us more (optional)", "Send", []map[string]any{{"Value": "great", "Label": "Great", "Glyph": "☺"}, {"Value": "good", "Label": "Good", "Glyph": "●"}, {"Value": "okay", "Label": "Okay", "Glyph": "◐"}, {"Value": "bad", "Label": "Bad", "Glyph": "☹"}}
			}
			accountHelpSourceFixture(chapter.Slug, story.Name, props)
			if chapter.Slug == "maps" {
				points := []map[string]any{{"Key": "new-york", "Label": "New York", "Hue": 3, "Latitude": 40.7128, "Longitude": -74.006}, {"Key": "london", "Label": "London", "Hue": 0, "Latitude": 51.5072, "Longitude": -0.1276}, {"Key": "tokyo", "Label": "Tokyo", "Hue": 4, "Latitude": 35.6762, "Longitude": 139.6503}, {"Key": "sao-paulo", "Label": "São Paulo", "Hue": 5, "Latitude": -23.5505, "Longitude": -46.6333}, {"Key": "cape-town", "Label": "Cape Town", "Hue": 2, "Latitude": -33.9249, "Longitude": 18.4241}, {"Key": "sydney", "Label": "Sydney", "Hue": 1, "Latitude": -33.8688, "Longitude": 151.2093}}
				shapes := `{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"The Bermuda Triangle"},"geometry":{"type":"Polygon","coordinates":[[[-80.19,25.76],[-64.78,32.3],[-66.1,18.47],[-80.19,25.76]]]}},{"type":"Feature","properties":{"name":"A ring around the Azores"},"geometry":{"type":"Polygon","coordinates":[[[-35,33],[-20,33],[-20,42],[-35,42],[-35,33]],[[-30,36],[-25,36],[-25,39],[-30,39],[-30,36]]]}},{"type":"Feature","properties":{"name":"The equator"},"geometry":{"type":"LineString","coordinates":[[-50,0],[10,0]]}},{"type":"Feature","properties":{"name":"Ports"},"geometry":{"type":"MultiPoint","coordinates":[[-9.14,38.72],[-17.44,14.69],[-23.51,14.93]]}}]}`
				regions := `{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"region":"west"},"geometry":{"type":"Polygon","coordinates":[[[-9,36],[3,36],[3,43.5],[-9,43.5],[-9,36]]]}},{"type":"Feature","properties":{"region":"middle"},"geometry":{"type":"Polygon","coordinates":[[[-4,43.5],[8,43.5],[8,51],[-4,51],[-4,43.5]]]}},{"type":"Feature","properties":{"region":"south"},"geometry":{"type":"Polygon","coordinates":[[[7,37],[18,37],[18,46],[7,46],[7,37]]]}},{"type":"Feature","properties":{"region":"north"},"geometry":{"type":"Polygon","coordinates":[[[5,55],[15,55],[15,60],[5,60],[5,55]]]}}]}`
				props["Title"], props["Label"], props["Value"], props["Points"] = "", "", "", points
				props["Center"], props["Zoom"] = map[string]any{"Latitude": 20.0, "Longitude": 10.0}, 1.2
				props["Width"], props["Height"], props["Attribution"], props["HideCoordinates"] = 720, 360, "Land: Natural Earth", true
				props["ShowReset"] = false
				switch story.Name {
				case "CoordinateDisplay":
					props["DecimalLabel"], props["DMSLabel"] = "decimal", "degrees, minutes, seconds"
					props["Value"], props["DMS"] = "33.9249° S, 18.4241° E", "33°55′30″ S, 18°25′27″ E"
				case "LocationPicker":
					props["Center"], props["Zoom"], props["Width"], props["Height"], props["Format"], props["HideCoordinates"] = map[string]any{"Latitude": 48.8566, "Longitude": 2.3522}, 3.0, 480, 288, "dms", false
					props["Caption"] = "The pick reaches the owner as it moves; the log shows it."
					props["Value"], props["Points"] = "48.8566,2.3522", []map[string]any{}
				case "RouteLine":
					props["Center"], props["Zoom"] = map[string]any{"Latitude": 38.0, "Longitude": -40.0}, 2.3
					props["Points"], props["Routes"], props["GeoJSON"] = []map[string]any{}, []map[string]any{{"Points": []map[string]any{{"Latitude": 51.5072, "Longitude": -0.1276}, {"Latitude": 64.1466, "Longitude": -21.9426}, {"Latitude": 44.6488, "Longitude": -63.5752}, {"Latitude": 40.7128, "Longitude": -74.006}}}}, shapes
				case "GeoHeatmap":
					props["Center"], props["Zoom"], props["Hue"] = map[string]any{"Latitude": 20.0, "Longitude": 30.0}, 1.0, 6
					next := mapSourceNoise(41)
					heatCenters := []map[string]any{{"Label": "Tokyo", "Latitude": 35.68, "Longitude": 139.69}, {"Label": "Santiago", "Latitude": -33.45, "Longitude": -70.67}, {"Label": "Jakarta", "Latitude": -6.21, "Longitude": 106.85}, {"Label": "Istanbul", "Latitude": 41.01, "Longitude": 28.98}, {"Label": "San Francisco", "Latitude": 37.77, "Longitude": -122.42}}
					heat := make([]map[string]any, 0, 150)
					for _, center := range heatCenters {
						for i := 0; i < 30; i++ {
							heat = append(heat, map[string]any{"Label": center["Label"], "Latitude": center["Latitude"].(float64) + (next()-0.5)*6, "Longitude": center["Longitude"].(float64) + (next()-0.5)*6, "Value": 0.5 + next()*1.5})
						}
					}
					props["Points"] = heat
				case "MapCluster":
					props["Center"], props["Zoom"] = map[string]any{"Latitude": 42.0, "Longitude": 5.0}, 3.0
					next := mapSourceNoise(7)
					capitals := []map[string]any{{"Label": "London", "Latitude": 51.51, "Longitude": -0.13}, {"Label": "Paris", "Latitude": 48.86, "Longitude": 2.35}, {"Label": "Berlin", "Latitude": 52.52, "Longitude": 13.4}, {"Label": "Madrid", "Latitude": 40.42, "Longitude": -3.7}, {"Label": "Rome", "Latitude": 41.9, "Longitude": 12.5}, {"Label": "Vienna", "Latitude": 48.21, "Longitude": 16.37}, {"Label": "Amsterdam", "Latitude": 52.37, "Longitude": 4.9}, {"Label": "Brussels", "Latitude": 50.85, "Longitude": 4.35}, {"Label": "Lisbon", "Latitude": 38.72, "Longitude": -9.14}, {"Label": "Prague", "Latitude": 50.08, "Longitude": 14.44}, {"Label": "Warsaw", "Latitude": 52.23, "Longitude": 21.01}, {"Label": "Stockholm", "Latitude": 59.33, "Longitude": 18.07}, {"Label": "Copenhagen", "Latitude": 55.68, "Longitude": 12.57}, {"Label": "Budapest", "Latitude": 47.5, "Longitude": 19.04}}
					clusters := make([]map[string]any, 0, 42)
					for _, capital := range capitals {
						for i := 0; i < 3; i++ {
							clusters = append(clusters, map[string]any{"Key": fmt.Sprintf("pin-%d", len(clusters)), "Hue": len(clusters) % 8, "Latitude": capital["Latitude"].(float64) + (next()-0.5)*1.2, "Longitude": capital["Longitude"].(float64) + (next()-0.5)*1.8})
						}
					}
					props["Points"] = clusters
				case "ChoroplethMap":
					props["PreviewStack"] = true
					rain := []map[string]any{{"Label": "west", "Value": "540"}, {"Label": "middle", "Value": "810"}, {"Label": "south", "Value": "700"}}
					visitors := []map[string]any{{"Label": "US", "Value": "120400"}, {"Label": "IN", "Value": "51300"}, {"Label": "GB", "Value": "45100"}, {"Label": "DE", "Value": "38200"}, {"Label": "JP", "Value": "30800"}, {"Label": "FR", "Value": "26400"}, {"Label": "BR", "Value": "22100"}, {"Label": "CA", "Value": "18300"}, {"Label": "AU", "Value": "14700"}, {"Label": "ES", "Value": "13200"}, {"Label": "CN", "Value": "12600"}, {"Label": "IT", "Value": "12100"}, {"Label": "KR", "Value": "11400"}, {"Label": "MX", "Value": "9100"}, {"Label": "SG", "Value": "8300"}, {"Label": "RU", "Value": "7200"}, {"Label": "AR", "Value": "6300"}, {"Label": "ZA", "Value": "5400"}, {"Label": "EG", "Value": "4100"}, {"Label": "NG", "Value": "3200"}}
					props["Points"], props["GeoJSON"], props["Center"], props["Zoom"], props["Width"], props["Height"], props["Hue"] = rain, regions, map[string]any{"Latitude": 46.0, "Longitude": 5.0}, 3.2, 480, 320, 1
					props["PreviewExamples"] = []map[string]any{{"PreviewName": "WorldMap", "Points": visitors, "GeoJSON": "", "Width": 720, "Height": 360, "Center": map[string]any{"Latitude": 25.0, "Longitude": 10.0}, "Zoom": 1.4, "Hue": 0, "Attribution": "Countries: Natural Earth"}, {"Points": rain, "GeoJSON": regions, "Width": 480, "Height": 320, "Center": map[string]any{"Latitude": 46.0, "Longitude": 5.0}, "Zoom": 3.2, "Hue": 1}}
				}
			}
			cases = append(cases, AdvancedCase{Family: "forms", Component: ui.Component{Chapter: chapter.Slug, Name: story.Name, ID: "audit-" + chapter.Slug + "-" + story.Slug, Props: props}})
			// Give each source specimen its own audit fixture without changing caller props.
			if chapter.Slug == "account" || chapter.Slug == "onboarding" || chapter.Slug == "maps" {
				if examples, ok := props["PreviewExamples"].([]map[string]any); ok {
					for _, example := range examples {
						if name, ok := example["PreviewName"].(string); ok && name != story.Name {
							alias := make(map[string]any, len(props))
							for key, value := range props {
								alias[key] = value
							}
							for key, value := range example {
								alias[key] = value
							}
							delete(alias, "PreviewExamples")
							cases = append(cases, AdvancedCase{Family: "forms", Component: ui.Component{Chapter: chapter.Slug, Name: name, ID: "audit-" + chapter.Slug + "-" + name, Props: alias}})
						}
					}
				}
			}
		}
	}
	return cases
}

// Settings/account/help gallery 550–567, upstream 49ed1f8. All external operations are host actions.
func accountHelpSourceFixture(chapter, name string, p map[string]any) {
	if chapter != "account" && chapter != "onboarding" && !(chapter == "settings" && name == "SettingsLayout") {
		return
	}
	p["Title"], p["Text"], p["Value"], p["Disabled"] = "", "", "", false
	p["Options"], p["Fields"], p["Items"] = []map[string]any{}, []map[string]any{}, []map[string]any{}
	p["ActionLabel"] = ""
	switch name {
	case "SettingsLayout":
		p["HideHeading"], p["AutoSave"], p["Placeholder"] = true, true, "Search settings"
		p["Items"] = []map[string]any{
			{"Label": "Appearance", "Text": "How the app looks.", "Fields": []map[string]any{
				{"Name": "theme", "Label": "Theme", "Type": "segments", "Value": "system", "Keywords": []string{"dark", "light", "mode", "color", "appearance"}, "Options": []map[string]any{{"Value": "light", "Label": "Light"}, {"Value": "dark", "Label": "Dark"}, {"Value": "system", "Label": "System"}}},
				{"Name": "accent", "Label": "Accent color", "Text": "Buttons, links and what is chosen.", "Type": "swatches", "Value": "#79a7e2", "Keywords": []string{"color", "hue"}, "Options": []map[string]any{{"Value": "#79a7e2", "Label": "Blue", "Color": "#79a7e2"}, {"Value": "#4eb9ad", "Label": "Teal", "Color": "#4eb9ad"}, {"Value": "#cd995c", "Label": "Amber", "Color": "#cd995c"}, {"Value": "#dc8a90", "Label": "Rose", "Color": "#dc8a90"}, {"Value": "#a998dd", "Label": "Purple", "Color": "#a998dd"}, {"Value": "#7cb57d", "Label": "Green", "Color": "#7cb57d"}}},
				{"Name": "size", "Label": "Font size", "Type": "range", "Default": 14, "Value": 14, "Min": 11, "Max": 20, "Step": 1, "Preview": "The quick brown fox jumps over the lazy dog", "Keywords": []string{"text", "zoom"}},
				{"Name": "density", "Label": "Density", "Text": "How close things sit.", "Type": "segments", "Value": "standard", "Keywords": []string{"compact", "spacing"}, "Options": []map[string]any{{"Value": "compact", "Label": "Compact"}, {"Value": "standard", "Label": "Standard"}, {"Value": "comfortable", "Label": "Comfortable"}}},
				{"Name": "font", "Label": "Font", "Text": "FontFamilySelect → forms::FontPicker", "Type": "select", "Value": "Inter", "Preview": "The quick brown fox jumps over the lazy dog", "Keywords": []string{"typeface", "family"}, "Options": []map[string]any{{"Value": "Inter", "Label": "Inter"}, {"Value": "serif", "Label": "Serif"}, {"Value": "monospace", "Label": "Monospace"}}},
			}},
			{"Label": "Keyboard", "Text": "Keyboard and language", "Fields": []map[string]any{{"Name": "language", "Label": "Language", "Type": "select", "Value": "en", "Keywords": []string{"locale", "translation"}, "Options": []map[string]any{{"Value": "en", "Label": "English"}, {"Value": "ko", "Label": "Korean"}, {"Value": "pt", "Label": "Portuguese"}}}, {"Name": "shortcuts", "Label": "Keyboard shortcuts", "Type": "shortcuts", "Options": []map[string]any{{"Group": "General", "Label": "Command palette", "Value": "⌘⇧P"}, {"Group": "General", "Label": "Settings", "Value": "⌘,"}, {"Group": "Editing", "Label": "Undo", "Value": "⌘Z"}, {"Group": "Editing", "Label": "Find", "Value": "⌘F"}, {"Group": "Window", "Label": "New window", "Value": "⌘⇧N"}}, "Keywords": []string{"keys", "bindings"}}}},
			{"Label": "Network", "Fields": []map[string]any{{"Name": "proxy", "Label": "Proxy", "Type": "select", "Value": "system", "Keywords": []string{"http", "socks"}, "Options": []map[string]any{{"Value": "system", "Label": "System"}, {"Value": "none", "Label": "No proxy"}, {"Value": "manual", "Label": "Manual"}}}, {"Name": "proxy_url", "Label": "Proxy address", "Placeholder": "http://localhost:8080"}}},
			{"Label": "Privacy", "Fields": []map[string]any{{"Name": "telemetry", "Label": "Usage data", "Type": "checkbox", "Checked": true, "Keywords": []string{"telemetry", "analytics"}}, {"Name": "crash_reports", "Label": "Crash reports", "Type": "checkbox", "Checked": true}, {"Name": "personalization", "Label": "Personalization", "Type": "checkbox"}, {"Name": "history", "Label": "History", "Type": "checkbox", "Checked": true}}},
			{"Label": "Notifications", "Fields": []map[string]any{{"Name": "quiet", "Label": "Hold notices", "Type": "checkbox", "Keywords": []string{"do not disturb", "quiet"}}, {"Name": "mentions_app", "Label": "Mentions · App", "Type": "checkbox", "Checked": true}, {"Name": "mentions_push", "Label": "Mentions · Push", "Type": "checkbox", "Checked": true}, {"Name": "replies_app", "Label": "Replies · App", "Type": "checkbox", "Checked": true}, {"Name": "digest_email", "Label": "Weekly digest · Email", "Type": "checkbox", "Checked": true}}},
			{"Label": "Startup", "Fields": []map[string]any{{"Name": "login", "Label": "Open at login", "Type": "checkbox", "Keywords": []string{"launch", "boot"}}, {"Name": "restore", "Label": "Restore windows", "Type": "checkbox", "Checked": true}, {"Name": "opens", "Label": "Opens", "Type": "select", "Value": "last", "Options": []map[string]any{{"Value": "last", "Label": "Where I left off"}, {"Value": "home", "Label": "The home page"}, {"Value": "blank", "Label": "A blank window"}}}, {"Name": "updates", "Label": "Check for updates", "Type": "checkbox", "Checked": true}}},
			{"Label": "Storage", "Text": "What the app keeps on this device.", "Fields": []map[string]any{{"Name": "cache", "Label": "Cache", "Type": "storage", "Clearable": true, "Value": "312 MiB", "Keywords": []string{"disk", "space"}}, {"Name": "logs", "Label": "Logs", "Type": "storage", "Clearable": true, "Value": "48 MiB"}, {"Name": "documents", "Label": "Documents", "Type": "storage", "Value": "1.2 GiB", "Disabled": true}}},
			{"Label": "Advanced", "Fields": []map[string]any{{"Name": "tabs", "Label": "Vertical tabs", "Text": "Tabs down the side of the window.", "Type": "checkbox"}, {"Name": "sync", "Label": "Settings sync", "Text": "The same settings on every device.", "Type": "checkbox", "Checked": true}, {"Name": "suggest", "Label": "Inline suggestions", "Text": "The rest of a line, offered as you type.", "Type": "checkbox"}, {"Name": "developer", "Label": "Developer mode", "Type": "checkbox", "Keywords": []string{"debug", "inspector"}}}},
		}
		sections := p["Items"].([]map[string]any)
		icons := []string{"palette", "keyboard", "globe", "shield", "bell", "power", "hard-drive", "wrench"}
		for i := range sections {
			sections[i]["Icon"] = icons[i]
		}
		sections[1]["Heading"], sections[1]["Text"] = "Keyboard and language", "ShortcutEditor → editor::KeybindingsEditor"
		sections[2]["Fields"] = []map[string]any{{"Name": "proxy", "Label": "Proxy", "Type": "proxy", "Value": "system", "Keywords": []string{"http", "socks", "network"}}}
		sections[4]["Fields"] = []map[string]any{{"Name": "quiet", "Label": "Hold notices", "Type": "checkbox"}, {"Name": "notifications", "Label": "Notifications", "Type": "matrix", "Columns": []string{"App", "Email", "Push"}, "Options": []map[string]any{
			{"Label": "Mentions", "Cells": []map[string]any{{"Name": "mentions_app", "Checked": true}, {"Name": "mentions_email"}, {"Name": "mentions_push", "Checked": true}}},
			{"Label": "Replies", "Cells": []map[string]any{{"Name": "replies_app", "Checked": true}, {"Name": "replies_email"}, {"Name": "replies_push"}}},
			{"Label": "Weekly digest", "Cells": []map[string]any{{"Name": "digest_app"}, {"Name": "digest_email", "Checked": true}, {"Name": "digest_push"}}},
		}}}
		sections[6]["Fields"] = append(sections[6]["Fields"].([]map[string]any), map[string]any{"Name": "settings_files", "Label": "Import and export", "Type": "actions", "Options": []map[string]any{{"Label": "Export settings", "Action": "export-settings"}, {"Label": "Import settings", "Action": "import-settings"}}}, map[string]any{"Name": "defaults", "Label": "Defaults", "Text": "A larger font size shows here.", "Type": "defaults"})

	case "LoginForm":
		p["Label"], p["Text"], p["Email"], p["PasswordLabel"], p["ActionLabel"], p["Action"] = "Sign in to Ely", "Welcome back.", "", "Password", "Sign in", "authenticate"
		p["ForgotAction"], p["OtherAction"], p["OtherLabel"] = "forgot-password", "sign-up", "No account? Sign up"
		p["Providers"] = []map[string]any{{"Value": "github", "Label": "Continue with GitHub"}, {"Value": "google", "Label": "Continue with Google"}, {"Value": "apple", "Label": "Continue with Apple"}}
	case "SignupForm":
		p["Label"], p["Email"], p["DisplayName"], p["PasswordLabel"], p["ActionLabel"], p["Action"] = "Create an account", "", "", "Password", "Create account", "sign-up"
		p["TermsLabel"], p["OtherAction"], p["OtherLabel"] = "I agree to the terms of service", "sign-in", "Have an account? Sign in"
	case "MagicLinkForm":
		p["Email"], p["Label"], p["Text"], p["ActionLabel"] = "", "Sign in by email", "We will email you a link that signs you in. No password needed.", "Email me a link"
		p["OtherAction"], p["OtherLabel"] = "", ""
		p["PreviewExamples"] = []map[string]any{{"Email": "", "Label": "Sign in by email", "Text": "We will email you a link that signs you in. No password needed.", "Action": "send-magic-link", "ActionLabel": "Email me a link", "OtherAction": ""}, {"PreviewName": "ForgotPassword", "Label": "Reset your password", "Text": "Enter the email you signed up with and we will send a link to set a new password.", "Email": "", "Action": "send-password-reset", "ActionLabel": "Send reset link", "BackAction": "back-to-sign-in", "BackLabel": "Back to sign in", "OtherAction": ""}}
	case "TwoFactorInput":
		p["Value"], p["Label"], p["Text"], p["Items"] = "", "Two-step sign-in", "Enter the six-digit code from your authenticator app.", []int{1, 2, 3, 4, 5, 6}
		p["PreviewExamples"] = []map[string]any{{"Label": p["Label"], "Value": "", "Items": p["Items"]}}
	case "AccountSwitcher":
		accounts := []map[string]any{{"Value": "work", "Label": "Ada Lovelace", "Text": "ada@atlas.dev"}, {"Value": "home", "Label": "Ada Lovelace", "Text": "ada@hey.com"}}
		p["Value"], p["Items"], p["Action"] = "work", accounts, "switch-account"
		p["PreviewExamples"] = []map[string]any{{"PreviewName": "WorkspaceSwitcher", "Label": "Workspaces", "Value": "atlas", "Items": []map[string]any{{"Value": "atlas", "Label": "Atlas", "Text": "Pro · 12 members"}, {"Value": "field", "Label": "Field Notes", "Text": "Free · 3 members"}}, "Action": "switch-workspace", "AddAction": "create-workspace", "AddLabel": "Create workspace"}, {"Value": "work", "Items": accounts, "Action": "switch-account", "AddAction": "add-account"}, {"PreviewName": "UserMenu", "DisplayName": "Ada Lovelace", "Email": "ada@atlas.dev", "Options": []map[string]any{{"Label": "Profile", "Action": "view-profile"}, {"Label": "Settings", "Action": "open-settings"}}}}
	case "ProfileCard":
		p["Options"] = []map[string]any{{"Label": "Message", "Action": "message"}, {"Label": "View profile", "Action": "view-profile"}}
		// Keep the caller/editor field shape used by the public API.
		fields := []map[string]any{{"Name": "name", "Label": "Name", "Value": "Ada Lovelace", "Required": true}, {"Name": "username", "Label": "Username", "Value": "ada"}, {"Name": "email", "Label": "Email", "Type": "email", "Value": "ada@atlas.dev", "Required": true}, {"Name": "bio", "Label": "About", "Type": "textarea", "Rows": 3, "Value": "Writes the notes that make machines do more than count.", "Description": "A line or two others see."}, {"Name": "location", "Label": "Location", "Value": "London"}}
		p["Fields"] = fields
		p["PreviewExamples"] = []map[string]any{{"DisplayName": "Ada Lovelace", "Role": "Analyst, Atlas", "Presence": "Online", "Text": "Writes the notes that make machines do more than count.", "Email": "ada@atlas.dev", "Location": "London", "Options": p["Options"]}, {"PreviewName": "ProfileEditor", "DisplayName": "Ada Lovelace", "Fields": fields, "Action": "save-profile", "ActionLabel": "Save", "EditorLabel": ""}}
	case "SessionList":
		p["Items"] = []map[string]any{{"Value": "mac", "Icon": "▣", "Label": "MacBook Pro", "Text": "Ely 4.2", "Place": "Lisbon, Portugal", "Time": "Active now", "Current": true}, {"Value": "phone", "Icon": "▯", "Label": "iPhone 17", "Text": "Ely for iOS", "Place": "Lisbon, Portugal", "Time": "2 hours ago"}, {"Value": "office", "Icon": "▣", "Label": "Office desktop", "Text": "Firefox 150", "Place": "Porto, Portugal", "Time": "3 days ago"}}
		p["ActionLabel"], p["OthersLabel"] = "Sign out", "Sign out of all other devices"
		p["PreviewExamples"] = []map[string]any{{}, {"PreviewName": "ApiKeyManager", "ActionLabel": "Create key", "Fields": p["APIKeyFields"]}}
	case "SubscriptionCard":
		quotas := []map[string]any{{"Label": "Seats across every workspace you own", "Text": "9 of 12 seats", "Value": 9, "Max": 12}, {"Label": "Storage", "Text": "96.5 of 100 GB", "Value": 96.5, "Max": 100}, {"Label": "Automation runs", "Text": "1,240 of 2,000 runs", "Value": 1240, "Max": 2000}}
		p["Items"], p["Renews"], p["Resets"], p["Price"], p["Currency"] = quotas, "Renews on 1 October 2026.", "Resets on 1 October.", "$20.00 per month", ""
		p["Options"] = []map[string]any{{"Label": "Change plan", "Value": "change", "Action": "choose-plan"}, {"Label": "Cancel plan", "Value": "cancel", "Action": "cancel-plan", "Confirm": "Cancel plan?"}}
		p["PreviewExamples"] = []map[string]any{{}, {"PreviewName": "PaymentMethodForm", "Compact": true, "Action": "update-payment-method", "ActionLabel": "Save card", "Fields": []map[string]any{{"Name": "card_number", "Label": "Card number", "Placeholder": "____ ____ ____ ____", "Required": true, "Autocomplete": "cc-number"}, {"Name": "expiry", "Label": "Expires", "Placeholder": "MM/YY", "Required": true, "Autocomplete": "cc-exp"}, {"Name": "cvc", "Label": "Security code", "Required": true, "Autocomplete": "cc-csc"}, {"Name": "name", "Label": "Name on card", "Placeholder": "As printed on the card", "Required": true, "Autocomplete": "cc-name"}}}}
	case "BillingHistory":
		p["Label"], p["Action"] = "Billing history", "open-invoice"
		p["Items"] = []map[string]any{{"Value": "sep", "Date": "1 Sep 2026", "Description": "Pro, monthly", "Amount": "$20.00", "Status": "Due", "Label": "↓"}, {"Value": "aug", "Date": "1 Aug 2026", "Description": "Pro, monthly", "Amount": "$20.00", "Status": "Paid", "Label": "↓"}, {"Value": "jul", "Date": "1 Jul 2026", "Description": "Pro, monthly", "Amount": "$20.00", "Status": "Failed", "Label": "↓"}, {"Value": "jun", "Date": "12 Jun 2026", "Description": "Extra seats", "Amount": "−$15.00", "Status": "Refunded", "Label": "↓"}}
		p["PreviewExamples"] = []map[string]any{{}, {"PreviewName": "UpgradePrompt", "Label": "9 of 10 projects used", "Text": "Pro has no limit on projects.", "Action": "upgrade", "ActionLabel": "Upgrade", "DismissLabel": "Not now"}, {"PreviewName": "Paywall", "Label": "Version history is on Pro", "Text": "See and restore every version of a document.", "Benefits": []string{"Every version, kept a year", "Restore with one press", "Compare any two"}, "Action": "upgrade", "ActionLabel": "Upgrade", "DismissLabel": "Not now"}}
	case "TeamMemberTable":
		roles := []map[string]any{{"Value": "member", "Label": "Member", "Text": "Projects and documents"}, {"Value": "admin", "Label": "Admin", "Text": "Everything, billing too"}, {"Value": "guest", "Label": "Guest", "Text": "Only what is shared"}}
		p["Label"], p["HideInvite"], p["Options"] = "Team members", true, roles
		p["Items"] = []map[string]any{{"Value": "ada", "Label": "Ada Lovelace", "Email": "ada@atlas.dev", "Role": "admin", "Time": "Active now", "Owner": true}, {"Value": "grace", "Label": "Grace Hopper", "Email": "grace@atlas.dev", "Role": "admin", "Time": "Active today"}, {"Value": "alan", "Label": "Alan Turing", "Email": "alan@atlas.dev", "Role": "member", "Time": "3 days ago"}}
		p["PreviewExamples"] = []map[string]any{{}, {"PreviewName": "InvitationList", "ActionLabel": "Resend", "Items": []map[string]any{{"Value": "kat", "Email": "katherine@nasa.gov", "Text": "Member", "Time": "Sent 2 days ago"}, {"Value": "edsger", "Email": "edsger@tue.nl", "Text": "Guest", "Time": "Sent 9 days ago", "Expired": true}}, "Fields": []map[string]any{{"Name": "email", "Type": "email", "Label": "Email", "Placeholder": "name@example.com", "Required": true}, {"Name": "role", "Type": "select", "Label": "Role", "Value": "member", "Options": roles}}}}
	case "OnboardingWizard":
		p["Label"], p["SkipAction"] = "Welcome", "skip-onboarding"
		p["Items"] = []map[string]any{{"Label": "Name your workspace", "Text": "It shows in the sidebar and in every invitation.", "Fields": []map[string]any{{"Name": "workspace", "Label": "Workspace name", "Placeholder": "Acme", "Required": true}}}, {"Label": "Bring your team", "Text": "Add an address now, or later from Settings.", "Fields": []map[string]any{{"Name": "email", "Label": "Email", "Placeholder": "name@example.com"}}}, {"Label": "You're set", "Text": "Your workspace is ready. Press Finish to open it."}}
	case "Coachmark":
		p["Label"], p["Text"], p["ActionLabel"] = "Pin a view", "Keep the views you use most one press away.", "Got it"
		p["Items"] = []map[string]any{{"Label": "Inbox"}, {"Label": "Automations", "Badge": "New"}}
		p["PreviewExamples"] = []map[string]any{{}, {"PreviewName": "FeatureHighlight", "Label": "Split view", "Text": "Work on two files side by side, each with its own history.", "ActionLabel": "Try it", "Action": "try-feature"}}
	case "Checklist":
		p["Label"] = "Get started"
		p["Items"] = []map[string]any{{"Value": "profile", "Label": "Add your photo", "Text": "So your team knows who is who.", "Done": true}, {"Value": "invite", "Label": "Invite a teammate", "Text": "Work is better shared."}, {"Value": "connect", "Label": "Connect your calendar", "Text": "See meetings beside your tasks."}, {"Value": "shortcuts", "Label": "Learn three shortcuts", "Text": "Command K opens everything."}}
		p["PreviewExamples"] = []map[string]any{{}}
	case "HelpTooltip":
		p["Label"], p["Text"], p["ActionLabel"] = "Retention", "Deleted items stay 30 days before they are gone.", ""
		p["Fields"] = []map[string]any{{"Name": "billing_email", "Label": "Billing email", "Placeholder": "billing@example.com", "Description": "Invoices go here as well as to the owner."}}
		p["InlineHelp"], p["HelpKey"] = "Only admins can change billing.", "billing"
		p["PreviewExamples"] = []map[string]any{{}, {"PreviewName": "EmptyStateWithAction", "Label": "No projects yet", "Text": "Projects hold your work and who can see it.", "ActionLabel": "New project", "Action": "new-project"}}
	case "HelpPanel":
		p["Label"] = "Help"
		p["Items"] = []map[string]any{{"Value": "start", "Label": "Getting started", "Text": "Make a project and invite your team.", "Body": "Press New project in the sidebar, give it a name, and pick who can see it.", "Links": []map[string]any{{"Value": "team", "Label": "Then invite your team"}}}, {"Value": "team", "Label": "Invite your team", "Text": "Bring people in by email.", "Body": "Open Settings › Members and press Invite. Each person gets a link that works for seven days."}, {"Value": "billing", "Label": "Change billing", "Text": "Who can, and where.", "Body": "Only admins can change billing. Open Settings › Billing to change the plan or the card."}, {"Value": "keys", "Label": "Work from the keyboard", "Text": "The shortcuts worth learning first.", "Body": "Press cmd-k to open anything, and ? for every shortcut."}}
	case "KeyboardShortcutCheatsheet":
		p["Label"] = "Keyboard shortcuts"
		p["Items"] = []map[string]any{{"Group": "General", "Label": "Open anything", "Shortcut": "⌘K"}, {"Group": "General", "Label": "Every shortcut", "Shortcut": "?"}, {"Group": "General", "Label": "Settings", "Shortcut": "⌘,"}, {"Group": "Editing", "Label": "Undo", "Shortcut": "⌘Z"}, {"Group": "Editing", "Label": "Redo", "Shortcut": "⌘⇧Z"}, {"Group": "Editing", "Label": "Find", "Shortcut": "⌘F"}, {"Group": "View", "Label": "Split view", "Shortcut": "⌘\\"}, {"Group": "View", "Label": "Zoom in", "Shortcut": "⌘="}}
		p["PreviewExamples"] = []map[string]any{{}, {"PreviewName": "WhatsNewDialog", "Label": "What's new", "TriggerLabel": "What's new", "ActionLabel": "Close", "Items": []map[string]any{{"Label": "2.4", "Date": "Sep 25, 2026", "Text": "Split view, and a calmer sidebar.", "Changes": []map[string]any{{"Kind": "Added", "Text": "Split view: two files side by side."}, {"Kind": "Added", "Text": "Pin a view to the toolbar."}, {"Kind": "Fixed", "Text": "Search keeps its place after an edit."}}}, {"Label": "2.3", "Date": "Sep 9, 2026", "Changes": []map[string]any{{"Kind": "Changed", "Text": "The sidebar folds with a narrow window."}, {"Kind": "Fixed", "Text": "Sync resumes after sleep."}}}}}}
	case "FeedbackWidget":
		p["Label"], p["Value"], p["ActionLabel"], p["Action"] = "Feedback", "", "Send", "send-feedback"
		p["Options"] = []map[string]any{{"Value": "bad", "Label": "Not good", "Glyph": "☹"}, {"Value": "okay", "Label": "Okay", "Glyph": "◐"}, {"Value": "good", "Label": "Good", "Glyph": "☺"}, {"Value": "great", "Label": "Great", "Glyph": "☻"}}
		p["PreviewExamples"] = []map[string]any{{}, {"PreviewName": "ContactSupport", "Action": "contact-support", "ActionLabel": "Send message", "Address": "help@example.com", "Fields": []map[string]any{{"Name": "topic", "Label": "Topic", "Type": "select", "Required": true, "Options": []map[string]any{{"Value": "", "Label": "Choose a topic"}, {"Value": "billing", "Label": "Billing"}, {"Value": "bug", "Label": "Something broke"}, {"Value": "account", "Label": "My account"}, {"Value": "other", "Label": "Something else"}}}, {"Name": "message", "Label": "Message", "Type": "textarea", "Rows": 4, "Placeholder": "What happened, and what you expected", "Required": true}}}}
	}
}

// Same wrapping LCG as examples/gallery/ui.rs; fixtures are repeatable.
func mapSourceNoise(seed uint64) func() float64 {
	return func() float64 {
		seed = seed*6364136223846793005 + 1442695040888963407
		return float64(seed>>33) / float64(uint64(1)<<31)
	}
}
