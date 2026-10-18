package gohtmx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/mrchypark/elysdui/sdui"
	ui "github.com/mrchypark/elysdui/ui/gohtmx"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"golang.org/x/net/html"
	"io"
	"math"
	"math/big"
	"regexp"
	"strconv"
	"strings"
)

var colorValue = regexp.MustCompile(`^([A-Za-z]{1,32}|#[A-Fa-f0-9]{3}|#[A-Fa-f0-9]{4}|#[A-Fa-f0-9]{6}|#[A-Fa-f0-9]{8}|(rgb|rgba|hsl|hsla)\([0-9.+% ,/\-]{1,100}\))$`)
var cssToken = regexp.MustCompile(`^--[a-z][a-z0-9-]{0,63}$`)
var fontFamilyValue = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9 ,_-]{0,127}$`)

type valueBudget struct{ values, bytes int }

func newValueBudget() *valueBudget { return &valueBudget{} }
func (b *valueBudget) consume(bytes int) error {
	b.values++
	if err := b.addBytes(bytes); err != nil {
		return err
	}
	if b.values > MaxValues {
		return fmt.Errorf("value count exceeds %d", MaxValues)
	}
	return nil
}
func (b *valueBudget) addBytes(bytes int) error {
	b.bytes += bytes
	if b.bytes > MaxNormalizationBytes {
		return fmt.Errorf("normalized data exceeds %d bytes", MaxNormalizationBytes)
	}
	return nil
}

func exactInteger(value any) (int, error) {
	var text string
	switch v := value.(type) {
	case int:
		return v, nil
	case int8:
		return int(v), nil
	case int16:
		return int(v), nil
	case int32:
		return int(v), nil
	case int64:
		text = strconv.FormatInt(v, 10)
	case uint:
		text = strconv.FormatUint(uint64(v), 10)
	case uint8:
		return int(v), nil
	case uint16:
		return int(v), nil
	case uint32:
		text = strconv.FormatUint(uint64(v), 10)
	case uint64:
		text = strconv.FormatUint(v, 10)
	case json.Number:
		if len(v) > 128 || !jsonNumeric.MatchString(string(v)) {
			return 0, fmt.Errorf("invalid JSON number")
		}
		text = string(v)
	case float32:
		return exactInteger(float64(v))
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) || math.Trunc(v) != v || math.Abs(v) > 9007199254740991 {
			return 0, fmt.Errorf("expected exact integer")
		}
		text = strconv.FormatFloat(v, 'f', 0, 64)
	default:
		return 0, fmt.Errorf("expected integer")
	}
	if n, err := strconv.Atoi(text); err == nil {
		return n, nil
	}
	// Rat preserves decimals exactly; cap exponent and length before allocation.
	if len(text) > 128 {
		return 0, fmt.Errorf("integer exceeds limit")
	}
	if index := strings.IndexAny(text, "eE"); index >= 0 {
		exp, err := strconv.Atoi(text[index+1:])
		if err != nil || exp < -308 || exp > 308 {
			return 0, fmt.Errorf("integer exponent exceeds limit")
		}
	}
	rational, ok := new(big.Rat).SetString(text)
	if !ok || !rational.IsInt() || !rational.Num().IsInt64() {
		return 0, fmt.Errorf("expected exact integer")
	}
	number := rational.Num().Int64()
	result := int(number)
	if int64(result) != number {
		return 0, fmt.Errorf("integer exceeds platform limit")
	}
	return result, nil
}

// normalizeSandboxHTML rejects unsupported capabilities before serializing a
// canonical inert document. The iframe sandbox is defense in depth, not a
// substitute for the same resource-origin policy used by ordinary URL props.
func normalizeSandboxHTML(source string, policy URLPolicy) (string, error) {
	doc, err := html.Parse(strings.NewReader(source))
	if err != nil {
		return "", fmt.Errorf("invalid sandbox document: %w", err)
	}
	tags := map[string]bool{}
	for _, tag := range strings.Fields("html head title body main section article aside header footer nav div span p br hr h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table caption thead tbody tfoot tr th td pre code blockquote q em strong b i u s small sub sup mark a img figure figcaption details summary") {
		tags[tag] = true
	}
	count := 0
	var check func(*html.Node, int) error
	check = func(node *html.Node, depth int) error {
		count++
		if depth > 64 || count > MaxValues {
			return fmt.Errorf("sandbox document exceeds complexity limit")
		}
		switch node.Type {
		case html.DocumentNode, html.TextNode, html.CommentNode:
		case html.DoctypeNode:
			if !strings.EqualFold(node.Data, "html") || len(node.Attr) > 0 {
				return fmt.Errorf("unsupported sandbox doctype")
			}
		case html.ElementNode:
			if node.Namespace != "" || !tags[node.Data] {
				return fmt.Errorf("sandbox document element %q is unsupported", node.Data)
			}
			seen := map[string]bool{}
			for _, attr := range node.Attr {
				if attr.Namespace != "" || seen[attr.Key] {
					return fmt.Errorf("sandbox document attribute %q is unsupported", attr.Key)
				}
				seen[attr.Key] = true
				allowed := false
				switch attr.Key {
				case "title", "lang":
					allowed = true
				case "dir":
					allowed = attr.Val == "ltr" || attr.Val == "rtl" || attr.Val == "auto"
				case "href":
					allowed = node.Data == "a"
					if allowed {
						if err := sdui.ValidateURL("url", attr.Val, policy); err != nil {
							return fmt.Errorf("sandbox href: %w", err)
						}
					}
				case "src":
					allowed = node.Data == "img"
					if allowed {
						if err := sdui.ValidateURL("image-url", attr.Val, policy); err != nil {
							return fmt.Errorf("sandbox src: %w", err)
						}
					}
				case "alt":
					allowed = node.Data == "img"
				case "width", "height":
					if node.Data == "img" {
						n, err := strconv.Atoi(attr.Val)
						allowed = err == nil && n >= 1 && n <= 4096
					}
				case "colspan", "rowspan":
					if node.Data == "td" || node.Data == "th" {
						n, err := strconv.Atoi(attr.Val)
						allowed = err == nil && n >= 1 && n <= 100
					}
				case "scope":
					allowed = node.Data == "th" && (attr.Val == "row" || attr.Val == "col" || attr.Val == "rowgroup" || attr.Val == "colgroup")
				case "start":
					if node.Data == "ol" {
						n, err := strconv.Atoi(attr.Val)
						allowed = err == nil && n >= -100000 && n <= 100000
					}
				case "open":
					allowed = node.Data == "details" && (attr.Val == "" || attr.Val == "open")
				}
				if !allowed {
					return fmt.Errorf("sandbox document attribute %q on %s is unsupported", attr.Key, node.Data)
				}
			}
		default:
			return fmt.Errorf("unsupported sandbox document node")
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if err := check(child, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	if err := check(doc, 0); err != nil {
		return "", err
	}
	var output bytes.Buffer
	if err := html.Render(&output, doc); err != nil {
		return "", fmt.Errorf("serialize sandbox document: %w", err)
	}
	return output.String(), nil
}

var markdownSourceValidator = goldmark.New(goldmark.WithExtensions(extension.GFM))

type valueOutputBuffer struct{ bytes.Buffer }

func (b *valueOutputBuffer) Write(p []byte) (int, error) {
	if len(p) > MaxNormalizationBytes-b.Len() {
		return 0, fmt.Errorf("formatted value exceeds output limit")
	}
	return b.Buffer.Write(p)
}

// The renderer uses the same GFM configuration as ui.markdownHTML. Inspecting
// its rendered destinations handles escapes, references, entities and autolinks
// consistently; the original source stays ordinary text for the trusted helper.
func validateMarkdownSource(source string, policy URLPolicy) error {
	var rendered valueOutputBuffer
	if err := markdownSourceValidator.Convert([]byte(source), &rendered); err != nil {
		return fmt.Errorf("invalid markdown: %w", err)
	}
	doc, err := html.Parse(strings.NewReader(rendered.String()))
	if err != nil {
		return fmt.Errorf("invalid rendered markdown: %w", err)
	}
	count := 0
	var walk func(*html.Node, int) error
	walk = func(node *html.Node, depth int) error {
		count++
		if count > MaxValues || depth > 64 {
			return fmt.Errorf("markdown exceeds complexity limit")
		}
		if node.Type == html.ElementNode {
			for _, attr := range node.Attr {
				format := ""
				if attr.Key == "href" {
					format = "url"
				}
				if attr.Key == "src" {
					format = "image-url"
				}
				if format != "" {
					if err := sdui.ValidateURL(format, attr.Val, policy); err != nil {
						return fmt.Errorf("markdown %s: %w", attr.Key, err)
					}
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if err := walk(child, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	return walk(doc, 0)
}

// Inline Lottie data is intentionally a bounded vector-only subset. External
// assets, fonts, text, expressions, audio and precompositions are host-owned
// integrations, not capabilities granted by an arbitrary animation string.
func validateLottieJSON(source string) error {
	check := json.NewDecoder(strings.NewReader(source))
	check.UseNumber()
	if err := checkJSONValue(check, 0); err != nil {
		return fmt.Errorf("invalid Lottie JSON: %w", err)
	}
	if _, err := check.Token(); err != io.EOF {
		return fmt.Errorf("trailing Lottie JSON")
	}
	decoder := json.NewDecoder(strings.NewReader(source))
	decoder.UseNumber()
	var root map[string]any
	if err := decoder.Decode(&root); err != nil || root == nil {
		return fmt.Errorf("Lottie animation must be an object")
	}
	if _, ok := root["layers"].([]any); !ok {
		return fmt.Errorf("Lottie animation requires layers")
	}
	for key, maximum := range map[string]float64{"fr": 240, "w": 8192, "h": 8192} {
		if value, exists := root[key]; exists {
			number, ok := value.(json.Number)
			if !ok {
				return fmt.Errorf("Lottie %s must be numeric", key)
			}
			f, err := number.Float64()
			if err != nil || f <= 0 || f > maximum {
				return fmt.Errorf("Lottie %s exceeds supported bounds", key)
			}
		}
	}
	budget := newValueBudget()
	var walk func(any, int, string) error
	walk = func(value any, depth int, key string) error {
		if depth > MaxValueDepth {
			return fmt.Errorf("Lottie nesting exceeds limit")
		}
		if err := budget.consume(8); err != nil {
			return err
		}
		switch v := value.(type) {
		case nil, bool:
			return nil
		case json.Number:
			if len(v) > 128 {
				return fmt.Errorf("Lottie number exceeds limit")
			}
			number, err := v.Float64()
			if err != nil || math.IsNaN(number) || math.IsInf(number, 0) || math.Abs(number) > 10000000 {
				return fmt.Errorf("invalid or excessive Lottie number")
			}
			if key == "p" && (number < 0 || number > 256 || math.Trunc(number) != number) {
				return fmt.Errorf("Lottie gradient stops exceed supported bounds")
			}
		case string:
			if len(v) > MaxStringBytes {
				return fmt.Errorf("Lottie string exceeds limit")
			}
			if err := budget.addBytes(len(v)); err != nil {
				return err
			}
			if key == "x" || key == "p" {
				return fmt.Errorf("Lottie expressions and string resource paths are unsupported")
			}
		case []any:
			if len(v) > sdui.HardMaxArrayItems {
				return fmt.Errorf("Lottie array exceeds limit")
			}
			for _, item := range v {
				if err := walk(item, depth+1, key); err != nil {
					return err
				}
			}
		case map[string]any:
			if len(v) > MaxObjectProperties {
				return fmt.Errorf("Lottie object exceeds limit")
			}
			for name, item := range v {
				if len(name) > 128 || dangerousDictionaryKey(name) {
					return fmt.Errorf("invalid Lottie key")
				}
				switch strings.ToLower(name) {
				case "assets", "fonts", "chars", "ef":
					empty := false
					switch collection := item.(type) {
					case []any:
						empty = len(collection) == 0
					case map[string]any:
						empty = len(collection) == 0
					case nil:
						empty = true
					}
					if !empty {
						return fmt.Errorf("Lottie %s resources are unsupported", name)
					}
				case "refid", "u", "url", "href", "src", "fpath", "ffamily", "expression", "expressions", "audio":
					return fmt.Errorf("Lottie resource or executable field %q is unsupported", name)
				}
				if name == "layers" {
					layers, ok := item.([]any)
					if !ok {
						return fmt.Errorf("Lottie layers must be an array")
					}
					for _, layer := range layers {
						object, ok := layer.(map[string]any)
						if !ok {
							return fmt.Errorf("Lottie layer must be an object")
						}
						n, err := exactInteger(object["ty"])
						if err != nil || (n != 1 && n != 3 && n != 4) {
							return fmt.Errorf("only Lottie solid, null and shape layers are supported")
						}
					}
				}
				if name == "ty" {
					if shape, ok := item.(string); ok && shape == "rp" {
						return fmt.Errorf("Lottie repeater shapes are unsupported")
					}
				}
				if name == "sc" {
					color, ok := item.(string)
					if !ok || !colorValue.MatchString(color) {
						return fmt.Errorf("invalid Lottie solid color")
					}
				}
				if err := walk(item, depth+1, name); err != nil {
					return err
				}
			}
		default:
			return fmt.Errorf("unsupported Lottie value")
		}
		return nil
	}
	return walk(root, 1, "")
}

func checkJSONValue(d *json.Decoder, depth int) error {
	// Each tree level adds a node object and its children array. The compile
	// limit is stricter; this protects the JSON walk before a tree exists.
	if depth > MaxDepth*3 {
		return fmt.Errorf("JSON nesting exceeds limit")
	}
	token, err := d.Token()
	if err != nil {
		return err
	}
	delim, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delim {
	case '{':
		seen := map[string]bool{}
		for d.More() {
			token, err := d.Token()
			if err != nil {
				return err
			}
			key, ok := token.(string)
			if !ok {
				return fmt.Errorf("expected object key")
			}
			canonical := strings.ToLower(key)
			if seen[canonical] {
				return fmt.Errorf("duplicate key %q", key)
			}
			seen[canonical] = true
			if err := checkJSONValue(d, depth+1); err != nil {
				return err
			}
		}
	case '[':
		for d.More() {
			if err := checkJSONValue(d, depth+1); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("unexpected delimiter %q", delim)
	}
	_, err = d.Token()
	return err
}

func dangerousDictionaryKey(key string) bool {
	key = strings.ToLower(key)
	return key == "__proto__" || key == "constructor" || key == "prototype"
}

var jsonNumeric = regexp.MustCompile(`^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$`)

// formatsForDefinition creates a fresh capability set for one reviewed renderer.
// The adapter validates renderer and target selection before using these rules.
func formatsForDefinition(d Definition) map[string]sdui.FormatRule {
	check := func(fn func(string, URLPolicy) error) sdui.FormatRule {
		return sdui.FormatRule{Type: sdui.String, NormalizeString: func(value string, policy URLPolicy) (string, error) { return value, fn(value, policy) }}
	}
	pattern := func(re *regexp.Regexp, label string, empty bool) sdui.FormatRule {
		rule := check(func(value string, _ URLPolicy) error {
			if empty && value == "" || re.MatchString(value) {
				return nil
			}
			return fmt.Errorf("invalid %s", label)
		})
		rule.Pattern = re.String()
		if empty {
			rule.Pattern = "^(" + re.String() + "|)$"
		}
		return rule
	}
	rules := map[string]sdui.FormatRule{
		"markdown-source": check(validateMarkdownSource),
		"lottie-json":     check(func(value string, _ URLPolicy) error { return validateLottieJSON(value) }),
		"color":           pattern(colorValue, "color value", false),
		"css-token":       pattern(cssToken, "CSS custom property name", true),
		"font-family":     pattern(fontFamilyValue, "font family", false),
	}
	if d.Chapter == "menus" && d.Component == "ContextMenu" {
		rule := check(func(value string, _ URLPolicy) error { return ui.ValidateContextRequestNumber(value) })
		// This editor hint describes canonical decimal spelling and length.
		// The shared UI validator also enforces the unsigned 64-bit maximum.
		rule.Pattern = `^(0|[1-9][0-9]{0,19})$`
		rules["context-request-number"] = rule
	}
	if d.SandboxHTML {
		rules["sandbox-html"] = sdui.FormatRule{Type: sdui.String, NormalizeString: normalizeSandboxHTML}
	}
	if component, err := ui.ResolveComponent(d.Chapter, d.Component); d.Component != "" && err == nil && component.Chapter == "devtools" {
		rules["inert-data"] = sdui.FormatRule{Type: sdui.Object, NestedPropertyAllowed: inertNestedProperty}
	}
	return rules
}

func inertNestedProperty(name string, p sdui.Property) (bool, bool) {
	key := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(name, "_", ""), "-", ""))
	switch key {
	case "style":
		if p.Type == sdui.String && p.Format == "text" {
			return false, true
		}
	case "template":
		return true, true
	case "on":
		if p.Type == sdui.Boolean || p.Type == sdui.String && p.Format == "text" {
			return true, true
		}
	case "url":
		if p.Type == sdui.String && p.Format == "text" {
			return true, true
		}
	}
	return false, false
}
