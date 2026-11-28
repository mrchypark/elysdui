# Advanced `ui.Component` Catalogue Index

Advanced components are rendered with `ui.RenderComponent(tpl, w, ui.Component{Chapter, Name, ID, Props})` in Go or `{{component (dict "Chapter" ... "Name" ... "ID" ... "Props" (dict ...))}}` in templates.

- **ID rule:** Every instance requires a unique `ID` matching `^[A-Za-z][A-Za-z0-9_-]{0,127}$`.
- **Assets:** Include `{{template "ui-advanced-assets"}}` in `<head>`, or load only needed families with `{{template "ui-advanced-family-assets" "<family>"}}`. See [asset-loading.md](asset-loading.md).
- **Schema lookup:** Query exact SDUI/catalogue types with `go run ./cmd/ely catalog -type <chapter>/<Name>`.

```go
err := ui.RenderComponent(tpl, w, ui.Component{
    Chapter: "interaction",
    Name:    "CommandPalette",
    ID:      "cmd-palette",
    Props: map[string]any{
        "Label":       "Quick actions",
        "Placeholder": "Type a command...",
        "Items": []map[string]any{
            {"Value": "new-file", "Label": "New File", "Shortcut": "⌘N"},
        },
    },
})
```

---

## 7 Component Families & 44 Chapters

| Family | Asset Helper | Chapters (`Chapter` slug) | Representative `Name`s | Reference |
| --- | --- | --- | --- | --- |
| **`foundation`** | `{{template "ui-advanced-family-assets" "foundation"}}` | `primitives` (26), `typography` (33), `layout` (39) | `Box`, `Text`, `Icon`, `Svg`, `Image`, `Heading`, `Paragraph`, `Highlight`, `Latex`, `Code`, `Kbd`, `Divider`, `Stack`, `Grid`, `Accordion`, `SplitPane`, `Dock`, `Drawer`, `Sheet`, `FloatingPanel` | [advanced-foundation.md](advanced-foundation.md) |
| **`forms`** | `{{template "ui-advanced-family-assets" "forms"}}` | `forms` (49), `settings`, `account`, `onboarding`, `maps` | `Input`, `PasswordInput`, `NumberInput`, `CurrencyInput`, `TagInput`, `PinInput`, `KeyValueInput`, `Select`, `Combobox`, `MultiSelect`, `DatePicker`, `ColorPicker`, `GradientEditor`, `CronEditor`, `SignaturePad`, `FileInput`, `DropZone`, `SettingsLayout`, `AccountSwitcher`, `TwoFactorInput`, `OnboardingWizard`, `MapView`, `LocationPicker` | [advanced-forms.md](advanced-forms.md), [map-tiles.md](map-tiles.md) |
| **`interaction`** | `{{template "ui-advanced-family-assets" "interaction"}}` | `buttons` (17), `navigation` (14), `menus` (8), `overlays` (8), `feedback` (13), `motion` (21), `interaction` (7) | `Button`, `ButtonGroup`, `Tabs`, `Breadcrumb`, `Pagination`, `Steps`, `Menu`, `DropdownMenu`, `ContextMenu`, `Popover`, `HoverCard`, `Dialog`, `CommandPalette`, `SearchPalette`, `Toast`, `Alert`, `Banner`, `Spinner`, `Skeleton`, `ProgressBar` | [advanced-interaction.md](advanced-interaction.md) |
| **`data`** | `{{template "ui-advanced-family-assets" "data"}}` | `data`, `lists`, `tables`, `charts` (14), `finance` (22), `dashboard` (4) | `Table`, `DataTable`, `DataGrid`, `LineChart`, `AreaChart`, `PieChart`, `ScatterChart`, `RadarChart`, `HeatmapChart`, `CandlestickChart`, `DepthChart`, `Dashboard Grid`, `UptimeBar`, `AlertList`, `EventStream` | [advanced-data.md](advanced-data.md), [charts.md](charts.md) |
| **`workspace`** | `{{template "ui-advanced-family-assets" "workspace"}}` (auto-loads `forms` CSS) | `editor` (12), `terminal` (5), `git` (7), `debug` (6), `documents` (18), `collab` (8), `files` (20), `canvas` (9), `devtools` (11) | `CodeEditor`, `InlineDiff`, `Terminal`, `LogViewer`, `ProcessList`, `DiffViewer`, `CommitGraph`, `MarkdownEditor`, `MarkdownRenderer`, `RichTextEditor`, `CommentThread`, `FileExplorer`, `FolderTree`, `InfiniteCanvas`, `QueryEditor`, `DocumentViewer` | [advanced-workspace.md](advanced-workspace.md) |
| **`communication`** | `{{template "ui-advanced-family-assets" "communication"}}` | `chat` (19), `agent` (13), `messaging` (16), `mail` (10), `calendar` (10), `project` (14) | `ChatContainer`, `StreamingText`, `CodeBlock`, `MathBlock`, `ToolCallCard`, `ToolApprovalDialog`, `AgentStepList`, `SubAgentTree`, `ChannelList`, `ChatMessage`, `PinnedMessages`, `MessageThread`, `MailList`, `MailComposer`, `CalendarMonthView`, `KanbanBoard` | [advanced-communication.md](advanced-communication.md) |
| **`native`** | `{{template "ui-advanced-family-assets" "native"}}` | `shell` (24), `generative` (16), `media` (21), `theme` (11), `i18n` (5), `misc` (16), `tooling` (10), `rendering` (1) | `TitleBar`, `ColumnShell`, `ImageGenerationPanel`, `ImageViewer`, `VideoPlayer`, `ThemeEditor`, `I18nProvider`, `Clock`, `Stopwatch`, `Calculator`, `QRCodeScanner`, `InspectorOverlay`, `DesignTokenViewer`, `RenderSurface` | [advanced-native.md](advanced-native.md), [native-tooling.md](native-tooling.md) |

---

## Common Props Across Advanced Components

| Prop | Type | Meaning |
| --- | --- | --- |
| `ID` | `string` | Required unique component ID (`^[A-Za-z][A-Za-z0-9_-]{0,127}$`). |
| `Label` / `Title` | `string` | Accessible label (`Label` preferred) and heading (`Title`). |
| `Name` / `Value` | `string` (or numeric/`*int`) | Form submission name and current value. |
| `Disabled` / `Required` | `bool` | Native disabled/required state. |
| `Items` / `Options` / `Rows` / `Fields` | `[]map[string]any` or `[]ui.Option` | Structured collection data per component. |
| `Action` | `string` | Host `ely:action` identifier emitted on activation. |
| `Attrs` | `map[string]string` | Validated `data-*`, `aria-*`, `hx-*` attributes (no `hx-config` or JS handlers). |
