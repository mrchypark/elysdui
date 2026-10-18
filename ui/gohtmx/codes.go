package ui

import (
	"fmt"
	"html/template"
	"strings"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/code128"
	"github.com/boombuler/barcode/ean"
	"github.com/boombuler/barcode/qr"
)

func qrSVG(value any) (template.HTML, error) {
	return encodedSVG(value, "qr")
}

func barcodeSVG(value any, formats ...any) (template.HTML, error) {
	format := "code128"
	if len(formats) > 1 {
		return "", fmt.Errorf("barcode accepts one format")
	}
	if len(formats) == 1 && formats[0] != nil && fmt.Sprint(formats[0]) != "" {
		format = strings.ToLower(strings.ReplaceAll(fmt.Sprint(formats[0]), "-", ""))
	}
	if format != "code128" && format != "ean13" {
		return "", fmt.Errorf("unsupported barcode format %q", format)
	}
	return encodedSVG(value, format)
}

func encodedSVG(value any, format string) (template.HTML, error) {
	matrix := format == "qr"
	if value == nil || fmt.Sprint(value) == "" {
		return `<span data-ely-empty>Provide a value to encode.</span>`, nil
	}
	content := fmt.Sprint(value)
	if len(content) > 2048 || (!matrix && len(content) > 128) {
		return "", fmt.Errorf("barcode content exceeds the supported length")
	}
	var code barcode.Barcode
	var err error
	quiet, height, label := 10, 48, "Code 128 barcode"
	if matrix {
		code, err = qr.Encode(content, qr.M, qr.Auto)
		quiet, label = 4, "QR code"
	} else if format == "ean13" {
		if len(content) != 12 && len(content) != 13 {
			return "", fmt.Errorf("EAN-13 requires 12 digits or 13 digits with a valid checksum")
		}
		code, err = ean.Encode(content)
		quiet, label = 11, "EAN-13 barcode"
	} else {
		code, err = code128.Encode(content)
	}
	if err != nil {
		return "", fmt.Errorf("encode %s: %w", label, err)
	}
	content = code.Content()
	bounds := code.Bounds()
	if matrix {
		height = bounds.Dy()
	}
	var path strings.Builder
	for y := 0; y < bounds.Dy(); y++ {
		for x := 0; x < bounds.Dx(); x++ {
			r, g, b, _ := code.At(bounds.Min.X+x, bounds.Min.Y+y).RGBA()
			if r+g+b < 3*32768 {
				h := 1
				if !matrix {
					h = height
				}
				fmt.Fprintf(&path, "M%d %dh1v%dh-1z", x+quiet, y+quiet, h)
			}
		}
	}
	return template.HTML(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" role="img" aria-label="%s" data-ely-format="%s" data-ely-code="%s" shape-rendering="crispEdges"><title>%s</title><rect width="100%%" height="100%%" fill="white"/><path d="%s" fill="black"/></svg>`, bounds.Dx()+quiet*2, height+quiet*2, label, format, template.HTMLEscapeString(content), template.HTMLEscapeString(content), path.String())), nil
}
