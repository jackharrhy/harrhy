// The fixed demo and its loopback-only lifecycle service.
package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

var page = template.Must(template.New("demo").Parse(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Clank color demo</title><main><h1>{{.Session}}</h1><p>Demo color: #{{.Color}}</p><svg width="128" height="128" aria-hidden="true"><rect width="128" height="128" fill="#{{.Color}}"/></svg></main></html>`))

type demo struct {
	ID      string `json:"id"`
	Session string `json:"session"`
	Color   string `json:"-"`
}

type registry struct {
	mu     sync.Mutex
	active map[string]demo
	token  string
}

func (r *registry) control(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if subtle.ConstantTimeCompare([]byte(req.Header.Get("Authorization")), []byte("Bearer "+r.token)) != 1 {
		http.NotFound(w, req)
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	switch {
	case req.Method == "GET" && req.URL.Path == "/demos":
		rows := make([]demo, 0, len(r.active))
		for _, entry := range r.active {
			rows = append(rows, entry)
		}
		reply(w, http.StatusOK, rows)
	case req.Method == "POST" && req.URL.Path == "/demos":
		var input struct {
			Session string `json:"session"`
		}
		body := json.NewDecoder(http.MaxBytesReader(w, req.Body, 2048))
		body.DisallowUnknownFields()
		if body.Decode(&input) != nil || !errors.Is(body.Decode(new(struct{})), io.EOF) || strings.TrimSpace(input.Session) == "" || len(input.Session) > 320 {
			http.Error(w, "Invalid demo session", http.StatusBadRequest)
			return
		}
		for _, entry := range r.active {
			if entry.Session == input.Session {
				reply(w, http.StatusOK, entry)
				return
			}
		}
		if len(r.active) >= 16 {
			http.Error(w, "Preview limit reached", http.StatusConflict)
			return
		}
		var id [16]byte
		var color [3]byte
		rand.Read(id[:])
		rand.Read(color[:])
		entry := demo{hex.EncodeToString(id[:]), input.Session, hex.EncodeToString(color[:])}
		r.active[entry.ID] = entry
		reply(w, http.StatusCreated, entry)
	case req.Method == "DELETE" && strings.HasPrefix(req.URL.Path, "/demos/"):
		delete(r.active, strings.TrimPrefix(req.URL.Path, "/demos/"))
		reply(w, http.StatusOK, map[string]string{"status": "stopped"})
	default:
		http.NotFound(w, req)
	}
}

func (r *registry) preview(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
	if (req.Method != "GET" && req.Method != "HEAD") || req.Header.Get("Upgrade") != "" || !strings.HasPrefix(req.URL.Path, "/p/") {
		http.NotFound(w, req)
		return
	}
	// Render while holding the registry lock: revocation waits for the bounded
	// response and no later request can resolve that allocation.
	r.mu.Lock()
	defer r.mu.Unlock()
	entry, ok := r.active[strings.TrimPrefix(req.URL.Path, "/p/")]
	if !ok {
		http.NotFound(w, req)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = page.Execute(w, entry)
}

func reply(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func main() {
	token := os.Getenv("HARRHY_CLANK_PREVIEW_TOKEN")
	if len(token) < 32 {
		log.Fatal("A private preview control token is required")
	}
	r := &registry{active: make(map[string]demo), token: token}
	serve := func(env string, handler http.HandlerFunc) {
		port := os.Getenv(env)
		if port == "" {
			port = "0"
		}
		listener, err := net.Listen("tcp4", net.JoinHostPort("127.0.0.1", port))
		if err != nil {
			log.Fatal(err)
		}
		srv := &http.Server{Handler: handler, ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 5 * time.Second, WriteTimeout: 5 * time.Second, IdleTimeout: 5 * time.Second}
		log.Printf("%s=%s", env, listener.Addr())
		go func() { log.Fatal(srv.Serve(listener)) }()
	}
	serve("HARRHY_CLANK_PREVIEW_CONTROL_PORT", r.control)
	serve("HARRHY_CLANK_PREVIEW_PORT", r.preview)
	select {}
}
