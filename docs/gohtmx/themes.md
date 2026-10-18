# 공통 색상 테마

`/assets/theme.js`가 모든 프로젝트 화면의 색상 테마를 관리한다. 테마는 색상 역할 **19개**를 라이트·다크 각각 지정한 한 쌍이다. `color-primary` 등 14개 컴포넌트 별칭은 이 역할에서 자동으로 계산하며 별도로 편집하지 않는다. 기본값은 Ely Neutral이며 Ely GPUI의 중립 팔레트와 고대비 입력 경계 값을 사용한다. Blue·Dusty Violet·Oxide Terracotta도 같은 형식의 제안으로 제공한다. 이전에 저장한 팔레트 선택은 유지한다.

## 제안과 적용

갤러리의 `/components/themes`에서 시작점을 선택하고, 모드별 색과 제안 이름을 수정한다. 라이트·다크 미리보기는 페이지 테마와 독립적으로 동작한다. JSON 복사·불러오기로 다른 사람이 같은 제안을 재현할 수 있다. 불러오기는 미리보기만 갱신하며, **이 제안 적용**을 누르면 공통 화면에도 적용한다.

설정 형식은 `{id, name, light, dark}`다. `id`는 소문자로 시작하는 48자 이하의 영문·숫자·하이픈, `name`은 80자 이하의 이름이다. 각 모드는 아래 역할을 빠짐없이 포함하고 `#RRGGBB` 값을 사용해야 한다. 알 수 없는 역할과 잘못된 색상은 거부한다.

| 구분 | 역할 |
| --- | --- |
| 페이지·표면·글자 | `color-paper`, `surface`, `color-ink`, `color-muted` |
| 선·입력·포커스 | `color-line`, `border`, `focus` |
| 강조 | `color-accent`, `accent-hover`, `accent-tint`, `on-accent` |
| 상태 전경·배경 | `draft`, `draft-tint`, `approved`, `approved-tint`, `warning`, `warning-tint`, `error`, `error-tint` |

`ElyTheme.issues(theme)`는 두 모드의 기본 조합 30개를 계산한다. 본문·보조 글자·버튼·상태 글자에는 4.5:1, 입력 경계·포커스에는 3:1 기준을 사용한다. 위험 버튼은 `error` 배경과 `on-accent` 글자 조합도 검사한다. 등록·적용은 이 검사에 실패하면 거부한다. 미리보기는 실패한 조합도 표시하므로 수정할 수 있다. 장식용 구분선에는 텍스트 대비 기준을 적용하지 않는다. 이 검사는 전체 접근성 인증을 뜻하지 않는다.

## 프로젝트 API

페이지의 head에서 기존 `/assets/theme.js`를 불러온다. 프로젝트의 외부 스크립트에서 같은 API를 사용한다. 새 테마를 위해 컴포넌트 CSS를 복제하지 않는다.

```js
const theme = ElyTheme.get('violet');
theme.id = 'research-violet';
theme.name = '차분한 연구 공간';
theme.light['color-accent'] = '#67547F';
theme.light.focus = '#67547F';
ElyTheme.register(theme);
ElyTheme.apply(theme.id); // 현재 라이트·다크 모드를 유지한다.
```

| API | 동작 |
| --- | --- |
| `tokens` | 편집할 역할 19개 |
| `list()` | 등록된 테마의 id·이름 |
| `get(id)` | 전체 설정의 복사본; JSON으로 직렬화 가능 |
| `register(theme)` | 설정·대비 검사 후 등록; 기본 테마 id는 변경 불가 |
| `apply(id, mode?)` | 페이지 적용·저장; 모드는 `light` 또는 `dark` |
| `preview(element, themeOrID, mode)` | 요소 내부에만 적용; 현재 테마·저장값 변경 없음 |
| `issues(theme)` | 실패한 모드·전경·배경·대비·최소 기준 목록 |
| `current()` | 적용된 id·모드 |

적용 시 `document`에 `ely:theme-change` 이벤트가 전달된다. 기존 헤더 토글은 현재 색상 테마를 유지하면서 명도만 바꾼다. 중첩 미리보기에서도 컴포넌트 별칭을 해당 요소의 색상으로 다시 계산한다.

브라우저 저장은 기존 `ely-theme`(명도), `ely-palette`(색상 테마 id), `ely-custom-theme`(마지막으로 적용한 사용자 설정)를 사용한다. 편집 화면의 제안은 `custom` id로 저장한다. 새로고침과 같은 출처의 다른 화면에서 복원하며, 계정·서버 간 동기화는 하지 않는다. 저장소 접근이 막히거나 설정이 손상되면 기본 테마로 동작한다. 기본 테마 복원은 명도를 유지하며 저장한 제안은 삭제하지 않는다.

승인된 로고·파비콘의 브랜드 색, 차트 계열색, 코드 문서·미디어의 고유 색은 팔레트와 별개다. CSS의 기본 라이트·다크 값은 JavaScript를 사용할 수 없을 때의 대체값이며 `ui/gohtmx/tests/unit/theme_test.mjs`에서 기본 테마와의 일치를 검사한다.

검사:

```sh
node ui/gohtmx/tests/unit/theme_test.mjs
go test ./...
```
