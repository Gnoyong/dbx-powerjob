package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadRoutesAndProjection(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.Method != http.MethodPost || r.URL.Path != "/appInfo/list" {
			t.Errorf("unexpected outbound request: %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("PowerJwt"); got != "test-token" {
			t.Errorf("missing session header: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"success":true,"data":{"index":0,"pageSize":20,"totalPages":1,"totalItems":1,"data":[{"id":2,"appName":"demo","password":"server-secret","extra":"private"}]}}`)
	}))
	defer server.Close()

	s := &session{baseURL: server.URL, client: server.Client(), jwt: "test-token"}
	result, err := s.read("powerjob/apps", map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	page := result.(pageResult)
	if len(page.Data) != 1 || page.Data[0]["id"] != "2" || page.Data[0]["appName"] != "demo" {
		t.Fatalf("unexpected app projection: %#v", page.Data)
	}
	if _, ok := page.Data[0]["password"]; ok {
		t.Fatal("application password escaped the projection")
	}
	if _, ok := page.Data[0]["extra"]; ok {
		t.Fatal("unapproved field escaped the projection")
	}
	if _, err := s.read("powerjob/delete", map[string]any{}); err == nil {
		t.Fatal("unsupported write operation was accepted")
	}
	if requests != 1 {
		t.Fatalf("unsupported operation made an outbound request: %d total", requests)
	}
}

func TestAppsMenuMessage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/appInfo/list" {
			t.Errorf("unexpected outbound request: %s %s", r.Method, r.URL.Path)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body["pageSize"] != float64(8) {
			t.Errorf("apps menu request is not bounded: %#v", body)
		}
		fmt.Fprint(w, `{"success":true,"data":{"index":0,"pageSize":8,"totalPages":2,"totalItems":12,"data":[{"id":2,"appName":"Demo\nApp","password":"secret"},{"id":3,"title":"Backup"}]}}`)
	}))
	defer server.Close()

	s := &session{baseURL: server.URL, client: server.Client()}
	message, err := s.appsMenuMessage()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(message, "Demo App, Backup") || !strings.Contains(message, "2 of 12") {
		t.Fatalf("unexpected apps menu message: %q", message)
	}
	if strings.Contains(message, "secret") || strings.Contains(message, "\n") {
		t.Fatalf("apps menu exposed unsafe content: %q", message)
	}
}

func TestLargeInstanceIDPreserved(t *testing.T) {
	const instanceID = "981844507211334656"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/instance/list" {
			t.Errorf("unexpected outbound request: %s %s", r.Method, r.URL.Path)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body["instanceId"] != instanceID {
			t.Errorf("request ID changed: %#v", body["instanceId"])
		}
		fmt.Fprintf(w, `{"success":true,"data":{"index":0,"pageSize":20,"totalPages":1,"totalItems":1,"data":[{"instanceId":%s,"jobId":7,"status":5}]}}`, instanceID)
	}))
	defer server.Close()

	s := &session{baseURL: server.URL, client: server.Client()}
	result, err := s.read("powerjob/instances", map[string]any{"appId": "2", "instanceId": instanceID})
	if err != nil {
		t.Fatal(err)
	}
	got := result.(pageResult).Data[0]["instanceId"]
	if got != instanceID {
		t.Fatalf("response ID lost precision: %v", got)
	}
}

func TestRejectInvalidIDsAndPaginationBeforeRequest(t *testing.T) {
	s := &session{}
	cases := []map[string]any{
		{"appId": "../../auth/logout"},
		{"appId": "0"},
		{"appId": "2", "pageSize": "101"},
		{"appId": "2", "index": "-1"},
	}
	for _, params := range cases {
		_, err := s.read("powerjob/jobs", params)
		if err == nil {
			t.Fatalf("invalid parameters were accepted: %#v", params)
		}
		if strings.Contains(err.Error(), "could not reach") {
			t.Fatalf("request was sent before validation: %#v", params)
		}
	}
}
