package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestLatestJobInstancesContract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/instance/list" || r.Header.Get("AppId") != "2" || r.Header.Get("PowerJwt") != "test-token" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		if body["index"] != float64(0) || body["pageSize"] != float64(1) || body["type"] != "NORMAL" || body["status"] != "" {
			t.Errorf("unexpected filters: %#v", body)
		}
		switch body["jobId"] {
		case "7":
			fmt.Fprint(w, `{"success":true,"data":{"data":[{"jobId":7,"instanceId":981844507211334656,"status":3,"result":"private result"}]}}`)
		case "8":
			fmt.Fprint(w, `{"success":true,"data":{"data":[]}}`)
		default:
			w.WriteHeader(http.StatusForbidden)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client(), jwt: "test-token", readOnly: true}
	result, err := s.read("powerjob/latestJobInstances", map[string]any{"appId": "2", "jobIds": []any{"7", "8", "9"}})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(result)
	var got struct {
		Data []struct {
			JobID    string         `json:"jobId"`
			Instance map[string]any `json:"instance"`
			Error    string         `json:"error"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Data) != 3 {
		t.Fatalf("missing per-job results: %s", raw)
	}
	if got.Data[0].JobID != "7" || got.Data[0].Instance["instanceId"] != "981844507211334656" || got.Data[0].Instance["status"] != float64(3) {
		t.Fatalf("wrong summary: %s", raw)
	}
	if _, ok := got.Data[0].Instance["result"]; ok {
		t.Fatal("unneeded execution result escaped projection")
	}
	if got.Data[1].Instance != nil || got.Data[1].Error != "" {
		t.Fatalf("empty job misclassified: %s", raw)
	}
	if got.Data[2].Error == "" {
		t.Fatalf("failed job misclassified as empty: %s", raw)
	}
}

func TestLatestJobInstancesValidationAndDedup(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		fmt.Fprint(w, `{"success":true,"data":{"data":[]}}`)
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	tooMany := make([]any, 21)
	for i := range tooMany {
		tooMany[i] = "7"
	}
	for _, ids := range []any{nil, "7", []any{"0"}, []any{"7", "bad"}, tooMany} {
		if _, err := s.read("powerjob/latestJobInstances", map[string]any{"appId": "2", "jobIds": ids}); err == nil {
			t.Errorf("accepted invalid IDs: %#v", ids)
		}
	}
	if calls.Load() != 0 {
		t.Fatal("invalid batch sent requests")
	}
	if _, err := s.read("powerjob/latestJobInstances", map[string]any{"appId": "2", "jobIds": []any{"7", "7"}}); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 {
		t.Fatalf("duplicate job queried %d times", calls.Load())
	}
}

func TestLatestJobInstancesSessionConcurrency(t *testing.T) {
	var active, maximum atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := active.Add(1)
		defer active.Add(-1)
		for old := maximum.Load(); n > old && !maximum.CompareAndSwap(old, n); old = maximum.Load() {
		}
		time.Sleep(15 * time.Millisecond)
		fmt.Fprint(w, `{"success":true,"data":{"data":[]}}`)
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	var batches sync.WaitGroup
	for i := 0; i < 3; i++ {
		batches.Add(1)
		go func() {
			defer batches.Done()
			_, err := s.read("powerjob/latestJobInstances", map[string]any{"appId": "2", "jobIds": []any{"1", "2", "3", "4", "5", "6"}})
			if err != nil {
				t.Error(err)
			}
		}()
	}
	batches.Wait()
	if maximum.Load() > 4 || maximum.Load() < 2 {
		t.Fatalf("unexpected concurrent requests: %d", maximum.Load())
	}
}

func TestLatestJobInstancesRejectsWrongJobAndMalformedData(t *testing.T) {
	for _, body := range []string{
		`{"success":true,"data":{"data":[{"jobId":"8","instanceId":"9007199254740993","status":3}]}}`,
		`{"success":true,"data":"invalid"}`,
	} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, body) }))
		s := &session{baseURL: server.URL, client: server.Client()}
		value, err := s.read("powerjob/latestJobInstances", map[string]any{"appId": "2", "jobIds": []any{"7"}})
		server.Close()
		if err != nil {
			t.Fatal(err)
		}
		row := value.(latestJobInstancesResult).Data[0]
		if row.Error == "" || row.Instance != nil {
			t.Fatalf("invalid response accepted: %#v", row)
		}
	}
}

func TestRequestContextCancelsOutboundQuery(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
	defer cancel()
	started := time.Now()
	_, err := s.requestContext(ctx, "POST", "/instance/list", "2", nil, nil)
	if err == nil || time.Since(started) > time.Second {
		t.Fatal("HTTP request did not honor deadline")
	}
}
