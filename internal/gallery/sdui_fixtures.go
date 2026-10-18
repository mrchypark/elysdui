package uiexamples

import (
	"fmt"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"strings"
)

// SDUIFixture is build-time evidence for the generated SDUI contracts. The
// production sdui package does not import this package or these example values.
type SDUIFixture struct {
	Component ui.Component
	Source    string
}

// SDUIFixtures returns fresh primary/alias examples and independently rendered
// preview examples. Gallery-only presentation keys are excluded from props.
func SDUIFixtures() []SDUIFixture {
	var out []SDUIFixture
	for _, c := range advancedCases() {
		key := c.Component.Chapter + "/" + c.Component.Name
		out = append(out, SDUIFixture{cleanSDUIFixture(c.Component), "fixture:" + key})
		for i, p := range storyPreviewComponents(c.Component) {
			out = append(out, SDUIFixture{cleanSDUIFixture(p), fmt.Sprintf("preview:%s:%d", key, i)})
		}
	}
	return out
}

// SDUIAliasProps follows the gallery's explicit alias adjustments without
// installing any of them as production defaults.
func SDUIAliasProps(props map[string]any, name string) map[string]any {
	return aliasFixtureProps(props, name)
}

func cleanSDUIFixture(c ui.Component) ui.Component {
	p := map[string]any{}
	for k, v := range c.Props {
		if !strings.HasPrefix(k, "Preview") {
			p[k] = v
		}
	}
	// Relative-time specimens deliberately move in the live gallery. Freeze
	// only the generator's copy, so regeneration is byte-for-byte deterministic.
	if c.Chapter == "typography" && c.Name == "RelativeTime" {
		if formats, ok := p["Formats"].([]map[string]any); ok {
			copyFormats := make([]map[string]any, len(formats))
			for i, f := range formats {
				copyFormats[i] = map[string]any{}
				for k, v := range f {
					copyFormats[i][k] = v
				}
				copyFormats[i]["Value"] = fmt.Sprintf("2026-10-14T%02d:00:00Z", 12+i%12)
				copyFormats[i]["DateTime"] = copyFormats[i]["Value"]
			}
			p["Formats"] = copyFormats
		}
	}
	c.Props = p
	return c
}
