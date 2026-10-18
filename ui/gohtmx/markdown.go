package ui

import (
	"bytes"
	"fmt"
	"html/template"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
)

var markdown = goldmark.New(goldmark.WithExtensions(extension.GFM))

// Raw HTML and dangerous link schemes remain disabled in the renderer.
func markdownHTML(value any) (template.HTML, error) {
	if value == nil {
		return "", nil
	}
	var output bytes.Buffer
	if err := markdown.Convert([]byte(fmt.Sprint(value)), &output); err != nil {
		return "", err
	}
	return template.HTML(output.String()), nil
}
