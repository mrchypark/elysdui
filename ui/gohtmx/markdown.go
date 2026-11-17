package ui

import (
	"bytes"
	"fmt"
	"html/template"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
)

const maxMarkdownBytes = 1 << 20

var markdown = goldmark.New(goldmark.WithExtensions(extension.GFM))

// Raw HTML and dangerous link schemes remain disabled in the renderer.
func markdownHTML(value any) (template.HTML, error) {
	if value == nil {
		return "", nil
	}
	src := fmt.Sprint(value)
	if len(src) > maxMarkdownBytes {
		return "", fmt.Errorf("markdown input exceeds %d bytes", maxMarkdownBytes)
	}
	var output bytes.Buffer
	if err := markdown.Convert([]byte(src), &output); err != nil {
		return "", err
	}
	return template.HTML(output.String()), nil
}
