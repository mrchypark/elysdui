# HTMX 호스트 통합 및 컴포넌트 사용 가이드

이 문서는 `elysdui`의 Go + HTMX UI(`ui/gohtmx`) 및 SDUI 어댑터(`adapters/gohtmx`)를 실제 웹 애플리케이션에 통합할 때 스타일·레이아웃·이벤트·보안 계약을 정확히 지키기 위한 실전 가이드입니다.

---

## 1. 통합 모드 선택

호스트 앱은 아래 방식 중 하나를 선택합니다. **`ui.BindAssets`와 `gohtmx.BindAssets`를 같은 `http.ServeMux`에 중복 등록하지 마세요.** 기존 `ui/gohtmx` 라우트에 SDUI 화면을 함께 붙일 때는 `ui.BindAssets(mux)` 뒤에 `gohtmx.BindBridgeAssets(mux)`를 호출해 SDUI 브리지 에셋(`/assets/sdui.css`, `/assets/sdui.js`)만 추가로 등록합니다.

| 모드 | 대상 | 에셋 등록 | 렌더링 |
| :--- | :--- | :--- | :--- |
| **단독 Go/HTMX (`ui/gohtmx`)** | Go 템플릿에서 직접 컴포넌트 배치 | `ui.BindAssets(mux)` | `ui.RenderComponent` 또는 `{{component ...}}` |
| **SDUI 전용 (`adapters/gohtmx`)** | JSON 스키마 기반 화면/리전 렌더링 | `gohtmx.BindAssets(mux)` | `plan.Render` + `plan.RenderAssets` + `plan.RenderRegion` |
| **혼합·커스텀 셸 (`ui` + `adapters/gohtmx`)** | 자체 내비게이션 셸 안에 SDUI 화면 임베드 | `ui.BindAssets(mux)` + `gohtmx.BindBridgeAssets(mux)` | `handler.RenderFragment` + `handler.ServeFragment` (`FragmentOnHXRequest`) |

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

### C. 커스텀 레이아웃 셸 임베딩 (Fragment + Delta Assets)

자체 사이드바(`&lt;aside&gt;`)와 메인 컨테이너(`&lt;main id="shell-content"&gt;`)를 가진 호스트 앱은 전체 HTML 문서를 문자열로 자를 필요 없이 `adapters/gohtmx`의 fragment/asset API를 사용합니다.

1. **초기 셸 `<head>` 에셋 사전 로드 및 중복 제거**:
   - `plan.Assets()`, `handler.Assets()`, `store.Assets()`는 화면에 필요한 `AssetBundle`(`Stylesheets`, `Scripts`, `Modules`)을 반환합니다.
   - 셸이 이미 기본 UI 에셋(`gohtmx.BaseUIAssets()`)을 로드했다면 `Without` / `Exclude`로 이미 포함된 에셋을 빼고, 여러 SDUI 화면의 합집합을 `gohtmx.MergeAssets(...)`로 합친 뒤 `.HTML()`로 `<head>`에 한 번만 출력하세요. (개별 계열만 직접 추가할 때는 `gohtmx.FamilyAssets(...)`, 브리지 에셋만 필요할 때는 `gohtmx.BridgeAssets()`를 사용합니다.)
2. **전체 페이지 로드 vs HTMX 부분 스왑**:
   - **전체 페이지 요청**: `handler.RenderFragment(r)`(또는 `store.RenderFragment(r)`)를 호출하면 인증·인가·CSRF·로더 실행 후 `[data-sdui-screen]` 루트 마크업(`frag.Body`)과 `frag.Assets`를 돌려줍니다.
   - **HTMX 부분 스왑 (`HX-Request: true`)**: 라우트 핸들러에서 `handler.ServeFragment(w, r)`(또는 `store.ServeFragment(w, r)`)를 호출하거나, `gohtmx.Config{FragmentOnHXRequest: true}`를 설정해 `ServeHTTP`가 `HX-Request: true` (`HX-Boosted: true` 제외) 요청에 `[data-sdui-screen]` 조각만 반환하도록 합니다.
   - **셸 사전 로드 계약**: HTMX 부분 응답은 `<head>`나 `<script>`를 중복 삽입하지 않고 `[data-sdui-screen]` 마크업만 반환합니다. 따라서 내비게이션으로 나중에 스왑될 수 있는 모든 SDUI 화면의 계열·지도·브리지 에셋 합집합은 초기 셸 `<head>`에 미리 로드되어 있어야 합니다.
3. **커스텀 라이트/다크 테마 토큰 규약 (`ely-map.css` 포함)**:
   - 지도(`maps/MapView`, `maps/LocationPicker` 등)와 컴포넌트 CSS는 `app.css`와 동일한 라이트 기본값 및 `--surface` / `--color-paper` + `--color-ink` / `--ink` 동일 극성 쌍을 사용합니다. 커스텀 테마 호스트에서 `--surface`만 재정의하는 경우에도 `--color-ink`(또는 `--ink`)를 배경 극성에 맞게 함께 정의하세요.

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

- [ ] `gohtmx.BindAssets(mux)` **또는** `ui.BindAssets(mux)`(+ SDUI 병용 시 `gohtmx.BindBridgeAssets(mux)`)로 중복 없이 에셋을 등록했는가?
- [ ] 초기 `<head>`에 `app.css`, `ui-component-assets`, 필요한 모든 계열·지도·브리지 에셋(HTMX 스왑으로 들어올 SDUI 화면 포함)의 합집합(`plan.RenderAssets` 또는 `MergeAssets(...).Without(...)`)이 중복 없이 포함되었는가?
- [ ] 커스텀 셸 임베딩 시 HTML 문서를 수동 절단하지 않고 `RenderFragment` / `ServeFragment`(`FragmentOnHXRequest`)를 사용하며, HTMX partial 응답에 `<link>`/`<script>` 에셋 헬퍼가 중복 포함되지 않았는가?
- [ ] 모든 고급 컴포넌트가 `[data-ely-family]` 래퍼 안에 있고, SDUI 화면이 `[data-sdui-screen]` 안에 있는가?
- [ ] 모든 `ID`가 `[A-Za-z][A-Za-z0-9_-]{0,127}` 규칙을 지키고 페이지 내에서 유일한가?
- [ ] UI 텍스트에 raw DB ID/UUID나 포맷되지 않은 ISO 타임스탬프가 노출되지 않는가?
- [ ] `390x844`(모바일)와 `1280x800`(데스크톱)에서 가로 스크롤(`scrollWidth <= clientWidth`), 요소 겹침, 텍스트 잘림이 없는가?

브라우저 기반 자동 레이아웃·디자인 검증 실행:

```sh
node adapters/gohtmx/tests/browser/design-verification-browser-test.mjs
```
