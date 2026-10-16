package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNotificationUsers(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.Method != "GET" || r.URL.Path != "/user/list" || r.Header.Get("AppId") != "4" || r.Header.Get("PowerJwt") != "test-token" {
			t.Errorf("unexpected user-list request: %s %s", r.Method, r.URL.Path)
		}
		fmt.Fprint(w, `{"success":true,"data":[{"id":981844507211334656,"username":"user","showName":"Display name","enable":true,"email":"private","phone":"private"}]}`)
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client(), jwt: "test-token"}
	if _, err := s.read("powerjob/users", map[string]any{"appId": "invalid"}); err == nil || requests != 0 {
		t.Fatal("invalid app ID must fail before requesting users")
	}
	result, err := s.read("powerjob/users", map[string]any{"appId": "4"})
	if err != nil {
		t.Fatal(err)
	}
	users := result.([]map[string]any)
	if len(users) != 1 || users[0]["id"] != "981844507211334656" || users[0]["showName"] != "Display name" || len(users[0]) != 4 {
		t.Fatalf("unexpected users projection: %#v", users)
	}
}

func TestNotificationUsersFailures(t *testing.T) {
	for _, response := range []string{`{"success":false,"message":"denied"}`, `{"success":true,"data":{}}`} {
		t.Run(response, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, response) }))
			defer server.Close()
			s := &session{baseURL: server.URL, client: server.Client()}
			if _, err := s.read("powerjob/users", map[string]any{"appId": "4"}); err == nil {
				t.Fatal("invalid response accepted")
			}
		})
	}
}
