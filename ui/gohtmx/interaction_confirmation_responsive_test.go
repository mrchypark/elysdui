package ui

import (
	"strings"
	"testing"
)

func TestConfirmationCardGridFitsItsContainer(t *testing.T) {
	css, err := Files.ReadFile("assets/ely-api-interaction.css")
	if err != nil {
		t.Fatal(err)
	}

	const gridRule = `[data-ely-family="interaction"] .ely-interaction--feedback-source .ely-interaction__confirmation-grid{width:100%;max-width:512px;min-width:0;display:grid;grid-template-columns:minmax(0,1fr);gap:12px}`
	if !strings.Contains(string(css), gridRule) {
		t.Fatalf("confirmation card grid must fit its container and retain its 512px desktop cap; missing %q", gridRule)
	}

	const cardRule = `[data-ely-family="interaction"] .ely-interaction--feedback-source .ely-interaction__confirmation{display:flex;flex-direction:column;gap:12px;min-width:0;`
	if !strings.Contains(string(css), cardRule) {
		t.Fatalf("confirmation cards must be allowed to shrink within the grid; missing %q", cardRule)
	}
}
