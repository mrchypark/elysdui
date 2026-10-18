package gohtmx_test

import (
	"bytes"
	sdui "github.com/mrchypark/elysdui/adapters/gohtmx"
	"golang.org/x/net/html"
	"strings"
	"testing"
)

func TestGroupedSegmentedSelectionContract(t *testing.T) {
	registry, err := sdui.CatalogueRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{`"b"`, `true`, `false`} {
		t.Run(value, func(t *testing.T) {
			raw := `{"version":"1","id":"screen","root":{"id":"grouped","type":"buttons/SegmentedControl","props":{"groups":[{"name":"range","value":` + value + `,"items":[{"value":"a","selected":true},{"value":"b"},{"value":"c","selected":true,"disabled":true}]},{"name":"locked","value":"a","disabled":true,"items":[{"value":"a"},{"value":"b"}]},{"name":"fallback","items":[{"value":"a","selected":true},{"value":"b","selected":true}]}]}}}`
			if value != `"b"` {
				raw = `{"version":"1","id":"screen","root":{"id":"grouped","type":"buttons/SegmentedControl","props":{"groups":[{"value":` + value + `,"items":[{"value":"a"},{"value":"b"}]}]}}}`
			}
			screen, err := sdui.Decode(strings.NewReader(raw))
			if err != nil {
				t.Fatal(err)
			}
			plan, err := sdui.Compile(screen, registry)
			if value != `"b"` {
				if err == nil {
					t.Fatal("boolean group value must be rejected at compilation")
				}
				if !strings.Contains(err.Error(), "expected string") {
					t.Fatalf("wrong rejection: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			var out bytes.Buffer
			if err := plan.Render(&out, sdui.RenderContext{Endpoint: "/sdui", CSRF: "test"}); err != nil {
				t.Fatal(err)
			}
			doc, err := html.Parse(strings.NewReader(out.String()))
			if err != nil {
				t.Fatal(err)
			}
			attrs := func(n *html.Node) map[string]string {
				m := map[string]string{}
				for _, a := range n.Attr {
					m[a.Key] = a.Val
				}
				return m
			}
			checked := map[string][]string{}
			counts := map[string]int{}
			var walk func(*html.Node)
			walk = func(n *html.Node) {
				if n.Type == html.ElementNode && n.Data == "button" {
					a := attrs(n)
					if a["role"] == "radio" {
						name := a["name"]
						counts[name]++
						if a["aria-checked"] == "true" {
							checked[name] = append(checked[name], a["value"])
						}
						_, disabled := a["disabled"]
						wantDisabled := name == "locked" || (name == "range" && a["value"] == "c")
						if disabled != wantDisabled {
							t.Errorf("%s/%s disabled=%v", name, a["value"], disabled)
						}
						if wantDisabled && a["tabindex"] != "-1" {
							t.Error("disabled choice is tabbable")
						}
					}
				}
				for child := n.FirstChild; child != nil; child = child.NextSibling {
					walk(child)
				}
			}
			walk(doc)
			for name, want := range map[string]string{"range": "b", "locked": "a", "fallback": "a"} {
				if strings.Join(checked[name], ",") != want {
					t.Errorf("%s checked=%v want exactly %s", name, checked[name], want)
				}
			}
			if counts["range"] != 3 || counts["locked"] != 2 || counts["fallback"] != 2 {
				t.Fatalf("lost group names/items: %v", counts)
			}
		})
	}
}
