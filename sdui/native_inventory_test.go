package sdui

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"regexp"
	"sort"
	"testing"
)

func TestNativeSupportInventoryMatchesPlatformCapabilities(t *testing.T) {
	data, err := os.ReadFile("../contracts/native/profile-v1/support-matrix.json")
	if err != nil {
		t.Fatal(err)
	}
	var inventory struct {
		ProtocolVersion string                                        `json:"protocolVersion"`
		DefaultStatus   string                                        `json:"defaultStatus"`
		Components      []struct{ Type, IOS, Android, Limits string } `json:"components"`
	}
	if err := json.Unmarshal(data, &inventory); err != nil {
		t.Fatal(err)
	}
	if inventory.ProtocolVersion != NativeVersion || inventory.DefaultStatus != "unsupported" {
		t.Fatal("inventory must fail closed for this protocol version")
	}
	var names []string
	for _, c := range inventory.Components {
		if c.IOS == "" || c.Android == "" || c.Limits == "" {
			t.Fatalf("missing implementation or limits for %s", c.Type)
		}
		names = append(names, c.Type)
	}
	want := NativeCapabilities()
	sort.Strings(want)
	sort.Strings(names)
	if !reflect.DeepEqual(names, want) {
		t.Fatalf("inventory %v does not match Go capabilities %v", names, want)
	}
	for _, source := range []struct{ path, pattern string }{
		{"../adapters/ios/Sources/ElyNativeCore/Protocol.swift", `public static let capabilities = \[([^\]]+)\]`},
		{"../adapters/android/protocol/src/main/kotlin/dev/ely/nativeprofile/Protocol.kt", `val CAPABILITIES = listOf\(([^)]+)\)`},
	} {
		content, err := os.ReadFile(source.path)
		if err != nil {
			t.Fatal(err)
		}
		match := regexp.MustCompile(source.pattern).FindSubmatch(content)
		if len(match) != 2 {
			t.Fatalf("cannot locate capabilities in %s", source.path)
		}
		got, err := parseNativeCapabilityLiterals(match[1])
		if err != nil {
			t.Fatalf("invalid capability literals in %s: %v", source.path, err)
		}
		sort.Strings(got)
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("%s capabilities %v differ from inventory %v", source.path, got, want)
		}
	}
}

// The source lists deliberately use plain string literals, a JSON-compatible
// subset shared by Swift and Kotlin. Reject any unmatched syntax rather than
// silently dropping future uppercase, qualified or hyphenated capabilities.
func parseNativeCapabilityLiterals(source []byte) ([]string, error) {
	var values []string
	if err := json.Unmarshal(append(append([]byte{'['}, source...), ']'), &values); err != nil {
		return nil, err
	}
	for _, value := range values {
		if value == "" {
			return nil, fmt.Errorf("empty or null capability")
		}
	}
	return values, nil
}

func TestNativeInventoryParsesEveryCapabilityLiteral(t *testing.T) {
	for _, literal := range []string{"Toggle", "list-detail", "forms/Toggle"} {
		got, err := parseNativeCapabilityLiterals([]byte(`"text","` + literal + `"`))
		if err != nil || !reflect.DeepEqual(got, []string{"text", literal}) {
			t.Fatalf("lost capability %q: %v, %v", literal, got, err)
		}
	}
	for _, invalid := range []string{`"text", SOME_VARIABLE`, `"text", null`, `"text" + "switch"`} {
		if _, err := parseNativeCapabilityLiterals([]byte(invalid)); err == nil {
			t.Fatalf("unmatched list syntax accepted: %s", invalid)
		}
	}
}
