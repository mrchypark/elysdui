package uiexamples

import (
	"fmt"

	"github.com/mrchypark/elysdui/ui/gohtmx"
)

// advancedInteractionCases gives the gallery one caller-owned instance for every interaction primary.
func advancedInteractionCases() []AdvancedCase {
	chapterContent := map[string]string{
		"buttons":     "Choose an action for the selected document.",
		"navigation":  "Review the current workspace and choose where to go next.",
		"menus":       "Commands for the active document are available here.",
		"overlays":    "Details stay available until you dismiss this surface.",
		"feedback":    "The workspace saved the latest changes successfully.",
		"motion":      "Recent activity is loading into the workspace.",
		"interaction": "Arrange these workspace items with the available controls.",
	}
	chapterItems := map[string][]map[string]any{
		"buttons":     {{"Value": "reply", "Label": "Reply", "Title": "Reply", "Content": "Respond to the selected message", "Selected": true}, {"Value": "archive", "Label": "Archive", "Title": "Archive", "Content": "Move it out of the inbox"}},
		"navigation":  {{"Value": "overview", "Label": "Overview", "Title": "Overview", "Content": "Workspace overview", "Selected": true, "Href": "#overview"}, {"Value": "activity", "Label": "Activity", "Title": "Activity", "Content": "Recent workspace activity", "Href": "#activity"}},
		"menus":       {{"Value": "new", "Label": "New document", "Title": "New document", "Content": "Create a blank document", "Selected": true}, {"Value": "open", "Label": "Open…", "Title": "Open…", "Content": "Open a workspace document"}},
		"overlays":    {{"Value": "confirm", "Label": "Confirm", "Title": "Confirm", "Content": "Apply these changes", "Selected": true}, {"Value": "cancel", "Label": "Cancel", "Title": "Cancel", "Content": "Keep the current settings"}},
		"feedback":    {{"Value": "mark-read", "Label": "Mark as read", "Title": "Mark as read", "Content": "Clear this notification", "Selected": true}, {"Value": "view", "Label": "View details", "Title": "View details", "Content": "Open the saved result"}},
		"motion":      {{"Value": "report", "Label": "Quarterly report", "Title": "Quarterly report", "Content": "Preparing the latest report", "Selected": true}, {"Value": "invoices", "Label": "Invoices", "Title": "Invoices", "Content": "Loading invoice records"}},
		"interaction": {{"Value": "apple", "Label": "Apple", "Title": "Apple", "Content": "Fruit suggestion", "Selected": true}, {"Value": "apricot", "Label": "Apricot", "Title": "Apricot", "Content": "Fruit suggestion"}},
	}
	stories := map[string][]string{
		"buttons":     {"Button", "Sizes", "With icons", "Icon button", "ShortcutHint", "ButtonGroup", "SplitButton", "ToggleButton", "ToggleGroup", "SegmentedControl", "FloatingActionButton", "ConfirmButton", "CopyButton", "ActionBar", "BulkActionBar", "ActionSheet", "QuickActions"},
		"navigation":  {"Tabs", "EditorTabs", "Breadcrumb", "Pagination", "Steps", "Sidebar Navigation", "NavigationMenu", "BackForwardNavigation", "Anchor", "JumpTo", "CommandPalette", "QuickOpen", "QuickSwitcher", "SearchPalette"},
		"menus":       {"Menu", "CheckboxMenuItem", "DropdownMenu", "ContextMenu", "MenuBar Menu", "MegaMenu", "SearchableMenu", "PieMenu"},
		"overlays":    {"Popover", "HoverCard", "Dialog", "Lightbox", "Spotlight", "FloatingToolbar", "Callout", "Tooltip"},
		"feedback":    {"Toast", "Notification", "Alert", "Banner", "Callout", "InlineMessage", "EmptyState", "ErrorView", "ErrorBoundary", "Result", "ConfirmationCard", "SavingIndicator", "Countdown"},
		"motion":      {"Spinner", "Skeleton", "Shimmer", "LoadingButton", "LoadMore", "ProgressBar", "LoadingOverlay", "LazyLoad", "Suspense", "RefreshIndicator", "UploadList", "Transition", "Stagger", "AnimatePresence", "Flip", "Reorder", "Marquee", "Ripple", "Glow", "Blink", "ParticleBackground"},
		"interaction": {"Draggable", "Resizable", "LongPress", "Hotkeys", "Undo", "VirtualScroller", "Autofocus"},
	}
	var cases []AdvancedCase
	for chapter, names := range stories {
		for index, name := range names {
			id := fmt.Sprintf("audit-%s-%d", chapter, index+1)
			props := map[string]any{
				"Title": name + " for Northwind review", "Label": "Open " + name, "ActionLabel": "Open", "Content": chapterContent[chapter], "Description": "A concise description of the current workspace state.",
				"Name": "field_" + fmt.Sprintf("%d", index+1), "Value": fmt.Sprintf("%d", index+2), "Placeholder": "Find a caller-owned item", "Required": index%5 == 0, "Disabled": index%13 == 0,
				"Action": "save", "Icon": "✦", "Alt": name + " preview", "Src": "/assets/sample.svg", "Href": "#" + id,
				"Max": 100, "Loading": false, "Autofocus": name == "Autofocus", "DropLabel": "Drop caller item here", "UndoLabel": "Undo", "RedoLabel": "Redo", "BackLabel": "Back", "ForwardLabel": "Forward",
				"Items": chapterItems[chapter],
			}
			if chapter == "menus" || chapter == "overlays" || chapter == "navigation" && index >= 6 || chapter == "feedback" || chapter == "interaction" || chapter == "motion" {
				props["Value"], props["Disabled"], props["Required"] = "", false, false
			}
			if chapter == "overlays" || chapter == "feedback" || chapter == "interaction" || chapter == "motion" {
				props["ButtonVariant"] = "secondary"
			}
			if chapter+"/"+name == "buttons/Button" || chapter+"/"+name == "buttons/ActionBar" || chapter+"/"+name == "feedback/Toast" || chapter+"/"+name == "motion/AnimatePresence" {
				props["Disabled"] = false
			}
			if name == "Breadcrumb" {
				props["Items"] = []map[string]any{{"Label": "Home", "Value": "home", "Href": "#home", "Icon": "house"}, {"Label": "Projects", "Value": "projects", "Href": "#projects"}, {"Label": "ely", "Value": "ely", "Siblings": []map[string]any{{"Label": "ely", "Value": "ely"}, {"Label": "zed", "Value": "zed"}, {"Label": "helix", "Value": "helix"}}}, {"Label": "src", "Value": "src", "Href": "#src"}, {"Label": "main.rs", "Value": "main", "Current": true}}
			}
			if name == "CopyButton" {
				props["Action"] = "copy"
				props["Value"] = "https://northwind.example/reviews/quarterly"
			}
			if name == "Sizes" {
				props["ActionLabel"] = ""
				props["Items"] = []map[string]any{{"Label": "Small", "Value": "small", "Size": "sm", "ButtonVariant": "primary"}, {"Label": "Medium", "Value": "medium", "Size": "default", "ButtonVariant": "primary"}, {"Label": "Large", "Value": "large", "Size": "lg", "ButtonVariant": "primary"}}
			}
			if name == "Button" {
				props["ActionLabel"] = ""
				props["Groups"] = []map[string]any{{"Items": []map[string]any{{"Label": "Primary", "Value": "primary", "Action": "primary", "ButtonVariant": "primary"}, {"Label": "Secondary", "Value": "secondary", "Action": "secondary", "ButtonVariant": "secondary"}, {"Label": "Outline", "Value": "outline", "Action": "outline", "ButtonVariant": "outline"}, {"Label": "Ghost", "Value": "ghost", "Action": "ghost", "ButtonVariant": "ghost"}, {"Label": "Subtle", "Value": "subtle", "Action": "subtle", "ButtonVariant": "subtle"}, {"Label": "Danger", "Value": "danger", "Action": "danger", "ButtonVariant": "danger"}, {"Label": "Link", "Value": "link", "Action": "link", "ButtonVariant": "link"}}}, {"Items": []map[string]any{{"Label": "Primary", "Value": "primary-disabled", "ButtonVariant": "primary", "Disabled": true}, {"Label": "Secondary", "Value": "secondary-disabled", "ButtonVariant": "secondary", "Disabled": true}, {"Label": "Outline", "Value": "outline-disabled", "ButtonVariant": "outline", "Disabled": true}, {"Label": "Ghost", "Value": "ghost-disabled", "ButtonVariant": "ghost", "Disabled": true}, {"Label": "Subtle", "Value": "subtle-disabled", "ButtonVariant": "subtle", "Disabled": true}, {"Label": "Danger", "Value": "danger-disabled", "ButtonVariant": "danger", "Disabled": true}, {"Label": "Link", "Value": "link-disabled", "ButtonVariant": "link", "Disabled": true}}}}
			}
			if name == "ShortcutHint" {
				props["Items"] = []map[string]any{{"Label": "Save", "Value": "save", "Shortcut": "⌘ S", "ShortcutKeys": "Meta+S"}, {"Label": "Find", "Value": "find", "Shortcut": "⌘ ⇧ F", "ShortcutKeys": "Meta+Shift+F", "Icon": "search", "ButtonVariant": "ghost"}}
			}
			if name == "ToggleButton" {
				props["Items"] = []map[string]any{{"Label": "Pinned", "Value": "pin", "Icon": "pin", "Pressed": true}, {"Label": "Mute", "Value": "mute", "Icon": "volume-x", "IconOnly": true, "Pressed": false}}
			}
			if name == "ToggleGroup" {
				props["Groups"] = []map[string]any{{"Label": "Text style", "Multiple": true, "Items": []map[string]any{{"Label": "Bold", "Value": "bold", "Icon": "bold", "IconOnly": true, "Selected": true}, {"Label": "Italic", "Value": "italic", "Icon": "italic", "IconOnly": true}, {"Label": "Underline", "Value": "underline", "Icon": "underline", "IconOnly": true}}}, {"Label": "Alignment", "Multiple": false, "Items": []map[string]any{{"Label": "Left", "Value": "left", "Icon": "align-left", "Selected": true}, {"Label": "Center", "Value": "center", "Icon": "align-center"}, {"Label": "Right", "Value": "right", "Icon": "align-right"}}}}
			}
			if name == "SegmentedControl" {
				props["Groups"] = []map[string]any{{"Label": "Range", "Items": []map[string]any{{"Label": "Day", "Value": "day", "Selected": true}, {"Label": "Week", "Value": "week"}, {"Label": "Month", "Value": "month"}}}, {"Label": "View", "Items": []map[string]any{{"Label": "List", "Value": "list", "Icon": "list", "Selected": true}, {"Label": "Grid", "Value": "grid", "Icon": "layout-grid"}}}}
			}
			if name == "QuickActions" {
				props["Label"] = "Quick actions"
				props["Hint"] = "Tab in, then use the arrows."
				props["Items"] = []map[string]any{{"Label": "New document", "Value": "new", "Action": "new", "Note": "Blank, or from a template", "Shortcut": "Ctrl+N", "Icon": "file-plus"}, {"Label": "Open…", "Value": "open", "Action": "open", "Shortcut": "Ctrl+O", "Icon": "folder-open"}, {"Label": "Search everywhere", "Value": "search", "Action": "search", "Note": "Files, symbols, commands", "Shortcut": "Ctrl+Shift+P", "Icon": "search"}, {"Label": "Settings", "Value": "settings", "Action": "settings", "Shortcut": "Ctrl+,", "Icon": "settings"}}
			}
			switch chapter + "/" + name {
			case "buttons/With icons":
				props["ActionLabel"] = ""
				props["Items"] = []map[string]any{{"Label": "New file", "Value": "new", "Action": "new-file", "Icon": "plus", "ButtonVariant": "primary"}, {"Label": "Share", "Value": "share", "Action": "share", "Icon": "share-2", "ButtonVariant": "secondary"}, {"Label": "Sort", "Value": "sort", "Action": "sort", "Icon": "chevron-down", "IconPosition": "trailing", "ButtonVariant": "ghost"}, {"Label": "Delete", "Value": "delete", "Action": "delete", "Icon": "trash-2", "ButtonVariant": "danger"}}
			case "buttons/Icon button":
				props["ActionLabel"] = ""
				props["Groups"] = []map[string]any{{"Label": "Small", "Items": []map[string]any{{"Label": "Bold", "Value": "bold-sm", "Action": "bold", "Icon": "bold", "Size": "icon-sm"}, {"Label": "Italic", "Value": "italic-sm", "Action": "italic", "Icon": "italic", "Size": "icon-sm"}, {"Label": "Underline", "Value": "underline-sm", "Action": "underline", "Icon": "underline", "Size": "icon-sm", "ButtonVariant": "subtle"}, {"Label": "Link", "Value": "link-sm", "Action": "link", "Icon": "link", "Size": "icon-sm", "ButtonVariant": "outline"}}}, {"Label": "Medium", "Items": []map[string]any{{"Label": "Bold", "Value": "bold-md", "Action": "bold", "Icon": "bold", "Size": "icon"}, {"Label": "Italic", "Value": "italic-md", "Action": "italic", "Icon": "italic", "Size": "icon"}, {"Label": "Underline", "Value": "underline-md", "Action": "underline", "Icon": "underline", "Size": "icon", "ButtonVariant": "subtle"}, {"Label": "Link", "Value": "link-md", "Action": "link", "Icon": "link", "Size": "icon", "ButtonVariant": "outline"}}}, {"Label": "Large", "Items": []map[string]any{{"Label": "Bold", "Value": "bold-lg", "Action": "bold", "Icon": "bold", "Size": "icon-lg"}, {"Label": "Italic", "Value": "italic-lg", "Action": "italic", "Icon": "italic", "Size": "icon-lg"}, {"Label": "Underline", "Value": "underline-lg", "Action": "underline", "Icon": "underline", "Size": "icon-lg", "ButtonVariant": "subtle"}, {"Label": "Link", "Value": "link-lg", "Action": "link", "Icon": "link", "Size": "icon-lg", "ButtonVariant": "outline"}}}}
			case "buttons/ButtonGroup":
				props["Groups"] = []map[string]any{{"Label": "Calendar range", "Items": []map[string]any{{"Label": "Day", "Value": "day", "ButtonVariant": "secondary"}, {"Label": "Week", "Value": "week", "ButtonVariant": "secondary"}, {"Label": "Month", "Value": "month", "ButtonVariant": "secondary"}}}, {"Label": "Pagination", "Items": []map[string]any{{"Label": "Previous", "Value": "previous", "Icon": "chevron-left", "ButtonVariant": "outline"}, {"Label": "Next", "Value": "next", "Icon": "chevron-right", "IconPosition": "trailing", "ButtonVariant": "outline"}}}}
			case "buttons/SplitButton":
				props["Label"], props["ActionLabel"], props["Items"] = "Save", "Save", []map[string]any{{"Label": "Save as…", "Value": "save-as"}, {"Label": "Save all", "Value": "save-all"}}
			case "buttons/FloatingActionButton":
				props["Label"], props["Items"] = "Primary actions", []map[string]any{{"Label": "Compose", "Value": "compose", "Action": "compose", "Icon": "pencil", "Size": "default"}, {"Label": "New item", "Value": "new", "Action": "create", "Icon": "plus", "IconOnly": true, "Size": "icon"}}
			case "buttons/ConfirmButton":
				props["Items"] = []map[string]any{{"Label": "Hold to delete", "Value": "delete", "Action": "delete", "Mode": "hold", "Threshold": "700", "ButtonVariant": "danger"}, {"Label": "Discard draft", "Value": "discard", "Action": "discard", "Mode": "twice", "ButtonVariant": "danger"}}
			case "buttons/CopyButton":
				props["Items"] = []map[string]any{{"Label": "Copy invite link", "AriaLabel": "Copy invite link", "Value": "https://ely.dev/invite/7Q2", "Action": "copy", "Icon": "copy", "IconOnly": true, "Size": "icon"}, {"Label": "Share page", "AriaLabel": "Share page", "Value": "https://ely.dev", "Action": "share", "Icon": "share-2", "IconOnly": true, "Size": "icon"}, {"Label": "Close", "AriaLabel": "Close", "Value": "close", "Action": "close", "Icon": "x", "IconOnly": true, "Size": "icon"}, {"Label": "Back", "AriaLabel": "Back", "Value": "back", "Action": "back", "Icon": "arrow-left", "IconOnly": true, "Size": "icon"}, {"Label": "More", "AriaLabel": "More actions", "Value": "more", "Action": "more", "Icon": "ellipsis", "IconOnly": true, "Size": "icon"}}
			case "buttons/ActionBar":
				props["FloatingItems"] = []map[string]any{{"Label": "Reply", "Value": "reply", "Action": "reply", "Icon": "reply", "ButtonVariant": "ghost"}, {"Label": "Forward", "Value": "forward", "Action": "forward", "Icon": "forward", "ButtonVariant": "ghost"}, {"Label": "Archive", "Value": "archive", "Action": "archive", "Icon": "archive", "ButtonVariant": "primary"}}
				props["Items"] = []map[string]any{{"Label": "Cancel", "Value": "cancel", "Action": "cancel", "ButtonVariant": "ghost"}, {"Label": "Save changes", "Value": "save", "Action": "save", "ButtonVariant": "primary"}}
			case "buttons/BulkActionBar":
				props["SelectedCount"], props["SelectLabel"], props["Items"] = 0, "Select one more", []map[string]any{{"Label": "Move", "Value": "move", "Action": "move", "Icon": "folder", "ButtonVariant": "ghost"}, {"Label": "Delete", "Value": "delete", "Action": "delete", "Icon": "trash-2", "ButtonVariant": "danger"}}
			case "buttons/ActionSheet":
				props["Label"], props["Title"], props["Content"], props["CancelLabel"], props["Items"] = "Photo options", "dunes.jpg", "Taken at dusk. 4.2 MB.", "Cancel", []map[string]any{{"Label": "Set as wallpaper", "Value": "wallpaper", "Action": "set-wallpaper"}, {"Label": "Duplicate", "Value": "duplicate", "Action": "duplicate"}, {"Label": "Delete photo", "Value": "delete", "Action": "delete"}}
			case "navigation/Steps":
				props["Label"], props["ActionLabel"] = "Workspace setup", "Next"
				props["Items"] = []map[string]any{{"Label": "Account", "Value": "account", "Number": "1", "Content": "Name and email", "StageContent": "Who runs this workspace? One name, one address; both can change later.", "Selected": true}, {"Label": "Plan", "Value": "plan", "Number": "2", "Content": "Seats and billing", "StageContent": "Ten seats to start. Billing runs monthly and stops when you do."}, {"Label": "Confirm", "Value": "confirm", "Number": "3", "Content": "Check and start", "StageContent": "Ready. The workspace opens as soon as you finish."}}
				props["PreviewExamples"] = []map[string]any{{"Label": "Setup progress", "Vertical": true, "Items": []map[string]any{{"Label": "Account", "Value": "account", "Number": "1", "Content": "Name and email", "Completed": true}, {"Label": "Plan", "Value": "plan", "Number": "2", "Content": "Seats and billing", "Selected": true}, {"Label": "Confirm", "Value": "confirm", "Number": "3", "Content": "Check and start"}}}, {"Label": "Workspace setup", "ActionLabel": "Next", "Vertical": false}}
			case "navigation/Sidebar Navigation":
				props["Label"] = "Workspace navigation"
				props["Groups"] = []map[string]any{{"Label": "Mailbox", "Items": []map[string]any{{"Label": "Inbox", "Value": "inbox", "Href": "#inbox", "Selected": true, "Icon": "inbox", "Count": "12", "Content": "Twelve messages are waiting in the shared mailbox."}, {"Label": "Drafts", "Value": "drafts", "Href": "#drafts", "Icon": "file-text", "Content": "Draft replies remain private until you send them."}}}, {"Label": "Projects", "Items": []map[string]any{{"Label": "Ely", "Value": "ely", "Href": "#ely", "Icon": "box", "Content": "The Ely product workspace is open."}, {"Label": "Website", "Value": "website", "Href": "#website", "Icon": "globe", "Content": "Website planning and published pages."}, {"Label": "Research", "Value": "research", "Href": "#research", "Icon": "book-open", "Content": "Notes and references for current research."}}}}
				props["PreviewExamples"] = []map[string]any{{"Label": "Workspace navigation"}, {"Label": "Collapsed navigation", "Groups": props["Groups"], "Folded": true}}
			case "navigation/NavigationMenu":
				props["Items"] = []map[string]any{{"Label": "Product", "Items": []map[string]any{{"Value": "tour", "Label": "Tour", "Icon": "compass", "Content": "What it does, in five minutes", "Action": "select"}, {"Value": "pricing", "Label": "Pricing", "Icon": "credit-card", "Content": "Plans for one to a thousand", "Action": "select"}, {"Value": "changes", "Label": "Changelog", "Icon": "history", "Content": "Every release, dated", "Action": "select"}, {"Value": "status", "Label": "Status", "Icon": "activity", "Content": "Uptime, live", "Action": "select"}}}, {"Label": "Docs", "Items": []map[string]any{{"Value": "guide", "Label": "Guide", "Icon": "book-open", "Content": "From install to ship", "Action": "select"}, {"Value": "api", "Label": "API", "Icon": "code", "Content": "Every type and call", "Action": "select"}, {"Value": "examples", "Label": "Examples", "Icon": "layers", "Content": "Small apps to copy", "Action": "select"}, {"Value": "faq", "Label": "Questions", "Icon": "circle-help", "Content": "Asked and answered", "Action": "select"}}}}
			case "navigation/BackForwardNavigation":
				props["Items"] = []map[string]any{{"Label": "Home", "Value": "home", "Icon": "house"}, {"Label": "Search: gpui", "Value": "search", "Icon": "search"}, {"Label": "zed-industries/zed", "Value": "repo", "Icon": "git-branch"}, {"Label": "crates/gpui/src/window.rs", "Value": "file", "Icon": "file-text", "Selected": true}}
			case "navigation/Anchor":
				props["Label"] = "Table of contents"
				props["Items"] = []map[string]any{{"Value": "start", "Label": "Getting started", "Depth": 0, "Content": "Each section is long enough to scroll past. The line in the table follows the section in view; a click brings a section to the top.", "Selected": true}, {"Value": "install", "Label": "Install", "Depth": 1, "Content": "Each section is long enough to scroll past. The line in the table follows the section in view; a click brings a section to the top."}, {"Value": "first", "Label": "A first window", "Depth": 1, "Content": "Each section is long enough to scroll past. The line in the table follows the section in view; a click brings a section to the top."}, {"Value": "theme", "Label": "Theme and tokens", "Depth": 0, "Content": "Each section is long enough to scroll past. The line in the table follows the section in view; a click brings a section to the top."}, {"Value": "motion", "Label": "Motion", "Depth": 0, "Content": "Each section is long enough to scroll past. The line in the table follows the section in view; a click brings a section to the top."}}
			case "navigation/JumpTo":
				props["Label"], props["Name"], props["Value"], props["Max"], props["Placeholder"] = "Line or line:column", "target", "42:7", 240, "Line or line:column"
			case "navigation/CommandPalette":
				props["Label"], props["Placeholder"] = "Command palette", "Type a command"
				props["Items"] = []map[string]any{{"Group": "File", "Value": "new", "Label": "New file", "Icon": "file-plus", "Action": "run", "Shortcut": "⌘ n"}, {"Group": "File", "Value": "open", "Label": "Open…", "Icon": "folder-open", "Action": "run", "Shortcut": "⌘ o"}, {"Group": "File", "Value": "save", "Label": "Save", "Icon": "save", "Action": "run", "Shortcut": "⌘ s"}, {"Group": "File", "Value": "share", "Label": "Share…", "Icon": "share-2", "Action": "run"}, {"Group": "View", "Value": "sidebar", "Label": "Toggle sidebar", "Icon": "panel-left", "Action": "run", "Shortcut": "⌘ b", "Recent": 1}, {"Group": "View", "Value": "terminal", "Label": "Toggle terminal", "Icon": "terminal", "Action": "run", "Shortcut": "Ctrl `"}, {"Group": "View", "Value": "zoom-in", "Label": "Zoom in", "Icon": "zoom-in", "Action": "run", "Shortcut": "⌘ ="}, {"Group": "View", "Value": "zoom-out", "Label": "Zoom out", "Icon": "zoom-out", "Action": "run", "Shortcut": "⌘ -"}, {"Group": "Theme", "Value": "light", "Label": "Light theme", "Icon": "sun", "Action": "run"}, {"Group": "Theme", "Value": "dark", "Label": "Dark theme", "Icon": "moon", "Action": "run", "Recent": 2}, {"Group": "Theme", "Value": "system", "Label": "Match the system", "Icon": "monitor", "Action": "run"}, {"Group": "Help", "Value": "keys", "Label": "Keyboard shortcuts", "Icon": "keyboard", "Action": "run", "Shortcut": "⌘ /"}, {"Group": "Help", "Value": "bug", "Label": "Report a bug", "Icon": "bug", "Action": "run"}, {"Group": "Help", "Value": "new-in", "Label": "What's new", "Icon": "sparkles", "Action": "run"}}
			case "navigation/QuickOpen":
				props["Label"], props["ActionLabel"], props["Placeholder"] = "Go to file", "Go to file", "Search files by path"
				props["Items"] = []map[string]any{{"Value": "src/theme/tokens.rs", "Label": "tokens.rs", "Content": "src/theme", "Icon": "file", "Action": "open", "Recent": true}, {"Value": "AGENTS.md", "Label": "AGENTS.md", "Content": "", "Icon": "file", "Action": "open", "Recent": true}, {"Value": "Cargo.toml", "Label": "Cargo.toml", "Content": "", "Icon": "file", "Action": "open"}, {"Value": "README.md", "Label": "README.md", "Content": "", "Icon": "file", "Action": "open"}, {"Value": "src/lib.rs", "Label": "lib.rs", "Content": "src", "Icon": "file", "Action": "open"}, {"Value": "src/theme/mod.rs", "Label": "mod.rs", "Content": "src/theme", "Icon": "file", "Action": "open"}, {"Value": "src/theme/palette.rs", "Label": "palette.rs", "Content": "src/theme", "Icon": "file", "Action": "open"}, {"Value": "src/motion/mod.rs", "Label": "mod.rs", "Content": "src/motion", "Icon": "file", "Action": "open"}, {"Value": "src/motion/slide.rs", "Label": "slide.rs", "Content": "src/motion", "Icon": "file", "Action": "open"}, {"Value": "src/primitives/icon.rs", "Label": "icon.rs", "Content": "src/primitives", "Icon": "file", "Action": "open"}, {"Value": "src/primitives/focus.rs", "Label": "focus.rs", "Content": "src/primitives", "Icon": "file", "Action": "open"}, {"Value": "src/buttons/button.rs", "Label": "button.rs", "Content": "src/buttons", "Icon": "file", "Action": "open"}, {"Value": "src/buttons/segmented.rs", "Label": "segmented.rs", "Content": "src/buttons", "Icon": "file", "Action": "open"}, {"Value": "src/forms/select.rs", "Label": "select.rs", "Content": "src/forms", "Icon": "file", "Action": "open"}, {"Value": "src/forms/combobox.rs", "Label": "combobox.rs", "Content": "src/forms", "Icon": "file", "Action": "open"}, {"Value": "src/forms/text/mod.rs", "Label": "mod.rs", "Content": "src/forms/text", "Icon": "file", "Action": "open"}, {"Value": "src/forms/date/picker.rs", "Label": "picker.rs", "Content": "src/forms/date", "Icon": "file", "Action": "open"}, {"Value": "src/navigation/tabs.rs", "Label": "tabs.rs", "Content": "src/navigation", "Icon": "file", "Action": "open"}, {"Value": "src/navigation/menu.rs", "Label": "menu.rs", "Content": "src/navigation", "Icon": "file", "Action": "open"}, {"Value": "src/navigation/palette.rs", "Label": "palette.rs", "Content": "src/navigation", "Icon": "file", "Action": "open"}, {"Value": "src/navigation/toc.rs", "Label": "toc.rs", "Content": "src/navigation", "Icon": "file", "Action": "open"}, {"Value": "examples/gallery/main.rs", "Label": "main.rs", "Content": "examples/gallery", "Icon": "file", "Action": "open"}, {"Value": "examples/gallery/pages/navigation/palettes.rs", "Label": "palettes.rs", "Content": "examples/gallery/pages/navigation", "Icon": "file", "Action": "open"}, {"Value": "frontend/package.json", "Label": "package.json", "Content": "frontend", "Icon": "file", "Action": "open"}}
			case "navigation/QuickSwitcher":
				props["Label"], props["Placeholder"] = "Switch", "Search documents, sessions, and projects"
				props["Items"] = []map[string]any{{"Value": "roadmap", "Label": "Roadmap 2027", "Icon": "file-text", "Content": "Document", "Action": "switch"}, {"Value": "standup", "Label": "Design standup", "Icon": "message-square", "Content": "Session", "Action": "switch"}, {"Value": "ely", "Label": "Ely GPUI Component", "Icon": "box", "Content": "Project", "Action": "switch"}, {"Value": "brand", "Label": "Brand guidelines", "Icon": "file-text", "Content": "Document", "Action": "switch"}, {"Value": "research", "Label": "User research", "Icon": "message-square", "Content": "Session", "Action": "switch"}, {"Value": "site", "Label": "ely.dev", "Icon": "globe", "Content": "Project", "Action": "switch"}}
			case "navigation/SearchPalette":
				props["Label"], props["ActionLabel"], props["Placeholder"] = "Search everywhere", "Search", "Search commands, files, and symbols"
				props["Items"] = []map[string]any{{"Group": "Components", "Value": "palette", "Label": "Command palette", "Content": "Navigation · every command in one place", "Icon": "command", "Action": "open", "Suggested": true}, {"Group": "Components", "Value": "date", "Label": "Date picker", "Content": "Forms · a calendar under a field", "Icon": "calendar", "Action": "open"}, {"Group": "Components", "Value": "color", "Label": "Color picker", "Content": "Forms · hue, saturation and alpha", "Icon": "pipette", "Action": "open"}, {"Group": "Components", "Value": "tabs", "Label": "Tabs", "Content": "Navigation · a line slides to the chosen tab", "Icon": "panel-left", "Action": "open"}, {"Group": "Components", "Value": "slider", "Label": "Slider", "Content": "Forms · a thumb on a track, with steps", "Icon": "sliders-horizontal", "Action": "open"}, {"Group": "Guides", "Value": "tokens", "Label": "Theme and tokens", "Content": "Colors, sizes and radii come from the theme", "Icon": "palette", "Action": "open", "Suggested": true}, {"Group": "Guides", "Value": "motion", "Label": "Motion", "Content": "Durations honor reduced motion; springs stay in animators", "Icon": "sparkles", "Action": "open", "Suggested": true}, {"Group": "Guides", "Value": "focus", "Label": "Focus", "Content": "Tab and Shift-Tab walk every stop in order", "Icon": "keyboard", "Action": "open"}, {"Group": "Guides", "Value": "capture", "Label": "Captures", "Content": "The gallery photographs its own windows", "Icon": "image", "Action": "open"}, {"Group": "People", "Value": "ada", "Label": "Ada Lovelace", "Content": "Design · London", "Icon": "user", "Action": "open", "Suggested": true}, {"Group": "People", "Value": "grace", "Label": "Grace Hopper", "Content": "Engineering · Arlington", "Icon": "user", "Action": "open"}, {"Group": "People", "Value": "alan", "Label": "Alan Kay", "Content": "Research · Los Angeles", "Icon": "user", "Action": "open"}}
			case "menus/Menu":
				props["Icon"] = "file-text"
				props["Label"] = "File"
				props["Items"] = []map[string]any{{"Label": "New file", "Value": "new-file", "Action": "select", "Icon": "file-plus", "Shortcut": "⌘ N"}, {"Label": "Open…", "Value": "open…", "Action": "select", "Icon": "folder-open", "Shortcut": "⌘ O"}, {"Label": "Open recent", "Value": "open-recent", "Action": "select", "Icon": "history", "Items": []map[string]any{{"Label": "roadmap.md", "Value": "roadmap.md", "Action": "select", "Icon": "file-text"}, {"Label": "tokens.rs", "Value": "tokens.rs", "Action": "select", "Icon": "file-text"}, {"Separator": true}, {"Label": "Clear recent", "Value": "clear-recent", "Action": "select"}}}, {"Separator": true}, {"Label": "Save", "Value": "save", "Action": "select", "Icon": "save", "Shortcut": "⌘ S"}, {"Label": "Save as…", "Value": "save-as…", "Action": "select", "Shortcut": "⌘ ⇧ S"}, {"Label": "Revert", "Value": "revert", "Action": "select", "Disabled": true}, {"Separator": true}, {"Heading": "Share"}, {"Label": "Copy link", "Value": "copy-link", "Action": "select", "Icon": "link"}, {"Label": "Export PDF", "Value": "export-pdf", "Action": "select", "Icon": "download"}}
			case "menus/DropdownMenu":
				props["Host"], props["Icon"] = "dropdown", "share-2"
				props["Label"] = "Share"
				props["ActionLabel"] = "Share"
				props["PreviewExamples"] = []map[string]any{
					{"Host": "dropdown", "Label": "Share"},
					{"Host": "split", "Label": "Merge", "ActionLabel": "Merge", "Action": "merge", "ButtonVariant": "primary", "Items": []map[string]any{{"Label": "Squash and merge", "Value": "squash", "Action": "squash"}, {"Label": "Rebase and merge", "Value": "rebase", "Action": "rebase"}}},
					{"Host": "overflow", "Label": "More", "Items": []map[string]any{{"Label": "Rename", "Value": "rename", "Icon": "pencil", "Shortcut": "F2"}, {"Label": "Duplicate", "Value": "duplicate", "Icon": "copy"}, {"Label": "Archive", "Value": "archive", "Icon": "archive"}, {"Separator": true}, {"Label": "Delete", "Value": "delete", "Icon": "trash-2"}}},
				}
				props["Items"] = []map[string]any{{"Label": "Copy link", "Value": "copy-link", "Action": "select", "Icon": "link"}, {"Label": "Email", "Value": "email", "Action": "select", "Icon": "mail"}}
			case "menus/MegaMenu":
				props["Items"] = []map[string]any{{"Label": "Product", "Items": []map[string]any{{"Value": "tour", "Label": "Tour", "Icon": "compass", "Content": "What it does, in five minutes", "Action": "select"}, {"Value": "pricing", "Label": "Pricing", "Icon": "credit-card", "Content": "Plans for one to a thousand", "Action": "select"}, {"Value": "changes", "Label": "Changelog", "Icon": "history", "Content": "Every release, dated", "Action": "select"}, {"Value": "status", "Label": "Status", "Icon": "activity", "Content": "Uptime, live", "Action": "select"}}}, {"Label": "Docs", "Items": []map[string]any{{"Value": "guide", "Label": "Guide", "Icon": "book-open", "Content": "From install to ship", "Action": "select"}, {"Value": "api", "Label": "API", "Icon": "code", "Content": "Every type and call", "Action": "select"}, {"Value": "examples", "Label": "Examples", "Icon": "layers", "Content": "Small apps to copy", "Action": "select"}, {"Value": "faq", "Label": "Questions", "Icon": "circle-help", "Content": "Asked and answered", "Action": "select"}}}}
			case "menus/CheckboxMenuItem":
				props["ButtonVariant"] = "ghost"
				props["Label"] = "View"
				props["Items"] = []map[string]any{{"Label": "Sidebar", "Value": "sidebar", "Action": "select", "Selected": true, "Shortcut": "⌘ B"}, {"Label": "Minimap", "Value": "minimap", "Action": "select"}, {"Label": "Status bar", "Value": "status-bar", "Action": "select", "Selected": true}, {"Separator": true}, {"Heading": "Density"}, {"Label": "Compact", "Value": "compact", "Action": "select", "Radio": true, "Group": "density", "Selected": false}, {"Label": "Standard", "Value": "standard", "Action": "select", "Radio": true, "Group": "density", "Selected": true}, {"Label": "Comfortable", "Value": "comfortable", "Action": "select", "Radio": true, "Group": "density", "Selected": false}}
			case "menus/ContextMenu":
				props["Content"] = "Right-click anywhere here"
				props["ActionLabel"] = ""
				props["Items"] = []map[string]any{{"Label": "Back", "Value": "back", "Action": "select", "Icon": "arrow-left", "Shortcut": "⌘ ["}, {"Label": "Forward", "Value": "forward", "Action": "select", "Icon": "arrow-right", "Disabled": true}, {"Label": "Reload", "Value": "reload", "Action": "select", "Icon": "rotate-cw", "Shortcut": "⌘ R"}, {"Separator": true}, {"Label": "Copy link", "Value": "copy-link", "Action": "select", "Icon": "link"}, {"Label": "Inspect", "Value": "inspect", "Action": "select", "Icon": "code"}}
			case "menus/MenuBar Menu":
				props["Label"] = "Application menus"
				props["Items"] = []map[string]any{{"Label": "Ely", "Items": []map[string]any{{"Label": "About Ely", "Value": "about-ely", "Action": "select"}, {"Separator": true}, {"Label": "Quit Ely", "Value": "quit-ely", "Action": "select"}}}, {"Label": "View", "Items": []map[string]any{{"Label": "Light", "Value": "light", "Action": "select"}, {"Label": "Dark", "Value": "dark", "Action": "select"}}}}
			case "menus/SearchableMenu":
				props["Icon"] = "folder-open"
				props["Label"] = "Move to"
				props["Value"] = ""
				props["Placeholder"] = "Find a place"
				props["Items"] = []map[string]any{{"Label": "Inbox", "Value": "inbox", "Action": "select", "Icon": "inbox"}, {"Label": "Roadmap", "Value": "roadmap", "Action": "select", "Icon": "map"}, {"Label": "Design", "Value": "design", "Action": "select", "Icon": "pen-tool"}, {"Label": "Engineering", "Value": "engineering", "Action": "select", "Icon": "code"}, {"Label": "Research", "Value": "research", "Action": "select", "Icon": "book-open"}, {"Label": "Marketing", "Value": "marketing", "Action": "select", "Icon": "globe"}, {"Label": "Archive", "Value": "archive", "Action": "select", "Icon": "archive"}, {"Label": "Trash", "Value": "trash", "Action": "select", "Icon": "trash-2"}}
			case "menus/PieMenu":
				props["Content"] = "Right-click for the ring"
				props["Items"] = []map[string]any{{"Label": "Copy", "Value": "copy", "Action": "select", "Icon": "copy"}, {"Label": "Cut", "Value": "cut", "Action": "select", "Icon": "scissors"}, {"Label": "Paste", "Value": "paste", "Action": "select", "Icon": "clipboard"}, {"Label": "Share", "Value": "share", "Action": "select", "Icon": "share-2"}, {"Label": "Pin", "Value": "pin", "Action": "select", "Icon": "pin"}, {"Label": "Delete", "Value": "delete", "Action": "select", "Icon": "trash-2"}}
			case "overlays/HoverCard":
				props["Label"], props["Title"], props["Initials"], props["Subtitle"], props["Content"] = "@ada", "Ada Lovelace", "AL", "Design · London", "Writes the first programs for machines not yet built."
				props["Items"] = []map[string]any{{"Label": "Follow", "Value": "ada", "Action": "follow"}}
			case "overlays/Popover":
				props["Label"], props["ButtonVariant"], props["Icon"] = "Share", "secondary", "share-2"
				props["Title"], props["Content"], props["Items"] = "Share this page", "Anyone with the link can view it.", []map[string]any{{"Label": "Public link", "Value": "public", "Toggle": true, "Selected": true, "Action": "toggle-public"}, {"Label": "Copy link", "Value": "copy", "Icon": "link", "Action": "copy"}}
				props["PreviewExamples"] = []map[string]any{{"Label": "Share"}, {"Label": "terms", "Title": "", "Icon": "", "ButtonVariant": "link", "Before": "Read the", "After": "before you share.", "Content": "Plain words: you own your work, and we keep it private.", "Items": []map[string]any{}}}
			case "overlays/Dialog":
				props["Items"] = []map[string]any{{"Label": "Edit profile", "Title": "Edit profile", "Content": "How others see you across the workspace.", "ActionLabel": "Save", "Action": "save-profile", "Presentation": "modal", "Fields": []map[string]any{{"Label": "Name", "Name": "name", "Value": "Ada Lovelace", "Required": true}, {"Label": "Email", "Name": "email", "Value": "ada@ely.dev", "Required": true}}}, {"Label": "Session expired", "Title": "Session expired", "Content": "Sign in again to keep your changes. Nothing you wrote is lost.", "ActionLabel": "Sign in", "Action": "sign-in", "Presentation": "alert"}, {"Label": "Delete project", "Title": "Delete this project?", "Content": "Pages, files, and history go with it. This cannot be undone.", "ActionLabel": "Delete project", "Action": "delete-project", "Presentation": "confirm"}, {"Label": "Rename", "Title": "Rename", "Content": "Choose a new name for this workspace.", "ActionLabel": "Rename", "Action": "rename", "Presentation": "prompt", "Value": "Roadmap", "TrimRequired": true, "Disallow": "/", "ValidationMessage": "Names cannot hold a slash."}, {"Label": "Release notes", "Title": "Release notes", "Content": "Version 0.9 · September 2026", "Body": "Menus nest, filter and follow their buttons.\nPalettes pick on release, as buttons do.\nOverlays hand focus back on every close.", "NoActions": true, "Presentation": "fullscreen"}}
			case "overlays/Lightbox":
				props["Label"], props["Title"] = "Open gallery", "Gallery"
				props["Items"] = []map[string]any{{"Label": "Dunes at first light", "Value": "dunes", "Src": "/assets/ely-api-interaction.dunes.jpg", "Alt": "Dunes at first light", "Content": "Dunes at first light"}, {"Label": "An atrium, noon", "Value": "atrium", "Src": "/assets/ely-api-interaction.atrium.jpg", "Alt": "An atrium at noon", "Content": "An atrium, noon"}}
			case "overlays/Spotlight":
				props["Label"], props["CoachLabel"], props["CoachIndex"] = "Take the tour", "Show a coachmark", 1
				props["Steps"] = []map[string]any{{"Label": "Search", "Icon": "search", "Content": "Find any page, person or file from here."}, {"Label": "Invite", "Icon": "users", "Content": "Bring your team in. They see what you share.", "CoachTitle": "New: invites", "CoachContent": "Invite by name or email; links expire in a week."}, {"Label": "Settings", "Icon": "settings", "IconOnly": true, "Content": "Theme, density and keys live here."}}
			case "overlays/FloatingToolbar":
				props["Selection"], props["Value"], props["Label"] = true, "Select some of these words to see the tools.", "Text selection"
				props["Items"] = []map[string]any{{"Label": "Bold", "Value": "bold", "Icon": "bold", "Action": "bold"}, {"Label": "Italic", "Value": "italic", "Icon": "italic", "Action": "italic"}, {"Label": "Link", "Value": "link", "Icon": "link", "Action": "link"}}
			case "overlays/Callout":
				props["Toggle"], props["Label"], props["Title"], props["Content"] = true, "theme()", "src/theme/mod.rs", "pub trait ActiveTheme { fn theme(&self) -> &Theme; }"
				props["Before"], props["After"] = "let colors = cx.", "let accent = colors.accent;"
			case "overlays/Tooltip":
				props["Content"] = "Tooltip is primitives::Tooltip, on Primitives, chapter 1. Sheet and Drawer are layout::Sheet and layout::Drawer, on Layout, chapter 3. DropdownPanel and InlinePopup are the Popover above. ToastViewport holds toasts, so it lands with Feedback, chapter 10."
				props["PreviewExamples"] = []map[string]any{{"ReferenceOnly": true}}
			case "feedback/Toast":
				props["Triggers"] = []map[string]any{{"Label": "Success", "Value": "0"}, {"Label": "Error", "Value": "1"}, {"Label": "Warning", "Value": "2"}, {"Label": "Info", "Value": "3"}, {"Label": "Undo", "Value": "4"}, {"Label": "Plain", "Value": "5"}}
				props["Items"] = []map[string]any{{"Label": "Changes saved", "Value": "saved", "Severity": "success", "Icon": "circle-check", "Hidden": true}, {"Label": "Couldn't sync", "Value": "sync", "Severity": "error", "Icon": "circle-alert", "Content": "Check your connection, then try again.", "ActionLabel": "Retry", "Action": "retry", "Hidden": true}, {"Label": "Storage almost full", "Value": "storage", "Severity": "warning", "Icon": "circle-alert", "Content": "46 of 50 GB used.", "Hidden": true}, {"Label": "A new version is ready", "Value": "update", "Severity": "info", "Icon": "info", "ActionLabel": "Reload", "Action": "reload", "Hidden": true}, {"Label": "3 files moved to Trash", "Value": "trash", "Undo": true, "ActionLabel": "Undo", "Action": "undo", "Hidden": true}, {"Label": "Link copied", "Value": "copied", "Hidden": true}}
			case "feedback/Notification":
				props["Reset"] = true
				props["Title"], props["ActionLabel"], props["Items"] = "Notifications", "Mark all read", []map[string]any{{"Dismissible": false, "Group": "Today", "GroupHeading": true, "Label": "Mia Chen replied", "Icon": "message-square", "Value": "mia", "Content": "“Looks right. Ship it after the copy pass.”", "Time": "2m", "Unread": true}, {"Dismissible": false, "Group": "Today", "Label": "Review requested", "Icon": "git-pull-request", "Value": "review", "Content": "Hana asked you to review #482, toast motion.", "Time": "18m", "Unread": true, "Actions": []map[string]any{{"Label": "Review", "Action": "review", "ButtonVariant": "primary"}, {"Label": "Later", "Action": "later", "ButtonVariant": "ghost"}}}, {"Dismissible": false, "Group": "Today", "Label": "Design review moved", "Icon": "calendar-days", "Value": "design-review", "Content": "Now Thursday, 14:00 CET.", "Time": "1h"}, {"Dismissible": false, "Group": "Earlier", "GroupHeading": true, "Label": "Export ready", "Icon": "download", "Value": "export", "Content": "quarterly-report.pdf · 2.4 MB", "Time": "Yesterday"}, {"Dismissible": false, "Group": "Earlier", "Label": "Léa Martin joined", "Icon": "users", "Value": "lea", "Content": "Say hello in #studio.", "Time": "Mon"}}
			case "feedback/Alert":
				props["Items"] = []map[string]any{{"Label": "Scheduled maintenance", "Value": "maintenance", "Severity": "info", "Content": "Sync pauses Sunday, 02:00 to 03:00 UTC."}, {"Label": "Domain verified", "Value": "verified", "Severity": "success", "Content": "ely.design now points to this workspace."}, {"Label": "Your trial ends in 3 days", "Value": "trial", "Severity": "warning", "Content": "Add a payment method to keep your projects.", "ActionLabel": "Add payment method", "Action": "add-payment"}, {"Label": "Couldn't publish", "Value": "publish", "Severity": "error", "Content": "Two pages link to files that no longer exist.", "ActionLabel": "Show pages", "Action": "show-pages", "Dismissible": true, "RestoreLabel": "Show the closed alert"}}
			case "feedback/Banner":
				props["StageContent"], props["RestoreLabel"], props["Severity"], props["Icon"] = "The window’s content sits under it.", "Show the banner", "warning", "triangle-alert"
				props["Title"], props["Content"], props["ActionLabel"], props["Action"] = "You're offline.", "Edits sync when you reconnect.", "Retry", "retry"
			case "feedback/Callout":
				props["Items"] = []map[string]any{{"Label": "Note", "Severity": "info", "Content": "Themes cross-fade in 280 ms. The theme's reduced motion settles entrances, folds and fades at once; an undo line still counts real time."}, {"Label": "Tip", "Severity": "success", "Content": "Tab walks every control on a page; Shift-Tab walks back."}, {"Label": "Warning", "Severity": "warning", "Content": "Layouts saved by a newer version are refused, not guessed."}, {"Label": "Irreversible", "Severity": "danger", "Content": "Deleting a workspace removes its files for everyone."}}
			case "feedback/InlineMessage":
				props["Items"] = []map[string]any{{"Label": "Saved", "Severity": "success", "Caption": "success", "Icon": "circle-check"}, {"Label": "That name is taken", "Severity": "error", "Caption": "danger", "Icon": "circle-alert"}, {"Label": "Unsaved changes", "Severity": "warning", "Caption": "warning", "Icon": "circle-alert"}, {"Label": "Updated 2 minutes ago", "Severity": "info", "Caption": "info", "Icon": "info"}}
				props["Statuses"] = []string{"Ready to upload", "Uploading 3 files…", "Uploaded 3 files"}
			case "feedback/EmptyState":
				props["Items"] = []map[string]any{{"Label": "No messages yet", "Icon": "inbox", "Value": "messages", "Content": "When someone writes to you, it lands here, newest first, until you archive it.", "ActionLabel": "Write a message"}, {"Label": "No results for “quarterly”", "Value": "results", "Icon": "search-x", "Content": "Try fewer words, or check the spelling.", "ActionLabel": "Clear search"}, {"Label": "Start your first project", "Value": "project", "Icon": "sparkles", "ButtonVariant": "primary", "Content": "Projects keep files, people and tasks together.", "ActionLabel": "New project"}}
			case "feedback/ErrorView":
				props["Items"] = []map[string]any{{"Code": "404", "Title": "Page not found", "Variant": "not-found", "Content": "The link may be broken, or the page has moved.", "ActionLabel": "Go home", "Action": "home"}, {"Code": "403", "Title": "You don't have access", "Variant": "no-permission", "Content": "Ask an owner to share it with you.", "ActionLabel": "Request access", "Action": "request-access", "ButtonVariant": "primary"}, {"Icon": "wrench", "Title": "Down for maintenance", "Variant": "maintenance", "Content": "We'll be back shortly."}, {"Icon": "wifi-off", "Title": "You're offline", "Variant": "offline", "Content": "Check your connection. Your work stays on this device.", "ActionLabel": "Try again", "Action": "retry"}}
			case "feedback/ErrorBoundary":
				props["Items"] = nil
				props["Content"], props["DemoError"], props["DemoDetail"], props["Detail"] = "Revenue, third quarter: 1.2 M", "Revenue, third quarter", "Revenue, third quarter: the export service answered 503", "Revenue, third quarter: the export service answered 503"
				props["ActionLabel"], props["Action"] = "Try again", "retry-report"
			case "feedback/Result":
				props["Replay"] = true
				props["Items"] = []map[string]any{{"Label": "Payment sent", "Content": "€240.00 to Studio Ottanta. A receipt is on its way.", "Severity": "success", "Actions": []map[string]any{{"Label": "Done", "Action": "done", "ButtonVariant": "primary"}, {"Label": "View receipt", "Action": "receipt"}}}, {"Label": "Payment declined", "Content": "Your bank declined the charge. No money moved.", "Severity": "error", "Icon": "circle-alert", "Actions": []map[string]any{{"Label": "Try again", "Action": "retry"}}}}
			case "feedback/ConfirmationCard":
				props["Items"] = []map[string]any{{"Title": "Run this command?", "Value": "run", "Content": "The agent wants to rebuild the project from scratch.", "Command": "cargo clean && cargo build --release", "ActionLabel": "Run", "Action": "run-command", "CancelLabel": "Cancel", "CancelAction": "keep-build", "ConfirmMessage": "Ran the command", "CancelMessage": "Kept the build"}, {"Title": "Delete 3 branches?", "Value": "delete", "Content": "feature/toasts, feature/menus and old/draft go for good.", "ActionLabel": "Delete", "Action": "delete-branches", "CancelLabel": "Cancel", "CancelAction": "keep-branches", "ConfirmMessage": "Deleted 3 branches", "CancelMessage": "Kept the branches", "Destructive": true}}
			case "feedback/SavingIndicator":
				props["Items"] = []map[string]any{
					{"Name": "saving", "Caption": "saving", "RetryAction": "retry-save", "States": []map[string]any{{"State": "saving", "Label": "Saving…", "Icon": "cloud-upload"}, {"State": "saved", "Label": "Saved", "Icon": "cloud-check"}, {"State": "failed", "Label": "Couldn't save", "Icon": "cloud-alert", "Retry": true}}},
					{"Name": "sync", "Caption": "sync", "States": []map[string]any{{"State": "syncing", "Label": "Syncing 12 items", "Icon": "refresh-cw"}, {"State": "synced", "Label": "Up to date", "Icon": "cloud-check"}, {"State": "paused", "Label": "Sync paused", "Icon": "circle-pause"}, {"State": "failed", "Label": "Sync failed", "Icon": "cloud-alert"}}},
					{"Name": "connection", "Caption": "connection", "States": []map[string]any{{"State": "online", "Label": "Connected"}, {"State": "reconnecting", "Label": "Reconnecting…"}, {"State": "offline", "Label": "Offline"}}},
				}
			case "feedback/Countdown":
				props["Value"] = "10"
				props["Clocks"] = []map[string]any{{"Label": "launch in", "Value": 8047}, {"Label": "ten seconds", "Value": 10, "Restart": true}, {"Label": "on this page", "Value": 0, "Mode": "timer"}}
				props["DoneLabel"] = "The ten seconds ran out; on_done ran once."
			case "motion/Skeleton":
				rows := []map[string]any{}
				for row := 0; row < 4; row++ {
					cells := []map[string]any{}
					for col := 0; col < 4; col++ {
						width := 40
						if row > 0 {
							width = []int{72, 48, 60, 36}[(row+col)%4]
						}
						cells = append(cells, map[string]any{"Width": width})
					}
					rows = append(rows, map[string]any{"Cells": cells})
				}
				props["Rows"] = rows
			case "motion/Shimmer":
				props["ContentTitle"], props["Content"], props["ActionLabel"] = "Quarterly review", "Revenue rose 12% on the quarter. Churn held at 2.1%; three new markets opened.", "Load"
			case "motion/LoadingButton":
				props["Items"] = []map[string]any{{"Label": "Save changes", "Action": "save-changes", "DemoDelay": 1600, "ButtonVariant": "primary"}, {"Label": "Export", "Action": "export", "DemoDelay": 2400}}
				props["Label"], props["ActionLabel"], props["Action"] = "Save changes", "Save changes", "save-changes"
			case "motion/LoadMore":
				props["Label"], props["ActionLabel"], props["Action"], props["Value"] = "Load more", "Load more", "load-more", "5"
				props["Shown"], props["PageSize"], props["DemoDelay"], props["Caption"] = 5, 5, 900, "Five at a time, eighteen in all."
				people := []string{"Ada Lovelace", "Alan Turing", "Grace Hopper", "Katherine Johnson", "Tim Berners-Lee", "Margaret Hamilton", "Donald Knuth", "Barbara Liskov", "Ken Thompson", "Radia Perlman", "Edsger Dijkstra", "Frances Allen", "Dennis Ritchie", "Hedy Lamarr", "John McCarthy", "Sophie Wilson", "Yukihiro Matsumoto", "Fei-Fei Li"}
				items := []map[string]any{}
				for i, name := range people {
					items = append(items, map[string]any{"Label": name, "Value": name, "Visible": i < 5})
				}
				props["Items"] = items
			case "motion/Spinner":
				props["Sizes"] = []map[string]any{{"Label": "xs", "Size": 12}, {"Label": "sm", "Size": 14}, {"Label": "md", "Size": 16}, {"Label": "lg", "Size": 20}, {"Label": "xl", "Size": 24}}
				props["Items"] = []map[string]any{{"Label": "Ring", "Size": 24, "Style": "ring"}, {"Label": "Dots", "Size": 24, "Style": "dots"}, {"Label": "Bars", "Size": 24, "Style": "bars"}, {"Label": "Pulse", "Size": 24, "Style": "pulse"}, {"Label": "Orbit", "Size": 24, "Style": "orbit"}, {"Label": "Wave", "Size": 24, "Style": "wave"}}
			case "motion/ProgressBar":
				props["Value"], props["Steps"] = 35, []int{0, 35, 72, 100, 50}
				props["Items"] = []map[string]any{{"Label": "determinate, gliding", "Value": 35, "Linked": true}, {"Label": "buffered", "Value": 40, "Buffer": 70}, {"Label": "segmented, four steps", "Value": 62, "Segments": 4}, {"Label": "indeterminate", "Indeterminate": true}}
				props["Rings"] = []map[string]any{{"Label": "gliding", "Value": 35, "Linked": true, "Percent": true}, {"Label": "a quarter", "Value": 25}, {"Label": "done", "Value": 100, "Percent": true}}
			case "motion/LoadingOverlay":
				props["DemoDelay"], props["Content"], props["Cancellable"] = 1400, "", false
				props["LoadingLabel"], props["ActionLabel"], props["Items"] = "Refreshing prices…", "Reload", []map[string]any{{"Label": "Oat milk · 2.40"}, {"Label": "Espresso beans · 14.90"}, {"Label": "Rye bread · 4.20"}}
			case "motion/LazyLoad":
				props["Items"] = []map[string]any{{"Label": "Row 1 of 12", "Loaded": true}, {"Label": "Row 2 of 12", "Loaded": true}, {"Label": "Row 3 of 12", "Loaded": true}, {"Label": "Row 4 of 12", "Loaded": true}, {"Label": "Row 5 of 12", "Loaded": true}, {"Label": "Row 6 of 12"}, {"Label": "Row 7 of 12"}, {"Label": "Row 8 of 12"}, {"Label": "Row 9 of 12"}, {"Label": "Row 10 of 12"}, {"Label": "Row 11 of 12"}, {"Label": "Row 12 of 12"}}
			case "motion/Suspense":
				props["DemoDelay"], props["Error"] = 1500, "the report service answered 503"
				props["Content"], props["Action"] = "Revenue rose 12% on the quarter; churn held at 2.1%.", "reload-report"
			case "motion/RefreshIndicator":
				props["Typing"] = []map[string]any{{"Label": "named", "Who": "Mia"}, {"Label": "alone"}}
				props["ActionLabel"], props["Action"] = "Refresh", "refresh"
			case "motion/UploadList":
				props["Items"] = []map[string]any{{"Label": "brand-guidelines.pdf", "Progress": "62", "Content": "8.4 MB", "State": "uploading"}, {"Label": "hero@2x.png", "Progress": "100", "Content": "2.4 MB", "State": "done"}, {"Label": "interview.mov", "Content": "2.6 GB", "State": "failed", "Error": "Over the 2 GB limit"}, {"Label": "notes.md", "Progress": "12", "Content": "12.8 KB", "State": "uploading"}}
			case "motion/Reorder":
				props["Items"] = []map[string]any{{"Label": "Write the brief", "Value": "brief"}, {"Label": "Sketch the flows", "Value": "flows"}, {"Label": "Pick the type", "Value": "type"}, {"Label": "Build the prototype", "Value": "prototype"}, {"Label": "Test with five people", "Value": "test"}}
			case "motion/Transition":
				props["Content"], props["Entrance"] = "Hello", "fade"
				props["Items"] = []map[string]any{{"Label": "fade", "Entrance": "fade", "Content": "Hello"}, {"Label": "rise", "Entrance": "rise", "Content": "Hello"}, {"Label": "slide", "Entrance": "slide", "Content": "Hello"}}
			case "motion/Stagger":
				props["Items"] = []map[string]any{{"Label": "Inbox", "Value": "inbox"}, {"Label": "Drafts", "Value": "drafts"}, {"Label": "Sent", "Value": "sent"}, {"Label": "Archive", "Value": "archive"}, {"Label": "Trash", "Value": "trash"}}
			case "motion/AnimatePresence":
				props["AddLabel"] = "Add a tag"
				props["AddItems"] = []map[string]any{{"Label": "Sound", "Value": "sound"}, {"Label": "Typography", "Value": "typography"}, {"Label": "Color", "Value": "color"}, {"Label": "Layout", "Value": "layout"}}
				props["Items"] = []map[string]any{{"Label": "Design", "Value": "design"}, {"Label": "Motion", "Value": "motion"}, {"Label": "Rust", "Value": "rust"}}
			case "motion/Flip":
				props["Items"] = []map[string]any{{"Label": "Aurora", "Value": "aurora"}, {"Label": "Basalt", "Value": "basalt"}, {"Label": "Cinder", "Value": "cinder"}, {"Label": "Dune", "Value": "dune"}, {"Label": "Ember", "Value": "ember"}}
			case "motion/Marquee":
				props["Items"] = []map[string]any{{"Label": "Designed in the open"}, {"Label": "Built in Rust"}, {"Label": "Light and dark"}, {"Label": "Motion with restraint"}}
			case "motion/Ripple":
				props["Label"], props["Confetti"] = "Press anywhere", true
			case "motion/Glow":
				props["Content"], props["PulseLabel"] = "Focus mode", "Live"
			case "motion/Blink":
				props["Content"], props["Value"], props["Cues"], props["ActionLabel"] = "Type here", 1284, true, "Sign in"
			case "motion/ParticleBackground":
				props["Content"], props["GradientLabel"] = "Quiet motion", "Tonal drift"
				props["SourceNote"] = "Lottie Player is blocked in GPUI: clip masks, mattes, blend modes and radial gradients are not supported there."
			case "interaction/Resizable":
				props["Content"], props["Shapes"], props["Angle"], props["Alt"] = "", true, 45, "Arrow"
				props["Items"] = []map[string]any{}
				for tile := 0; tile < 12; tile++ {
					props["Items"] = append(props["Items"].([]map[string]any), map[string]any{"Value": fmt.Sprintf("tile-%d", tile), "Selected": tile == 2})
				}
				props["SortItems"] = []map[string]any{{"Label": "Inbox", "Value": "inbox"}, {"Label": "Today", "Value": "today"}, {"Label": "Upcoming", "Value": "upcoming"}, {"Label": "Someday", "Value": "someday"}}
			case "interaction/Hotkeys":
				props["Bindings"] = []map[string]any{{"Keys": "Meta+Shift+h", "Action": "shout", "Label": "heard"}, {"Keys": "Meta+k Meta+s", "Action": "save-all", "Label": "saved"}}
			case "interaction/LongPress":
				props["Label"], props["Action"], props["Gestures"], props["Threshold"] = "Pressed 0 · held 0", "long-press", true, 500
			case "interaction/Undo":
				props["Value"], props["UndoLabel"], props["RedoLabel"] = "0", "Undo", "Redo"
			case "interaction/Autofocus":
				props["Autofocus"], props["Placeholder"] = false, "Focused as it appears"
				props["Items"] = []map[string]any{{"Label": "Bold", "Value": "bold", "Icon": "bold", "Selected": true}, {"Label": "Italic", "Value": "italic", "Icon": "italic"}, {"Label": "Underline", "Value": "underline", "Icon": "underline"}, {"Label": "Strikethrough", "Value": "strike", "Icon": "strikethrough"}}
				props["Options"] = []map[string]any{{"Label": "Apple", "Value": "apple", "Selected": true}, {"Label": "Apricot", "Value": "apricot"}, {"Label": "Banana", "Value": "banana"}, {"Label": "Blueberry", "Value": "blueberry"}, {"Label": "Cherry", "Value": "cherry"}, {"Label": "Grape", "Value": "grape"}}
			}
			if name == "Tabs" {
				props["Placement"], props["Disabled"], props["Value"] = "top", false, "activity"
				props["Items"] = []map[string]any{{"Label": "Overview", "Value": "overview", "Content": "Three services, all healthy. The last deploy went out an hour ago."}, {"Label": "Activity", "Value": "activity", "Note": "12", "Content": "Twelve events since noon: four deploys, eight config reads.", "Selected": true}, {"Label": "Settings", "Value": "settings", "Content": "Alerts go to the on-call channel. Deploys need one review."}, {"Label": "Archived", "Value": "archived", "Disabled": true, "Content": "Archived items."}}
				props["PreviewExamples"] = []map[string]any{{"Placement": "top", "Value": "activity"}, {"Placement": "left", "Value": "general", "Items": []map[string]any{{"Label": "General", "Value": "general", "Icon": "settings", "Content": "Settings for this section sit here, beside their tab.", "Selected": true}, {"Label": "Appearance", "Value": "appearance", "Icon": "palette", "Content": "Appearance settings."}, {"Label": "Keyboard", "Value": "keyboard", "Icon": "keyboard", "Content": "Keyboard settings."}}}, {"Placement": "bottom", "Value": "console", "Items": []map[string]any{{"Label": "Console", "Value": "console", "Content": "Logs stream above their tabs, as a panel dock does.", "Selected": true}, {"Label": "Output", "Value": "output", "Content": "Output."}, {"Label": "Problems", "Value": "problems", "Note": "3", "Content": "Problems."}}}}
			}
			if name == "Pagination" {
				props["Page"], props["Total"], props["PreviousPage"], props["NextPage"], props["Jump"] = "6", "20", "5", "7", true
				props["Items"] = []map[string]any{{"Value": "1", "Label": "1"}, {"Gap": true}, {"Value": "5", "Label": "5"}, {"Value": "6", "Label": "6", "Selected": true}, {"Value": "7", "Label": "7"}, {"Gap": true}, {"Value": "20", "Label": "20"}}
			}
			if name == "EditorTabs" {
				props["AddLabel"] = "New file"
				props["Items"] = []map[string]any{{"Label": "Cargo.toml", "Value": "cargo", "Pinned": true, "Pinnable": true, "Icon": "file", "Content": "Package metadata and workspace dependencies."}, {"Label": "main.rs", "Value": "main", "Selected": true, "Closable": true, "Pinnable": true, "Icon": "file", "Content": "fn main() starts the application."}, {"Label": "lib.rs", "Value": "lib", "Dirty": true, "Closable": true, "Pinnable": true, "Icon": "file", "Content": "Unsaved library exports."}, {"Label": "theme.rs", "Value": "theme", "Preview": true, "Closable": true, "Pinnable": true, "Icon": "file", "Content": "A preview of theme tokens."}, {"Label": "tokens.rs", "Value": "tokens", "Closable": true, "Pinnable": true, "Icon": "file", "Content": "Shared color and spacing tokens."}, {"Label": "README.md", "Value": "readme", "Preview": true, "Closable": true, "Pinnable": true, "Content": "Project notes and setup instructions."}}
			}
			if name == "Popover" {
				props["ButtonVariant"] = "link"
			}
			if name == "Draggable" {
				props["Lanes"] = []map[string]any{{"Label": "Today", "Value": "today", "Items": []map[string]any{{"Label": "Design", "Value": "design"}, {"Label": "Build", "Value": "build"}, {"Label": "Ship", "Value": "ship"}}}, {"Label": "Later", "Value": "later"}}
			}
			if name == "VirtualScroller" {
				props["Count"], props["RowHeight"], props["Label"] = 10000, 28, "Ten thousand rows"
				panes := []map[string]any{}
				for _, side := range []string{"Before", "After"} {
					rows := []map[string]any{}
					for n := 1; n <= 40; n++ {
						rows = append(rows, map[string]any{"Label": fmt.Sprintf("%s line %d", side, n)})
					}
					panes = append(panes, map[string]any{"Label": side, "Items": rows})
				}
				props["Panes"] = panes
			}
			cases = append(cases, AdvancedCase{Family: "interaction", Component: ui.Component{Chapter: chapter, Name: name, ID: id, Props: props}})
		}
	}
	// Exercise the Lottie alias through the same primary with a caller-owned animation.
	cases = append(cases, AdvancedCase{Family: "interaction", Component: ui.Component{Chapter: "motion", Name: "Lottie Player", ID: "audit-motion-lottie", Props: map[string]any{"Title": "Caller Lottie animation", "Label": "Caller animation", "Animation": `{"v":"5.7.4","fr":30,"ip":0,"op":30,"w":64,"h":64,"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"Visible marker","sr":1,"ks":{"o":{"a":0,"k":100},"r":{"a":0,"k":0},"p":{"a":0,"k":[32,32,0]},"a":{"a":0,"k":[0,0,0]},"s":{"a":0,"k":[100,100,100]}},"ao":0,"shapes":[{"ty":"gr","it":[{"ty":"el","d":1,"s":{"a":0,"k":[28,28]},"p":{"a":0,"k":[0,0]},"nm":"Marker"},{"ty":"fl","c":{"a":0,"k":[0.11,0.43,0.8,1]},"o":{"a":0,"k":100},"r":1,"nm":"Blue fill"},{"ty":"tr","p":{"a":1,"k":[{"t":0,"s":[-12,0],"e":[12,0],"o":{"x":0.333,"y":0},"i":{"x":0.667,"y":1}},{"t":29,"s":[12,0]}]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100},"nm":"Motion"}]}],"ip":0,"op":30,"st":0,"bm":0}]}`, "Autoplay": false, "Loop": false}}})
	return cases
}
