package httpencoding

import (
	"math"
	"testing"
)

func TestMeetsThresholdsPercentages(t *testing.T) {
	cases := []struct {
		name       string
		original   int
		encoded    int
		minPercent int
		want       bool
	}{
		{name: "exact 29 percent passes 29", original: 100, encoded: 71, minPercent: 29, want: true},
		{name: "28 percent fails 29", original: 100, encoded: 72, minPercent: 29, want: false},
		{name: "33.33 percent passes 30", original: 3, encoded: 2, minPercent: 30, want: true},
		{name: "33.33 percent fails 34", original: 3, encoded: 2, minPercent: 34, want: false},
		{name: "zero percent allows expansion", original: 100, encoded: 200, minPercent: 0, want: true},
		{name: "zero percent allows no saving", original: 100, encoded: 100, minPercent: 0, want: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			o := Options{MinSavingsPercent: tc.minPercent}
			if got := MeetsThresholds(tc.original, tc.encoded, o); got != tc.want {
				t.Fatalf("MeetsThresholds(%d, %d, %+v) = %v, want %v", tc.original, tc.encoded, o, got, tc.want)
			}
		})
	}
}

func TestMeetsThresholdsKeepsOtherThresholds(t *testing.T) {
	o := Options{MinBytes: 100, MinSavingsBytes: 10, MinSavingsPercent: 10}
	if MeetsThresholds(99, 50, o) {
		t.Fatal("below MinBytes qualified")
	}
	if MeetsThresholds(100, 95, o) {
		t.Fatal("below MinSavingsBytes qualified")
	}
	if !MeetsThresholds(100, 90, o) {
		t.Fatal("meeting every threshold did not qualify")
	}
}

func TestMeetsThresholdsNoOverflow(t *testing.T) {
	// A naive saved*100 comparison wraps for large sizes; the exact integer
	// comparison must not.
	maxInt32 := math.MaxInt32
	// original 2147483647, encoded 1073741823 -> saved 1073741824, just above half.
	if !MeetsThresholds(maxInt32, maxInt32/2, Options{MinSavingsPercent: 50}) {
		t.Fatal("saved above half of MaxInt32 did not qualify for a 50 percent threshold")
	}
	// encoded 1073741824 -> saved 1073741823, just below half.
	if MeetsThresholds(maxInt32, maxInt32/2+1, Options{MinSavingsPercent: 50}) {
		t.Fatal("saved below half of MaxInt32 qualified for a 50 percent threshold")
	}
	if !MeetsThresholds(maxInt32, 0, Options{MinSavingsPercent: 100}) {
		t.Fatal("MaxInt32 fully compressed did not qualify for a 100 percent threshold")
	}
	if MeetsThresholds(maxInt32, 1, Options{MinSavingsPercent: 100}) {
		t.Fatal("MaxInt32 nearly uncompressed qualified for a 100 percent threshold")
	}
	// Values beyond 32 bits exercise the wide comparison path.
	large := math.MaxInt64
	if !MeetsThresholds(large, 1, Options{MinSavingsPercent: 99}) {
		t.Fatal("MaxInt64 nearly fully compressed did not qualify for a 99 percent threshold")
	}
	if MeetsThresholds(large, 1, Options{MinSavingsPercent: 100}) {
		t.Fatal("MaxInt64 nearly fully compressed qualified for a 100 percent threshold")
	}
}
