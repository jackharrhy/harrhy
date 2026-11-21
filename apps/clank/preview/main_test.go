package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDemoLifecycle(t *testing.T) {
	r := &registry{active: make(map[string]demo), token: "fixture"}
	control := httptest.NewServer(http.HandlerFunc(r.control))
	defer control.Close()
	preview := httptest.NewServer(http.HandlerFunc(r.preview))
	defer preview.Close()
	request := func(method, url, body, token string, status int) string {
		t.Helper()
		req, err := http.NewRequest(method, url, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != status {
			t.Fatalf("%s %s: got %d, want %d", method, url, resp.StatusCode, status)
		}
		return string(data)
	}
	request("GET", control.URL+"/demos", "", "", 404)
	request("GET", preview.URL+"/p/missing", "", "", 404)
	start := func() demo {
		var result demo
		body := request("POST", control.URL+"/demos", `{"session":"Fixture <demo>"}`, "fixture", 201)
		if err := json.Unmarshal([]byte(body), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	first := start()
	path := fmt.Sprintf("%s/p/%s", preview.URL, first.ID)
	html := request("GET", path, "", "", 200)
	if !strings.Contains(html, "Fixture &lt;demo&gt;") || !strings.Contains(html, "Demo color: #") {
		t.Fatal(html)
	}
	request("DELETE", control.URL+"/demos/"+first.ID, "", "fixture", 200)
	request("GET", path, "", "", 404)
	if second := start(); first.ID == second.ID {
		t.Fatal("reused withdrawn generation")
	}
	request("GET", path, "", "", 404)
}
