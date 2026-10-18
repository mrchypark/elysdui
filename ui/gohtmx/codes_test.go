package ui

import (
	"strings"
	"testing"
)

func TestCodesEncodeCallerPayloadWithoutHTMLInjection(t *testing.T) {
	first, err := qrSVG("연구 <source> & citation")
	if err != nil || !strings.Contains(string(first), "data-ely-code=") || !strings.Contains(string(first), "&lt;source&gt;") {
		t.Fatalf("QR encoding: %v %s", err, first)
	}
	second, err := qrSVG("Different caller payload")
	if err != nil || first == second {
		t.Fatalf("QR payload did not change the encoded geometry: %v", err)
	}
	if _, err := barcodeSVG("ELY HTMX-123"); err != nil {
		t.Fatal(err)
	}
	if _, err := barcodeSVG(strings.Repeat("x", 129)); err == nil {
		t.Fatal("oversized linear barcode accepted")
	}
	if _, err := qrSVG(strings.Repeat("x", 2049)); err == nil {
		t.Fatal("oversized QR payload accepted")
	}
}

func TestEAN13EncodesAndValidatesCheckDigit(t *testing.T) {
	complete, err := barcodeSVG("4006381333931", "ean13")
	if err != nil || !strings.Contains(string(complete), `data-ely-format="ean13"`) || !strings.Contains(string(complete), `viewBox="0 0 117 70"`) {
		t.Fatalf("EAN-13 encoding or quiet zone: %v %s", err, complete)
	}
	derived, err := barcodeSVG("400638133393", "EAN-13")
	if err != nil || complete != derived {
		t.Fatalf("EAN-13 checksum was not derived consistently: %v", err)
	}
	for _, value := range []string{"4006381333932", "1234567", "12345678901x", "<source>"} {
		if _, err := barcodeSVG(value, "ean13"); err == nil {
			t.Errorf("invalid EAN-13 accepted: %q", value)
		}
	}
	if _, err := barcodeSVG("4006381333931", "unknown"); err == nil {
		t.Fatal("unknown barcode format accepted")
	}
}
