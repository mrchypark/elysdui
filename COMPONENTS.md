# 공통 UI

루트 `ui` 패키지는 애플리케이션에서 사용하는 공통 Go 패키지다. PocketBase와 예제 서버에 의존하지 않는다. [Ely](https://elygpui.com/)의 디자인을 프로젝트의 HTML·Go·htmx 환경에 맞춰 구현한다.


색상은 [공통 테마 설정](themes.md)의 라이트·다크 19개 역할과 `ElyTheme` API로 지정한다. `/components/themes`에서 기본 Ely Neutral과 블루·바이올렛·테라코타를 비교하고 새 제안을 편집·적용·JSON으로 공유한다.

`NewTemplates()`는 브랜드, 기본 폼, 복합 폼, 데이터 표시, 달력, 지도와 Ely 카탈로그 템플릿을 준비한다. 호출자는 자신의 `ParseFS`로 화면을 추가한다. `BindAssets(mux)`는 공통 자산의 개별 경로를 등록하므로 앱의 다른 `/assets/` 핸들러와 함께 사용할 수 있다. 중첩된 Ely 이미지·라이선스·지도 데이터도 같은 방식으로 제공한다.

`Catalogue()`는 공식 목록에 대응하는 44개 분류, 624개 예제, 1,279개 고유 이름을 반환한다. 여러 이름이 한 예제의 관련 변형을 가리킨다. **1,279개 이름이 각각 독립적인 API라는 뜻은 아니다.** 예제에 있던 구현·스타일·동작의 원본은 이 패키지에 있으며 `internal/gallery/templates/demo-*.html`은 호출과 샘플 설정만 담는다.

## 카탈로그 컴포넌트 API

고급 컴포넌트는 `Component{Chapter, Name, ID, Props}`와 `RenderComponent()`로 호출한다. `Name`에는 기본 이름이나 해당 분류의 별칭을 지정한다. 이름이 여러 분류에 있으면 `Chapter`가 필요하다. `ID`는 페이지에서 고유해야 하며, 영문자로 시작하는 128자 이하의 영문·숫자·밑줄·하이픈이다. 잘못된 이름과 ID는 오류를 반환한다. 호출자 `Props`는 변경하지 않는다.

```go
err := ui.RenderComponent(templates, writer, ui.Component{
    Chapter: "documents", Name: "MarkdownRenderer", ID: "source-preview",
    Props: map[string]any{"Title": "추출문", "Value": sourceMarkdown},
})
```

Go 화면에서는 같은 API를 `{{component (dict "Chapter" "documents" "Name" "MarkdownRenderer" "ID" "source-preview" "Props" (dict "Value" .Source))}}`로 호출한다. `{{template "ui-component-assets"}}`와 `{{template "ui-advanced-assets"}}`를 추가한다. 한 계열만 사용할 때는 `{{template "ui-advanced-family-assets" "workspace"}}`처럼 필요한 계열의 CSS와 JavaScript만 추가할 수 있다. 공유 런타임과 교차 계열 의존성은 자동으로 포함된다. HTMX로 나중에 삽입할 계열도 초기 페이지에서 미리 로드해야 한다. 자세한 내용은 [에셋 로딩 안내](docs/asset-loading.md)를 참고한다. 지도에는 `ui-map-assets`를 추가한다. 카탈로그의 상세 페이지도 이 API와 호출자 데이터를 사용한다.

공통 속성은 `Title`, `Label`, `Name`, `Value`, `Disabled`, `Required`이다. `Items`, `Options`, `Rows`, `Fields`와 SVG 좌표는 컴포넌트별 데이터이다. 문자열은 Go 템플릿이 이스케이프한다. Markdown은 GFM으로 렌더링하며 입력의 HTML과 위험한 링크 스킴을 실행하지 않는다. QR, Code128과 EAN-13은 실제 호출 값으로 인코딩한다. EAN-13은 12자리 숫자의 검증 숫자를 계산하고, 13자리 입력의 검증 숫자를 확인한다.

각 계열의 속성과 동작은 [기본 표시](advanced-foundation.md), [상호작용](advanced-interaction.md), [데이터](advanced-data.md), [작업 공간](advanced-workspace.md), [통신](advanced-communication.md), [미디어·환경](advanced-native.md), [폼·계정·설정](advanced-forms.md)에 있다.

브라우저의 `ely:change`는 인스턴스의 값 변경을 전달한다. `ely:action`은 `id`, `component`, `action`, `value`와 폼의 `formData`·`values`를 전달하며, 특정 동작은 좌표·파일·선택 경로 등 추가 데이터를 포함한다. 호스트는 `/assets/ely-api.js`의 `mount()`로 처리한다.

```js
import {mount} from '/assets/ely-api.js';
const unbind = mount(document.querySelector('#order-entry'), {
  actions: {order: async detail => submitOrder(detail.formData)},
  onChange: detail => updateDraft(detail),
});
```

호스트 결과는 `ely:result`, 실패는 `ely:error`로 전달한다. 같은 동작의 오래된 비동기 결과는 무시한다. `unbind()` 또는 요소 제거 시 리스너와 계열의 타이머를 정리한다. 인증·금융 주문·AI 생성·실제 파일 조작은 호출자가 서비스를 연결해야 한다. 요청 버튼을 누른 것만으로 완료했다고 표시하지 않는다. MarkdownEditor의 `preview-markdown`은 `source`를 전달한다. 호스트는 안전하게 렌더링한 결과를 미리보기에 반영한다. 갤러리의 `advanced-markdown.js`가 실제 서버 연결 예제를 제공한다.

`/components/api`는 고급 API 예제, `/components/audit`는 624개 기본 컴포넌트 검사, `?aliases=1`은 분류를 포함한 1,313개 이름 검사다. 검사는 합성 데이터와 두 인스턴스를 사용한다. 외부 서비스는 호출하지 않는다.

## 화면 연결

```gotemplate
<link rel="stylesheet" href="/assets/app.css">
{{template "ui-component-assets"}}
{{/* 지도 사용 시 추가 */}}
{{template "ui-map-assets"}}

{{template "combobox" (dict
  "ID" "method" "Name" "method" "Label" "연구 방법" "Required" true
  "Options" (list
    (dict "Value" "survey" "Label" "설문 조사")
    (dict "Value" "interview" "Label" "면담")))}}
```

브라우저에서 컨트롤을 만드는 리뷰 화면은 `{{template "ui-client-templates"}}`을 body에 넣고 `/assets/ui-controls.js`의 `createControl(name, attributes, text)`을 사용한다. 서버에서 렌더링한 동일한 템플릿을 복제한다. Checkbox의 반환값은 체크 표시 SVG를 포함한 `span`이며, `checked`, `name`과 변경 이벤트는 그 안의 `input`에서 읽고 쓴다. 다른 컨트롤은 네이티브 요소를 반환한다.

## 기본 폼

`input`, `textarea`, `select`, `radio-group`, `checkbox`, `switch`, `slider`, `button`, `field-label`, `field-description`, `datalist`, `badge`, `progress`, `separator`, `kbd`, `kbd-group`을 제공한다. 기본 스타일은 `assets/input.css`가 관리한다.

`Name`, `Value`, `Required`, `Disabled`는 네이티브 폼 동작을 보존한다. `input`·`textarea`·`button`·`select`의 `Class`는 배치용 클래스를 추가한다. `Role`과 `TabIndex`도 전달할 수 있다. 선택 옵션은 `ui.Option` 또는 `Value`·`Label`이 있는 `dict`이다. 여러 선택값은 옵션의 `Selected`, 개별 비활성 옵션은 `Disabled`로 지정한다. `button`에 `Href`를 주면 같은 스타일의 링크를 만든다.

Button links with `Disabled` or `AriaDisabled` omit `href`, so they expose no
native or context-menu navigation. `AriaDisabled` retains `role="link"` and
`tabindex="0"`; `Disabled` uses `tabindex="-1"`. Re-render with both flags false
to restore the URL. Changing only the DOM `aria-disabled` attribute does not
restore an omitted URL. Existing labels and ARIA descriptions remain available.

Include `ui-component-assets` for readonly checkbox/switch activation guards,
focusable aria-disabled button guards, and checkbox `Indeterminate` initialization.
Readonly choices remain focusable and participate in form submission; disabled
controls follow native exclusion rules. Mixed-state initialization runs once per
inserted checkbox, including HTMX replacements, without overwriting user changes
on repeated swap notifications.


`Attrs`는 코드에서 정한 `data-*`·`aria-*`·`hx-*` 속성이다. 속성 이름을 검증하고 값은 이스케이프한다. 이벤트 실행 속성과 임의의 HTML을 이 경로로 전달하지 않는다.

## 복합 폼

복합 컴포넌트의 `ID`는 화면에서 고유해야 한다. 내부 요소는 이 ID에서 파생한다. `Name`, `Value`, `Label`, `Placeholder`, `Disabled`, `Required`, 루트 `Attrs`를 사용한다.

| 템플릿 | 추가 설정과 동작 |
| --- | --- |
| `clearable-input`, `password-input` | 초기화와 표시 전환. 초기화 시 input·change 이벤트 전달 |
| `pin-input` | `Items` 수만큼 자리 생성. 숫자 입력·붙여넣기·Backspace 이동, 전체 코드 제출과 필수 자리 검사 |
| `tag-input` | 쉼표로 구분한 `Value`. Enter로 추가, 삭제, 독립 인스턴스와 필수 태그 검사 |
| `key-value-input` | `Items`의 `Key`·`Value`. 행 추가·삭제, 고유 ID, `Name[key]`·`Name[value]` 제출 |
| `file-dropzone` | `Accept`·`Multiple`. 선택·드롭한 파일을 네이티브 FileList에 반영. 업로드는 호출자가 처리 |
| `date-picker`, `color-picker` | 네이티브 값·제약. 날짜의 `Min`·`Max` 지원 |
| `hotkey-input` | 수정 키 조합 기록, Escape 취소, Tab 탐색 |
| `signature-pad` | 로컬 캔버스 또는 텍스트 입력. 그린 값은 데이터 URL로 제출 |
| `combobox` | `Options`의 `Value`·`Label`. 검색·방향키·Enter·Escape, 선택한 값 제출, 네이티브 select 대체 |
| `multi-select` | 옵션별 체크박스, 반복 Name 제출, 최소 한 항목 필수 검사. `Selected`로 초기 복수 선택 |
| `selectable-list` | 네이티브 select. `Size`로 목록 높이 설정 |
| `dialog`, `tabs` | 대화상자·탭 패널. `Content`, 탭 `Items`의 `Value`·`Label`·`Content`, 방향키 및 포커스 관리 |

`Content`는 문자열이면 이스케이프한다. 앱이 안전하게 렌더링한 조각만 `template.HTML`로 전달한다. 사용자 입력을 직접 `template.HTML`로 바꾸지 않는다. HTMX 4의 `htmx:after:swap`에서 새 컴포넌트를 한 번 초기화한다.

## 데이터·레이아웃·지도

`card`, `stack`, `grid`, `code-block`, `avatar`, `alert`, `empty-state`, `accordion`, `breadcrumb`, `timeline`, `menu`, `table`, `data-table`, `chart`, `calendar`, `map-view`, `coordinate-display`을 호출자가 제공한 데이터로 사용한다.

- `table`·`data-table`: `Columns`의 `Label`, `Rows`의 `Cells`. 데이터 표는 검색·정렬·열 표시·밀도를 제공한다.
- `chart`: `Label`, `Type` (`line` 또는 `bar`), `Points`의 `X`·`Y`·`Label`; 막대에는 `Width`·`Height`를 추가한다. 좌표는 SVG의 320×120 영역을 기준으로 전달한다.
- `calendar`: `ID`, `Name`, `Value` (`YYYY-MM-DD`), `Min`, `Max`, `Required`, `Disabled`. 월 전환·날짜 선택·방향키 이동과 네이티브 날짜 입력을 제공한다.
- `menu`: `ID`, `Label`, `Items`의 `Value`·`Label`·`Href`·`Disabled`·`Attrs`. 네이티브 Popover, 방향키·Escape, `ui:select` 이벤트를 제공한다.
- `map-view`: `ID`, `Label`, `Points`의 `Latitude`·`Longitude`·`Label`·`Value`, `Routes`의 `Points`, `Name`, `Value`, `Disabled`, `Mode`. Mode는 `markers`, `location`, `routes`, `heatmap`, `clusters`, `choropleth`, `world`이다. 국가별 색의 값은 국가 이름을 Label로 준다. `GeoJSON`은 호스트가 제공하는 FeatureCollection 문자열이다. 기본 국가 경계는 저장소에 포함한 Natural Earth 자료다.

## 카탈로그와 검증 범위

`ely-<분류>` 템플릿은 이전 디자인 감사의 고정 데이터 레시피이다. 현재 상세 페이지와 실제 화면은 공통 컴포넌트 API를 사용한다. 레시피의 htmx 요청 주소는 `Endpoint`로 전달하며, 갤러리만 `/components/demo`를 지정한다. 특정 레시피의 고급 금융·편집기·OS·AI 동작은 원본 런타임과 동일하게 구현한 것이 아니다. 외부 서비스와 파일 시스템을 실제로 연결하는 것은 호출자의 책임이다.

`internal/gallery`는 검색·샘플 응답·예제 구성을 담당한다. `/components/usage`는 서로 다른 값의 복수 인스턴스, 제출값, 키보드 조작을 확인하는 실행 화면이다. 갤러리는 라이브러리를 사용하는 별도 예제다. 원본 GPUI/WASM API 호환성과 모든 화면의 픽셀 일치는 보장하지 않는다.


개발·검사·CSS 빌드 방법은 [README](README.md)에 있다.
