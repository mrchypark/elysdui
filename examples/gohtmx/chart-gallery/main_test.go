package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGalleryAndChartAssets(t *testing.T) {
	h, err := newHandler()
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/", "/assets/ely-charts.js", "/assets/ely-charts.css", "/assets/echarts.esm.min.js", "/assets/ely-stat-charts.js", "/assets/ely-stat-charts.css", "/assets/ely-density-charts.js", "/assets/ely-relation-charts.js"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusOK || w.Body.Len() == 0 {
			t.Errorf("%s: status %d, length %d", path, w.Code, w.Body.Len())
		}
	}
}
