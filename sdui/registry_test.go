package sdui

import (
	"encoding/json"
	"html/template"
	"math"
	"testing"
)

func TestPropertyNormalization(t *testing.T) {
	min, max := float64(0), float64(100)
	largeMax := float64(9007199254740992)
	cases := []struct {
		name  string
		p     Property
		value any
		want  any
		fails bool
	}{
		{"string", Property{Type: String}, "hello", "hello", false},
		{"trusted HTML rejected", Property{Type: String}, template.HTML("<b>x</b>"), nil, true},
		{"trusted URL rejected", Property{Type: String}, template.URL("https://example.com"), nil, true},
		{"bool", Property{Type: Boolean}, false, false, false},
		{"string bool rejected", Property{Type: Boolean}, "false", nil, true},
		{"int", Property{Type: Integer}, 42, 42, false},
		{"JSON integer", Property{Type: Integer}, json.Number("42"), 42, false},
		{"JSON decimal integer", Property{Type: Integer}, json.Number("42.00"), 42, false},
		{"JSON scientific integer", Property{Type: Integer}, json.Number("4.2e1"), 42, false},
		{"exact fractional rejected", Property{Type: Integer}, json.Number("1.000000000000000000001"), nil, true},
		{"fraction rejected", Property{Type: Integer}, 3.2, nil, true},
		{"float integer", Property{Type: Integer}, 3.0, 3, false},
		{"precision loss rejected", Property{Type: Integer}, float64(9007199254740992), nil, true},
		{"huge exponent rejected", Property{Type: Integer}, json.Number("1e1000000000"), nil, true},
		{"tiny exponent rejected", Property{Type: Integer}, json.Number("1e-1000000000"), nil, true},
		{"overflow rejected", Property{Type: Integer}, json.Number("9223372036854775808"), nil, true},
		{"non JSON fraction rejected", Property{Type: Integer}, json.Number("1/1"), nil, true},
		{"number", Property{Type: Number}, json.Number("1.25"), 1.25, false},
		{"nan", Property{Type: Number}, math.NaN(), nil, true},
		{"infinity", Property{Type: Number}, math.Inf(1), nil, true},
		{"bounds", Property{Type: Integer, Min: &min, Max: &max}, 50, 50, false},
		{"min", Property{Type: Integer, Min: &min}, -1, nil, true},
		{"max", Property{Type: Number, Max: &max}, 101, nil, true},
		{"exact integer bound", Property{Type: Integer, Max: &largeMax}, json.Number("9007199254740993"), nil, true},
		{"enum", Property{Type: String, Enum: []string{"sm", "md"}}, "md", "md", false},
		{"enum rejected", Property{Type: String, Enum: []string{"sm", "md"}}, "<style>", nil, true},
		{"name reserved", Property{Type: String, Format: "field-name"}, "_csrf", nil, true},
		{"name invalid", Property{Type: String, Format: "field-name"}, "a[b]", nil, true},
		{"name allowed", Property{Type: String, Format: "field-name"}, "profile.name", "profile.name", false},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			got, err := normalize(test.p, test.value)
			if test.fails {
				if err == nil {
					t.Fatalf("accepted %#v", test.value)
				}
				return
			}
			if err != nil || got != test.want {
				t.Fatalf("got %#v, %v; want %#v", got, err, test.want)
			}
		})
	}
}
