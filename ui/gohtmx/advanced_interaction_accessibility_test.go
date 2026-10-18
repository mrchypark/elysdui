package ui

import (
	"bytes"
	"regexp"
	"strings"
	"testing"
)

func TestInteractionRendersDisabledTabsAndMenuCheckboxesSemantically(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, component := range []Component{
		{Chapter: "navigation", Name: "Tabs", ID: "interaction-tabs", Props: map[string]any{"Items": []map[string]any{{"Label": "Current", "Value": "current", "Selected": true}, {"Label": "Archived", "Value": "archived", "Disabled": true}}}},
		{Chapter: "menus", Name: "CheckboxMenuItem", ID: "interaction-menu", Props: map[string]any{"Items": []map[string]any{{"Label": "Pinned", "Value": "pinned", "Selected": true}}}},
	} {
		var body bytes.Buffer
		if err := RenderComponent(tpl, &body, component); err != nil {
			t.Fatal(err)
		}
		output := body.String()
		if component.Name == "Tabs" && (!strings.Contains(output, `role="tab"`) || !strings.Contains(output, `disabled`)) {
			t.Fatalf("tabs lost disabled tab semantics: %s", output)
		}
		if component.Name == "CheckboxMenuItem" && (!strings.Contains(output, `role="menuitemcheckbox"`) || !strings.Contains(output, `aria-checked="true"`)) {
			t.Fatalf("checkbox menu lost menuitemcheckbox semantics: %s", output)
		}
	}
}

func TestInteractionRendersCallerButtonVariantsAndTabPlacement(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, component := range []Component{
		{Chapter: "buttons", Name: "With icons", ID: "interaction-variant", Props: map[string]any{"Label": "Share", "Icon": "↗", "ButtonVariant": "ghost"}},
		{Chapter: "buttons", Name: "ShortcutHint", ID: "interaction-shortcuts", Props: map[string]any{"Items": []map[string]any{{"Label": "Save", "Value": "save", "Shortcut": "Ctrl+S"}, {"Label": "Find", "Value": "find", "Shortcut": "Ctrl+F"}}}},
		{Chapter: "buttons", Name: "ToggleGroup", ID: "interaction-toggles", Props: map[string]any{"Label": "Style", "Multiple": true, "Items": []map[string]any{{"Label": "Bold", "Value": "bold", "Selected": true}, {"Label": "Italic", "Value": "italic"}}}},
		{Chapter: "buttons", Name: "SegmentedControl", ID: "interaction-segments", Props: map[string]any{"Label": "Range", "Items": []map[string]any{{"Label": "Day", "Value": "day", "Selected": true}, {"Label": "Week", "Value": "week"}}}},
		{Chapter: "buttons", Name: "FloatingActionButton", ID: "interaction-fab", Props: map[string]any{"Label": "Compose", "Icon": "✎"}},
		{Chapter: "buttons", Name: "ConfirmButton", ID: "interaction-confirm", Props: map[string]any{"Label": "Delete"}},
		{Chapter: "buttons", Name: "CopyButton", ID: "interaction-copy", Props: map[string]any{"Label": "Copy", "Value": "https://example.test"}},
		{Chapter: "buttons", Name: "QuickActions", ID: "interaction-quick", Props: map[string]any{"Items": []map[string]any{{"Label": "New document", "Value": "new", "Action": "new", "Note": "Blank, or from a template", "Shortcut": "Ctrl+N", "Icon": "file-plus"}}}},
		{Chapter: "navigation", Name: "Tabs", ID: "interaction-left-tabs", Props: map[string]any{"Placement": "left", "Items": []map[string]any{{"Label": "General", "Value": "general", "Selected": true}, {"Label": "Advanced", "Value": "advanced"}}}},
		{Chapter: "navigation", Name: "EditorTabs", ID: "interaction-editor-tabs", Props: map[string]any{"Items": []map[string]any{{"Label": "main.rs", "Value": "main", "Selected": true, "Closable": true, "Pinnable": true, "Icon": "file"}, {"Label": "lib.rs", "Value": "lib", "Dirty": true}, {"Label": "theme.rs", "Value": "theme", "Preview": true}}}},
		{Chapter: "navigation", Name: "Breadcrumb", ID: "interaction-breadcrumb", Props: map[string]any{"Items": []map[string]any{{"Label": "Home", "Href": "#home", "Icon": "house"}, {"Label": "Projects", "Href": "#projects"}, {"Label": "ely", "Current": true}}}},
		{Chapter: "navigation", Name: "NavigationMenu", ID: "interaction-navigation-menu", Props: map[string]any{"Items": []map[string]any{{"Label": "Products", "Value": "products", "Href": "#products", "Content": "Browse product updates"}}}},
		{Chapter: "navigation", Name: "Pagination", ID: "interaction-pagination", Props: map[string]any{"Page": "6", "Total": "20", "PreviousPage": "5", "NextPage": "7", "Jump": true, "Items": []map[string]any{{"Value": "1"}, {"Gap": true}, {"Value": "6", "Selected": true}, {"Value": "20"}}}},
		{Chapter: "overlays", Name: "Popover", ID: "interaction-link-popover", Props: map[string]any{"Label": "Terms", "Title": "Terms", "ButtonVariant": "link"}},
		{Chapter: "motion", Name: "LoadingButton", ID: "interaction-loading", Props: map[string]any{"Label": "Save", "Action": "save", "Value": "draft"}},
		{Chapter: "motion", Name: "LoadMore", ID: "interaction-more", Props: map[string]any{"Label": "Load more", "Action": "next-page", "Value": "12"}},
		{Chapter: "feedback", Name: "Countdown", ID: "interaction-countdown", Props: map[string]any{"Value": "90"}},
	} {
		var body bytes.Buffer
		if err := RenderComponent(tpl, &body, component); err != nil {
			t.Fatal(err)
		}
		output := body.String()
		switch component.Name {
		case "With icons":
			if !strings.Contains(output, `data-slot="button"`) || !strings.Contains(output, `data-variant="ghost"`) {
				t.Fatalf("button variant did not use the shared button template: %s", output)
			}
		case "Tabs":
			if !strings.Contains(output, `data-interaction-placement="left"`) || !strings.Contains(output, `aria-orientation="vertical"`) {
				t.Fatalf("left tabs lost their vertical placement contract: %s", output)
			}
		case "EditorTabs":
			if !strings.Contains(output, `data-interaction-editor-close`) || !strings.Contains(output, `ely-interaction__editor-dirty`) || !strings.Contains(output, `data-interaction-editor-select`) || !strings.Contains(output, `data-interaction-editor-pin`) || !strings.Contains(output, `draggable="true"`) || !strings.Contains(output, `data-interaction-icon="file"`) {
				t.Fatalf("editor tabs lost close, pin, icon, reorder, dirty, or overflow controls: %s", output)
			}
		case "Pagination":
			if !strings.Contains(output, `aria-label="Previous page"`) || !strings.Contains(output, `aria-current="page"`) || !strings.Contains(output, `data-interaction-page-input`) || !strings.Contains(output, `page 6 of 20`) {
				t.Fatalf("pagination lost page controls or status: %s", output)
			}
		case "Breadcrumb":
			if !strings.Contains(output, `href="#home"`) || !strings.Contains(output, `href="#projects"`) || !strings.Contains(output, `aria-current="page">ely`) {
				t.Fatalf("breadcrumb lost caller links or current page semantics: %s", output)
			}
		case "NavigationMenu":
			if !strings.Contains(output, `data-interaction-menu="interaction-navigation-menu-nav-0"`) || !strings.Contains(output, `role="menu"`) || !strings.Contains(output, `role="menuitem"`) {
				t.Fatalf("navigation menu lost its caller-owned panel contract: %s", output)
			}
		case "QuickActions":
			if !strings.Contains(output, `data-interaction-quickaction`) || !strings.Contains(output, `Ctrl&#43;N`) || !strings.Contains(output, `data-interaction-icon="file-plus"`) {
				t.Fatalf("quick actions lost command-row metadata: %s", output)
			}
		case "Popover":
			if !strings.Contains(output, `data-slot="button"`) || !strings.Contains(output, `data-variant="link"`) {
				t.Fatalf("link popover trigger did not use the shared button template: %s", output)
			}
		case "LoadingButton":
			if !strings.Contains(output, `data-ely-action="save"`) || !strings.Contains(output, `data-interaction-pending-action="save"`) || !strings.Contains(output, `value="draft"`) {
				t.Fatalf("loading button lost its configured host pending action: %s", output)
			}
		case "LoadMore":
			if !strings.Contains(output, `data-ely-action="next-page"`) || !strings.Contains(output, `data-interaction-pending-action="next-page"`) || !strings.Contains(output, `data-interaction-more-count`) {
				t.Fatalf("load more lost its configured host pending action: %s", output)
			}
		case "Countdown":
			if !strings.Contains(output, `data-interaction-countdown-toggle`) || !strings.Contains(output, `data-interaction-countdown-reset`) {
				t.Fatalf("countdown lost pause and reset controls: %s", output)
			}
		}
		if component.Name == "ShortcutHint" && (!strings.Contains(output, `Ctrl&#43;S`) || !strings.Contains(output, `ely-interaction__shortcut`)) {
			t.Fatalf("shortcut hint lost caller-provided keycaps: %s", output)
		}
		if component.Name == "ToggleGroup" && (!strings.Contains(output, `ely-interaction__toggle-group`) || !strings.Contains(output, `data-interaction-toggle-group="multiple"`) || !strings.Contains(output, `aria-pressed="true"`)) {
			t.Fatalf("toggle group lost connected selected controls: %s", output)
		}
		if component.Name == "SegmentedControl" && (!strings.Contains(output, `ely-interaction__segmented`) || !strings.Contains(output, `role="radiogroup"`)) {
			t.Fatalf("segmented control lost radiogroup semantics: %s", output)
		}
		if component.Name == "FloatingActionButton" && !strings.Contains(output, `ely-interaction__fab`) {
			t.Fatalf("floating action button lost its interaction class: %s", output)
		}
		if (component.Name == "ConfirmButton" || component.Name == "CopyButton") && (!strings.Contains(output, `id="`+component.ID+`"`) || !strings.Contains(output, `id="`+component.ID+`-control"`)) {
			t.Fatalf("%s reused its root ID for the inner button: %s", component.Name, output)
		}
	}
}

func TestInteractionRendersSourceButtonCollections(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []Component{
		{Chapter: "buttons", Name: "Button", ID: "interaction-button-variants", Props: map[string]any{"Groups": []map[string]any{{"Items": []map[string]any{{"Label": "Primary", "Value": "primary", "ButtonVariant": "primary"}, {"Label": "Secondary", "Value": "secondary", "ButtonVariant": "secondary"}, {"Label": "Outline", "Value": "outline", "ButtonVariant": "outline"}, {"Label": "Ghost", "Value": "ghost", "ButtonVariant": "ghost"}, {"Label": "Subtle", "Value": "subtle", "ButtonVariant": "subtle"}, {"Label": "Danger", "Value": "danger", "ButtonVariant": "danger"}, {"Label": "Link", "Value": "link", "ButtonVariant": "link"}}}, {"Items": []map[string]any{{"Label": "Primary", "Value": "primary-disabled", "ButtonVariant": "primary", "Disabled": true}, {"Label": "Secondary", "Value": "secondary-disabled", "ButtonVariant": "secondary", "Disabled": true}, {"Label": "Outline", "Value": "outline-disabled", "ButtonVariant": "outline", "Disabled": true}, {"Label": "Ghost", "Value": "ghost-disabled", "ButtonVariant": "ghost", "Disabled": true}, {"Label": "Subtle", "Value": "subtle-disabled", "ButtonVariant": "subtle", "Disabled": true}, {"Label": "Danger", "Value": "danger-disabled", "ButtonVariant": "danger", "Disabled": true}, {"Label": "Link", "Value": "link-disabled", "ButtonVariant": "link", "Disabled": true}}}}}},
		{Chapter: "buttons", Name: "Sizes", ID: "interaction-button-sizes", Props: map[string]any{"Items": []map[string]any{{"Label": "Small", "Size": "sm", "ButtonVariant": "primary"}, {"Label": "Medium", "Size": "default", "ButtonVariant": "primary"}, {"Label": "Large", "Size": "lg", "ButtonVariant": "primary"}}}},
		{Chapter: "buttons", Name: "With icons", ID: "interaction-button-icons", Props: map[string]any{"Items": []map[string]any{{"Label": "New file", "Value": "new", "Icon": "plus", "ButtonVariant": "primary"}, {"Label": "Share", "Value": "share", "Icon": "share-2", "ButtonVariant": "secondary"}, {"Label": "Sort", "Value": "sort", "Icon": "chevron-down", "IconPosition": "trailing", "ButtonVariant": "ghost"}, {"Label": "Delete", "Value": "delete", "Icon": "trash-2", "ButtonVariant": "danger"}}}},
		{Chapter: "buttons", Name: "Icon button", ID: "interaction-icon-buttons", Props: map[string]any{"Groups": []map[string]any{{"Label": "Small", "Items": []map[string]any{{"Label": "Bold", "Value": "bold", "Icon": "bold", "Size": "icon-sm"}, {"Label": "Italic", "Value": "italic", "Icon": "italic", "Size": "icon-sm"}, {"Label": "Underline", "Value": "underline", "Icon": "underline", "Size": "icon-sm", "ButtonVariant": "subtle"}, {"Label": "Link", "Value": "link", "Icon": "link", "Size": "icon-sm", "ButtonVariant": "outline"}}}}}},
		{Chapter: "buttons", Name: "ShortcutHint", ID: "interaction-shortcuts", Props: map[string]any{"Items": []map[string]any{{"Label": "Save", "Value": "save", "Shortcut": "⌘ S", "ShortcutKeys": "Meta+S"}, {"Label": "Find", "Value": "find", "Shortcut": "⌘ ⇧ F", "ShortcutKeys": "Meta+Shift+F", "Icon": "search", "ButtonVariant": "ghost"}}}},
		{Chapter: "buttons", Name: "ButtonGroup", ID: "interaction-button-groups", Props: map[string]any{"Groups": []map[string]any{{"Label": "Calendar range", "Items": []map[string]any{{"Label": "Day", "Value": "day"}, {"Label": "Week", "Value": "week"}, {"Label": "Month", "Value": "month"}}}, {"Label": "Pagination", "Items": []map[string]any{{"Label": "Previous", "Value": "previous", "Icon": "chevron-left", "ButtonVariant": "outline"}, {"Label": "Next", "Value": "next", "Icon": "chevron-right", "ButtonVariant": "outline"}}}}}},
		{Chapter: "buttons", Name: "ToggleButton", ID: "interaction-toggle-buttons", Props: map[string]any{"Items": []map[string]any{{"Label": "Pinned", "Value": "pin", "Icon": "pin", "Pressed": true}, {"Label": "Mute", "Value": "mute", "Icon": "volume-x", "IconOnly": true}}}},
		{Chapter: "buttons", Name: "ToggleGroup", ID: "interaction-toggle-groups", Props: map[string]any{"Groups": []map[string]any{{"Label": "Text style", "Multiple": true, "Items": []map[string]any{{"Label": "Bold", "Value": "bold", "Icon": "bold", "IconOnly": true, "Selected": true}, {"Label": "Italic", "Value": "italic", "Icon": "italic", "IconOnly": true}}}, {"Label": "Alignment", "Items": []map[string]any{{"Label": "Left", "Value": "left", "Icon": "align-left", "Selected": true}, {"Label": "Center", "Value": "center", "Icon": "align-center"}}}}}},
		{Chapter: "buttons", Name: "SegmentedControl", ID: "interaction-segments", Props: map[string]any{"Groups": []map[string]any{{"Label": "Range", "Items": []map[string]any{{"Label": "Day", "Value": "day", "Selected": true}, {"Label": "Week", "Value": "week"}}}, {"Label": "View", "Items": []map[string]any{{"Label": "List", "Value": "list", "Icon": "list", "Selected": true}, {"Label": "Grid", "Value": "grid", "Icon": "layout-grid"}}}}}},
		{Chapter: "buttons", Name: "FloatingActionButton", ID: "interaction-fab-source", Props: map[string]any{"Label": "Primary actions", "Items": []map[string]any{{"Label": "Compose", "Value": "compose", "Icon": "pencil", "Action": "compose", "Size": "default"}, {"Label": "New item", "Value": "new", "Icon": "plus", "IconOnly": true, "Action": "create"}}}},
	}
	for _, component := range cases {
		var body bytes.Buffer
		if err := RenderComponent(tpl, &body, component); err != nil {
			t.Fatal(err)
		}
		output := body.String()
		switch component.Name {
		case "Button":
			for _, variant := range []string{"primary", "secondary", "outline", "ghost", "subtle", "danger", "link"} {
				if !strings.Contains(output, `data-variant="`+variant+`"`) {
					t.Fatalf("Button is missing %s: %s", variant, output)
				}
			}
			if len(regexp.MustCompile(`(?s)<button\b[^>]*\sdisabled(?:\s|>)`).FindAllString(output, -1)) != 7 {
				t.Fatalf("Button must retain its seven disabled source examples: %s", output)
			}
		case "Sizes":
			for _, size := range []string{"sm", "default", "lg"} {
				if !strings.Contains(output, `data-size="`+size+`"`) {
					t.Fatalf("Sizes is missing %s: %s", size, output)
				}
			}
		case "With icons":
			for _, icon := range []string{"plus", "share-2", "chevron-down", "trash-2"} {
				if !strings.Contains(output, `data-interaction-button-icon="`+icon+`"`) {
					t.Fatalf("With icons is missing bundled %s icon: %s", icon, output)
				}
			}
			if !strings.Contains(output, `data-interaction-button-icon-position="trailing"`) {
				t.Fatalf("With icons lost its trailing menu icon: %s", output)
			}
		case "Icon button":
			if !strings.Contains(output, `aria-label="Bold"`) || !strings.Contains(output, `data-size="icon-sm"`) || strings.Contains(output, ">B<") {
				t.Fatalf("Icon button lost accessible mask-icon controls: %s", output)
			}
		case "ShortcutHint":
			if !strings.Contains(output, "⌘ S") || !strings.Contains(output, "⌘ ⇧ F") || !strings.Contains(output, `aria-keyshortcuts="Meta&#43;Shift&#43;F"`) || !strings.Contains(output, `data-interaction-icon="search"`) {
				t.Fatalf("ShortcutHint lost source keycaps or search icon: %s", output)
			}
		case "ButtonGroup":
			if strings.Count(output, `class="ely-interaction__button-group"`) != 2 || !strings.Contains(output, `data-interaction-button-icon="chevron-left"`) || !strings.Contains(output, `data-interaction-button-icon="chevron-right"`) {
				t.Fatalf("ButtonGroup did not render both intrinsic source groups: %s", output)
			}
		case "ToggleButton":
			if !strings.Contains(output, `data-interaction-button-icon="pin"`) || !strings.Contains(output, `data-interaction-button-icon="volume-x"`) || !strings.Contains(output, `aria-pressed="true"`) {
				t.Fatalf("ToggleButton lost its pinned and mute source controls: %s", output)
			}
		case "ToggleGroup":
			if strings.Count(output, `class="ely-interaction__toggle-group"`) != 2 || !strings.Contains(output, `data-interaction-toggle-group="multiple"`) || !strings.Contains(output, `data-interaction-toggle-group="single"`) {
				t.Fatalf("ToggleGroup did not render its multiple and single source specimens: %s", output)
			}
		case "SegmentedControl":
			if strings.Count(output, `role="radiogroup"`) != 2 || !strings.Contains(output, `data-interaction-icon="layout-grid"`) {
				t.Fatalf("SegmentedControl did not render text and icon source specimens: %s", output)
			}
		case "FloatingActionButton":
			if !strings.Contains(output, `ely-interaction__fab-stage`) || strings.Count(output, `ely-interaction__fab"`) != 2 || !strings.Contains(output, `data-interaction-button-icon="pencil"`) || !strings.Contains(output, `data-interaction-button-icon="plus"`) {
				t.Fatalf("FloatingActionButton did not render its framed compose and new-item controls: %s", output)
			}
		}
	}
}

func TestInteractionRendersFunctionalDirectControls(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	for _, component := range []Component{
		{Chapter: "interaction", Name: "Draggable", ID: "interaction-drag", Props: map[string]any{"DropLabel": "Drop in Today", "Items": []map[string]any{{"Label": "Inbox", "Value": "inbox"}}}},
		{Chapter: "interaction", Name: "Undo", ID: "interaction-undo", Props: map[string]any{"Value": "2"}},
		{Chapter: "interaction", Name: "Autofocus", ID: "interaction-focus", Props: map[string]any{"Label": "Show a field", "Name": "title", "Items": []map[string]any{{"Label": "Bold", "Value": "bold"}}}},
	} {
		var body bytes.Buffer
		if err := RenderComponent(tpl, &body, component); err != nil {
			t.Fatal(err)
		}
		output := body.String()
		switch component.Name {
		case "Draggable":
			if !strings.Contains(output, `data-interaction-value="inbox"`) || !strings.Contains(output, `data-interaction-drop`) {
				t.Fatalf("draggable lost its caller-owned source and target: %s", output)
			}
		case "Undo":
			if !strings.Contains(output, `data-interaction-undo-count`) || !strings.Contains(output, `data-interaction-increment`) {
				t.Fatalf("undo is missing its editable tally: %s", output)
			}
		case "Autofocus":
			if !strings.Contains(output, `data-interaction-autofocus-toggle`) || !strings.Contains(output, `role="toolbar"`) {
				t.Fatalf("autofocus is missing its disclosure and roving toolbar: %s", output)
			}
		}
	}
}

func TestInteractionRendersWizardSidebarAndLauncherStructures(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []Component{
		{Chapter: "navigation", Name: "Steps", ID: "interaction-wizard", Props: map[string]any{"Label": "Setup", "Items": []map[string]any{{"Label": "Account", "Value": "account", "Number": "1", "Selected": true, "StageContent": "Set your account"}, {"Label": "Plan", "Value": "plan", "Number": "2", "StageContent": "Select a plan"}}}},
		{Chapter: "navigation", Name: "Sidebar Navigation", ID: "interaction-sidebar", Props: map[string]any{"Groups": []map[string]any{{"Label": "Mailbox", "Items": []map[string]any{{"Label": "Inbox", "Value": "inbox", "Href": "#inbox", "Icon": "inbox", "Count": "12", "Selected": true}}}}}},
		{Chapter: "navigation", Name: "QuickOpen", ID: "interaction-open", Props: map[string]any{"Label": "Go to file", "Items": []map[string]any{{"Label": "src/main.rs", "Value": "src/main.rs", "Content": "src", "Selected": true}}}},
		{Chapter: "navigation", Name: "QuickSwitcher", ID: "interaction-switch", Props: map[string]any{"Label": "Switch", "Items": []map[string]any{{"Label": "Roadmap", "Value": "roadmap", "Content": "Document", "Selected": true}}}},
		{Chapter: "navigation", Name: "SearchPalette", ID: "interaction-search", Props: map[string]any{"Label": "Search everywhere", "Items": []map[string]any{{"Group": "Suggested", "Label": "Command palette", "Value": "palette", "Content": "Navigation", "Selected": true}}}},
	}
	for _, component := range cases {
		var body bytes.Buffer
		if err := RenderComponent(tpl, &body, component); err != nil {
			t.Fatal(err)
		}
		output := body.String()
		switch component.Name {
		case "Steps":
			if !strings.Contains(output, `data-interaction-wizard`) || !strings.Contains(output, `data-interaction-step-next`) || !strings.Contains(output, `data-interaction-step-panel="account"`) {
				t.Fatalf("steps lost its staged wizard controls: %s", output)
			}
		case "Sidebar Navigation":
			if !strings.Contains(output, `data-interaction-nav-group-toggle`) || !strings.Contains(output, `data-interaction-nav-fold`) || !strings.Contains(output, `data-interaction-icon="inbox"`) {
				t.Fatalf("sidebar lost grouped icon navigation: %s", output)
			}
		default:
			if !strings.Contains(output, `data-interaction-dialog`) || !strings.Contains(output, `data-interaction-palette`) || !strings.Contains(output, `data-interaction-palette-option`) || !strings.Contains(output, `role="listbox"`) {
				t.Fatalf("%s lost its launcher dialog and result controls: %s", component.Name, output)
			}
		}
	}
}

func TestInteractionRendersOverlayFeedbackAndMotionStructures(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []Component{
		{Chapter: "overlays", Name: "Lightbox", ID: "interaction-lightbox", Props: map[string]any{"Items": []map[string]any{{"Label": "Dunes", "Src": "/assets/sample.svg", "Alt": "Dunes", "Content": "Dunes at first light"}, {"Label": "Atrium", "Src": "/assets/ely/native-architecture.svg", "Alt": "Atrium", "Content": "An atrium"}}}},
		{Chapter: "overlays", Name: "Dialog", ID: "interaction-dialogs", Props: map[string]any{"Items": []map[string]any{
			{"Label": "Edit profile", "Title": "Edit profile", "Presentation": "modal", "Fields": []map[string]any{{"Label": "Name", "Name": "name", "Value": "Ada", "Required": true}, {"Label": "Email", "Name": "email", "Value": "ada@ely.dev", "Required": true}}},
			{"Label": "Session expired", "Title": "Session expired", "Presentation": "alert"},
			{"Label": "Delete project", "Title": "Delete project?", "Presentation": "confirm"},
			{"Label": "Rename", "Title": "Rename", "Presentation": "prompt", "Value": "Roadmap"},
			{"Label": "Activity", "Title": "Activity", "Presentation": "drawer"},
			{"Label": "Project actions", "Title": "Project actions", "Presentation": "sheet"},
			{"Label": "Notes", "Title": "Release notes", "Presentation": "fullscreen"},
		}}},
		{Chapter: "feedback", Name: "Toast", ID: "interaction-toasts", Props: map[string]any{"Triggers": []map[string]any{{"Label": "Undo", "Value": "0"}}, "Items": []map[string]any{{"Label": "Moved", "ActionLabel": "Undo", "Hidden": true}}}},
		{Chapter: "feedback", Name: "Notification", ID: "interaction-notes", Props: map[string]any{"Title": "Notifications", "Items": []map[string]any{{"Group": "Today", "GroupHeading": true, "Label": "Review requested", "Value": "review", "Content": "Priya assigned a review", "Unread": true, "Time": "2m"}}}},
		{Chapter: "feedback", Name: "Alert", ID: "interaction-alerts", Props: map[string]any{"Items": []map[string]any{{"Label": "Maintenance", "Severity": "info", "Content": "Tonight"}, {"Label": "Storage", "Severity": "warning", "Content": "Add payment", "Dismissible": true, "Visible": true}}}},
		{Chapter: "feedback", Name: "EmptyState", ID: "interaction-empty", Props: map[string]any{"Items": []map[string]any{{"Label": "No messages", "Content": "Start one", "ActionLabel": "Compose"}}}},
		{Chapter: "feedback", Name: "ConfirmationCard", ID: "interaction-confirmation", Props: map[string]any{"Items": []map[string]any{{"Title": "Run this command?", "Value": "run", "Content": "Rebuild the project.", "Command": "cargo build", "ActionLabel": "Run"}}}},
		{Chapter: "feedback", Name: "SavingIndicator", ID: "interaction-saving", Props: map[string]any{"Value": "Saving…"}},
		{Chapter: "motion", Name: "Spinner", ID: "interaction-spinner", Props: map[string]any{"Items": []map[string]any{{"Label": "Ring", "Value": "ring"}, {"Label": "Dots", "Value": "dots"}}}},
		{Chapter: "motion", Name: "LoadingOverlay", ID: "interaction-overlay", Props: map[string]any{"Items": []map[string]any{{"Label": "Oat milk · 2.40"}}, "LoadingLabel": "Refreshing prices…"}},
		{Chapter: "motion", Name: "LazyLoad", ID: "interaction-lazy", Props: map[string]any{"Items": []map[string]any{{"Label": "Row 1 of 12", "Loaded": true}, {"Label": "Row 2 of 12"}}}},
		{Chapter: "motion", Name: "Suspense", ID: "interaction-suspense", Props: map[string]any{"Content": "Revenue rose 12%"}},
		{Chapter: "motion", Name: "RefreshIndicator", ID: "interaction-refresh", Props: map[string]any{"ActionLabel": "Refresh"}},
		{Chapter: "motion", Name: "UploadList", ID: "interaction-upload", Props: map[string]any{"Items": []map[string]any{{"Label": "brand-guidelines.pdf", "Progress": "62", "State": "uploading"}, {"Label": "interview.mov", "State": "failed", "Error": "Over the 2 GB limit"}}}},
		{Chapter: "motion", Name: "Transition", ID: "interaction-transition", Props: map[string]any{"Content": "Hello", "Entrance": "rise"}},
	}
	for _, component := range cases {
		var body bytes.Buffer
		if err := RenderComponent(tpl, &body, component); err != nil {
			t.Fatal(err)
		}
		output := body.String()
		switch component.Name {
		case "Lightbox":
			if !strings.Contains(output, `data-interaction-lightbox-open`) || !strings.Contains(output, `data-interaction-lightbox-next`) || !strings.Contains(output, `data-interaction-lightbox-zoom-in`) || !strings.Contains(output, `data-interaction-lightbox-fullscreen`) {
				t.Fatalf("lightbox lost thumbnails or local controls: %s", output)
			}
		case "Dialog":
			if !strings.Contains(output, `role="alertdialog"`) || !strings.Contains(output, `data-interaction-dismissible="false"`) || !strings.Contains(output, `is-confirm`) || !strings.Contains(output, `is-prompt`) || !strings.Contains(output, `is-drawer`) || !strings.Contains(output, `is-sheet`) || !strings.Contains(output, `is-fullscreen`) || !strings.Contains(output, `name="name"`) || !strings.Contains(output, `name="email"`) || !strings.Contains(output, `data-interaction-close`) {
				t.Fatalf("dialog lost caller-owned presentations: %s", output)
			}
		case "Toast":
			if !strings.Contains(output, `data-interaction-toast-show`) || !strings.Contains(output, `data-interaction-toast-dismiss`) {
				t.Fatalf("toast lost stack item controls: %s", output)
			}
		case "Notification":
			if !strings.Contains(output, `data-interaction-notification-read`) || !strings.Contains(output, `data-interaction-notification-clear`) || !strings.Contains(output, `data-interaction-notification-dismiss`) {
				t.Fatalf("notification lost collection controls: %s", output)
			}
		case "Alert":
			if !strings.Contains(output, `data-interaction-alert-dismiss`) || !strings.Contains(output, `role="alert"`) {
				t.Fatalf("alert lost dismissible severity row: %s", output)
			}
		case "ConfirmationCard":
			if !strings.Contains(output, `ely-interaction__confirmation`) || !strings.Contains(output, `data-interaction-confirmation-status`) {
				t.Fatalf("confirmation card lost caller controls: %s", output)
			}
		case "SavingIndicator":
			if !strings.Contains(output, `data-interaction-saving-next`) || !strings.Contains(output, `data-interaction-saving-retry`) {
				t.Fatalf("saving indicator lost local states: %s", output)
			}
		case "Spinner":
			if !strings.Contains(output, `is-ring`) || !strings.Contains(output, `is-dots`) {
				t.Fatalf("spinner lost caller-selected styles: %s", output)
			}
		case "LoadingOverlay":
			if !strings.Contains(output, `data-interaction-loading-overlay-toggle`) || !strings.Contains(output, `data-interaction-loading-overlay-cancel`) {
				t.Fatalf("loading overlay lost reload and cancellation controls: %s", output)
			}
		case "LazyLoad":
			if !strings.Contains(output, `data-interaction-lazy-row`) || !strings.Contains(output, `data-interaction-lazy-loaded`) {
				t.Fatalf("lazy load lost row placeholders: %s", output)
			}
		case "Suspense":
			if !strings.Contains(output, `data-interaction-suspense-fail`) || !strings.Contains(output, `data-interaction-suspense-error`) {
				t.Fatalf("suspense lost success and failure states: %s", output)
			}
		case "RefreshIndicator":
			if !strings.Contains(output, `data-interaction-refresh-state="refreshing"`) || !strings.Contains(output, `ely-interaction__typing`) {
				t.Fatalf("refresh indicator lost source phase and typing specimens: %s", output)
			}
		case "UploadList":
			if !strings.Contains(output, `data-interaction-upload-retry`) || !strings.Contains(output, `data-interaction-upload-tick`) {
				t.Fatalf("upload list lost retry and progression controls: %s", output)
			}
		case "Transition":
			if !strings.Contains(output, `data-interaction-transition-toggle`) || !strings.Contains(output, `data-interaction-entrance="rise"`) {
				t.Fatalf("transition lost its entrance control: %s", output)
			}
		}
	}
}

func TestInteractionRendersSourceActionControls(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []Component{
		{Chapter: "buttons", Name: "ConfirmButton", ID: "interaction-confirm-source", Props: map[string]any{"Items": []map[string]any{{"Label": "Hold to delete", "Value": "delete", "Action": "delete", "Mode": "hold", "Threshold": "700"}, {"Label": "Discard draft", "Value": "discard", "Action": "discard", "Mode": "twice"}}}},
		{Chapter: "buttons", Name: "CopyButton", ID: "interaction-copy-source", Props: map[string]any{"Items": []map[string]any{{"Label": "Copy invite link", "Value": "https://ely.dev/invite/7Q2", "Action": "copy", "Icon": "copy", "IconOnly": true}, {"Label": "Share page", "Value": "https://ely.dev", "Action": "share", "Icon": "share-2", "IconOnly": true}}}},
		{Chapter: "buttons", Name: "ActionBar", ID: "interaction-action-bar", Props: map[string]any{"FloatingItems": []map[string]any{{"Label": "Reply", "Value": "reply", "Action": "reply", "Icon": "reply"}, {"Label": "Archive", "Value": "archive", "Action": "archive", "Icon": "archive", "ButtonVariant": "primary"}}, "Items": []map[string]any{{"Label": "Cancel", "Value": "cancel", "Action": "cancel"}, {"Label": "Save changes", "Value": "save", "Action": "save", "ButtonVariant": "primary"}}}},
		{Chapter: "buttons", Name: "BulkActionBar", ID: "interaction-bulk", Props: map[string]any{"SelectedCount": 0, "SelectLabel": "Select one more", "Items": []map[string]any{{"Label": "Move", "Value": "move", "Action": "move", "Icon": "folder"}, {"Label": "Delete", "Value": "delete", "Action": "delete", "Icon": "trash-2", "ButtonVariant": "danger"}}}},
		{Chapter: "buttons", Name: "ActionSheet", ID: "interaction-sheet", Props: map[string]any{"Label": "Photo options", "Title": "dunes.jpg", "Content": "Taken at dusk. 4.2 MB.", "Items": []map[string]any{{"Label": "Set as wallpaper", "Value": "wallpaper", "Action": "set-wallpaper"}, {"Label": "Duplicate", "Value": "duplicate", "Action": "duplicate"}, {"Label": "Delete photo", "Value": "delete", "Action": "delete"}}}},
		{Chapter: "buttons", Name: "QuickActions", ID: "interaction-quick-source", Props: map[string]any{"Items": []map[string]any{{"Label": "New document", "Value": "new", "Action": "new", "Icon": "file-plus", "Note": "Blank, or from a template", "Shortcut": "⌘ N", "ShortcutKeys": "Meta+N"}, {"Label": "Search everywhere", "Value": "search", "Action": "search", "Icon": "search", "Note": "Files, symbols, commands", "Shortcut": "⌘ ⇧ P", "ShortcutKeys": "Meta+Shift+P"}}}},
	}
	for _, component := range cases {
		var body bytes.Buffer
		if err := RenderComponent(tpl, &body, component); err != nil {
			t.Fatal(err)
		}
		output := body.String()
		switch component.Name {
		case "ConfirmButton":
			if !strings.Contains(output, `data-interaction-confirm-mode="hold"`) || !strings.Contains(output, `data-interaction-confirm-mode="twice"`) || !strings.Contains(output, `data-interaction-confirm-threshold="700"`) {
				t.Fatalf("ConfirmButton lost hold and twice source contracts: %s", output)
			}
		case "CopyButton":
			if strings.Count(output, `data-interaction-copy=""`) != 2 || !strings.Contains(output, `data-interaction-copy-status`) || !strings.Contains(output, `data-interaction-button-icon="copy"`) {
				t.Fatalf("CopyButton lost copy controls or feedback: %s", output)
			}
		case "ActionBar":
			if !strings.Contains(output, `ely-interaction__actionbar-stage`) || !strings.Contains(output, `ely-interaction__bar is-floating`) || !strings.Contains(output, `ely-interaction__bar is-footer`) {
				t.Fatalf("ActionBar lost floating and footer source forms: %s", output)
			}
		case "BulkActionBar":
			if !strings.Contains(output, `data-interaction-bulk-add`) || !strings.Contains(output, `data-interaction-bulk-clear`) || !strings.Contains(output, `data-interaction-bulk-count`) {
				t.Fatalf("BulkActionBar lost selection and count controls: %s", output)
			}
		case "ActionSheet":
			if !strings.Contains(output, `class="ely-interaction__dialog is-sheet"`) || !strings.Contains(output, `data-interaction-sheet-action`) || !strings.Contains(output, `data-interaction-close`) {
				t.Fatalf("ActionSheet lost bottom-panel dialog controls: %s", output)
			}
		case "QuickActions":
			if !strings.Contains(output, `data-interaction-quick-actions`) || !strings.Contains(output, `aria-keyshortcuts="Meta&#43;Shift&#43;P"`) || !strings.Contains(output, `Blank, or from a template`) {
				t.Fatalf("QuickActions lost row, shortcut, or note semantics: %s", output)
			}
		}
	}
}

func TestInteractionRendersSourceNavigationStructures(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []Component{
		{Chapter: "navigation", Name: "Tabs", ID: "source-tabs", Props: map[string]any{"Placement": "bottom", "Items": []map[string]any{{"Label": "Console", "Value": "console", "Selected": true, "Content": "Logs stream above their tabs."}, {"Label": "Problems", "Value": "problems", "Note": "3", "Content": "Problems."}}}},
		{Chapter: "navigation", Name: "EditorTabs", ID: "source-editor", Props: map[string]any{"Items": []map[string]any{{"Label": "main.rs", "Value": "main", "Selected": true, "Closable": true, "Icon": "file", "Content": "fn main()"}}}},
		{Chapter: "navigation", Name: "Breadcrumb", ID: "source-breadcrumb", Props: map[string]any{"Items": []map[string]any{{"Label": "Home", "Value": "home", "Href": "#home", "Icon": "house"}, {"Label": "ely", "Value": "ely", "Siblings": []map[string]any{{"Label": "ely", "Value": "ely"}, {"Label": "zed", "Value": "zed"}}}, {"Label": "main.rs", "Current": true}}}},
		{Chapter: "navigation", Name: "Pagination", ID: "source-pages", Props: map[string]any{"Page": "6", "Total": "20", "PreviousPage": "5", "NextPage": "7", "Jump": true, "Items": []map[string]any{{"Value": "1"}, {"Gap": true}, {"Value": "5"}, {"Value": "6", "Selected": true}, {"Value": "7"}, {"Gap": true}, {"Value": "20"}}}},
		{Chapter: "navigation", Name: "Steps", ID: "source-steps", Props: map[string]any{"Items": []map[string]any{{"Label": "Account", "Value": "account", "Number": "1", "Completed": true}, {"Label": "Plan", "Value": "plan", "Number": "2", "Selected": true, "StageContent": "Ten seats to start."}, {"Label": "Confirm", "Value": "confirm", "Number": "3"}}}},
		{Chapter: "navigation", Name: "Sidebar Navigation", ID: "source-sidebar", Props: map[string]any{"Groups": []map[string]any{{"Label": "Mailbox", "Items": []map[string]any{{"Label": "Inbox", "Value": "inbox", "Selected": true, "Icon": "inbox", "Count": "12", "Content": "Twelve messages."}, {"Label": "Drafts", "Value": "drafts", "Icon": "file"}}}}}},
	}
	for _, component := range cases {
		var body bytes.Buffer
		if err := RenderComponent(tpl, &body, component); err != nil {
			t.Fatal(err)
		}
		output := body.String()
		switch component.Name {
		case "Tabs":
			if !strings.Contains(output, `data-interaction-placement="bottom"`) || !strings.Contains(output, `role="tabpanel"`) {
				t.Fatalf("tabs lost source placement or panel: %s", output)
			}
		case "EditorTabs":
			if !strings.Contains(output, `data-interaction-editor-add`) || !strings.Contains(output, `aria-controls="source-editor-editor-panel-0"`) || !strings.Contains(output, `role="tabpanel"`) {
				t.Fatalf("editor tabs lost add or selected pane: %s", output)
			}
		case "Breadcrumb":
			if !strings.Contains(output, `data-interaction-breadcrumb-sibling`) || !strings.Contains(output, `data-interaction-icon="house"`) {
				t.Fatalf("breadcrumb lost sibling menu or home icon: %s", output)
			}
		case "Pagination":
			if strings.Count(output, `data-interaction-page`) != 8 || !strings.Contains(output, `data-interaction-icon="chevron-left"`) {
				t.Fatalf("pagination lost source page window: %s", output)
			}
		case "Steps":
			if !strings.Contains(output, `is-complete`) || !strings.Contains(output, `aria-current="step"`) || !strings.Contains(output, `Ten seats to start.`) {
				t.Fatalf("steps lost source states: %s", output)
			}
		case "Sidebar Navigation":
			if !strings.Contains(output, `ely-interaction__sidebar-stage`) || !strings.Contains(output, `data-interaction-nav-panel="inbox"`) {
				t.Fatalf("sidebar lost framed pane: %s", output)
			}
		}
	}
}
