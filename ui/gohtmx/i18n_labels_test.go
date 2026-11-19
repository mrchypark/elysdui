package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestI18nLabelOverridesAndFallbacks(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}

	t.Run("map-view defaults to English", func(t *testing.T) {
		var out bytes.Buffer
		err := tpl.ExecuteTemplate(&out, "map-view", map[string]any{
			"ID":        "map-default",
			"ShowReset": true,
			"Center":    map[string]any{"Latitude": 37.5665, "Longitude": 126.9780},
			"Value":     "37.5665, 126.9780",
		})
		if err != nil {
			t.Fatal(err)
		}
		html := out.String()
		for _, want := range []string{
			`aria-label="Map"`,
			`aria-label="Zoom in"`,
			`aria-label="Zoom out"`,
			`>Reset</button>`,
			`aria-label="Copy coordinates"`,
			`aria-label="Close map popup"`,
			`aria-label="Map value legend"`,
		} {
			if !strings.Contains(html, want) {
				t.Errorf("expected default English label %q in %s", want, html)
			}
		}
	})

	t.Run("map-view overrides via flat Props and Labels map", func(t *testing.T) {
		var out bytes.Buffer
		err := tpl.ExecuteTemplate(&out, "map-view", map[string]any{
			"ID":          "map-ko",
			"ShowReset":   true,
			"Center":      map[string]any{"Latitude": 37.5665, "Longitude": 126.9780},
			"Value":       "37.5665, 126.9780",
			"MapLabel":    "변전소 지도",
			"ZoomInLabel": "확대",
			"CopiedLabel": "복사됨",
			"Labels": map[string]string{
				"zoom_out":         "축소",
				"reset":            "초기화",
				"copy_coordinates": "좌표 복사",
				"close_map_popup":  "팝업 닫기",
				"map_value_legend": "범례",
				"low":              "낮음",
				"high":             "높음",
				"no_data":          "데이터 없음",
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		html := out.String()
		for _, want := range []string{
			`aria-label="변전소 지도"`,
			`aria-label="확대"`,
			`aria-label="축소"`,
			`>초기화</button>`,
			`aria-label="좌표 복사"`,
			`data-copied-label="복사됨"`,
			`aria-label="팝업 닫기"`,
			`aria-label="범례"`,
			`>낮음<`,
			`>높음<`,
			`데이터 없음`,
		} {
			if !strings.Contains(html, want) {
				t.Errorf("expected Korean override %q in %s", want, html)
			}
		}
	})

	t.Run("I18n map overrides and HTML escaping in communication & patterns", func(t *testing.T) {
		var out bytes.Buffer
		err := RenderComponent(tpl, &out, Component{
			Chapter: "messaging",
			Name:    "PinnedMessages",
			ID:      "pins-ko",
			Props: map[string]any{
				"I18n": map[string]string{
					"pinned":         "고정됨",
					"nothing_pinned": "고정된 메시지가 없습니다.",
					"unpin":          `<script>고정해제</script>`,
				},
				"Items": []map[string]any{
					{"Value": "m1", "Label": "점검 안내"},
				},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		html := out.String()
		if !strings.Contains(html, "<h2>고정됨</h2>") {
			t.Errorf("expected I18n pinned heading, got %s", html)
		}
		if strings.Contains(html, "<script>고정해제</script>") || !strings.Contains(html, "&lt;script&gt;고정해제&lt;/script&gt;") {
			t.Errorf("expected escaped label override, got %s", html)
		}

		var dtOut bytes.Buffer
		if err := tpl.ExecuteTemplate(&dtOut, "data-table-toolbar", map[string]any{
			"ID": "dt-ko",
			"Labels": map[string]string{
				"search":  "검색",
				"filter":  "필터",
				"columns": "열",
				"density": "밀도",
				"export":  "내보내기",
			},
		}); err != nil {
			t.Fatal(err)
		}
		for _, want := range []string{`placeholder="검색"`, `>필터</summary>`, `>열</summary>`, `>밀도</button>`, `>내보내기</button>`} {
			if !strings.Contains(dtOut.String(), want) {
				t.Errorf("expected data-table-toolbar override %q in %s", want, dtOut.String())
			}
		}
	})
}
