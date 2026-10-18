package ui

import (
	"strings"
	"testing"
)

func TestMarkdownHTML(t *testing.T) {
	output, err := markdownHTML("## Caller heading\n\n**Caller bold**\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert%281%29)")
	if err != nil {
		t.Fatal(err)
	}
	text := string(output)
	if !strings.Contains(text, "<h2>Caller heading</h2>") || !strings.Contains(text, "<strong>Caller bold</strong>") {
		t.Fatal(text)
	}
	if strings.Contains(text, "<script>") || strings.Contains(text, `href="javascript:`) {
		t.Fatal(text)
	}
}
