# Basic & Pattern Component Reference (`ui/gohtmx`)

Every template below is registered by `ui.NewTemplates()` and rendered with `{{template "<name>" (dict ...)}}` or a typed Go struct. All string props are HTML-escaped; pass `template.HTML` only for trusted server-rendered markup.

**Required `<head>` assets:** `/assets/app.css` and `{{template "ui-component-assets"}}`. Add `{{template "ui-map-assets"}}` for `map-view` / `coordinate-display`.

---

## 1. Core Form Controls (`shadcn-*.html`)

| Template | Key Props & Types | Behavior & Notes |
| --- | --- | --- |
| `input` | `Type` (`"text"` default, `email`, `password`, `number`, `search`, `tel`, `url`, `date`, `file`, ...), `ID`, `Name`, `Value`, `Placeholder`, `Class`, `Required`, `Disabled`, `Readonly`, `Checked`, `MinLength`/`MaxLength` (`int`), `Min`/`Max`/`Step`/`Pattern`, `InputMode`, `EnterKeyHint`, `Autocomplete`, `Autocapitalize`, `Spellcheck` (`*bool`), `Autocorrect`, `Autofocus`, `List`, `Accept`, `Multiple`, `Capture`, `Size`, `Dirname`, `Form`, `Role`, `TabIndex`, `AriaLabel`, `AriaLabelledby`, `AriaDescribedby`, `AriaInvalid`, `AriaRequired`, `Attrs` (`map[string]string`) | Native `<input>`. `Attrs` accepts validated `data-*`, `aria-*`, `hx-*`. |
| `textarea` | `ID`, `Name`, `Value`, `Placeholder`, `Class`, `Rows`/`Cols` (`int`), `MinLength`/`MaxLength` (`int`), `Required`, `Disabled`, `Readonly`, `Autofocus`, `Autocomplete`, `Autocapitalize`, `Autocorrect`, `Spellcheck` (`*bool`), `InputMode`, `EnterKeyHint`, `Dirname`, `Wrap`, `Form`, `Role`, `TabIndex`, `AriaLabel`, `AriaLabelledby`, `AriaDescribedby`, `AriaInvalid`, `AriaRequired`, `AriaErrormessage`, `Attrs` | Native `<textarea>`. |
| `select` | `ID`, `Name`, `Value`, `Placeholder`, `Options` (`[]ui.Option` or maps with `Value`, `Label`, `Selected`, `Disabled`), `Class`, `Required`, `Disabled`, `Multiple`, `Size`, `Form`, `Role`, `TabIndex`, `AriaLabel`, `AriaLabelledby`, `AriaDescribedby`, `Attrs` | Native `<select>`. `Placeholder` adds an empty-value `<option>`. Multiple selection uses each option's `Selected`. |
| `radio-group` | `Name`, `Value`, `Options` (`Value`, `Label`, `Disabled`), `AriaLabel`, `Required`, `Disabled` | Renders `<div role="group">` with `<label><input type="radio">...</label>` items sharing `Name`. |
| `checkbox` | `ID`, `Name`, `Value`, `Class`, `Checked`, `Indeterminate`, `Required`, `Disabled`, `Readonly`, `Form`, `AriaLabel`, `AriaLabelledby`, `AriaDescribedby`, `AriaInvalid`, `Attrs` | Renders a styled `<span>` wrapping `<input type="checkbox">`. `Readonly` keeps focusability & form submission (`ui-component-assets` guards activation). |
| `switch` | `ID`, `Name`, `Value`, `Size` (`"default"` \| `"sm"`), `Checked`, `Required`, `Disabled`, `Readonly`, `Autofocus`, `Form`, `AriaLabel`, `AriaLabelledby`, `AriaDescribedby`, `Attrs` | Renders `<input type="checkbox" switch role="switch">`. |
| `slider` | `ID`, `Name`, `Value` (`*int`), `Min` (`*int`, default `0`), `Max` (`*int`, default `100`), `Step` (`string`, e.g. `"5"` or `"any"`), `Disabled`, `Required`, `Form`, `List`, `AriaLabel`, `AriaLabelledby`, `AriaDescribedby`, `AriaValuetext`, `Attrs` | **Must pass `*int`** for `Value`, `Min`, `Max` in Go. |
| `progress` | `ID`, `Max` (default `100`), `Value` (`*int`), `AriaLabel` | **Must pass `*int`** for `Value`; `nil` renders indeterminate `<progress>`. |
| `field-label` | `Label`, `Required` (`bool`) | Renders `<span data-slot="field-label">` with `Required` / `Optional` suffix. |
| `field-description` | `ID`, `Text` | Helper `<p>` referenced by `AriaDescribedby`. |
| `datalist` | `ID`, `Options` (`[]string`) | Native `<datalist>` paired with `input` `List`. |

### Example: Form Controls

```gotemplate
{{template "field-label" (dict "Label" "Email" "Required" true)}}
{{template "field-description" (dict "ID" "email-help" "Text" "We will never share your email.")}}
{{template "input" (dict "ID" "email" "Name" "email" "Type" "email" "Required" true "AriaDescribedby" "email-help")}}

{{template "select" (dict
  "ID" "role" "Name" "role" "Placeholder" "Choose a role" "Value" "editor"
  "Options" (list (dict "Value" "admin" "Label" "Admin") (dict "Value" "editor" "Label" "Editor")))}}
```

---

## 2. Buttons, Badges, Typography & Chrome (`shadcn-*.html`, `ui.html`)

| Template | Key Props & Types | Behavior & Notes |
| --- | --- | --- |
| `button` | `Label`, `Href`, `Variant` (`default`/`primary`, `destructive`/`danger`, `outline`, `secondary`/`subtle`, `ghost`, `link`), `Size` (`default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`), `Type` (`button`\|`submit`\|`reset`), `Class`, `ID`, `Name`, `Value`, `Form`, `FormAction`, `FormEnctype`, `FormMethod`, `FormNoValidate`, `FormTarget`, `PopoverTarget`, `PopoverTargetAction`, `Disabled`, `AriaDisabled`, `Pressed` (`*bool`), `PressedMixed` (`bool`), `AriaExpanded` (`*bool`), `AriaHaspopup`, `AriaControls`, `AriaLabel`, `AriaLabelledby`, `AriaDescribedby`, `Role`, `TabIndex`, `Attrs` | With `Href`, renders `<a ...>`; when `Disabled` or `AriaDisabled` is true, `href` is omitted (`AriaDisabled` stays focusable with `tabindex="0"`). |
| `badge` | `Text`, `Variant` (`default`\|`secondary`\|`destructive`\|`outline`\|`ghost`\|`link`), `Tag` (`span`\|`a`\|`div`\|`button`), `Href`, `ID`, `AriaLabel`, `AriaLabelledby`, `Attrs` | Pill status/label badge. |
| `separator` | `Orientation` (`horizontal`\|`vertical`), `Decorative` (`*bool`, default `true`), `ID` | Non-decorative horizontal renders `<hr>`. |
| `kbd` | `Text`, `ID`, `AriaLabel`, `Title`, `Attrs` | Single keycap `<kbd>`. |
| `kbd-group` | `Keys` (`[]string`), `Separator` (default `"+"`), `Body` (`template.HTML`), `ID`, `AriaLabel`, `Attrs` | Renders joined keycaps (`Ctrl + K`). |
| `theme-toggle` | Translation props (`ThemeToggleLabel` / `Labels` / `I18n`) | Renders `<button data-theme-toggle>` wired to `/assets/theme.js`. |
| `font-preloads` | — | Preloads `geist`, `pretendard`, `geist-mono` woff2 fonts. |

---

## 3. Composite Controls (`ely-controls.html`)

> **Important:** Every composite control requires a unique `ID`. `Attrs` apply to the root wrapper; submitted form controls use `Name`.

| Template | Key Props & Types | Behavior & Notes |
| --- | --- | --- |
| `clearable-input` | `ID`, `Name`, `Label`, `Value`, `Placeholder`, `Disabled`, `Readonly`, `Attrs`, plus `input` props | Input with clear `×` button (`data-ui-action="clear"`). |
| `password-input` | `ID`, `Name`, `Label`, `Value`, `Placeholder`, `Disabled`, `Attrs`, plus `input` props | Password input with show/hide toggle (`aria-pressed`). |
| `pin-input` | `ID`, `Name`, `Label`, `Value`, `Items` (`[]any`, length = slot count), `Required`, `Disabled`, `Attrs` | Renders numeric `one-time-code` slots and hidden `Name` field. |
| `tag-input` | `ID`, `Name`, `Label`, `Value` (comma-delimited), `Placeholder`, `Required`, `Disabled`, `Attrs` | Adds tags on Enter; submits comma-separated hidden `Name` field. |
| `key-value-input` | `ID`, `Name`, `Label`, `Items` (`[]{Key, Value, Disabled}`), `Placeholder`, `Disabled`, `Attrs` | Dynamic `Name[key]` / `Name[value]` pairs with Add/Remove buttons. |
| `file-dropzone` | `ID`, `Name`, `Label`, `AriaLabel`, `Accept`, `Multiple`, `Required`, `Disabled`, `DropZone` (`bool`), `Hint` (`string`), `Attrs` | Native file input; set `DropZone: true` for drag-and-drop zone + Browse button. |
| `date-picker` | `ID`, `Name`, `Label`, `Value` (`YYYY-MM-DD`), `Min`, `Max`, `Required`, `Disabled`, `Attrs` | Native `<input type="date">`. |
| `color-picker` | `ID`, `Name`, `Label`, `Value` (`#RRGGBB`), `Required`, `Disabled`, `Attrs` | Native `<input type="color">`. |
| `hotkey-input` | `ID`, `Name`, `Label`, `Value`, `Placeholder`, `Glyph` (`bool`), `Required`, `Disabled`, `Attrs` | Records focused key chord; `Glyph: true` shows `⌘` prefix. |
| `signature-pad` | `ID`, `Name`, `Label`, `Value`, `Placeholder`, `Required`, `Disabled`, `Attrs` | Canvas stroke pad with typed `<details>` fallback; submits PNG data URL or text. |
| `combobox` | `ID`, `Name`, `Label`, `Value`, `Placeholder`, `Options` (`Value`, `Label`, `Note`, `Keywords`, `Disabled`), `Free` (`bool`), `Required`, `Disabled`, `Readonly`, `AriaLabel`, `Attrs` | Searchable ARIA combobox with `<noscript>` `<select>` fallback. `Free: true` allows arbitrary text. |
| `multi-select` | `ID`, `Name`, `Label`, `Value`, `Options` (`Value`, `Label`, `Selected`, `Disabled`), `Required`, `Disabled`, `Attrs` | Checkbox group submitting multiple values under `Name`. |
| `selectable-list` | `ID`, `Name`, `Label`, `Value`, `Placeholder`, `Options`, `Size`, `Required`, `Disabled`, `Attrs` | Listbox-style multi-row `<select>` with `Size`. |
| `dialog` | `ID`, `Label`, `Content` (`template.HTML` or text), `Attrs` | Native `<dialog closedby="any">` with Close button. |
| `tabs` | `ID`, `Label`, `Value` (active item `Value`), `Items` (`[]{Label, Value, Content}`), `Disabled`, `Attrs` | Accessible `tablist` + `tabpanel` switching. |

---

## 4. Layout & Data Patterns (`ely-patterns.html`)

| Template | Key Props & Types | Behavior & Notes |
| --- | --- | --- |
| `card` | `ID`, `Class`, `Title`, `Description`, `Content` | `<article class="ui-card">` container. |
| `stack` | `Horizontal` (`bool`), `Class`, `Content` | Flex stack (`.ui-stack` / `.ui-stack--row`). |
| `grid` | `Class`, `Content` | Responsive grid (`.ui-grid`). |
| `code-block` | `Label`, `Content` | Focusable `<pre><code>` region. |
| `avatar` | `Src`, `Label`, `Text` | Image avatar (`Src`) or initials (`Text`). |
| `alert` | `Title`, `Content`, `Urgent` (`bool`) | `role="alert"` when `Urgent`, else `role="status"`. |
| `empty-state` | `Title`, `Description`, `Content` | Empty state container. |
| `accordion` | `ID`, `Items` (`[]{Label, Content, Open}`) | Native `<details>` accordion stack. |
| `breadcrumb` | `Label`, `Items` (`[]{Label, Href}`) | Items without `Href` get `aria-current="page"`. |
| `timeline` | `Items` (`[]{Time, Label, Content}`) | Ordered timeline list (pass pre-formatted `Time`). |
| `menu` | `ID`, `Label`, `Disabled`, `Items` (`[]{Label, Href, Value, Disabled, Attrs}`) | Popover `role="menu"` with `menuitem` buttons/links. |
| `table` | `ID`, `Caption`, `Columns` (`[]{Label}`), `Rows` (`[]{Cells}`), `EmptyLabel` | Simple accessible HTML table. |
| `data-table` | `ID`, `Label`, `Placeholder`, `Caption`, `Columns` (`[]{Label}`), `Rows` (`[]{Cells, Initials, Trend, Quota}`), `EmptyLabel`, `Empty`, `Compact` (`bool`), `Grouped` (`bool`), `Groups` (`[]{Label, Value, Rows}`), `FilterOptions` (`[]{Value, Label}`) | Interactive client-side filter, column visibility, sort, density, and live summary. `Compact: true` enables toolbar with status filter & export action; `Grouped: true` renders collapsible groups. |
| `chart` | `Label`, `Type` (`"line"` \| `"bar"`), `Points` (`[]{X, Y, Width, Height, Label}`) | Lightweight SVG chart with accessible list. |
| `calendar` | `ID`, `Name`, `Label`, `Value` (`YYYY-MM-DD`), `Min`, `Max`, `Required`, `Disabled` | Interactive month grid + native date input. |

---

## 5. Maps (`ely-map.html`, requires `ui-map-assets`)

| Template | Key Props & Types | Behavior & Notes |
| --- | --- | --- |
| `map-view` | `ID`, `Label`, `Name`, `Value`, `TileProvider`, `Width`, `Height`, `Center` (`{Latitude, Longitude}`), `Zoom`, `Format`, `Hue`, `Mode` (`"markers"` default \| `"location"`), `Points` (`[]{Latitude, Longitude, Label, Value, Key, Hue}`), `Routes` (`[]{Points}`), `GeoJSON` (`string`), `Attribution`, `Caption`, `ShowReset` (`bool`), `ShowLocate` (`bool`), `HideCoordinates` (`bool`), `PickAction`, `MarkerAction`, `ViewportAction`, `Disabled`, plus i18n label props | Interactive map with pan/zoom, markers, optional GeoJSON, geolocation (`ShowLocate`), and hidden `Name` coordinate field. |
| `coordinate-display` | `ID`, `Value`, `Label`, `Disabled`, plus i18n copy labels | Copyable coordinate output with live clipboard status. |
