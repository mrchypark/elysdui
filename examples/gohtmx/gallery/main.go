// Command components serves the standalone elysdui UI example gallery.
package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/mrchypark/elysdui/internal/gallery"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8091", "loopback listen address")
	flag.Parse()
	if err := loopbackAddress(*addr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	handler, err := uiexamples.New()
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{
		Addr:              *addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("elysdui UI examples: http://%s/components", *addr)
	log.Fatal(server.ListenAndServe())
}

func loopbackAddress(addr string) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil || host == "" {
		return fmt.Errorf("-addr must be a loopback host and port: %q", addr)
	}
	if host == "localhost" {
		return nil
	}
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		return fmt.Errorf("-addr must be a loopback host and port: %q", addr)
	}
	return nil
}
