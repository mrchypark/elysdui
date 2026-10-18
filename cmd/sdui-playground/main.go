// Command sdui-playground runs the local SDUI visual editor and JSON playground.
package main

import (
	"github.com/mrchypark/elysdui/internal/playground"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8094"
	}
	n, e := strconv.Atoi(port)
	if e != nil || n < 1 || n > 65535 {
		log.Fatal("PORT must be 1..65535")
	}
	h, e := playground.NewHandler()
	if e != nil {
		log.Fatal(e)
	}
	addr := "127.0.0.1:" + strconv.Itoa(n)
	log.Printf("elysdui playground (local authoring only): http://%s", addr)
	log.Fatal((&http.Server{Addr: addr, Handler: h, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: time.Minute, MaxHeaderBytes: 16 << 10}).ListenAndServe())
}
