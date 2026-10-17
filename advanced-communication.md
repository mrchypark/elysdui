# Communication component API

All components use `ui.Component` with `Chapter`, `Name`, `ID`, and flat `Props`. The wrapper supplies the instance ID and the `communication` family. Strings are escaped by Go templates.

Shared props: `Title`, `Label`, `Content`, `Value`, `Name`, `Items`, `Options`, `Disabled`, and `Required`. List items accept `Value`, `Label`, `Title`, and `Content`. Options accept `Value`, `Label`, `Selected`, and `Disabled`.

Chat messages accept `Author`, `Time`, `Attachments`, `Context`, and `Commands`. Dispatch `ely:stream` to a StreamingText root with `{text, status}` to update its local displayed stream and status. Terminal statuses (`done`, `complete`, `failed`, `stopped`) hide the cursor. Replay emits `replay-stream` for the host to supply a new stream. Agent timelines use item `Status`; tool approval keeps the supplied `Payload` in the action value. Artifact version options update local preview, source, copy content, and download value. Source-only artifacts display their source immediately. Sandbox meters preserve caller zero values without requiring `CPUSet` or `MemorySet`.

MathBlock accepts `Formula`, `Label`, and `Content`, and mounts safe MathML from the formula. TableBlock accepts `Caption`, `Columns`, and `Rows`, where every row has `Cells`. MermaidRenderer accepts `Src`, `Alt`, and `Caption` for a caller-rendered diagram. Without `Src`, it shows `Diagram` source and emits `render-diagram`; the host provides any rendering result.

Mail uses `To`, `From`, `Subject`, and `Value`. Calendar day objects use `Date`, `Day`, and `Events`; events use `Value`, `Label`, `Start`, and `End`. EventEditor accepts `AllDay`, `Location`, `Notes`, `ShowCancel`, and `ShowDelete`; it emits `cancel-event` and `delete-event` when those controls are present, and prevents submission when `End` is not after `Start`. Project boards use `Lanes`, each with `Value`, `Label`, `Cards`, and card `Value`, `Title`, `Priority`, and `Due`. Drag, Move, and Alt+Arrow keys reorder cards locally and emit `move-task` with `taskId`, destination `laneId`, and destination `index`. Gantt, workload, milestone, and timer views use caller progress and time values. Pomodoro Timer accepts `Progress` (0–100) and `Phase`; it updates the ring through bounded SVG attributes.

ToolApprovalDialog accepts `Permission`; when true it exposes `deny`, `allow-once`, and `allow-always` actions. BrowserPreview accepts `URL`, `PreviewURL`, `Alt`, `ActionLabel`, and `NextActionLabel`; its address form emits `open-browser` and the local next control emits `browser-next`. SubAgentTree items can include nested `Children`, each with `Value`, `Label`, `Title`, and `Status`. MCPServerList accepts `Servers`, whose entries use `Value`, `Label`, `Title`, `Content`, `Permission`, `Enabled`, and `ActionLabel`; changing a server switch emits `ely:change` with `name: "server-enabled"`, its `Value`, and `checked`, while Configure emits `configure-server`.

Native forms emit their `data-ely-submit` action with full `FormData` and `values`. Buttons emit their declared `data-ely-action`. Selection, ranges, filters, checkboxes, and toggles emit `ely:change`; click actions include selected IDs, dates, task IDs, and lane IDs where relevant. The host must complete provider work. The components only update local display state.

BrowserPreview accepts optional `Frames` entries (`Value`, `Label`, `Src`, `Alt`, `Caption`, `Active`) and `Steps` (`Label`, `State`); choosing a frame updates the local preview and emits `show-frame`. Steps render caller-owned action progress only. The `ComputerUseViewer` alias accepts `ScreenURL`, `ScreenAlt`, `Action`, `PointerX`, `PointerY`, and `NextActionLabel`; its next control emits `computer-next`.

The `ToolRegistry Panel` alias accepts caller-owned `Tools` entries (`Value`, `Label`, `Content`, `Access`). Its filter emits `tool-filter`; changing access emits `ely:change` with `name: "tool-access"` and emits `set-tool-access` with `toolId` and `access`.

CalendarWeekView accepts `Days` (`Label`, `Date`) and `TimeGrid` rows (`Time`, `Cells`); each cell accepts `Date` and optional `Events` (`Value`, `Label`). CalendarDayView uses the same `TimeGrid` and supports `DayLabel`, `Timezone`, and `OverlayTimezone`. Empty slots emit `create-event`; calendar navigation continues to emit `calendar-navigation`. YearView accepts `Months` entries (`Label`, `Weeks`), with each week containing `Days` (`Day`, `Date`, `Marked`) for its mini-month matrix.

CodeBlock accepts caller-owned `Lines`, whose entries support `Text`, `Hidden`, and `Spans` (`Text`, `Class`), plus `ExactCopy` and `ShowMoreLabel`. The copy action uses `ExactCopy`; the show-more control reveals hidden caller lines and emits `toggle-code-lines`. `Code` and `Content` remain the plain-text fallback.

ChatContainer accepts caller message `Items` with `Value`, `Role`, `Avatar`, `Author`, `Time`, `Content`, `Grouped`, and optional `ThreadLabel`; grouped entries show their time in the gutter and user entries become the quiet right bubble. ImageMessage accepts caller `URL`, `Alt`, `Caption`, `Width`, and `Height`; dimensions are rendered as native image attributes and applied as a mounted aspect ratio. QuoteReply accepts `QuoteAuthor`, `Quote`, `QuoteValue`, and normal composer props; removing the quote updates only local display and emits `remove-quote`.

ChatContainer accepts optional `DateLabel`, `TypingLabel`, and per-item `Avatar` and `ThreadLabel`; its newest control scrolls its local message log and emits `scroll-bottom`. StreamingText accepts caller `Paragraphs` and `ReplayLabel`; replay emits `replay-stream`. CodeBlock accepts optional `Actions` entries (`Label`, `Value`, `Action`) for caller-run, apply, or download callbacks. AgentStepList accepts item `Status`; `Finish next item` marks the first non-complete local step complete and emits `complete-step` with `stepId`. Communication lists support Up/Down roving selection.

ChannelList accepts grouped `Sections` (`Label`, `Items`), whose entries may set `Private`, `Presence`, `Pinned`, `Muted`, and `Unread`; ChannelItem accepts the same `Items`. ChannelHeader accepts `Actions` (`Label`, `Value`, `Action`). PinnedMessages unpins the selected item. ChatMessage accepts a `Messages` transcript with `Avatar`, `Grouped`, `Unread`, `Reaction`, `Count`, and `ThreadLabel`, plus `DateLabel` and `TypingLabel`.

MailList items may include `Time`, `Unread`, `Starred`, and `HasAttachment`. Its star control updates `aria-pressed` and emits `star-mail`; opening mail supports Command/Ctrl/Shift multi-selection and emits `select-mail` with the selected values.

CalendarMonthView day buttons support arrows, PageUp/PageDown, and double-click; day opening emits `open-day`. Timed calendar cells emit `create-event` for an empty-slot drag and `resize-event` for a lower-edge event drag. Both events carry local ISO-like start/end slot values for the host to persist.

TemperatureSlider accepts `Parameters` (`Key`, `Label`, `Value`, `Min`, `Max`, `Step`, optional `Hint`), optional `SystemPrompt`, `SystemTokens`, `SystemLimit`, `TokenUsed`, and `TokenLimit`. Parameter changes remain local until the host observes `ely:change`; reset emits `reset-system-prompt`.

ConversationList accepts grouped `Sections` with caller `Items` (`Value`, `Label`, `Time`, `Pinned`, `Active`) and filters the narrow sidebar locally. FolderList accepts project `Items` and project `Files`, `Used`, and `Capacity`, composing project navigation and a knowledge panel without duplicating the project list. FolderList conversation entries emit `open-conversation` with the child caller `Value`.

SharedConversationView accepts `Title`, `SharedBy`, `SharedAt`, and role-tagged message `Items`; continue and export remain host callbacks. WelcomeScreen accepts `UserName`, one native composer, starter `Suggestions`, and optional `Capabilities`; a selection fills that composer and emits the caller action. SuggestionChips is the standalone alias for caller `Items`.

FollowUpSuggestions accepts an assistant `Author`, `Content`, and caller `Items`; each row emits `use-suggestion`. PromptLibrary accepts `Templates` (`Value`, `Label`, `Category`, `Description`, `Content`) and `Categories`. Its filter and category chips only change local visibility. Choosing a template updates the local detail pane and emits `select-template`; `use-template` emits the selected template value for the host to insert or run.

PromptInput is the composer/editor structure. It accepts `Attachments` (`Value`, `Name` or `Label`, `Content`), `Context`, `Commands`, `Models`, `Model`, and `Temperature` with optional `TemperatureMin`, `TemperatureMax`, and `TemperatureStep`. Remove emits `remove-attachment`; native file selection emits `add-attachment` metadata; Enter submits unless Shift is held. Model and temperature are local settings until the host handles their change events. The `PromptTemplateMenu` alias accepts `Templates` and emits `insert-template` with the selected caller template.

ToolCallCard accepts `Tool`, `Status` (`done`, `working`, `failed`, or `waiting`), `Summary`, `Took`, `Arguments`, optional `Result`, optional `Error`, optional `Progress`, and `Value`. Its local details disclosure presents caller arguments and output; `tool-details` is a host callback. The `ToolCallGroup` alias accepts `Title`, `Content` or `Count`, `Expanded`, and caller `Items` with the same call fields.

ToolApprovalDialog accepts `Tool`, `Detail`, `Payload`, `Permission`, and `ActionLabel`. Its modal receives native dialog focus; Escape emits `deny`. With `Permission`, it exposes `deny`, `allow-once`, and `allow-always`; without it, it exposes `approve`. The `PermissionPrompt` alias renders the three choices in place and updates only its local status. Each choice remains a host callback carrying `Payload`.

PromptInput numeric settings preserve caller zero values: `Temperature`, `TemperatureMin`, `TemperatureMax`, and `TemperatureStep` default only when absent. Pomodoro Timer likewise preserves `Progress: 0`.

Agent source views accept caller-owned data. AgentStepList renders caller `Items` with `Value`, `Label`, `Content`, and `Status` (`complete`, `done`, `working`, `waiting`, or `failed`); its finish action completes the first pending step locally and emits `complete-step`. SubAgentTree uses nested `Items` (`Value`, `Label`, `Status`, `Progress`, `Open`, `Children`) and maintains local disclosure and selection. FileChangeCard accepts `Path`, `Status`, `Added`, `Removed`, `Diff`, `Summary`, `Proposed`, and optional selectable `Changes` (`Value`, `Path`, `Label`, `Content`, `Selected`); selection emits `select-change`, while accept, reject, and review are host callbacks. ArtifactPanel accepts `Title`, `Value`, `Content`, `Source`, and version `Options`; preview/source tabs and version content are local while copy and download emit host actions. SandboxStatus accepts `Title`, `Status`, `Content`, `CPU`, `MemoryUsed`, `MemoryLimit`, and `Uptime`. MemoryPanel accepts memory `Items` (`Value`, `Content`, `Source`, `Time`) and `Checkpoints` (`Value`, `Label`, `Time`, `Files`, `Current`); forget and checkpoint selection update local UI and emit host actions, while add-memory submits typed form data.

MCPServerList accepts `Servers` (`Value`, `Label`, `Content`, `State`, `Tools`, `Enabled`, optional `ActionLabel`) and emits `ely:change` with `name: "server-enabled"` when a switch changes. The `ConnectorList` and `ToolRegistry Panel` aliases use the same canonical API; the registry keeps its local filter and access selector callbacks. InterruptButton accepts `Status`, `Question`, `Choices`, `Answer`, and `Placeholder`. Interrupt and continue update its local run state; a selected or typed human answer remains visible and emits `answer-input` for the host. TraceViewer accepts `Duration`, `SelectedLabel`, and `Tracks`, each with `Label` and `Spans` (`Value`, `Label`, `Start`, `End`, `Selected`); selecting a span emits `select-trace-span`, and wheel/range zoom is local. The `EvalResultTable` alias accepts `Columns` and `Rows` with `Cells` and sorts its local rendered rows.

Chat status and compose views keep their data caller-owned. `ErrorMessage` accepts `Title`, `Content`, `Status`, `Feedback`, and `FeedbackReasons` (`Value`, `Label`, `Selected`); retry and `send-feedback` are host callbacks, while reason chips only change local form state. `ThinkingBlock` accepts `State` (`complete`, `working`, or `disclosed`), `Open`, `Content`, `DurationLabel`, and `WorkingLabel`. `CitationBadge` accepts `Number`, `Value`, `SourceTitle`, `SourceSite`, `Content`, and `Href`; its numbered pill opens a local source disclosure and emits `open-source`.

`CitationBadge` also accepts `Citations` for an inline answer (`Text`, `Number`, and source fields) and `Sources` for a collapsible source list. `SearchProgress` accepts `Results` (`SourceSite`, `SourceTitle`, `Href`, `Date`, `Content`) and document `Chunks` (`FileName`, `Location`, `Score`, `Runs` with escaped `Text` and optional `Match`, and optional `Narrow`), in addition to caller `Items` with `Label`, `State`, `Content`, `Documents`, `Citations`, and `Href`. `PromptInput` keeps attachments and context inside its composer and accepts `Attachments`, `Context`, `Commands`, `Models`, `Model`, and temperature bounds. Command, attachment, and model events remain host callbacks. `ModelSelector` accepts `Options` (`Value`, `Label`, `Content`, `Selected`), `Modes`, `Tools`, and `Templates`; its model popover, visible mode controls, and separate Tools/Prompts disclosures emit `select-model`, `select-mode`, `set-tool`, and `insert-template` without executing a model or tool.
Messaging stories 476–481 use caller data throughout. ChannelList/ChatList accept `Sections` or flat `Items`; `Value` identifies the selected chat. ChannelItem/DirectMessageItem share `Value`, `Label`, `Avatar`, `Presence`, `Private`, `Pinned`, `Muted`, and `Unread`. Muted rows suppress counts. Selecting a row clears its displayed unread badge and emits `open` with the caller value. Arrow navigation stays within its section.

PinnedMessages accepts newest-first `Items` with `Value`, `Label`, `Avatar`, `Author`, and `Time`; legacy `Content` metadata remains supported. Unpin removes the local row and updates the count and empty state. The host persists `unpin`. ChannelHeader `Actions` supply their own labels, values, and host action names.

ChatMessage accepts `Messages` with caller `Grouped` flags, timestamps, and `Reactions` (`Value`, `Label`, `Count`, `Selected`). The existing singular `Reaction`/`Count` remains supported. Unread markers precede their message. Reactions toggle locally and emit the message value, reaction, and selected state; persistence is host-owned. UnreadDivider, MessageReactions, and TypingIndicator render their corresponding standalone view.

MessageThread/ThreadPanel accept `Root`, reply `Items`, `Chat`, `Repliers`, `Count` or `ReplyCount`, `LastReply`, and optional `Open: false`. Close and reopen only change local disclosure. The composer retains existing form props and emits `send-message` with form values. The host sends replies and supplies updated messages; the component does not invent server results.

Conversation filtering targets caller conversation rows, is case-insensitive, and restores rows when cleared. AgentStepList and its aliases treat both `done` and `complete` as terminal; Finish next item completes the first remaining step locally and emits its `stepId`. The host owns execution and persistence. Trace selection emits caller span value/start/end; a disabled trace cannot select or zoom. The interactive trace fixture is explicitly enabled rather than inheriting the generic index-based disabled sample.

The parent validated all 199 communication names through the authorized in-page audit. Subsequent bounded work uses Go rendering tests, Node checks without a browser, and the existing in-page checks for parent integration.

Messaging 482–491 follows upstream revision `49ed1f84056fa13347d68801b479a4a5a8e03b53`, the messaging gallery pages and `src/messaging`, and saved `audit-results/ely-reference/482–491` images. Receipts show Sending/Sent/Delivered/Read and up to three reader avatars plus overflow. Member groups use online/offline counts and name order, a 300px list, and a 280px profile. Presence shows four states. Status uses a 380px form. Calls use the 560px host; five 3:2 tiles fit a 640px grid with a centered short row. Screen share uses a 760px host and 200px participant strip. Stickers have four 64px columns; GIFs use two columns and caller aspect ratios.

The added caller props and boundaries are:

- `ReadReceipt`: `Status`, `Content`, `Readers` (Label/Avatar), or a `Receipts` array. Only Read shows readers.
- `MemberList/UserProfileCard`: `Items` with Value, Label, Avatar, Presence, PresenceLabel, Role, StatusText, JobTitle, Zone, LocalTime fallback, and Actions (Label/Action); root Value or item Selected chooses the profile. Selection and arrows show the local profile. Enter or double-click requests `message-member`; profile buttons emit caller action names with the member value. The host handles contact and calls. Local time is formatted at mount from the caller zone.
- `OnlineStatus`: flat Presence/PresenceLabel, legacy Status, or Items.
- `StatusSetter`: existing Name/Value/Required/Disabled remain supported; Emoji, ClearAfter, ClearOptions, SavedStatus, and Suggestions (Emoji/Label/ClearAfter) add the source fields. The native emoji input accepts arbitrary emoji and provides caller suggestions. Suggestions fill the draft; Save updates local output and emits the existing `status` form action with all fields. Clear updates local state and emits `clear-status`. Expiry scheduling and persistence belong to the host.
- `CallControls/VoiceCallBar/HuddleIndicator`: Value identifies the call; Title, Duration, People, Mic, Camera, Share, Joined, Status and Disabled are caller-owned. Local pressed states synchronize microphone controls. `set-mic`, `set-camera`, and `set-share` carry `enabled` and Value. Join and Leave update local disclosure and emit `join-call` and the existing `end-call`. These are requested UI states: the component does not acquire devices or establish a connection. The host supplies duration and confirmed state.
- `ParticipantTile/VideoCallGrid`: flat Title/URL/Alt/Status remain supported; Items, Label, Avatar, Ratio, Muted and Speaking provide tiles. `ScreenShareView` adds Presenter, Ratio, Items and CanStop; only CanStop exposes `stop-presenting`. The host supplies frames and performs screen capture or stopping.
- `IncomingCallDialog`: Caller or legacy Title, Content, Avatar, Value and ActionLabel. Accept/Decline close the native modal and record the local answer; Escape emits `decline-call`. Accept emits `accept-call`. Neither establishes a call.
- `StickerPicker`: Packs (Label/Items) or legacy Items; each item has Value, Label/Title/Name, Content and URL. Search spans all packs; blank search returns to the chosen pack. Arrow keys move through the four-column grid. Selection updates a local preview, retains `select`, and emits `pick-sticker` with value/url.
- `GifPicker`: Items with Ratio, Categories, Query and Loading. Typing or choosing a category emits `query-gifs` with query. By default the host supplies replacement results; `LocalResults: true` filters only supplied items, as used by the offline gallery. Selection retains `select` and emits `pick-gif`. SentLabel/SentTime are optional caller preview metadata for both pickers; previewing does not send a message.

The 15 images in `internal/gallery/assets/communication/` are exact copies of the upstream gallery's eight stickers, four GIFs, two camera frames, and screen frame. Their MIT notice is included as `LICENSE.txt` in that directory.

Focused checks for this scope (no browser or server required):

```sh
go test . ./internal/gallery -run 'TestMessaging|^TestCommunication' -count=1
node messaging_controls_test.mjs
node --check assets/ely-api-communication.js
node --check internal/gallery/assets/advanced-communication-checks.js
node css_test.mjs
```

The gallery interaction checks also cover these controls for the parent's next browser run. Browser geometry, screenshots, and device/network integration were not run in this bounded scope.

Mail stories 492–501 use the same upstream revision and the ten saved `audit-results/ely-reference/492–501` images. Fixtures contain the three mailbox sections, six source messages, the complete review message and two attachments, four thread messages, the empty composer with contact suggestions and its signature, six labels, and the compact snooze/send triggers. Fixture timestamps reproduce the saved reference; applications supply their own Time/RelativeTime strings. Widths follow the upstream hosts: mailboxes 260px, list/empty state 440px, reader/thread 640px, composer 560px, signature 420px, and labels 300px, all constrained by available width.

- `MailboxList/FolderList` accepts Sections (Label/Items) or the existing flat Items. Item Value, Label/Title/Name, Content, Icon, Hue, Unread and Selected remain caller data; root Value selects a box. Click, Enter and arrows change selection locally and emit `select` plus `open-mailbox` with the key.
- `MailList/MailItem` preserves Items and search, adds Selected and attachment counts, and keeps `star-mail` and `select-mail`. Shift selects a contiguous range; Control/Command toggles a row. Arrow keys select visible rows. Search restores all rows when cleared; exclusive selection clears hidden selections. `ShowSearch: false` matches the source screenshot and is used only by the story preview.
- `InboxZeroState` preserves Title/Content and the default `refresh` action. Action, ActionLabel and Value allow the story's Open the archive callback. The source's “EmptyState” is a reference to another component, not a new mail alias.
- `MailReader` preserves Subject, From, Content and Value. Label/Email/Avatar/To/Cc/Time, Paragraphs, Actions, Quote/QuoteParagraphs and Files (Value/Name/Size) supply the source message. Quotes fold with native details. Reply/Reply all/Forward use caller action names; `download-file` carries message `value` and `fileId`. `QuotedText` renders its own disclosure. `MailThreadView` uses the same item fields; the last message opens by default, while explicit Open controls initial state. Native summaries and collapse buttons only change disclosure.
- `MailComposer/RecipientInput` retains To, Subject, Value as the body, Required, Disabled and SubmitLabel; its `send` action retains the `to`, `subject` and `message` fields. Cc/Bcc, Contacts (Label/Email), Files (Value/Name/Size), Signature and SendAt add the source controls. Native multiple-email inputs provide contact suggestions; removable chips mirror each field. Cc/Bcc can be shown, drafts edited, files removed, and the draft discarded locally. At least one valid recipient across To/Cc/Bcc is required; Required additionally requires To, subject and body. `attach-file` requests host file selection/upload; `remove-attachment` carries the removed key. `discard` is retained as a host notification. Sending or scheduling retains the draft and shows a request acknowledgment, never a delivery claim. The source's “TagInput” is not a registered mail alias.
- `SignatureEditor` retains Name/Value and mirrors plain text with line breaks. `LabelPicker` retains Items (Value/Label/Title/Name/Content), adds Hue/Selected, filters locally, toggles multiple labels, and can create a selected local label. `set-labels` carries selected keys; `create-label` carries name, provisional instance-local value and selected keys. The host assigns/persists canonical IDs and can re-render; local creation does not create server data.
- `SnoozePicker` and `ScheduleSend` preserve Until/SendAt and legacy Value time seeds. Optional Presets (Label/Value) override generated choices. Otherwise, choices follow upstream's local-time rules: later today only before 17:00, tomorrow, weekday-to-Saturday, next Monday, and duplicate removal; send uses tomorrow 08:00/13:00 and Monday 08:00. Optional Now fixes the reference instant for deterministic callers. Native custom-time dialogs reject past/equal/invalid times and DST gaps. Menus support arrows, Escape and outside dismissal; closing dialogs restores trigger focus.

Snooze/schedule requests retain `snooze`/`schedule-send` and their `until`/`send_at` fields, plus `instant` (UTC ISO) and `time_zone` (browser zone) in FormData/values. Composer schedules include the current draft and attachment keys. Presets and custom input use the browser's time zone; callers that need another zone must supply appropriately offset preset values or handle zone selection in the host. Standalone Send emits `send`. No component sends mail, downloads attachments, persists labels, or schedules a server job itself.

Mail verification without a browser:

```sh
go test . ./internal/gallery -run 'TestMail|TestMessaging|^TestCommunication' -count=1
node mail_controls_test.mjs
node messaging_controls_test.mjs
node --check assets/ely-api-communication.js
node --check internal/gallery/assets/advanced-communication-checks.js
node css_test.mjs
```

The Mail Node checks exercise production recipient validation, selection ranges, filtered selection, preset deduplication, future/DST validation, draft retention, scheduling payloads, and discard behavior against a minimal DOM boundary. Go checks cover caller props/escaping and all ten rendered routes. The strengthened in-page Mail checks await the parent's browser integration; no browser was run for this scope.

### Calendar source parity 502–510

Compared against `/tmp/degreeon-ely-upstream` revision `49ed1f84056fa13347d68801b479a4a5a8e03b53`, `src/calendar`, `examples/gallery/pages/calendar`, and saved reference images 502–510. Fixtures freeze the source's relative dates at October 13, 2026. Month and year grids start on Monday; week views include seven days. Existing `Items`, `Options`, `Days`, `TimeGrid`, `Months`, editor fields and action names remain supported.

Additive props: calendar `Date` and `Today` seed local navigation; event `Hue`, `Span`, `Minutes`, `Offset`, `Caption` describe its presentation. `AllDayEvents` use `Column` (one-based day), `Span`, `Value`, `Label`, and `Hue`. Availability `Days` contain `Date`, `Label`, and caller-resolved `Slots` (`Value`, `Label`, `Selected`, `Disabled`); legacy checkbox `Options` still render. Hosts calculate free/busy and time-zone-aware availability. EventPopover accepts `Attendees` (`Name`, `Email`, `Avatar`, `Answer`, `Organizer`), `AttendeeSummary`, `Location`, `ShowEdit`, and `ShowDelete`. EventEditor adds `Hue`, `Frequency`, `Interval`, `Weekdays` (`Value`: Monday=0, `Label`, `Selected`), `Reminders` in minutes, `RepeatUntil`, and `RepeatCount`.

Navigation changes the local civil-date view and emits `calendar-navigation` with `direction`, `view`, and `date`. Supplied events are retained when returning to their original dates; the host supplies other ranges. Date selection, crowded-day disclosure, agenda selection, event disclosure, availability selection, recurrence previews, and reminder edits are local. `pick-time` includes `value` and `start`; edit/delete/save/create/resize actions request host work. Civil date/time strings remain in the caller's zone; the host resolves instants and owns network writes. All-day end dates are inclusive, so equal start/end dates are valid. Timed events require a later end. Recurrence skips unavailable dates such as February 31 and honors until/count limits.

Focused checks: `calendar_controls_test.mjs`, `calendar_parity_test.go`, `internal/gallery/calendar_parity_test.go`, and the existing in-page communication checks. Browser execution belongs to parent integration. Mail label Enter selection now filters the picker's own rows, avoiding an outer gallery list item satisfying the descendant selector; `mail_controls_test.mjs` verifies creation state and the full `create-label` payload.

Time-grid `Now` optionally supplies a civil `YYYY-MM-DDTHH:mm` current-time marker in the caller's zone. Without it the marker uses the browser's local clock; hosts using a different zone should provide `Now`. Empty-time drags show a local draft and resize drags update the displayed end before notifying the host. They stay within the starting day and reject backward resizes. Pointer positions snap to quarter hours within half-hour cells, and caller timed events with valid start/end values share lanes when they overlap. Pixel-level verification remains with parent integration.

### Source stories 511–518 and 521–525

Compared against upstream `49ed1f84056fa13347d68801b479a4a5a8e03b53`, `examples/gallery/pages/project`, `src/project`, and saved images 511–518 and 521–525. Story 511 is calendar EventCard/EventChip. The original project-control batch deferred charts 519 and 520; the later chart implementation below replaces their placeholders without claiming separate Roadmap parity. DatabaseView's own Timeline remains in scope for 525.

Existing flat props and aliases remain supported. Empty/missing subtask `Items` and lane `Cards` render safely. The gallery uses upstream's six studio tasks, four milestones, four workload rows, three time entries, and source default Pomodoro cycle. Dates are frozen to October 13, 2026 for reference comparison.

- EventCard/EventChip retain `Title`, `Value`, `Start`, `End`, and `Content`; additive `Location`, `Hue`, `Items` (cards), and `Chips` supply the source composition. Each card/chip emits `open-event` with its caller key.
- TaskItem/TaskList accept either the original single task or task `Items`: `Value`, `Title`/`Label`, `Content`, `Done`, `Status`, `Priority`, `Issue`, `Due`, `DueLabel`, `Overdue`, `Assignee`, and `Avatar`. Checkbox edits update locally and emit `toggle-task` (`taskId`, `done`); row arrows select, Enter/double-click emit `open-task` (`value`).
- StatusSelect retains `Value`, caller `Options`, `Due`, and the `update-task` form action. `Assignees` (`Value`, `Label`, `Selected`) and `AssigneeValue` add assignment. TaskDetailPanel accepts the same properties, task `Value`, `Issue`, `Labels`, `Notes`, and subtask `Items`; its title edits in place. Property changes emit `update-task` with `taskId`, `field`, `value`, `formData`, and `values`. Close/reopen is local with `close-task`/`open-task` notifications. The original `edit` action remains available.
- SubtaskList and detail subtasks recompute count/progress on toggles. Enter adds nonblank text locally and emits `add-subtask` with provisional `value`, `title`, `formData`, and `values`. The host replaces provisional keys when it persists the updated data.
- KanbanBoard and its aliases retain `Lanes` and `Cards`. Lane `Status` updates a moved card's displayed status. Drag uses the drop position; Alt+Up/Down reorders within a lane, and Alt+Left/Right preserves the index up to the destination's end. The keyboard-accessible Move control advances to the next lane. `move-task` retains `taskId`, `laneId`, and final zero-based `index`. Counts and empty states follow the local order.
- LabelManager retains caller `Items` and adds in-place names and hue selection. Names must be nonblank and unique without regard to case. Local create/rename/recolor/delete emits `create-label` (`value`, `name`, `hue`), `rename-label` (`value`, `name`), `recolor-label` (`value`, numeric `hue`), or `delete-label` (`value`). Escape cancels an invalid name edit. Strings enter the DOM as text.
- MilestoneProgress retains direct `Title`, `Progress`, and `Content`, and supports milestone `Items` with `Start`, `End`, `Today`, `Completed`, and `Total`. Standing uses upstream's tenth-of-total tolerance. WorkloadView retains `Items` (`Value`, `Capacity`, `Content`); `Avatar` and `Unit` add source presentation. Over-capacity work remains numerically visible even when the bar is full.
- TimeTracker accepts `Task`, initial clock `Value`, and `Entries` (`Value`, `Task`/`Label`, `Seconds`, `Display`). Start/Enter requires a task name; Stop appends an elapsed-time entry locally. `start-timer` includes `task`; `log-time` includes `task` and elapsed `seconds`. The original explicit `log-time` control is retained. Totals use whole minutes, and elapsed time uses a monotonic clock.
- Pomodoro retains `Value`, `Progress`, and `Phase`; `FocusMinutes`, `ShortMinutes`, `LongMinutes`, and `Rounds` default to 25/5/15/4. Pause banks elapsed time. Skip and natural completion emit `phase-change` (`phase`, `round`) and wait for Start. Reset restores Focus round one; intervals stop on component cleanup.
- DatabaseView retains `Title` and record `Items`, including `Content`, and adds `Layout` and `Today`. Table, Board, Gallery, Calendar, and Timeline switch locally without discarding records. Board changes update the local record status and emit `set-status` (`taskId`, `status`) alongside `move-task`. Calendar groups by `Due`; Timeline uses valid `Start`/`Due` spans and explains omitted dates. Record actions emit `open-task` with caller `value`.

These are local UI edits and host notifications, not server acknowledgments. The host owns persistence and synchronization across separate component roots. New deterministic coverage lives in `project_controls_test.mjs`, `project_parity_test.go`, and `internal/gallery/project_parity_test.go`; the existing in-page checks verify observable state and host payloads. No browser was run. Parent integration owns the remaining browser and pixel verification.

### Trace 418 source parity

Compared `examples/gallery/pages/agent/control.rs` and `src/debug/timeline.rs` at upstream `49ed1f84056fa13347d68801b479a4a5a8e03b53` with saved `audit-results/ely-reference/418-agent--traceviewer-evalresulttable.png`. The fixture uses all eight spans, selects `edit` (1150–2600 ms), and includes all five evaluation cases. Timeline geometry uses the source's 96px label gutter, 28px tracks, clipped proportional spans, hashed eight-color palette, responsive millisecond ruler, and detailed selection summary. The source fixture hides the extra inner headings and slider.

Existing `TraceViewer` props remain supported: `Title`, `Duration`, `SelectedLabel`, `Tracks[].Label`, `Tracks[].Spans[]` (`Value`, `Label`, `Start`, `End`, `Selected`), and `Disabled`. Additive `RangeStart`/`RangeEnd` set the initial visible millisecond range (default 0–Duration); invalid ranges fall back to 0–Duration, or 0–1 for invalid durations. `HideHeading` and `HideControls` hide only their respective UI. `SelectedLabel` remains the initial fallback text when no span is selected. Native span buttons support keyboard activation. Vertical wheel movement zooms around the pointer; horizontal wheel movement pans. Ranges may extend beyond the data, as in the source. The legacy slider remains available to callers and zooms from the current range start. Resize recomputes ruler ticks; unmount removes listeners and disconnects observation.

Selection emits `ely:action` action `select-trace-span` with the existing string `value`, `start`, and `end`, plus numeric `index`/`duration` and the caller's `track` label. Range changes emit `change-trace-range` with numeric `start`, `end`, `range: [start,end]`, and `type` (`range`, `wheel`, or `pan`). Existing `ely:change` names `trace-span` and `trace-zoom` remain. These operations are local; hosts own persistence and any external trace service.

`EvalResultTable` retains caller `Columns` (`Value`, `Label`) and `Rows[].Cells`. Known `result` cells receive Pass/Fail tags; `score` cells accept 0–1 fractions or percentages and receive progress bars. Other cell text remains intact. Sorting alternates ascending/descending, compares numeric cells numerically (including grouped tokens and seconds), exposes `aria-sort`, and emits `sort-evaluations` with `column`/`direction` plus the existing `ely:change` name `eval-sort`. Disabled controls do not mutate state or notify hosts.

Focused deterministic coverage: `trace_controls_test.mjs` exercises production geometry/ruler/zoom functions and actual mount handlers, selection/range/sort payloads, numeric ordering, disabled behavior, and lifecycle cleanup; `trace_parity_test.go` covers caller props, aliases, escaping, and empty data; `internal/gallery/trace_parity_test.go` covers source fixture values and selected state. In-page Trace checks cover span geometry, summary/payload, slider, wheel/pan, all five progress cells, and both numeric sort directions. Browser execution and image comparison of the rendered result remain with the parent.

### Calendar 502–511 visual follow-up

Compared upstream `49ed1f84056fa13347d68801b479a4a5a8e03b53`, calendar gallery `months.rs`, `times.rs`, `people.rs`, and `editing.rs`; implementation `month.rs`, `weeks.rs`, `grid.rs`, `days.rs`, `year.rs`, `chip.rs`, `card.rs`, `recurrence.rs`, and theme `calendar.rs`. Saved evidence: `audit-results/comparison/communication-checkpoint-005.jpg`, `006.jpg`, original checkpoint PNGs, and `eventeditor-visual3.png`.

Integration: load `/assets/ely-api-calendar-parity.css` **after** `/assets/ely-api-communication.css` in both the complete asset bundle and the communication family asset bundle. The parent owns these shared integration templates. The patch file supplies the calendar geometry and the separately requested EventEditor recurrence layout; it does not replace communication CSS.

The hour pitch was already 48px. Week labels collided because the fixture also supplied `OverlayTime` in the same 56px gutter, and wrapping was allowed. Week rows now omit overlay labels; DayView retains them in two 56px gutters. Headers are outside the scroll grid, followed by the all-day row, then 24 hours of 24px half-hour cells. Source-sized week/day containers are 800×560 and 420×480; initial scroll defaults to 07:30, with additive caller `ScrollTime` (`HH:MM`). The host still supplies rows, timezone-converted clock labels, and events. Rendering does not infer timezone conversions from an abbreviation.

Month spans were present in the checkpoint. The corrected layout reserves up to two bar lanes across an entire week and uses the remaining three-row budget for timed events and an overflow summary. Hidden bars remain reachable in the covered days' overflow. Source metrics are 20px chips, 2px gaps, 4px insets, and 94px day cells. Caller `Span` is clipped at the week boundary; callers provide continuation entries in the next week. Event keys and HTML-escaped caller labels are retained. The year view uses 28px day squares, 196px months, and 32px horizontal/24px vertical gaps, with event-hue dots. MiniCalendar has no event dots, matching the source gallery's plain forms calendar.

Month/year day clicks and agenda clicks select locally; Enter/double-click open (`open-day` with `value`/`date`, or `open-event` with `value`). MiniCalendar picks on click and retains its existing `open-day` notification. Day arrows cross month/year boundaries; Page keys move a month and clamp invalid month-end dates. Header buttons retain their existing view-sized navigation. Popover details include caller attendees, reference an instance-prefixed panel ID, and restore trigger focus on Escape/Close. Time slots retain create/resize host callbacks. Persistence, event loading after navigation, cross-root calendar synchronization, and timezone computation remain explicit host boundaries.

The additional EventEditor correction only changes recurrence layout: `Every [number] unit` uses a 96px, 24px-high number field (source `w_24`, small control); end-date fields use a compact 150px width. Recurrence labels use explicit inline flex layout and input inline sizes. Existing all-day, date grouping, 14px checkbox/radio, color, and reminder behavior remains intact.

Checks: `calendar_controls_test.mjs`, `calendar_visual_contract_test.mjs`, `calendar_visual_parity_test.go`, and `internal/gallery/calendar_visual_parity_test.go`. In-page assertions now distinguish select/open actions and verify popover focus and compact recurrence controls. Browser/pixel verification remains with the parent; DOM/SVG font metrics and native date-picker appearance are not claimed to match GPUI exactly.

## Project chart data and inspection

The project Gantt and Burndown render dated chart geometry instead of the former
progress/meter placeholders. Source: `src/charts/schedule.rs` and
`src/charts/burndown.rs` at upstream `da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721`.
This is chart functionality, not parity with the separate Roadmap lanes/months
shown in upstream story 519. That distinction remains open in the audit.

- `project/GanttChart`: `Items` contain `Value`, `Label` (or `Title`), `Start`,
  `End`, `Progress` (0–100), and optional `After` (zero-based earlier task indexes).
  End dates are inclusive. Invalid/self/forward dependencies are dropped, as in
  upstream. `Today` is optional. The date range is inferred from the tasks.
- `project/Burndown Chart`: `Start`, `End`, `Scope` (positive number), `Remaining`
  (daily numbers from the first day), and optional `Today`. `Max` is a deprecated
  fallback for `Scope`; `Value` remains visible as a legacy summary, never an
  invented daily series. Legacy callers must supply dates and `Remaining` to get
  a plot. Empty observations display only the ideal line. Future days are
  explicitly unreported. Scope growth raises the scale.
- Dates are strict `YYYY-MM-DD`, interpreted in UTC. Invalid data clears the plot
  and displays an error. Limits: 1,000 tasks, 36,600-day Gantt span, 3,660-day
  sprint, finite work values at most 1e12. No network data is fetched.
- Hover/focus inspects exact values. Arrow keys, Home/End navigate; Enter/Space
  emit `ely:action` with `select-task` (`value`, `index`, `start`, `end`,
  `progress`) or `select-day` (`value`, `index`, `date`, `ideal`, optional
  `remaining`). Escape clears inspection. Disabled roots suppress actions.
- HTML data tables remain available without JavaScript. Charts horizontally
  scroll inside their container on narrow screens. No scheduling mutations,
  persistence, rescheduling, or host backend are implied.
- Replace components through the normal HTMX lifecycle. For a caller-owned DOM
  data update, dispatch `ely:chart-refresh` on the component root after changing
  its data rows/attributes. Component removal aborts listeners.

Go example: `go run ./examples/project-charts`; `/sdui` demonstrates real event
mappings to host HTTP actions and server-rendered selection results. The loopback
example uses a fixed demo principal/CSRF token and is not production authentication.
Action detail `id` is the rendered component control ID. In SDUI this differs
from the logical wrapper node ID; the example validates IDs from the actual
rendered plan rather than assuming or duplicating the internal ID algorithm.
SDUI properties use lower camel
case (`remaining`, `items[].after`, `scope`); the generated catalogue is the
contract authority. Focused browser checks: `node scripts/project-charts-browser-test.mjs`.
