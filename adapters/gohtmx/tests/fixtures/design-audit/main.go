package main

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"time"

	gohtmx "github.com/mrchypark/elysdui/adapters/gohtmx"
	"github.com/mrchypark/elysdui/sdui"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	templates, err := ui.NewTemplates()
	if err != nil {
		log.Fatal(err)
	}

	screen := sdui.Screen{
		Version: "1",
		ID:      "design-audit-screen",
		Root: sdui.Node{
			ID:   "root-stack",
			Type: "stack",
			Props: map[string]any{
				"gap": "md",
			},
			Children: []sdui.Node{
				{
					ID:   "room-title",
					Type: "text",
					Props: map[string]any{
						"text": "양재 변전소 협업방 — SDUI 디자인 검증",
					},
				},
				{
					ID:   "pinned-card",
					Type: "notice",
					Props: map[string]any{
						"title": "고정 공지",
						"text":  "안녕하세요, 3호 변압기 점검 일정을 공유드립니다. 현장 안전 장구 착용을 확인해주세요.",
					},
				},
				{
					ID:   "msg-form",
					Type: "form",
					Props: map[string]any{
						"label": "메시지 작성",
					},
					Children: []sdui.Node{
						{
							ID:   "msg-input",
							Type: "input",
							Props: map[string]any{
								"name":        "message",
								"label":       "메시지",
								"placeholder": "메시지 입력 (@이름 멘션)",
							},
						},
						{
							ID:   "msg-send",
							Type: "button",
							Props: map[string]any{
								"label": "전송",
							},
						},
					},
				},
			},
		},
	}

	reg, err := gohtmx.DefaultRegistry()
	if err != nil {
		log.Fatal(err)
	}
	plan, err := gohtmx.Compile(screen, reg)
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	if err := gohtmx.BindAssets(mux); err != nil {
		log.Fatal(err)
	}

	renderComponent := func(chapter, name, id string, props map[string]any) template.HTML {
		var buf bytes.Buffer
		if err := ui.RenderComponent(templates, &buf, ui.Component{
			Chapter: chapter,
			Name:    name,
			ID:      id,
			Props:   props,
		}); err != nil {
			log.Fatalf("render %s/%s: %v", chapter, name, err)
		}
		return template.HTML(buf.String())
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "ok")
	})

	mux.HandleFunc("/communication", func(w http.ResponseWriter, r *http.Request) {
		var head bytes.Buffer
		head.WriteString(`<link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/sdui.css">`)
		if err := templates.ExecuteTemplate(&head, "ui-component-assets", nil); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := templates.ExecuteTemplate(&head, "ui-advanced-family-assets", "communication"); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := templates.ExecuteTemplate(&head, "ui-advanced-family-assets", "forms"); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		pins := renderComponent("messaging", "PinnedMessages", "comm-pins", map[string]any{
			"Items": []map[string]any{
				{
					"Value":  "pin-1",
					"Label":  "안녕하세요, 3호 변압기 점검 일정 공유드립니다. 매우 긴 공지 텍스트가 모바일에서도 넘치지 않아야 합니다.",
					"Author": "김팀장",
					"Time":   "16:15",
				},
			},
		})
		chat := renderComponent("messaging", "ChatMessage", "comm-chat", map[string]any{
			"Messages": []map[string]any{
				{
					"Value":   "m-1",
					"Author":  "김팀장",
					"Avatar":  "김",
					"Time":    "16:15",
					"Content": "안녕하세요, 3호 변압기 점검 일정 공유드립니다.",
				},
				{
					"Value":   "m-2",
					"Author":  "이대리",
					"Avatar":  "이",
					"Time":    "16:16",
					"Grouped": true,
					"Content": "네, 내일 오전 10시에 현장 확인하겠습니다 @김팀장",
				},
			},
		})
		upload := renderComponent("motion", "UploadList", "comm-upload", map[string]any{
			"Items": []map[string]any{
				{"Label": "점검체크리스트.pdf", "Value": "up-1", "Progress": "65", "State": "uploading", "Content": "1.2 MB"},
			},
		})

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Communication Design Audit</title>%s<script src="/assets/htmx.min.js" defer></script></head><body><main data-sdui-screen="comm-audit" class="sdui-stack" data-sdui-gap="md"><h1>양재 변전소 협업방</h1>%s%s<form class="sdui-stack" data-sdui-gap="sm"><input type="file" name="raw_attachment" aria-label="직접 파일 첨부">%s</form><div><button id="load-fragment" type="button" class="button" hx-get="/fragment" hx-target="#swap-target" hx-swap="innerHTML">추가 공지 불러오기</button><div id="swap-target"></div></div></main></body></html>`, head.String(), pins, chat, upload)
	})

	mux.HandleFunc("/fragment", func(w http.ResponseWriter, r *http.Request) {
		pins := renderComponent("messaging", "PinnedMessages", "swapped-pins", map[string]any{
			"Items": []map[string]any{
				{
					"Value":  "pin-2",
					"Label":  "HTMX 부분 스왑으로 추가된 고정 공지",
					"Author": "박과장",
					"Time":   "16:20",
				},
			},
		})
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, string(pins))
	})

	mux.HandleFunc("/sdui", func(w http.ResponseWriter, r *http.Request) {
		var assets, body bytes.Buffer
		if err := plan.RenderAssets(&assets); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := plan.Render(&body, gohtmx.RenderContext{Endpoint: "/sdui/action", CSRF: "audit-csrf"}); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SDUI Design Audit</title>%s<script src="/assets/htmx.min.js" defer></script></head><body>%s</body></html>`, assets.String(), body.String())
	})

	mux.HandleFunc("/families", func(w http.ResponseWriter, r *http.Request) {
		var head bytes.Buffer
		head.WriteString(`<link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/sdui.css">`)
		if err := templates.ExecuteTemplate(&head, "ui-component-assets", nil); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := templates.ExecuteTemplate(&head, "ui-advanced-assets", nil); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		alert := renderComponent("feedback", "Alert", "fam-alert", map[string]any{
			"Items": []map[string]any{
				{
					"Label":    "점검 안내",
					"Severity": "info",
					"Content":  "모든 계열의 모바일 폭(390px) 및 데스크톱(1280px) 레이아웃을 검증합니다.",
				},
			},
		})
		tabs := renderComponent("navigation", "Tabs", "fam-tabs", map[string]any{
			"Value": "overview",
			"Items": []map[string]any{
				{"Value": "overview", "Label": "개요", "Selected": true, "Content": "요약 내용"},
				{"Value": "history", "Label": "이력", "Content": "점검 이력"},
			},
		})
		table := renderComponent("tables", "VirtualTable", "fam-table", map[string]any{
			"Columns": []map[string]any{
				{"Key": "equip", "Label": "설비"},
				{"Key": "status", "Label": "상태"},
				{"Key": "owner", "Label": "담당자"},
			},
			"Rows": []map[string]any{
				{"equip": "3호 변압기", "status": "정상", "owner": "김팀장"},
				{"equip": "1호 차단기", "status": "점검중", "owner": "이대리"},
			},
		})
		form := renderComponent("forms", "Input", "fam-form", map[string]any{
			"Label":       "작업자 이름",
			"Name":        "worker",
			"Placeholder": "김팀장",
		})

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>All Families Design Audit</title>%s<script src="/assets/htmx.min.js" defer></script></head><body><main data-sdui-screen="families-audit" class="sdui-stack" data-sdui-gap="md">%s%s%s%s</main></body></html>`, head.String(), alert, tabs, table, form)
	})

	server := &http.Server{
		Addr:              "127.0.0.1:" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		<-context.Background().Done()
	}()
	log.Fatal(server.ListenAndServe())
}
