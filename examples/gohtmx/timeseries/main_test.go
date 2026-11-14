package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExampleServesChartAndAssets(t *testing.T) {
	handler, err := newHandler()
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/", "/assets/uPlot.esm.js", "/assets/uPlot.min.css", "/assets/ely-timeseries.js", "/assets/ely-timeseries.css"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusOK || response.Body.Len() == 0 {
			t.Errorf("%s: status %d, body length %d", path, response.Code, response.Body.Len())
		}
	}
}
