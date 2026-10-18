package main

import "testing"

func TestLoopbackAddress(t *testing.T) {
	for _, addr := range []string{"127.0.0.1:8091", "[::1]:8091", "localhost:8091"} {
		if err := loopbackAddress(addr); err != nil {
			t.Fatalf("%s rejected: %v", addr, err)
		}
	}
	for _, addr := range []string{"0.0.0.0:8091", "192.168.1.9:8091", "example.test:8091", "127.0.0.1", ":8091"} {
		if err := loopbackAddress(addr); err == nil {
			t.Fatalf("%s accepted", addr)
		}
	}
}
