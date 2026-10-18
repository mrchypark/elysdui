package uiexamples

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/mrchypark/elysdui/ui/gohtmx"
)

func uptimeSamples(count int, normal string, changedAt int, changed string) []map[string]any {
	samples := make([]map[string]any, count)
	for index := range samples {
		state := normal
		if index == changedAt {
			state = changed
		}
		samples[index] = map[string]any{"State": state, "Label": fmt.Sprintf("Day %d", index+1)}
	}
	return samples
}

func sourceOrders() []map[string]any {
	people := []struct{ name, initials string }{{"Ada Lovelace", "AL"}, {"Alan Turing", "AT"}, {"Grace Hopper", "GH"}, {"Katherine Johnson", "KJ"}, {"Tim Berners-Lee", "TB"}, {"Radia Perlman", "RP"}, {"Sophie Wilson", "SW"}, {"Barbara Liskov", "BL"}, {"Ken Thompson", "KT"}, {"Margaret Hamilton", "MH"}}
	regions := []string{"Europe", "Americas", "Asia", "Oceania"}
	state := uint64(7)
	next := func() float64 {
		state = state*6364136223846793005 + 1442695040888963407
		return float64(state>>33) / float64(uint64(1)<<31)
	}
	amount := func(value int) string {
		text := fmt.Sprintf("%d", value)
		for index := len(text) - 3; index > 0; index -= 3 {
			text = text[:index] + "," + text[index:]
		}
		return "$" + text
	}
	rows := make([]map[string]any, 0, 24)
	for index := 0; index < 24; index++ {
		statusValue := next()
		status := "Review"
		if statusValue < 1.0/3 {
			status = "Live"
		} else if statusValue < 2.0/3 {
			status = "Draft"
		}
		points := make([]string, 8)
		for point := range points {
			points[point] = fmt.Sprintf("%d,%d", point*12, int(math.Round((1-next())*20)))
		}
		region := regions[int(next()*4)]
		revenue := int(math.Round(next()*90000 + 8000))
		growth := (next() - .35) * 40
		growthText := fmt.Sprintf("%.1f%%", growth)
		growthText = strings.Replace(growthText, "-", "−", 1)
		quota := int(math.Round(next() * 100))
		person := people[index%len(people)]
		growthTone := "success"
		if growth < 0 {
			growthTone = "danger"
		}
		rows = append(rows, map[string]any{"Initials": person.initials, "Cells": []string{person.name, status, region, amount(revenue), growthText, "", ""}, "Trend": strings.Join(points, " "), "Quota": quota, "GrowthTone": growthTone})
	}
	sort.SliceStable(rows, func(left, right int) bool {
		return rows[left]["Cells"].([]string)[2] < rows[right]["Cells"].([]string)[2]
	})
	return rows
}

func financeBookLevels(mid float64) ([]map[string]any, []map[string]any) {
	bids, asks := make([]map[string]any, 12), make([]map[string]any, 12)
	for index := range bids {
		size := 320 + index*95
		bids[index] = map[string]any{"Cells": []string{fmt.Sprintf("%.2f", mid-.05*float64(index+1)), fmt.Sprintf("%d", size)}, "Level": fmt.Sprintf("%d", 12-index)}
		asks[index] = map[string]any{"Cells": []string{fmt.Sprintf("%.2f", mid+.05*float64(index+1)), fmt.Sprintf("%d", 280+index*90)}, "Level": fmt.Sprintf("%d", index+1)}
	}
	return bids, asks
}

// advancedDataCases gives the gallery one independent caller-data instance for every data-family primary.
func advancedDataCases() []AdvancedCase {
	stories := map[string][]string{
		"data":      {"Badge", "Tag", "Avatar", "AvatarGroup", "Statistic", "DescriptionList", "PropertyGrid", "Timeline", "ActivityFeed", "Changelog", "Carousel", "Gallery", "BeforeAfter", "Watermark", "QRCode", "Meter", "Stars", "Comparison"},
		"lists":     {"List", "SelectableList", "SortableList", "SwipeableListItem", "VirtualList", "InfiniteList", "GroupedList", "Tree", "CheckboxTree", "TreeSelect", "Outline", "FileTree", "DirectoryListing"},
		"tables":    {"Table", "DataTable", "ColumnPinning", "RowExpansion", "RowGrouping", "DataGrid", "Spreadsheet", "TreeTable", "PivotTable", "VirtualTable", "HeatmapTable"},
		"charts":    {"LineChart", "AreaChart", "PieChart", "ScatterChart", "RadarChart", "HeatmapChart", "Treemap", "SankeyChart", "WaterfallChart", "Histogram", "GanttChart", "NetworkGraph", "Bullet Chart", "RealtimeChart"},
		"finance":   {"CandlestickChart", "IndicatorOverlay", "DrawingTools", "DepthChart", "MarketProfile", "RenkoChart", "MultiChartLayout", "Ticker", "OrderBook", "TimeAndSales", "OrderEntry", "PositionTable", "LeverageSlider", "OptionChain", "Watchlist", "MarketHeatmap", "Screener", "MarketOverview", "EconomicCalendar", "PortfolioSummary", "DividendTable", "CurrencyConverter"},
		"dashboard": {"Dashboard Grid", "UptimeBar", "AlertList", "EventStream"},
	}
	base := map[string]any{
		"Title": "Caller supplied <record>", "Label": "Caller label", "Value": "42", "Description": "Caller supplied detail", "Caption": "Caller supplied chart caption",
		"Columns": []map[string]any{{"Label": "Name"}, {"Label": "State"}},
		"Rows":    []map[string]any{{"Cells": []string{"Ari Lopez", "Ready"}}, {"Cells": []string{"Grace Hopper", "Review"}}, {"Cells": []string{"Katherine Johnson", "Ready"}}, {"Cells": []string{"Lin Tan", "Draft"}}, {"Cells": []string{"Owen Price", "Paused"}}},
		"Items":   []map[string]any{{"Value": "ari", "Label": "Ari Lopez", "Description": "Design review", "Leading": "AL", "Trailing": "2m", "Selected": true, "Time": "2m ago"}, {"Value": "grace", "Label": "Grace Hopper", "Description": "Build deployed", "Leading": "GH", "Trailing": "9m", "Time": "9m ago"}, {"Value": "katherine", "Label": "Katherine Johnson", "Description": "Dataset ready", "Leading": "KJ", "Trailing": "18m", "Time": "18m ago"}, {"Value": "lin", "Label": "Lin Tan", "Description": "Draft updated", "Leading": "LT", "Trailing": "1h", "Time": "1h ago"}, {"Value": "owen", "Label": "Owen Price", "Description": "Awaiting approval", "Leading": "OP", "Trailing": "2h", "Time": "2h ago"}},
		"Fields":  []map[string]any{{"Name": "title", "Label": "Title", "Value": "Caller record", "Required": true}},
		"Cells":   []map[string]any{{"Name": "a1", "Label": "A1", "Value": "A1", "Level": "2"}, {"Name": "b1", "Label": "B1", "Value": "B1", "Level": "4"}}, "Points": "0,90 80,60 160,70 240,25 320,40", "Samples": 2,
		"Symbol": "ACME", "Quantity": 3, "Price": "18.50", "From": "USD", "Max": 8, "Min": 0, "Risk": 42,
	}
	var cases []AdvancedCase
	for chapter, names := range stories {
		for index, name := range names {
			props := make(map[string]any, len(base))
			for key, value := range base {
				props[key] = value
			}
			props["Title"] = fmt.Sprintf("%s %s", chapter, name)
			switch name {
			case "Badge":
				props["Label"], props["Items"], props["Counts"] = "Badge variants", []map[string]any{{"Label": "Draft", "Tone": "neutral"}, {"Label": "Beta", "Tone": "accent"}, {"Label": "Live", "Tone": "success", "Dot": true}, {"Label": "Review", "Tone": "warning", "Dot": true}, {"Label": "Failed", "Tone": "danger", "Dot": true}, {"Label": "New", "Tone": "info"}}, []map[string]any{{"Icon": "♧", "Count": "3", "Tone": "accent"}, {"Icon": "▣", "Count": "99+", "Tone": "accent"}, {"Icon": "♧", "Dot": true, "Tone": "accent"}, {"Count": "7", "Tone": "accent"}}
			case "Tag":
				props["Label"], props["TagRows"] = "Tag variants", []any{
					[]map[string]any{{"Value": "research", "Label": "Research"}, {"Value": "pinned", "Label": "Pinned", "Icon": "⌖"}, {"Value": "urgent", "Label": "Urgent", "Icon": "!", "Tone": "danger"}},
					[]map[string]any{{"Value": "design", "Label": "Design", "Removable": true}, {"Value": "motion", "Label": "Motion", "Removable": true}, {"Value": "accessibility", "Label": "Accessibility", "Removable": true}, {"Value": "rust", "Label": "Rust", "Removable": true}},
				}
			case "Avatar":
				props["Label"], props["AvatarRows"] = "Avatar variants", []any{
					[]map[string]any{{"Label": "Kofi Mensah", "Initials": "KM", "Size": "xs", "Caption": "xs"}, {"Label": "Kofi Mensah", "Initials": "KM", "Size": "sm", "Caption": "sm"}, {"Label": "Kofi Mensah", "Initials": "KM", "Size": "md", "Caption": "md"}, {"Label": "Kofi Mensah", "Initials": "KM", "Size": "lg", "Caption": "lg"}, {"Label": "Kofi Mensah", "Initials": "KM", "Size": "xl", "Caption": "xl"}},
					[]map[string]any{{"Label": "Dunes", "ImageURL": "/assets/sample.svg", "ImageAlt": "Dunes photograph", "Size": "lg", "Caption": "picture"}, {"Label": "Aiko Tanaka", "Initials": "AT", "Presence": "online", "Size": "lg", "Caption": "online"}, {"Label": "Lucía Romero", "Initials": "LR", "Presence": "away", "Size": "lg", "Caption": "away"}, {"Label": "Ben Carter", "Initials": "BC", "Presence": "busy", "Size": "lg", "Caption": "busy"}, {"Label": "Studio North", "Initials": "SN", "Size": "lg", "Caption": "team"}, {"Label": "Build bot", "Icon": "◉", "Size": "lg", "Caption": "bot"}},
				}
			case "AvatarGroup":
				people := []map[string]any{{"Label": "Ada Lovelace", "Initials": "AL"}, {"Label": "Alan Turing", "Initials": "AT"}, {"Label": "Grace Hopper", "Initials": "GH"}, {"Label": "Katherine Johnson", "Initials": "KJ"}, {"Label": "Tim Berners-Lee", "Initials": "TB"}, {"Label": "Radia Perlman", "Initials": "RP"}, {"Label": "Sophie Wilson", "Initials": "SW"}, {"Label": "Margaret Hamilton", "Initials": "MH"}}
				props["Label"], props["Groups"], props["Assignment"] = "Avatar group variants", []map[string]any{{"Items": people[:4], "More": 4, "Size": "md"}, {"Items": people[:5], "More": 3, "Size": "sm"}}, map[string]any{"Person": "Grace Hopper", "Team": "Dune Studio"}
			case "Statistic":
				props["Label"], props["Statistics"], props["Metrics"] = "Statistic variants", []map[string]any{{"Label": "Revenue", "Value": "$48,210", "Trend": "+12.4%", "Tone": "success", "Icon": "$", "Caption": "This month, against the last"}, {"Label": "Active people", "Value": "3,812", "Trend": "+3.1%", "Tone": "success", "Icon": "♙", "Caption": "Seen in the last seven days"}, {"Label": "p95 latency", "Value": "212 ms", "Trend": "−8.0%", "Tone": "success", "Icon": "◴", "Caption": "Across all regions"}}, []map[string]any{{"Label": "Uptime", "Value": "99.98%"}, {"Label": "In queue", "Value": "14"}, {"Label": "Change", "Value": "—", "Trend": "Flat", "Tone": "muted"}}
			case "DescriptionList":
				props["Label"], props["Columns"] = "Description list variants", []map[string]any{{"Layout": "lined", "Items": []map[string]any{{"Label": "Status", "Value": "● Paid"}, {"Label": "Customer", "Value": "Katherine Johnson"}, {"Label": "Amount", "Value": "$1,280.00"}, {"Label": "Placed", "Value": "Sep 24, 2026 · 14:32"}, {"Label": "Reference", "Value": "ORD-2419"}}}, {"Layout": "stacked", "Items": []map[string]any{{"Label": "Ship to", "Value": "12 Harbour Street, Wellington 6011, New Zealand"}, {"Label": "Delivery", "Value": "Standard, three to five days"}}}}
			case "PropertyGrid":
				props["Groups"], props["Preview"] = []map[string]any{{"Label": "Layout", "Fields": []map[string]any{{"Name": "width", "Label": "Width", "Type": "number", "Value": "240"}, {"Name": "height", "Label": "Height", "Type": "number", "Value": "144"}, {"Name": "direction", "Label": "Direction", "Options": []map[string]any{{"Value": "row", "Label": "Row", "Selected": true}, {"Value": "column", "Label": "Column"}}}}}, {"Label": "Appearance", "Fields": []map[string]any{{"Name": "opacity", "Label": "Opacity", "Range": true, "Min": 0, "Max": 1, "Step": "0.01", "Value": "0.8"}, {"Name": "visible", "Label": "Visible", "Switch": true, "Checked": true}}}, {"Label": "Export", "Collapsed": true, "Fields": []map[string]any{{"Name": "scale", "Label": "Scale", "Type": "number", "Value": "2"}}}}, true
			case "Timeline":
				props["Timelines"] = []map[string]any{{"Items": []map[string]any{{"Time": "14:02", "Label": "Build started", "Detail": "main at 4f2a9c1, by Radia Perlman", "Icon": "↪"}, {"Time": "14:06", "Label": "Tests passed", "Detail": "412 tests in 3 min 12 s", "Icon": "✓", "Tone": "success"}, {"Time": "14:09", "Label": "Deployed to staging", "Icon": "↗", "Tone": "info"}, {"Label": "Promote to production", "Detail": "Waiting for approval", "Icon": "⌛", "Tone": "warning"}}}, {"Items": []map[string]any{{"Time": "Jan 12", "Label": "Kickoff"}, {"Time": "Feb 3", "Label": "Design review", "Detail": "Type scale settled; spacing loosened by one step."}, {"Time": "Mar 18", "Label": "Beta", "Tone": "success"}, {"Time": "Apr 30", "Label": "Launch", "Detail": "Planned", "Tone": "warning"}}}}
			case "ActivityFeed":
				props["Items"] = []map[string]any{{"Time": "3 minutes ago", "Actor": "Grace Hopper", "Initials": "GH", "Verb": "commented on", "Object": "Design review", "Detail": "The cards finally breathe. Ship it."}, {"Time": "2 hours ago", "Actor": "Build bot", "Initials": "BB", "Verb": "deployed", "Object": "v0.4.0"}, {"Time": "Yesterday", "Actor": "Alan Turing", "Initials": "AT", "Verb": "merged", "Object": "Timeline component"}, {"Time": "3 days ago", "Actor": "Ada Lovelace", "Initials": "AL", "Verb": "created", "Object": "Q4 roadmap"}}
			case "Changelog":
				props["Releases"] = []map[string]any{{"Version": "2.4.0", "Date": "Sep 25, 2026", "Latest": true, "Summary": "Faster search, and a calmer sidebar.", "Changes": []map[string]any{{"Kind": "Added", "Tone": "success", "Items": []string{"Search inside attachments.", "Pin a note to the sidebar."}}, {"Kind": "Changed", "Tone": "info", "Items": []string{"The sidebar folds with a narrow window."}}, {"Kind": "Fixed", "Tone": "neutral", "Items": []string{"Pasting a table keeps its borders."}}}}, {"Version": "2.3.1", "Date": "Sep 9, 2026", "Changes": []map[string]any{{"Kind": "Fixed", "Tone": "neutral", "Items": []string{"Sync resumes after sleep."}}, {"Kind": "Security", "Tone": "danger", "Items": []string{"Shared links expire when they should."}}}}, {"Version": "2.3.0", "Date": "Aug 28, 2026", "Changes": []map[string]any{{"Kind": "Added", "Tone": "success", "Items": []string{"Templates for new notes."}}, {"Kind": "Deprecated", "Tone": "warning", "Items": []string{"The legacy export format."}}, {"Kind": "Removed", "Tone": "danger", "Items": []string{"The old toolbar."}}}}}
			case "Tree":
				props["Name"], props["Items"] = "project_node", []map[string]any{
					{"Value": "app", "Label": "ely-notes", "Folder": true, "Open": true, "Children": []map[string]any{
						{"Value": "src", "Label": "src", "Folder": true, "Open": true, "Children": []map[string]any{
							{"Value": "main", "Label": "main.rs", "Icon": "rust"},
							{"Value": "ui", "Label": "ui", "Folder": true, "Open": true, "Children": []map[string]any{
								{"Value": "sidebar", "Label": "sidebar.rs", "Icon": "rust"},
								{"Value": "editor", "Label": "editor.rs", "Icon": "rust"},
							}},
						}},
						{"Value": "assets", "Label": "assets", "Folder": true, "Children": []map[string]any{
							{"Value": "logo", "Label": "logo.svg", "Icon": "image"},
							{"Value": "font", "Label": "Inter.ttf", "Icon": "font"},
						}},
						{"Value": "readme", "Label": "README.md", "Icon": "text"},
						{"Value": "cargo", "Label": "Cargo.toml", "Icon": "config"},
					}},
				}
			case "FileTree":
				props["Name"], props["Items"] = "file_path", []map[string]any{
					{"Value": "assets", "Label": "assets", "Folder": true, "Open": true, "Children": []map[string]any{
						{"Value": "logo", "Label": "logo.svg", "Icon": "image"},
						{"Value": "font", "Label": "Inter.ttf", "Icon": "font"},
					}},
					{"Value": "src", "Label": "src", "Folder": true, "Open": true, "Children": []map[string]any{
						{"Value": "app", "Label": "app.rs", "Icon": "rust"},
						{"Value": "ui", "Label": "ui", "Folder": true, "Open": true, "Children": []map[string]any{
							{"Value": "sidebar", "Label": "sidebar.rs", "Icon": "rust", "Status": "M"},
							{"Value": "editor", "Label": "editor.rs", "Icon": "rust"},
						}},
						{"Value": "sync", "Label": "sync", "Folder": true, "Children": []map[string]any{
							{"Value": "cloud", "Label": "cloud.rs", "Icon": "rust", "Status": "A"},
						}},
					}},
					{"Value": "license", "Label": "LICENSE", "Icon": "text", "Status": "D"},
					{"Value": "readme", "Label": "README.md", "Icon": "text"},
					{"Value": "test", "Label": "editing.rs", "Icon": "rust", "Status": "U"},
				}
			case "CheckboxTree":
				props["Name"], props["Items"] = "granted", []map[string]any{
					{"Value": "documents", "Label": "Documents", "Folder": true, "Open": true, "Children": []map[string]any{{"Value": "read", "Label": "Read", "Selected": true}, {"Value": "write", "Label": "Write"}}},
					{"Value": "billing", "Label": "Billing", "Folder": true, "Open": true, "Children": []map[string]any{{"Value": "invoices", "Label": "See invoices"}, {"Value": "plan", "Label": "Change the plan"}}},
				}
			case "TreeSelect":
				props["Name"], props["Items"] = "team", []map[string]any{
					{"Value": "design", "Label": "Design", "Folder": true, "Children": []map[string]any{{"Value": "brand", "Label": "Brand"}, {"Value": "product", "Label": "Product"}}},
					{"Value": "engineering", "Label": "Engineering", "Folder": true, "Children": []map[string]any{{"Value": "platform", "Label": "Platform"}, {"Value": "apps", "Label": "Apps", "Selected": true, "Children": []map[string]any{{"Value": "ios", "Label": "iOS"}, {"Value": "macos", "Label": "macOS"}}}}},
					{"Value": "operations", "Label": "Operations", "Folder": true},
				}
			case "GroupedList":
				props["Groups"] = []map[string]any{{"Label": "A", "Items": []map[string]any{{"Value": "ada", "Label": "Ada Lovelace", "Leading": "AL", "LeadingStyle": "avatar"}, {"Value": "alan", "Label": "Alan Turing", "Leading": "AT", "LeadingStyle": "avatar"}, {"Value": "aiko", "Label": "Aiko Tanaka", "Leading": "AT", "LeadingStyle": "avatar"}}}, {"Label": "B", "Items": []map[string]any{{"Value": "barbara", "Label": "Barbara Liskov", "Leading": "BL", "LeadingStyle": "avatar"}, {"Value": "brian", "Label": "Brian Kernighan", "Leading": "BK", "LeadingStyle": "avatar"}}}}
			case "Outline":
				props["Items"] = []map[string]any{{"Value": "introduction", "Label": "Introduction", "Level": 1, "Number": "1"}, {"Value": "installation", "Label": "Installation", "Level": 2, "Number": "1.1", "Selected": true}, {"Value": "requirements", "Label": "Requirements", "Level": 3, "Number": "1.1.1"}, {"Value": "quick-start", "Label": "Quick start", "Level": 2, "Number": "1.2"}, {"Value": "components", "Label": "Components", "Level": 1, "Number": "2"}, {"Value": "buttons", "Label": "Buttons", "Level": 2, "Number": "2.1"}, {"Value": "forms", "Label": "Forms", "Level": 2, "Number": "2.2"}, {"Value": "theming", "Label": "Theming", "Level": 1, "Number": "3"}}
			case "SelectableList":
				props["Multiple"], props["ListStyle"], props["Items"] = true, "selectable", []map[string]any{{"Value": "brief", "Label": "Brief.pdf", "Leading": "▧", "Trailing": "2.4 MB"}, {"Value": "plan", "Label": "Q4 plan.key", "Leading": "▧", "Trailing": "18 MB", "Selected": true}, {"Value": "notes", "Label": "Interview notes.md", "Leading": "▧", "Trailing": "12 KB"}, {"Value": "budget", "Label": "Budget.numbers", "Leading": "▧", "Trailing": "640 KB"}, {"Value": "logo", "Label": "Logo.svg", "Leading": "▧", "Trailing": "8 KB"}}
			case "List":
				props["ListStyle"], props["Items"] = "divided", []map[string]any{{"Value": "grace", "Label": "Grace Hopper", "Description": "Design review: the cards finally breathe.", "Leading": "GH", "LeadingStyle": "avatar", "Trailing": "09:41"}, {"Value": "inbox", "Label": "Inbox", "Leading": "▣", "Trailing": "12"}, {"Value": "drafts", "Label": "Drafts", "Description": "Two unsent", "Leading": "▤", "Trailing": "● Synced"}, {"Value": "archive", "Label": "Archive", "Description": "Moving to cold storage", "Leading": "▧", "Disabled": true}}
			case "SortableList":
				props["Items"] = []map[string]any{{"Value": "morning-light", "Label": "Morning light", "Trailing": "1"}, {"Value": "harbour", "Label": "Harbour", "Trailing": "2"}, {"Value": "low-tide", "Label": "Low tide", "Trailing": "3"}, {"Value": "dunes", "Label": "Dunes", "Trailing": "4"}, {"Value": "evening", "Label": "Evening", "Trailing": "5"}}
			case "SwipeableListItem":
				props["Status"], props["Items"] = "Nothing done yet.", []map[string]any{{"Value": "ada", "Label": "Ada Lovelace", "Description": "The engine notes, annotated", "Leading": "AL", "Actions": []map[string]any{{"Value": "archive", "Label": "Archive"}, {"Value": "delete", "Label": "Delete", "Tone": "danger"}}}, {"Value": "alan", "Label": "Alan Turing", "Description": "On computable numbers", "Leading": "AT", "Actions": []map[string]any{{"Value": "archive", "Label": "Archive"}, {"Value": "delete", "Label": "Delete", "Tone": "danger"}}}}
			case "VirtualList":
				props["Total"], props["Start"], props["End"], props["Items"] = 10000, 1, 8, []map[string]any{{"Value": "row-1", "Label": "Row 1", "Description": "Every seventh row carries a second line, so heights differ."}, {"Value": "row-2", "Label": "Row 2"}, {"Value": "row-3", "Label": "Row 3"}, {"Value": "row-4", "Label": "Row 4"}, {"Value": "row-5", "Label": "Row 5"}, {"Value": "row-6", "Label": "Row 6"}, {"Value": "row-7", "Label": "Row 7"}, {"Value": "row-8", "Label": "Row 8", "Description": "Every seventh row carries a second line, so heights differ."}}
			case "DirectoryListing":
				props["Path"], props["Items"] = []map[string]any{{"Value": "Macintosh HD", "Label": "Macintosh HD", "Icon": "▣"}, {"Value": "Users", "Label": "Users"}, {"Value": "grace", "Label": "grace"}, {"Value": "Documents", "Label": "Documents"}}, []map[string]any{{"Value": "Projects", "Label": "Projects", "Folder": true, "Icon": "▾", "Size": "", "Modified": "3 hours ago"}, {"Value": "Receipts", "Label": "Receipts", "Folder": true, "Icon": "▾", "Size": "", "Modified": "10 days ago"}, {"Value": "budget", "Label": "Budget 2026.numbers", "Icon": "▧", "Size": "2.3 MB", "Modified": "1 day ago"}, {"Value": "letter", "Label": "Letter.pages", "Icon": "▤", "Size": "410 KB", "Modified": "5 hours ago"}, {"Value": "scan", "Label": "Scan 12.pdf", "Icon": "▥", "Size": "1.1 MB", "Modified": "5 days ago"}, {"Value": "notes", "Label": "notes.txt", "Icon": "▹", "Size": "3.2 KB", "Modified": "1 hour ago"}}
			case "InfiniteList":
				messages := make([]map[string]any, 12)
				for i := range messages {
					messages[i] = map[string]any{"Value": fmt.Sprintf("message-%d", i+1), "Label": fmt.Sprintf("Message %d", i+1)}
				}
				props["Cursor"], props["Status"], props["Items"] = "caller-next-page", "Ready to load more", messages
			case "Meter":
				props["Max"], props["Value"], props["ValueText"] = 100, 42, "42%"
				props["Label"], props["Gauges"], props["UsageLabel"], props["UsageParts"] = "Storage", []map[string]any{{"Label": "CPU", "Value": "38", "Suffix": "%", "Percent": 38}, {"Label": "Temperature", "Value": "54", "Suffix": "°C", "Percent": 54}}, "Storage use", []map[string]any{{"Label": "Apps", "Value": 42, "Text": "42 GB", "Tone": "info"}, {"Label": "Photos", "Value": 82, "Text": "82 GB", "Tone": "success"}, {"Label": "Documents", "Value": 23, "Text": "23 GB", "Tone": "warning"}}
			case "Carousel":
				props["Items"] = []map[string]any{{"Value": "editorial", "Label": "Editorial study", "ImageURL": "/assets/sample.svg", "ImageAlt": "Editorial geometric study", "Selected": true}, {"Value": "contrast", "Label": "Contrast study", "ImageURL": "/assets/sample-before.svg", "ImageAlt": "Contrast geometric study"}, {"Value": "architecture", "Label": "Architecture study", "ImageURL": "/assets/ely/native-architecture.svg", "ImageAlt": "Architecture illustration"}, {"Value": "motion", "Label": "Motion study", "ImageURL": "/assets/sample.gif", "ImageAlt": "Animated sample study"}}
			case "Gallery":
				props["Items"] = []map[string]any{{"Value": "editorial", "Label": "Editorial study", "ImageURL": "/assets/sample.svg", "ImageAlt": "Editorial geometric study"}, {"Value": "contrast", "Label": "Contrast study", "ImageURL": "/assets/sample-before.svg", "ImageAlt": "Contrast geometric study"}, {"Value": "architecture", "Label": "Architecture study", "ImageURL": "/assets/ely/native-architecture.svg", "ImageAlt": "Architecture illustration"}, {"Value": "motion", "Label": "Motion study", "ImageURL": "/assets/sample.gif", "ImageAlt": "Animated sample study"}, {"Value": "editorial-detail", "Label": "Editorial detail", "ImageURL": "/assets/sample.svg", "ImageAlt": "Editorial geometric detail"}, {"Value": "architecture-detail", "Label": "Architecture detail", "ImageURL": "/assets/ely/native-architecture.svg", "ImageAlt": "Architecture illustration detail"}}

			case "LineChart", "RealtimeChart":
				props["GridPath"], props["Points"], props["ViewBox"] = "M0 100H320", "0,90 80,60 160,75 240,30 320,45", "0 0 320 120"
			case "AreaChart":
				props["AreaPath"], props["Bars"] = "M0 100L0 80 100 50 200 70 320 20V100Z", []map[string]any{{"X": 30, "Y": 65, "Width": 24, "Height": 35}}
			case "PieChart":
				props["Segments"] = []map[string]any{{"Label": "Alpha", "Path": "M60 60L60 5A55 55 0 0 1 112 76Z"}, {"Label": "Beta", "Path": "M60 60L112 76A55 55 0 0 1 18 88Z"}}
			case "ScatterChart":
				props["Points"] = []map[string]any{{"X": 30, "Y": 80, "R": 5, "Label": "Alpha"}, {"X": 180, "Y": 35, "R": 8, "Label": "Beta"}}
			case "RadarChart":
				props["GridPoints"], props["Points"] = "100,5 190,70 155,145 45,145 10,70", "100,28 165,76 140,120 60,115 35,72"
			case "Treemap":
				props["Items"] = []map[string]any{{"Label": "Alpha", "X": 0, "Y": 0, "Width": 180, "Height": 120, "TextX": 8, "TextY": 20}, {"Label": "Beta", "X": 182, "Y": 0, "Width": 138, "Height": 120, "TextX": 190, "TextY": 20}}
			case "SankeyChart":
				props["Links"], props["Nodes"] = []map[string]any{{"Path": "M20 30C100 30 140 45 220 45V75C140 75 100 90 20 90Z"}}, []map[string]any{{"Label": "In", "X": 0, "Y": 25, "Width": 20, "Height": 70, "LabelY": 18}}
			case "WaterfallChart", "Histogram":
				props["Bars"] = []map[string]any{{"X": 20, "Y": 50, "Width": 30, "Height": 50}, {"X": 70, "Y": 25, "Width": 30, "Height": 75}}
			case "NetworkGraph":
				props["Edges"], props["Nodes"] = []map[string]any{{"X1": 30, "Y1": 60, "X2": 180, "Y2": 35}}, []map[string]any{{"X": 30, "Y": 60, "R": 10, "Label": "A", "LabelX": 45, "LabelY": 60}}
			case "CandlestickChart":
				props["Candles"], props["Types"], props["Ranges"], props["ViewBox"] = []map[string]any{{"X": 40, "High": 20, "Low": 95, "BodyX": 32, "Open": 45, "Width": 16, "BodyHeight": 30, "Direction": "up"}}, []map[string]any{{"Value": "candle", "Label": "Candle"}}, []map[string]any{{"Value": "1d", "Label": "1 day"}}, "0 0 320 120"
			case "DepthChart":
				props["BidPath"], props["AskPath"], props["ViewBox"] = "M0 100L160 40V100Z", "M160 40L320 100V100H160Z", "0 0 320 120"
			case "OrderBook":
				props["Columns"], props["Spread"] = []map[string]any{{"Label": "Price"}, {"Label": "Size"}}, "187.20 bid  ·  187.30 ask  ·  10¢ spread"
				props["Bids"], props["Asks"] = financeBookLevels(187.25)
				props["BidTotal"], props["AskTotal"], props["BidShare"], props["AskShare"] = "6,720 bid", "6,540 ask", 51, 49
				props["Level2"] = []map[string]any{{"Venue": "NYSE", "Bid": "187.20", "BidSize": "311", "Ask": "187.30", "AskSize": "674"}, {"Venue": "ARCA", "Bid": "187.20", "BidSize": "641", "Ask": "187.30", "AskSize": "518"}, {"Venue": "BATS", "Bid": "187.15", "BidSize": "564", "Ask": "187.35", "AskSize": "857"}, {"Venue": "EDGX", "Bid": "187.15", "BidSize": "139", "Ask": "187.35", "AskSize": "376"}, {"Venue": "IEX", "Bid": "187.10", "BidSize": "480", "Ask": "187.40", "AskSize": "697"}, {"Venue": "NSDQ", "Bid": "187.10", "BidSize": "898", "Ask": "187.40", "AskSize": "756"}}
			case "DrawingTools":
				props["Tools"], props["Drawings"], props["ViewBox"] = []map[string]any{{"Value": "line", "Label": "Line", "Selected": true}, {"Value": "erase", "Label": "Erase", "Selected": false}}, []map[string]any{{"Path": "M30 90L250 20"}}, "0 0 320 120"
			case "GanttChart":
				props["Tasks"] = []map[string]any{{"Label": "Research", "Left": 10, "Width": 45, "Detail": "Review"}}
			case "IndicatorOverlay":
				props["Paths"], props["Indicators"] = []map[string]any{{"Path": "M0 80L160 45L320 55"}}, []map[string]any{{"Value": "sma", "Label": "SMA"}}
			case "MultiChartLayout":
				props["Charts"] = []map[string]any{{"Label": "ACME", "ViewBox": "0 0 320 120", "Points": "0,90 160,45 320,60"}}
			case "Ticker":
				props["Items"] = []map[string]any{{"Label": "ELY", "Value": "$182.79", "Change": "+1.84%", "Tone": "success", "ViewBox": "0 0 120 40", "Points": "0,30 40,20 80,26 120,8"}, {"Label": "NOVA", "Value": "$63.59", "Change": "+0.71%", "Tone": "success", "ViewBox": "0 0 120 40", "Points": "0,24 40,30 80,14 120,18"}, {"Label": "ORBT", "Value": "$130.18", "Change": "−1.22%", "Tone": "danger", "ViewBox": "0 0 120 40", "Points": "0,12 40,18 80,20 120,34"}}
				props["Tape"] = []map[string]any{{"Label": "ELY", "Value": "187.24", "Change": "+1.24%", "Tone": "success"}, {"Label": "NOVA", "Value": "62.10", "Change": "−0.81%", "Tone": "danger"}, {"Label": "ORBIT", "Value": "131.52", "Change": "+2.03%", "Tone": "success"}, {"Label": "PINE", "Value": "27.33", "Change": "−1.52%", "Tone": "danger"}, {"Label": "QUILL", "Value": "88.05", "Change": "+0.41%", "Tone": "success"}, {"Label": "RIVER", "Value": "45.60", "Change": "0.00%", "Tone": "muted"}, {"Label": "SOLACE", "Value": "312.90", "Change": "+0.77%", "Tone": "success"}, {"Label": "TERRA", "Value": "9.84", "Change": "−3.12%", "Tone": "danger"}}
			case "Watchlist":
				props["Items"] = []map[string]any{{"Value": "ely", "Label": "ELY", "Description": "Ely Systems", "Leading": "●", "Trailing": "$182.79  +1.84%", "Selected": true}, {"Value": "nova", "Label": "NOVA", "Description": "Nova Energy", "Leading": "●", "Trailing": "$63.59  +0.71%"}, {"Value": "orbit", "Label": "ORBIT", "Description": "Orbit Freight", "Leading": "●", "Trailing": "$130.18  −1.22%"}, {"Value": "pine", "Label": "PINE", "Description": "Pine Foods", "Leading": "●", "Trailing": "$27.79  +0.32%"}, {"Value": "quill", "Label": "QUILL", "Description": "Quill Media", "Leading": "●", "Trailing": "$88.05  +0.41%"}, {"Value": "river", "Label": "RIVER", "Description": "River Health", "Leading": "●", "Trailing": "$45.62  +0.93%"}, {"Value": "solace", "Label": "SOLACE", "Description": "Solace Labs", "Leading": "●", "Trailing": "$316.23  +1.84%"}, {"Value": "terra", "Label": "TERRA", "Description": "Terra Mining", "Leading": "●", "Trailing": "$9.70  −3.96%"}}
				props["SymbolBadges"] = []map[string]any{{"Label": "ELY", "Venue": "NASDAQ"}, {"Label": "NOVA", "Venue": "NYSE"}, {"Label": "ORBIT", "Venue": "NYSE"}, {"Label": "PINE", "Venue": "NASDAQ"}}
			case "MarketHeatmap":
				props["Items"] = []map[string]any{{"Label": "ELY", "Value": "+1.84%", "Level": "5", "Span": "5"}, {"Label": "NOVA", "Value": "+0.71%", "Level": "4", "Span": "3"}, {"Label": "ORBT", "Value": "−1.22%", "Level": "2", "Span": "4"}, {"Label": "PINE", "Value": "+0.46%", "Level": "3", "Span": "3"}, {"Label": "RIVER", "Value": "−0.31%", "Level": "1", "Span": "3"}, {"Label": "TERRA", "Value": "+2.18%", "Level": "5", "Span": "4"}}
			case "MarketOverview":
				props["Status"] = map[string]any{"Label": "New York", "State": "Open", "Detail": "Closes in 2 h 14 min"}
				props["Items"] = []map[string]any{{"Label": "EGX 500", "Description": "Broad market", "Value": "5,812.40", "Change": "+0.71%", "Tone": "success"}, {"Label": "EGX Tech", "Description": "Technology", "Value": "19,440.10", "Change": "+0.22%", "Tone": "success"}, {"Label": "EGX Small", "Description": "Small companies", "Value": "2,231.80", "Change": "−0.16%", "Tone": "danger"}}
				props["Movers"] = []map[string]any{{"Label": "BIRCH", "Value": "18.92", "Change": "+2.66%", "Tone": "success"}, {"Label": "SOLACE", "Value": "317.08", "Change": "+2.12%", "Tone": "success"}, {"Label": "TERRA", "Value": "9.78", "Change": "−3.17%", "Tone": "danger"}, {"Label": "ORBIT", "Value": "126.28", "Change": "−2.03%", "Tone": "danger"}}
				props["Sessions"] = []map[string]any{{"Label": "Sydney", "Hours": "23:00–05:00", "State": "closed"}, {"Label": "Tokyo", "Hours": "00:00–06:00", "State": "closed"}, {"Label": "Hong Kong", "Hours": "01:30–08:00", "State": "closed"}, {"Label": "Frankfurt", "Hours": "07:00–15:30", "State": "open"}, {"Label": "London", "Hours": "08:00–16:30", "State": "open"}, {"Label": "New York", "Hours": "13:30–20:00", "State": "open"}}
			case "PortfolioSummary":
				props["Statistics"] = []map[string]any{{"Label": "Worth", "Value": "$136,200", "Trend": ""}, {"Label": "Today", "Value": "+$1,284", "Trend": "+0.95%", "Tone": "success"}, {"Label": "Since bought", "Value": "+$18,402", "Trend": "+15.3%", "Tone": "success"}, {"Label": "Cash", "Value": "$9,864", "Trend": ""}}
				props["Holdings"] = []map[string]any{{"Label": "ELY", "Value": 48210, "Text": "$48,210"}, {"Label": "SOLACE", "Value": 31050, "Text": "$31,050"}, {"Label": "Bonds", "Value": 26400, "Text": "$26,400"}, {"Label": "NOVA", "Value": 12480, "Text": "$12,480"}, {"Label": "PINE", "Value": 8196, "Text": "$8,196"}, {"Label": "Cash", "Value": 9864, "Text": "$9,864"}}
				props["Sentiment"] = map[string]any{"Label": "Sentiment", "Value": 64}
			case "MarketProfile":
				props["Items"] = []map[string]any{{"Label": "98.4", "Width": 60}}
			case "RenkoChart":
				props["Items"] = []map[string]any{{"Label": "Up", "Direction": "up"}}
			case "LeverageSlider":
				props["Value"], props["Max"], props["MarginUsed"], props["MarginTotal"], props["Risk"] = 5, 100, "$21,500", "$96,000", 13
			case "OrderEntry":
				props["Symbol"], props["Quantity"], props["Price"] = "ELY", 100, "187.20"
				props["OrderKinds"] = []map[string]any{{"Value": "market", "Label": "Market"}, {"Value": "limit", "Label": "Limit", "Selected": true}, {"Value": "stop", "Label": "Stop"}}
				props["QuickTrades"] = []map[string]any{{"Value": "sell", "Label": "Sell 100 ELY at 187.24"}, {"Value": "buy", "Label": "Buy 100 ELY at 187.26"}}
			case "Screener":
				props["Filters"] = []map[string]any{{"Name": "market", "Label": "Market", "Options": []map[string]any{{"Value": "all", "Label": "All"}}}}
				props["Columns"] = []map[string]any{{"Label": "Symbol"}, {"Label": "Sector"}, {"Label": "Last"}, {"Label": "Change"}, {"Label": "Volume"}}
				props["Rows"] = []map[string]any{{"Cells": []string{"ELY", "Energy", "$182.79", "+1.84%", "28.4k"}}, {"Cells": []string{"ORBT", "Transport", "$130.18", "−1.22%", "47.0k"}}, {"Cells": []string{"PINE", "Retail", "$77.28", "+0.55%", "84.5k"}}, {"Cells": []string{"RIVER", "Software", "$46.42", "−0.92%", "95.1k"}}}
			case "EconomicCalendar":
				props["Items"] = []map[string]any{{"Value": "tokyo-cpi", "Time": "01:30", "Label": "Tokyo core consumer prices", "Detail": "JP · medium impact", "Forecast": "2.3%", "Actual": "2.4%"}, {"Value": "ifo", "Time": "08:00", "Label": "Ifo business climate", "Detail": "DE · medium impact", "Forecast": "87.6", "Actual": "87.1"}, {"Value": "durable", "Time": "12:30", "Label": "Durable goods orders", "Detail": "US · medium impact", "Forecast": "0.5%", "Actual": "0.8%"}, {"Value": "claims", "Time": "12:30", "Label": "Initial jobless claims", "Detail": "US · high impact", "Forecast": "224K", "Actual": "—"}, {"Value": "homes", "Time": "14:00", "Label": "New home sales", "Detail": "US · low impact", "Forecast": "668K", "Actual": "—"}}
				props["Earnings"] = []map[string]any{{"Date": "Sep 28", "Symbol": "ELY", "Label": "Ely Systems", "When": "After close", "Estimate": "1.84", "Reported": "1.97"}, {"Date": "Sep 29", "Symbol": "NOVA", "Label": "Nova Energy", "When": "Before open", "Estimate": "0.62", "Reported": "0.55"}, {"Date": "Sep 30", "Symbol": "SOLACE", "Label": "Solace Labs", "When": "After close", "Estimate": "3.10", "Reported": "—"}, {"Date": "Oct 1", "Symbol": "QUILL", "Label": "Quill Media", "When": "Before open", "Estimate": "0.48", "Reported": "—"}}
				props["Stories"] = []map[string]any{{"Source": "Wire", "Time": "15:42", "Label": "Ely Systems lifts its outlook as cloud orders climb", "Symbols": "ELY", "Tone": "success"}, {"Source": "Markets Desk", "Time": "15:10", "Label": "Freight rates slide for a third week", "Symbols": "ORBIT · TERRA", "Tone": "danger"}, {"Source": "Wire", "Time": "14:36", "Label": "Nova Energy names a new chief financial officer", "Symbols": "NOVA", "Tone": "muted"}, {"Source": "Daily Brief", "Time": "13:58", "Label": "Solace Labs trial meets its main goal", "Symbols": "SOLACE", "Tone": "success"}}
			case "CurrencyConverter":
				props["Value"], props["Currencies"], props["From"], props["To"], props["Converted"] = 1000, []map[string]any{{"Value": "USD", "Label": "US dollar", "Rate": 1}, {"Value": "EUR", "Label": "Euro", "Rate": 1.09}, {"Value": "GBP", "Label": "Pound sterling", "Rate": 1.27}, {"Value": "KRW", "Label": "Korean won", "Rate": 0.00073}}, "USD", "EUR", "€917.43"
				props["Wallet"] = map[string]any{"Label": "Savings wallet", "Value": "0.8412 BTC", "Detail": "Available to transfer"}
				props["Transfers"] = []map[string]any{{"Label": "Salary", "Value": "+$6,250 USD", "State": "Settled"}, {"Label": "Card ending 4417", "Value": "−$86.40 USD", "State": "Pending"}, {"Label": "Wallet bc1q…yg3c", "Value": "+0.0421 BTC", "State": "Settled"}, {"Label": "Rent", "Value": "−$2,400 USD", "State": "Settled"}, {"Label": "Exchange withdrawal", "Value": "−500.00 EUR", "State": "Failed"}}
			case "Dashboard Grid":
				props["Filters"] = []map[string]any{{"Name": "window", "Label": "Window", "Options": []map[string]any{{"Value": "1h", "Label": "Last hour"}, {"Value": "24h", "Label": "Last 24 hours", "Selected": true}}}, {"Name": "environment", "Label": "Environment", "Options": []map[string]any{{"Value": "production", "Label": "Production", "Selected": true}, {"Value": "staging", "Label": "Staging"}}}}
				props["RefreshOptions"], props["RefreshAction"] = []map[string]any{{"Value": "30", "Label": "30 seconds", "Selected": true}, {"Value": "60", "Label": "1 minute"}}, "refresh-dashboard"
				props["Widgets"] = []map[string]any{{"Key": "requests", "Label": "Requests", "Subtitle": "per minute", "Value": "12,400", "X": 0, "Y": 0, "W": 4, "H": 2}, {"Key": "errors", "Label": "Errors", "Subtitle": "5xx share", "Value": "0.42%", "X": 4, "Y": 0, "W": 4, "H": 2}, {"Key": "cpu", "Label": "CPU", "Subtitle": "percent busy", "Value": "62%", "X": 8, "Y": 0, "W": 4, "H": 2}, {"Key": "latency", "Label": "Latency", "Subtitle": "p95, milliseconds", "Value": "182 ms", "ViewBox": "0 0 320 120", "Points": "0,88 80,64 160,76 240,28 320,44", "X": 0, "Y": 2, "W": 8, "H": 3}, {"Key": "saturation", "Label": "Saturation", "Subtitle": "memory in use", "Value": "81%", "X": 8, "Y": 2, "W": 4, "H": 3}}
			case "UptimeBar":
				props["Services"] = []map[string]any{{"Label": "API", "Value": "99.98%", "Samples": uptimeSamples(60, "ok", 41, "warning")}, {"Label": "Website", "Value": "99.92%", "Samples": uptimeSamples(60, "ok", 12, "error")}}
				props["StatusLabel"], props["ServiceStatus"], props["HealthChecks"] = "Some systems: degraded", []map[string]any{{"Label": "API", "Value": "99.98%", "State": "operational"}, {"Label": "Website", "Value": "99.92%", "State": "operational"}, {"Label": "Payments", "Value": "99.71%", "State": "degraded"}, {"Label": "Email", "Value": "", "State": "maintenance"}}, []map[string]any{{"Label": "GET /health", "State": "passing", "Detail": "ran 1m ago · 42 ms"}, {"Label": "Database", "State": "passing", "Detail": "ran 1m ago · 8 ms"}, {"Label": "Queue depth", "State": "warning", "Detail": "ran 2m ago"}, {"Label": "Payments provider", "State": "failing", "Detail": "ran 3m ago · 3020 ms"}, {"Label": "Search index", "State": "pending", "Detail": ""}}
			case "EventStream":
				props["Kinds"] = []map[string]any{{"Value": "deploy", "Label": "deploy", "Selected": true}, {"Value": "scale", "Label": "scale", "Selected": true}, {"Value": "alert", "Label": "alert", "Selected": true}, {"Value": "config", "Label": "config", "Selected": true}}
				props["Items"] = []map[string]any{{"Kind": "deploy", "Tone": "info", "Time": "2m ago", "Label": "web 1.8.2 rolled out to production"}, {"Kind": "config", "Tone": "accent", "Time": "7m ago", "Label": "feature flag new-checkout at 20%"}, {"Kind": "alert", "Tone": "danger", "Time": "12m ago", "Label": "Payments p95 over 2s"}, {"Kind": "scale", "Tone": "neutral", "Time": "41m ago", "Label": "worker scaled from 4 to 6 replicas"}, {"Kind": "deploy", "Tone": "info", "Time": "58m ago", "Label": "web 1.8.1 rolled out to production"}}
			case "AlertList":
				props["Items"] = []map[string]any{{"Key": "payments-p95", "Label": "Payments p95 over 2s", "Source": "payments · prometheus", "Since": "12m", "Severity": "danger", "State": "firing"}, {"Key": "queue-depth", "Label": "Queue depth rising", "Source": "worker · prometheus", "Since": "25m", "Severity": "warning", "State": "firing"}, {"Key": "db-disk", "Label": "Disk 85% on db-2", "Source": "db-2 · node exporter", "Since": "1h", "Severity": "warning", "State": "acknowledged"}, {"Key": "certificate", "Label": "Certificate renewed", "Source": "edge · cert-manager", "Since": "5h", "Severity": "info", "State": "resolved"}}
				props["Incident"] = map[string]any{"Severity": "danger", "Phase": "Monitoring", "Title": "Card payments fail for some customers", "Detail": "Began 48m ago · Payments, Checkout", "Updates": []map[string]any{{"Label": "Monitoring", "Detail": "Payments pass again; we watch error rates.", "Time": "9m ago"}, {"Label": "Identified", "Detail": "The provider's EU region is slow; traffic moves to the US region.", "Time": "30m ago"}, {"Label": "Investigating", "Detail": "Payments time out for about one in ten cards.", "Time": "46m ago"}}}
			case "Stars":
				props["Ratings"] = []map[string]any{{"Value": "4.6", "Max": 5, "Text": "4.6 · 1,284 reviews", "Stars": []map[string]any{{"Fill": 100}, {"Fill": 100}, {"Fill": 100}, {"Fill": 100}, {"Fill": 60}}}, {"Value": "3.0", "Max": 5, "Text": "3.0 · 18 reviews", "Stars": []map[string]any{{"Fill": 100}, {"Fill": 100}, {"Fill": 100}, {"Fill": 0}, {"Fill": 0}}}, {"Value": "8.5", "Max": 10, "Text": "8.5 of 10, small", "Size": "small", "Stars": []map[string]any{{"Fill": 100}, {"Fill": 100}, {"Fill": 100}, {"Fill": 100}, {"Fill": 100}, {"Fill": 100}, {"Fill": 100}, {"Fill": 100}, {"Fill": 50}, {"Fill": 0}}}}
			case "Comparison":
				props["Plans"] = []map[string]any{{"Label": "Free"}, {"Label": "Pro", "Featured": true}, {"Label": "Team"}}
				props["Features"] = []map[string]any{{"Label": "Storage", "Values": []string{"5 GB", "1 TB", "Unlimited"}}, {"Label": "Version history", "Values": []string{"—", "✓", "✓"}}, {"Label": "Shared spaces", "Values": []string{"—", "—", "✓"}}, {"Label": "Support", "Values": []string{"Community", "Email", "Priority"}}}
			case "Table":
				props["Columns"], props["Rows"], props["TableSource"] = []map[string]any{{"Label": "Name"}, {"Label": "Role"}, {"Label": "City"}}, []map[string]any{{"Cells": []string{"Ada Lovelace", "Analyst", "London"}}, {"Cells": []string{"Grace Hopper", "Engineer", "Arlington"}}, {"Cells": []string{"Katherine Johnson", "Mathematician", "Hampton"}}}, true
			case "DataTable":
				props["FilterOptions"] = []map[string]any{{"Value": "Live", "Label": "Live"}, {"Value": "Draft", "Label": "Draft"}, {"Value": "Review", "Label": "Review"}}
				props["Columns"] = []map[string]any{{"Label": "Owner"}, {"Label": "Status"}, {"Label": "Region"}, {"Label": "Revenue"}, {"Label": "Growth"}, {"Label": "Trend"}, {"Label": "Quota"}}
				props["Rows"], props["Paged"], props["PageSize"], props["FilterColumn"] = sourceOrders(), true, 8, 2
				props["Footer"] = []string{"Sum $1,286,800", "Avg 6.4%", "Avg 49"}
			case "ColumnPinning":
				props["Columns"] = []map[string]any{{"Label": "Team"}, {"Label": "Jan"}, {"Label": "Feb"}, {"Label": "Mar"}, {"Label": "Apr"}, {"Label": "May"}, {"Label": "Jun"}, {"Label": "Jul"}, {"Label": "Aug"}, {"Label": "Sep"}, {"Label": "Oct"}, {"Label": "Nov"}, {"Label": "Dec"}}
				props["Rows"] = []map[string]any{{"Cells": []string{"Design", "10", "23", "36", "49", "22", "35", "48", "21", "34", "47", "20", "33"}}, {"Cells": []string{"Platform", "17", "30", "43", "16", "29", "42", "15", "28", "41", "14", "27", "40"}}, {"Cells": []string{"Apps", "24", "37", "10", "23", "36", "49", "22", "35", "48", "21", "34", "47"}}, {"Cells": []string{"Growth", "31", "44", "17", "30", "43", "16", "29", "42", "15", "28", "41", "14"}}, {"Cells": []string{"Support", "38", "11", "24", "37", "10", "23", "36", "49", "22", "35", "48", "21"}}}
			case "VirtualTable":
				props["Columns"], props["VirtualTotal"], props["TableSource"] = []map[string]any{{"Label": "Event"}, {"Label": "Region"}, {"Label": "Value"}}, 100000, true
				props["Rows"] = []map[string]any{{"Cells": []string{"Event 1", "Europe", "873"}}, {"Cells": []string{"Event 2", "Americas", "586"}}, {"Cells": []string{"Event 3", "Asia", "79"}}, {"Cells": []string{"Event 4", "Oceania", "199"}}, {"Cells": []string{"Event 5", "Europe", "914"}}, {"Cells": []string{"Event 6", "Americas", "897"}}, {"Cells": []string{"Event 7", "Asia", "302"}}, {"Cells": []string{"Event 8", "Oceania", "160"}}, {"Cells": []string{"Event 9", "Europe", "409"}}}
			case "TimeAndSales":
				props["Columns"] = []map[string]any{{"Label": "Time"}, {"Label": "Price"}, {"Label": "Size"}, {"Label": "Venue"}}
				props["Rows"] = []map[string]any{{"Cells": []string{"13:24:18", "187.26", "4,200", "NYSE"}}, {"Cells": []string{"13:24:12", "187.24", "800", "NASDAQ"}}, {"Cells": []string{"13:24:07", "187.28", "1,100", "ARCA"}}, {"Cells": []string{"13:23:59", "187.21", "350", "IEX"}}, {"Cells": []string{"13:23:51", "187.25", "1,900", "NYSE"}}, {"Cells": []string{"13:23:45", "187.27", "620", "BATS"}}, {"Cells": []string{"13:23:39", "187.23", "2,400", "NASDAQ"}}, {"Cells": []string{"13:23:31", "187.26", "480", "ARCA"}}, {"Cells": []string{"13:23:20", "187.24", "930", "NYSE"}}, {"Cells": []string{"13:23:11", "187.22", "720", "IEX"}}}
				props["Ladder"] = []map[string]any{{"Price": "187.30", "Size": "150", "Tone": "danger"}, {"Price": "187.29", "Size": "280", "Tone": "danger"}, {"Price": "187.28", "Size": "420", "Tone": "danger"}, {"Price": "187.27", "Size": "760", "Tone": "danger"}, {"Price": "187.26", "Size": "1,900", "Tone": "danger"}, {"Price": "187.25", "Size": "last"}, {"Price": "187.24", "Size": "2,400", "Tone": "success"}, {"Price": "187.23", "Size": "1,100", "Tone": "success"}}
			case "PositionTable":
				props["Columns"] = []map[string]any{{"Label": "Symbol"}, {"Label": "Quantity"}, {"Label": "Average cost"}, {"Label": "Last"}, {"Label": "Value"}, {"Label": "Gain"}}
				props["Rows"] = []map[string]any{{"Cells": []string{"ELY", "300", "$171.40", "$187.25", "$56,175", "+$4,755"}}, {"Cells": []string{"NOVA", "−150", "$64.80", "$62.08", "−$9,312", "+$408"}}, {"Cells": []string{"ORBIT", "80", "$139.10", "$131.52", "$10,522", "−$606"}}, {"Cells": []string{"PINE", "1,200", "$25.90", "$27.33", "$32,796", "+$1,716"}}}
				props["Summary"] = []map[string]any{{"Label": "Today", "Value": "+$1,284.50"}, {"Label": "Open positions", "Value": "+$4,910.20"}, {"Label": "This month", "Value": "−$2,046.75"}}
				props["OrderColumns"], props["Orders"] = []map[string]any{{"Label": "Time"}, {"Label": "Symbol"}, {"Label": "Side"}, {"Label": "Quantity"}}, []map[string]any{{"Cells": []string{"09:04", "ELY", "Buy limit", "200"}}, {"Cells": []string{"09:11", "NOVA", "Sell stop", "150"}}, {"Cells": []string{"09:26", "QUILL", "Buy limit", "500"}}}
			case "DividendTable":
				props["Columns"] = []map[string]any{{"Label": "Ex date"}, {"Label": "Pay date"}, {"Label": "Amount"}, {"Label": "Yield"}, {"Label": "Frequency"}}
				props["Rows"] = []map[string]any{{"Cells": []string{"Nov 7, 2025", "Nov 14, 2025", "$0.24", "0.51%", "Quarterly"}}, {"Cells": []string{"Feb 6, 2026", "Feb 13, 2026", "$0.24", "0.51%", "Quarterly"}}, {"Cells": []string{"May 8, 2026", "May 15, 2026", "$0.26", "0.56%", "Quarterly"}}, {"Cells": []string{"Aug 7, 2026", "Aug 14, 2026", "$0.26", "0.56%", "Quarterly"}}}
				props["StatementColumns"], props["StatementRows"] = []map[string]any{{"Label": "Line"}, {"Label": "Q4 2025"}, {"Label": "Q1 2026"}, {"Label": "Q2 2026"}, {"Label": "Q3 2026"}}, []map[string]any{{"Cells": []string{"Revenue", "$18,420", "$19,106", "$20,388", "$21,950"}}, {"Cells": []string{"Products", "$11,210", "$11,380", "$11,902", "$12,430"}}, {"Cells": []string{"Services", "$7,210", "$7,726", "$8,486", "$9,520"}}, {"Cells": []string{"Cost of revenue", "−$7,920", "−$8,120", "−$8,480", "−$8,940"}}, {"Cells": []string{"Operating expenses", "−$5,880", "−$6,010", "−$6,240", "−$6,530"}}, {"Cells": []string{"Operating income", "$4,620", "$4,976", "$5,668", "$6,480"}}, {"Cells": []string{"Net income", "$3,710", "$3,990", "$4,560", "$5,190"}}}
			case "OptionChain":
				props["Symbol"], props["Expiry"] = "ELY", "May 16, 2027"
				props["Columns"] = []map[string]any{{"Label": "Call bid"}, {"Label": "Ask"}, {"Label": "Volume"}, {"Label": "Strike"}, {"Label": "Put bid"}, {"Label": "Ask"}, {"Label": "Volume"}}
				props["Rows"] = []map[string]any{{"Cells": []string{"17.17", "17.27", "400", "170.00", "0.30", "0.40", "1.4k"}}, {"Cells": []string{"12.24", "12.34", "520", "175.00", "0.66", "0.76", "1.2k"}}, {"Cells": []string{"7.31", "7.41", "640", "180.00", "1.02", "1.12", "1.0k"}}, {"Cells": []string{"3.18", "3.28", "760", "185.00", "2.38", "2.48", "881"}}, {"Cells": []string{"1.05", "1.15", "880", "190.00", "5.75", "5.85", "770"}}, {"Cells": []string{"0.48", "0.58", "1.0k", "195.00", "10.42", "10.52", "660"}}, {"Cells": []string{"0.30", "0.40", "1.1k", "200.00", "15.30", "15.40", "550"}}, {"Cells": []string{"0.30", "0.40", "1.2k", "205.00", "20.25", "20.35", "440"}}, {"Cells": []string{"0.30", "0.40", "1.4k", "210.00", "25.21", "25.31", "330"}}}
				props["Greeks"] = []map[string]any{{"Label": "Δ", "Value": "0.58"}, {"Label": "Γ", "Value": "0.04"}, {"Label": "Θ", "Value": "−0.08"}, {"Label": "Vega", "Value": "0.19"}}
			case "RowExpansion":
				props["Columns"] = []map[string]any{{"Label": "Task"}, {"Label": "Owner"}, {"Label": "State"}}
				props["Rows"] = []map[string]any{{"Key": "t1", "Cells": []string{"Draft the launch notes", "Ada Lovelace", "Doing"}}, {"Key": "t2", "Cells": []string{"Review the type scale", "Grace Hopper", "Done"}}, {"Key": "t3", "Cells": []string{"Record the demo", "Alan Turing", "Next"}}}
			case "DataGrid":
				props["Columns"] = []map[string]any{{"Label": "Item"}, {"Label": "Q1"}, {"Label": "Q2"}, {"Label": "Q3"}}
				props["Rows"] = []map[string]any{{"Cells": []string{"Rent", "2400", "2400", "2400"}}, {"Cells": []string{"Salaries", "18000", "18500", "19000"}}, {"Cells": []string{"Software", "1200", "1250", "1300"}}, {"Cells": []string{"Travel", "900", "400", "1600"}}}
			case "Spreadsheet":
				props["Columns"] = []map[string]any{{"Label": "A"}, {"Label": "B"}, {"Label": "C"}, {"Label": "D"}, {"Label": "E"}, {"Label": "F"}}
				props["Rows"] = []map[string]any{{"Label": "1", "Cells": []string{"Quarterly budget", "", "", "", "", ""}}, {"Label": "2", "Cells": []string{"Item", "Q1", "Q2", "Q3", "Q4", "Total"}}, {"Label": "3", "Cells": []string{"Rent", "2400", "2496", "2592", "2688", "10,176"}}, {"Label": "4", "Cells": []string{"Salaries", "18000", "18720", "19440", "20160", "76,320"}}, {"Label": "5", "Cells": []string{"Software", "1200", "1248", "1296", "1344", "5,088"}}, {"Label": "6", "Cells": []string{"Travel", "900", "936", "972", "1008", "3,816"}}, {"Label": "7", "Cells": []string{"Marketing", "3000", "3120", "3240", "3360", "12,720"}}, {"Label": "8", "Cells": []string{"Total", "25,500", "26,520", "27,540", "28,560", "108,120"}}, {"Label": "9", "Cells": []string{"Share of rent", "", "", "", "", "9.41"}}, {"Label": "10", "Cells": []string{"", "", "", "", "", ""}}}
			case "HeatmapTable":
				props["Caption"] = "ComparisonTable is Comparison, in Data Display."
				props["Columns"] = []map[string]any{{"Label": "6"}, {"Label": "9"}, {"Label": "12"}, {"Label": "15"}, {"Label": "18"}, {"Label": "21"}}
				props["HeatmapRows"] = []map[string]any{{"Label": "Mon", "Cells": []map[string]any{{"Value": "33", "Level": "2"}, {"Value": "95", "Level": "4"}, {"Value": "135", "Level": "5"}, {"Value": "97", "Level": "4"}, {"Value": "123", "Level": "5"}, {"Value": "44", "Level": "2"}}}, {"Label": "Tue", "Cells": []map[string]any{{"Value": "49", "Level": "2"}, {"Value": "110", "Level": "4"}, {"Value": "117", "Level": "4"}, {"Value": "131", "Level": "5"}, {"Value": "157", "Level": "5"}, {"Value": "65", "Level": "3"}}}, {"Label": "Wed", "Cells": []map[string]any{{"Value": "39", "Level": "2"}, {"Value": "137", "Level": "5"}, {"Value": "151", "Level": "5"}, {"Value": "146", "Level": "5"}, {"Value": "88", "Level": "4"}, {"Value": "60", "Level": "3"}}}, {"Label": "Thu", "Cells": []map[string]any{{"Value": "47", "Level": "2"}, {"Value": "140", "Level": "5"}, {"Value": "86", "Level": "3"}, {"Value": "106", "Level": "4"}, {"Value": "151", "Level": "5"}, {"Value": "48", "Level": "2"}}}, {"Label": "Fri", "Cells": []map[string]any{{"Value": "36", "Level": "2"}, {"Value": "108", "Level": "4"}, {"Value": "104", "Level": "4"}, {"Value": "92", "Level": "4"}, {"Value": "135", "Level": "5"}, {"Value": "47", "Level": "2"}}}, {"Label": "Sat", "Cells": []map[string]any{{"Value": "20", "Level": "1"}, {"Value": "71", "Level": "3"}, {"Value": "63", "Level": "3"}, {"Value": "46", "Level": "2"}, {"Value": "45", "Level": "2"}, {"Value": "20", "Level": "1"}}}, {"Label": "Sun", "Cells": []map[string]any{{"Value": "14", "Level": "1"}, {"Value": "54", "Level": "2"}, {"Value": "34", "Level": "2"}, {"Value": "64", "Level": "3"}, {"Value": "57", "Level": "2"}, {"Value": "31", "Level": "2"}}}}
			case "RowGrouping":
				props["Columns"] = []map[string]any{{"Label": "Owner"}, {"Label": "Status"}, {"Label": "Region"}, {"Label": "Revenue"}, {"Label": "Growth"}, {"Label": "Trend"}, {"Label": "Quota"}}
				props["Caption"] = "Groups keep the order their first rows come in; sort to reorder them."
				props["Groups"] = []map[string]any{
					{"Value": "Asia", "Label": "Asia", "Rows": []map[string]any{
						{"Initials": "AL", "Cells": []string{"Ada Lovelace", "Draft", "Asia", "$45,849", "8.4%", "", ""}, "Trend": "0,19 12,18 24,5 36,5 48,3 60,8 72,6 80,20", "Quota": 19},
						{"Initials": "AT", "Cells": []string{"Alan Turing", "Draft", "Asia", "$27,370", "18.1%", "", ""}, "Trend": "0,5 12,1 24,18 36,3 48,2 60,19 72,19 80,7", "Quota": 80},
						{"Initials": "TB", "Cells": []string{"Tim Berners-Lee", "Draft", "Asia", "$61,570", "3.5%", "", ""}, "Trend": "0,4 12,9 24,1 36,1 48,12 60,12 72,15 80,18", "Quota": 43},
						{"Initials": "SW", "Cells": []string{"Sophie Wilson", "Live", "Asia", "$83,221", "0.5%", "", ""}, "Trend": "0,2 12,1 24,1 36,12 48,18 60,19 72,14 80,14", "Quota": 59},
					}},
					{"Value": "Americas", "Label": "Americas", "Rows": []map[string]any{
						{"Initials": "GH", "Cells": []string{"Grace Hopper", "Live", "Americas", "$47,705", "−13.4%", "", ""}, "Trend": "0,16 12,6 24,12 36,5 48,3 60,6 72,15 80,15", "Quota": 8},
						{"Initials": "BL", "Cells": []string{"Barbara Liskov", "Draft", "Americas", "$89,109", "−5.8%", "", ""}, "Trend": "0,13 12,16 24,18 36,17 48,4 60,3 72,3 80,10", "Quota": 2},
					}},
					{"Value": "Oceania", "Label": "Oceania", "Rows": []map[string]any{
						{"Initials": "KJ", "Cells": []string{"Katherine Johnson", "Draft", "Oceania", "$21,426", "2.6%", "", ""}, "Trend": "0,2 12,4 24,13 36,15 48,20 60,13 72,11 80,18", "Quota": 7},
					}},
					{"Value": "Europe", "Label": "Europe", "Rows": []map[string]any{
						{"Initials": "RP", "Cells": []string{"Radia Perlman", "Draft", "Europe", "$33,669", "21.0%", "", ""}, "Trend": "0,8 12,0 24,2 36,10 48,5 60,6 72,6 80,12", "Quota": 53},
						{"Initials": "KT", "Cells": []string{"Ken Thompson", "Draft", "Europe", "$38,267", "−0.8%", "", ""}, "Trend": "0,17 12,2 24,7 36,10 48,17 60,19 72,7 80,15", "Quota": 36},
					}},
				}
			case "TreeTable":
				props["Label"], props["Columns"] = "Name", []map[string]any{{"Label": "Size"}, {"Label": "Files"}}
				props["TreeSource"] = true
				props["Rows"] = []map[string]any{{"Label": "src", "Cells": []string{"842 KB", "64"}, "Open": true, "Children": []map[string]any{{"Label": "ui", "Depth": 1, "Cells": []string{"512 KB", "38"}, "Children": []map[string]any{{"Label": "button.rs", "Depth": 2, "Cells": []string{"18 KB", "1"}}, {"Label": "table.rs", "Depth": 2, "Cells": []string{"41 KB", "1"}}}}, {"Label": "main.rs", "Depth": 1, "Cells": []string{"6 KB", "1"}}}}, {"Label": "assets", "Cells": []string{"2,480 KB", "12"}, "Children": []map[string]any{{"Label": "Inter.ttf", "Depth": 1, "Cells": []string{"804 KB", "1"}}, {"Label": "JetBrains Mono.ttf", "Depth": 1, "Cells": []string{"268 KB", "1"}}}}, {"Label": "Cargo.toml", "Cells": []string{"2 KB", "1"}}}
			case "PivotTable":
				props["RowHeader"], props["Columns"] = "Region", []map[string]any{{"Label": "Q1"}, {"Label": "Q2"}, {"Label": "Q3"}, {"Label": "Total"}}
				props["PivotSource"], props["Caption"] = true, "Sales in thousands."
				props["Measures"] = []map[string]any{{"Value": "sum", "Label": "Sales", "Selected": true, "Rows": []map[string]any{{"Label": "Europe", "Cells": []string{"120", "132", "150", "402"}}, {"Label": "Americas", "Cells": []string{"180", "171", "199", "550"}}, {"Label": "Asia", "Cells": []string{"90", "118", "141", "349"}}, {"Label": "Total", "Cells": []string{"390", "421", "490", "1,301"}}}}, {"Value": "count", "Label": "Count", "Rows": []map[string]any{{"Label": "Europe", "Cells": []string{"1", "1", "2", "4"}}, {"Label": "Americas", "Cells": []string{"1", "1", "1", "3"}}, {"Label": "Asia", "Cells": []string{"1", "1", "1", "3"}}}}}
			case "BeforeAfter":
				props["Label"], props["BeforeURL"], props["AfterURL"], props["BeforeAlt"], props["AfterAlt"], props["Value"] = "Atrium color comparison", "/assets/sample-before.svg", "/assets/sample.svg", "Flat atrium photograph", "Color-graded atrium photograph", 50
			case "Watermark":
				props["Title"], props["Description"], props["Watermark"], props["Read"] = "Plan for the fourth quarter", "Three launches, one migration, and a quieter support queue. The launches share a date so the notes can go out once; the migration waits for the new year.", "Confidential · Ada Lovelace", false
			case "QRCode":
				props["Label"], props["Codes"] = "Codes for cameras and scanners", []map[string]any{{"Label": "QR code", "Value": "https://git.zacharyzhang.com/ZacharyZhang-NY/Ely-GPUI-Components", "Format": "qr"}, {"Label": "Code 128", "Value": "ELY-2419", "Format": "code128"}, {"Label": "EAN-13", "Value": "4006381333931", "Format": "ean13"}}
			}
			cases = append(cases, AdvancedCase{Family: "data", Component: ui.Component{Chapter: chapter, Name: name, ID: fmt.Sprintf("audit-%s-%d", chapter, index+1), Props: props}})
		}
	}
	return cases
}
