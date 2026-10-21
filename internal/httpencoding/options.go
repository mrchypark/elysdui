package httpencoding

import (
	"fmt"
	"math/bits"
	"sort"
)

// Options configures content coding for public data. Codecs is the ordered
// tie-break preference (gzip, br, zstd); nil uses the profile defaults, while an
// empty non-nil slice enables identity only. Identity is always a fallback.
// Strategy is "smallest" or "preference"; client quality values take priority.
// Zero thresholds disable that threshold. Zero levels use profile defaults.
// GzipLevel accepts -2, -1, and 1..9; BrotliLevel 1..11; ZstdLevel -5..22.
// Zstd levels map to the encoder's supported speed presets.
// Normalize copies Codecs; callers may safely reuse or modify their input.
type Options struct {
	Disabled          bool
	Codecs            []string
	Strategy          string
	MinBytes          int
	MinSavingsBytes   int
	MinSavingsPercent int
	GzipLevel         int
	BrotliLevel       int
	ZstdLevel         int
}

// Normalize validates settings and supplies defaults. A nil static profile uses
// cached high-ratio encodings; a nil dynamic profile disables compression to
// avoid compressing secrets accidentally. An explicit dynamic Options enables
// fast compression. The request profile supplies browser codec preferences;
// browser CompressionStream does not expose configurable encoder levels.
func Normalize(input *Options, profile string) (Options, error) {
	defaults := Options{Codecs: []string{"zstd", "br", "gzip"}, Strategy: "smallest", MinBytes: 256, MinSavingsBytes: 32, MinSavingsPercent: 5, GzipLevel: 6, BrotliLevel: 5, ZstdLevel: 3}
	switch profile {
	case "static":
	case "dynamic", "request":
		defaults.Strategy = "preference"
		defaults.GzipLevel, defaults.BrotliLevel, defaults.ZstdLevel = 1, 1, 1
		defaults.MinBytes, defaults.MinSavingsBytes, defaults.MinSavingsPercent = 256, 32, 5
		if profile == "request" {
			defaults.Codecs = []string{"gzip"}
		}
	default:
		return Options{}, fmt.Errorf("unknown compression profile %q", profile)
	}
	if input == nil {
		defaults.Disabled = profile == "dynamic"
		return defaults, nil
	}
	o := *input
	if o.Codecs == nil {
		o.Codecs = defaults.Codecs
	}
	o.Codecs = append([]string{}, o.Codecs...)
	if o.Strategy == "" {
		o.Strategy = defaults.Strategy
	}
	if o.GzipLevel == 0 {
		o.GzipLevel = defaults.GzipLevel
	}
	if o.BrotliLevel == 0 {
		o.BrotliLevel = defaults.BrotliLevel
	}
	if o.ZstdLevel == 0 {
		o.ZstdLevel = defaults.ZstdLevel
	}
	if o.Strategy != "smallest" && o.Strategy != "preference" {
		return Options{}, fmt.Errorf("unsupported compression strategy %q", o.Strategy)
	}
	seen := map[string]bool{}
	for _, c := range o.Codecs {
		if c != "gzip" && c != "br" && c != "zstd" {
			return Options{}, fmt.Errorf("unsupported compression codec %q", c)
		}
		if seen[c] {
			return Options{}, fmt.Errorf("duplicate compression codec %q", c)
		}
		seen[c] = true
	}
	if o.MinBytes < 0 || o.MinBytes > 64<<20 || o.MinSavingsBytes < 0 || o.MinSavingsBytes > 64<<20 || o.MinSavingsPercent < 0 || o.MinSavingsPercent > 100 {
		return Options{}, fmt.Errorf("invalid compression thresholds")
	}
	if o.GzipLevel < -2 || o.GzipLevel > 9 {
		return Options{}, fmt.Errorf("invalid gzip level %d", o.GzipLevel)
	}
	if o.BrotliLevel < 1 || o.BrotliLevel > 11 {
		return Options{}, fmt.Errorf("invalid Brotli level %d", o.BrotliLevel)
	}
	if o.ZstdLevel < -5 || o.ZstdLevel > 22 {
		return Options{}, fmt.Errorf("invalid zstd level %d", o.ZstdLevel)
	}
	return o, nil
}

// MeetsThresholds reports whether a representation meets all configured size
// thresholds. With zero savings thresholds even an expanded encoding qualifies.
// The savings percentage is compared with exact integer arithmetic, so an exact
// percentage meets its threshold and large sizes never overflow.
func MeetsThresholds(originalSize, encodedSize int, o Options) bool {
	if originalSize < o.MinBytes {
		return false
	}
	saved := originalSize - encodedSize
	if o.MinSavingsBytes > 0 && saved < o.MinSavingsBytes {
		return false
	}
	if o.MinSavingsPercent <= 0 {
		return true
	}
	if originalSize <= 0 || saved <= 0 {
		return false
	}
	// Compare saved*100 against percent*originalSize as 128-bit products so the
	// percentage is exact for every integer input and cannot overflow.
	savedHi, savedLo := bits.Mul64(uint64(saved), 100)
	needHi, needLo := bits.Mul64(uint64(o.MinSavingsPercent), uint64(originalSize))
	if savedHi != needHi {
		return savedHi > needHi
	}
	return savedLo >= needLo
}

// Select chooses from already encoded representations using normalized options.
// Thresholds prefer identity only when identity is acceptable; they never
// override an explicit identity exclusion. Missing variants are unavailable.
func Select(header string, variants map[string][]byte, o Options) (string, bool) {
	available := make([]string, 0, len(o.Codecs)+1)
	if !o.Disabled {
		for _, c := range o.Codecs {
			if _, ok := variants[c]; ok {
				available = append(available, c)
			}
		}
	}
	if o.Strategy == "smallest" {
		sort.SliceStable(available, func(i, j int) bool { return len(variants[available[i]]) < len(variants[available[j]]) })
	}
	original, hasIdentity := variants["identity"]
	if hasIdentity {
		available = append(available, "identity")
	}
	// Filter costly representations only if an acceptable identity fallback exists.
	if _, identityOK := NegotiateAvailable(header, "identity"); identityOK && hasIdentity {
		eligible := available[:0]
		for _, c := range available {
			if c == "identity" || MeetsThresholds(len(original), len(variants[c]), o) {
				eligible = append(eligible, c)
			}
		}
		available = eligible
	}
	return NegotiateAvailable(header, available...)
}

// DefaultDynamicCompressionOptions returns enabled fast settings for explicitly
// public response data. Callers must still enforce their public-data opt-in.
func DefaultDynamicCompressionOptions() Options {
	o, _ := Normalize(nil, "dynamic")
	o.Disabled = false
	return o
}

// SelectEncoded negotiates and encodes a dynamic response. The preference
// strategy encodes only the negotiated codec; smallest encodes every configured
// codec. A threshold fallback never sends a forbidden identity representation.
func SelectEncoded(data []byte, header string, o Options) ([]byte, string, bool, error) {
	_, identityOK := NegotiateAvailable(header, "identity")
	if o.Disabled || len(o.Codecs) == 0 || (len(data) < o.MinBytes && identityOK) {
		return data, "identity", identityOK, nil
	}
	if o.Strategy == "preference" {
		available := append(append([]string{}, o.Codecs...), "identity")
		coding, ok := NegotiateAvailable(header, available...)
		if !ok {
			return nil, "", false, nil
		}
		if coding == "identity" {
			return data, coding, true, nil
		}
		body, err := EncodeWithOptions(data, coding, o)
		if err != nil {
			return nil, "", false, err
		}
		if identityOK && !MeetsThresholds(len(data), len(body), o) {
			return data, "identity", true, nil
		}
		return body, coding, true, nil
	}
	variants := map[string][]byte{"identity": data}
	for _, c := range o.Codecs {
		// Do not spend CPU on codings explicitly excluded by the client.
		if _, ok := NegotiateAvailable(header, c); !ok {
			continue
		}
		body, err := EncodeWithOptions(data, c, o)
		if err != nil {
			return nil, "", false, err
		}
		variants[c] = body
	}
	coding, ok := Select(header, variants, o)
	return variants[coding], coding, ok, nil
}
