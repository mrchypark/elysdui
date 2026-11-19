# HTMX 호스트 통합 및 컴포넌트 사용 가이드

이 문서는 `elysdui`의 Go + HTMX UI(`ui/gohtmx`) 및 SDUI 어댑터(`adapters/gohtmx`)를 실제 웹 애플리케이션에 통합할 때 스타일·레이아웃·이벤트·보안 계약을 정확히 지키기 위한 실전 가이드입니다.

---

## 1. 통합 모드 선택

호스트 앱은 아래 두 방식 중 하나를 선택합니다. **두 바인더(`ui.BindAssets`와 `gohtmx.BindAssets`)를 동시에 등록하지 마세요.**

| 모드 | 대상 | 에셋 등록 | 렌더링 |
| :--- | :--- | :--- | :--- |
| **단독 Go/HTMX (`ui/gohtmx`)** | Go 템플릿에서 직접 컴포넌트 배치 | `ui.BindAssets(mux)` | `ui.RenderComponent` 또는 `{{component ...}}` |
| **SDUI 어댑터 (`adapters/gohtmx`)** | JSON 스키마 기반 화면/리전 렌더링 | `gohtmx.BindAssets(mux)` | `plan.Render` + `plan.RenderAssets` + `plan.RenderRegion` |

---

## 2. `<head>` 에셋 로딩 순서 (필수)

CSS 캐스케이드와 JS 라이프사이클이 깨지지 않도록 초기 HTML 셸 `<head>`에 아래 순서를 지킵니다.

### A. SDUI 어댑터 (`adapters/gohtmx`)
```gotemplate
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  {{.Assets}} {{/* plan.RenderAssets(w) 결과: app.css, sdui.css, ely-controls.css, ely-api*.css, sdui.js 등 자동 포함 */}}
  <script src="/assets/htmx.min.js" defer></script>
</head>
```

### B. 단독 Go/HTMX (`ui/gohtmx`)
```gotemplate
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/assets/app.css">
  {{template "ui-component-assets"}}
  {{/* 전체 계열을 쓰거나, 사용하는 계열(초기 + HTMX 스왑으로 나중에 들어올 계열 포함)의 합집합만 선택 로드 */}}
  {{template "ui-advanced-assets"}}
  {{/* 또는 선택 로드:
  {{template "ui-advanced-family-assets" "communication"}}
  {{template "ui-advanced-family-assets" "forms"}}
  */}}
  {{/* 지도를 사용할 때만 추가: {{template "ui-map-assets"}} */}}
  <script src="/assets/htmx.min.js" defer></script>
</head>
```

> **주의**: `ely-api-communication.css` 등 계열 CSS는 `[data-ely-family="..."]` 선택자 또는 전용 클래스를 기준으로 스타일을 적용합니다. `<head>`에서 계열 에셋을 빼먹으면 버튼·헤더·리스트·아바타가 브라우저 기본 태그 스타일로 무너집니다.

---

## 3. 필수 DOM 래퍼 및 라이프사이클

1. **고급 컴포넌트는 반드시 `ui.RenderComponent` / `{{component ...}}`로 렌더링**
   - `ely-api-wrapper`가 `<section id="..." data-ely-family="..." data-ely-component="...">` 래퍼를 생성합니다.
   - 내부 HTML 조각만 복사해서 직접 렌더링하면 `[data-ely-family="..."]` CSS와 `/assets/ely-api.js` 자동 마운트가 동작하지 않습니다.
2. **SDUI 루트는 반드시 `plan.Render`로 렌더링**
   - 최상위 `<div data-sdui-screen="...">`가 생성되어 최대 폭(`56rem`), 반응형 여백(`1.5rem`, 모바일 `1rem`), 폼 간격, 파일 입력 스타일이 적용됩니다.
3. **고유한 `ID` 규약**
   - 모든 컴포넌트 `ID`는 `[A-Za-z][A-Za-z0-9_-]{0,127}` 형식이어야 하며, HTMX 스왑으로 동적 삽입되는 조각을 포함해 페이지 전체에서 유일해야 합니다.
4. **이벤트 처리**
   - 고급 컴포넌트 상태 변경은 `ely:action` / `ely:change` 커스텀 이벤트로 전달됩니다. 호스트는 `/assets/ely-api.js`의 `mount(root, handlers)`로 수신합니다.
   - `Attrs`에는 선언적 `data-*`, `aria-*`, `hx-*`만 허용되며 `hx-config`나 인라인 JS 핸들러는 렌더링 오류로 거부됩니다.

---

## 4. 데이터 포맷 & Go 타입 계약 (실수 방지)

컴포넌트에 데이터를 넘길 때 아래 계약을 반드시 지키세요.

1. **내부 ID와 표시용 텍스트 분리**
   - DB PK / UUID / 해시(`member_b984cdea556ab374`)를 `Label`, `Title`, `Author` 표시 영역에 그대로 넣지 마세요.
   - 내부 식별자는 `ID`, `Value`, `Name`에 넣고, 화면에 보이는 필드(`Label`, `Title`, `Author`)에는 사람에게 읽히는 이름/제목을 전달하세요.
2. **아바타(`Avatar`)는 짧은 이니셜/코드 사용**
   - `ChatMessage` 등에서 `Avatar`를 비워두면 `Author` 전체 문자열이 아바타 영역에 들어갑니다. `Avatar`에 `"김"`, `"홍"` 같은 짧은 이니셜(1~2자)을 명시적으로 전달하세요.
3. **타임스탬프(`Time`)는 서버에서 로캘 포맷 후 전달**
   - `date-picker`/`calendar`의 `Value`/`Min`/`Max` 입력값은 `YYYY-MM-DD`(`time.Format("2006-01-02")`)를 사용합니다.
   - `PinnedMessages`, `ChatMessage`, `timeline`, `table` 등 화면 표시용 `Time`에는 raw RFC3339/ISO 문자열(`2026-11-18T16:15:02.845376Z`)이나 `time.Time.String()`을 그대로 넘기지 말고, 서버에서 사용자 타임존 기준 `"16:15"`, `"11월 18일 16:15"` 등으로 포맷해 전달하세요.
4. **Go 포인터/HTML 타입**
   - `slider`, `progress`의 `Value`는 `*int`를 사용합니다.
   - 문자열 props는 HTML 이스케이프되므로, 신뢰할 수 있는 앱 렌더링 HTML만 `template.HTML`로 전달합니다.

---

## 5. HTMX 부분 스왑 & 반응형 컨테이너 규칙

- **부분 응답에 에셋 헬퍼 금지**: HTMX partial(`hx-get`/`hx-post`) 응답에는 마크업만 반환하고 `ui-component-assets`나 `ui-advanced-family-assets`를 포함하지 마세요.
- **오버플로 방지**: `data-table`, `code-block`, `chart`, `timeline` 등을 감싸는 커스텀 flex/grid 부모에는 `min-inline-size: 0`을 지정하세요.
- **스왑 경계**: `innerHTML` 스왑은 래퍼 안쪽만 교체하고, `outerHTML` 스왑은 고유 `ID`를 가진 완전한 루트 요소를 반환해야 `ely-api.js`가 기존 인스턴스를 정리하고 재마운트합니다.

---

## 6. 7개 계열 전체 컴포넌트 레퍼런스

각 계열의 상세 `Chapter`, `Name`, `Props`, 이벤트 목록은 아래 문서를 참고하세요.

- **개요 & 공통 API**: [COMPONENTS.md](COMPONENTS.md), [asset-loading.md](asset-loading.md), [themes.md](themes.md)
- **기본 표시 (`foundation`)**: [advanced-foundation.md](advanced-foundation.md)
- **상호작용 (`interaction`)**: [advanced-interaction.md](advanced-interaction.md)
- **데이터 (`data`) & 차트/지도**: [advanced-data.md](advanced-data.md), [charts.md](charts.md), [map-geojson.md](map-geojson.md), [map-tiles.md](map-tiles.md)
- **작업 공간 (`workspace`)**: [advanced-workspace.md](advanced-workspace.md)
- **통신 (`communication`)**: [advanced-communication.md](advanced-communication.md)
- **미디어·환경 (`native`)**: [advanced-native.md](advanced-native.md), [native-tooling.md](native-tooling.md)
- **폼·계정·설정 (`forms`)**: [advanced-forms.md](advanced-forms.md)
- **SDUI JSON 스펙**: [../sdui/sdui.md](../sdui/sdui.md), [../sdui/sdui-composition.md](../sdui/sdui-composition.md)

---

## 7. 배포 전 체크리스트 & 디자인 검증

- [ ] `ui.BindAssets(mux)` **또는** `gohtmx.BindAssets(mux)` 중 하나만 등록했는가?
- [ ] 초기 `<head>`에 `app.css`, `ui-component-assets`, 필요한 모든 계열(HTMX 스왑 포함)의 `ui-advanced-family-assets`(또는 `plan.RenderAssets`)가 포함되었는가?
- [ ] HTMX partial 응답에 `<link>`/`<script>` 에셋 헬퍼가 중복 포함되지 않았는가?
- [ ] 모든 고급 컴포넌트가 `[data-ely-family]` 래퍼 안에 있고, SDUI 화면이 `[data-sdui-screen]` 안에 있는가?
- [ ] 모든 `ID`가 `[A-Za-z][A-Za-z0-9_-]{0,127}` 규칙을 지키고 페이지 내에서 유일한가?
- [ ] UI 텍스트에 raw DB ID/UUID나 포맷되지 않은 ISO 타임스탬프가 노출되지 않는가?
- [ ] `390x844`(모바일)와 `1280x800`(데스크톱)에서 가로 스크롤(`scrollWidth <= clientWidth`), 요소 겹침, 텍스트 잘림이 없는가?

브라우저 기반 자동 레이아웃·디자인 검증 실행:

```sh
node adapters/gohtmx/tests/browser/design-verification-browser-test.mjs
```
