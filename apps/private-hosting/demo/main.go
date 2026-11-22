package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"
)

func main() {
	port, err := strconv.Atoi(os.Getenv("PORT"))
	if err != nil || port < 1024 || port > 65535 {
		log.Fatal("PORT must be a non-privileged TCP port")
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "ready")
	})
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "Private Hosting Go demo")
	})
	mux.HandleFunc("GET /stream", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: opened\n\n")
		if err := http.NewResponseController(w).Flush(); err != nil {
			return
		}
		select {
		case <-r.Context().Done():
		case <-time.After(8 * time.Second):
		}
	})
	server := &http.Server{
		Addr: fmt.Sprintf("127.0.0.1:%d", port), Handler: mux,
		ReadHeaderTimeout: 5 * time.Second, WriteTimeout: 10 * time.Second,
	}
	log.Fatal(server.ListenAndServe())
}
