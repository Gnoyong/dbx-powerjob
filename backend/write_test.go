package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestEnableJobSavesCompleteConsoleJobWithoutLosingConfiguration(t *testing.T) {
	var calls []string
	enabled := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.Method+" "+r.URL.Path)
		if r.Header.Get("AppId") != "2" || r.Header.Get("PowerJwt") != "token" {
			t.Errorf("missing scoped authorization headers")
		}
		switch r.URL.Path {
		case "/job/list":
			var body map[string]any
			decoder := json.NewDecoder(r.Body)
			decoder.UseNumber()
			if err := decoder.Decode(&body); err != nil {
				t.Error(err)
			}
			if body["jobId"] != json.Number("7") {
				t.Error("incorrect job filter")
			}
			fmt.Fprintf(w, `{"success":true,"data":{"data":[{"id":7,"appId":2,"enable":%t,"jobName":"demo","jobParams":"line1\nline2","notifyUserIds":["2","4"],"processorInfo":"foo","executeType":"STANDALONE","processorType":"BUILT_IN","timeExpressionType":"CRON","advancedRuntimeConfig":{"custom":1234567890123456789}}]}}`, enabled)
		case "/job/save":
			var body map[string]any
			decoder := json.NewDecoder(r.Body)
			decoder.UseNumber()
			if err := decoder.Decode(&body); err != nil {
				t.Error(err)
			}
			if body["id"] != json.Number("7") || body["jobName"] != "demo" || body["enable"] != true ||
				body["appId"] != json.Number("2") ||
				body["jobParams"] != "line1\nline2" ||
				!reflect.DeepEqual(body["notifyUserIds"], []any{"2", "4"}) ||
				body["advancedRuntimeConfig"].(map[string]any)["custom"] != json.Number("1234567890123456789") {
				t.Errorf("job configuration changed: %#v", body)
			}
			enabled = true
			fmt.Fprint(w, `{"success":true,"data":7}`)
		default:
			t.Errorf("unexpected write path: %s", r.URL.Path)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client(), jwt: "token"}
	if _, err := s.write("powerjob/setJobEnabled", map[string]any{"appId": "2", "jobId": "7", "enabled": true}); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(calls, []string{"POST /job/list", "POST /job/save", "POST /job/list"}) {
		t.Fatal(calls)
	}
}

func TestDisableJobUsesNarrowRoute(t *testing.T) {
	var calls []string
	enabled := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.URL.Path)
		if r.URL.Path == "/job/list" {
			fmt.Fprintf(w, `{"success":true,"data":{"data":[{"id":7,"appId":2,"jobName":"demo","enable":%t}]}}`, enabled)
		} else if r.URL.Path == "/job/disable" && r.Method == "GET" && r.URL.Query().Get("jobId") == "7" {
			enabled = false
			fmt.Fprint(w, `{"success":true,"data":null}`)
		} else {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	if _, err := s.write("powerjob/setJobEnabled", map[string]any{"appId": "2", "jobId": "7", "enabled": false}); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(calls, []string{"/job/list", "/job/disable", "/job/list"}) {
		t.Fatal(calls)
	}
}

func TestDisableRejectsSuccessWithoutStateChange(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/job/list" {
			fmt.Fprint(w, `{"success":true,"data":{"data":[{"id":7,"appId":2,"enable":true}]}}`)
		} else {
			fmt.Fprint(w, `{"success":true,"data":null}`)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	if _, err := s.write("powerjob/setJobEnabled", map[string]any{"appId": "2", "jobId": "7", "enabled": false}); err == nil || err.Error() != "PowerJob acknowledged the action but job state did not change" {
		t.Fatalf("unexpected state verification result: %v", err)
	}
}

func TestEnableAcceptsNullSaveResultWhenStateChanged(t *testing.T) {
	enabled := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/job/list" {
			fmt.Fprintf(w, `{"success":true,"data":{"data":[{"id":7,"appId":2,"enable":%t,"jobName":"demo","processorInfo":"foo","executeType":"STANDALONE","processorType":"BUILT_IN","timeExpressionType":"CRON"}]}}`, enabled)
		} else if r.URL.Path == "/job/save" {
			enabled = true
			fmt.Fprint(w, `{"success":true,"data":null}`)
		} else {
			t.Error("unexpected request", r.URL.Path)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	if _, err := s.write("powerjob/setJobEnabled", map[string]any{"appId": "2", "jobId": "7", "enabled": true}); err != nil {
		t.Fatal(err)
	}
}

func TestRetryOnlyFailedInstanceForJob(t *testing.T) {
	const instanceID = "981844507211334656"
	status, actualJob, retryCalls := 4, "7", 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/instance/list":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			if body["instanceId"] != instanceID || body["type"] != "NORMAL" {
				t.Error("incorrect instance filter")
			}
			fmt.Fprintf(w, `{"success":true,"data":{"data":[{"instanceId":%s,"jobId":%s,"status":%d}]}}`, instanceID, actualJob, status)
		case "/instance/retry":
			retryCalls++
			if r.Method != "GET" || r.URL.Query().Get("instanceId") != instanceID || r.URL.Query().Get("appId") != "2" || r.Header.Get("AppId") != "2" {
				t.Error("incorrect retry request")
			}
			fmt.Fprint(w, `{"success":true,"data":null}`)
		default:
			t.Error("unexpected route", r.URL.Path)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	params := map[string]any{"appId": "2", "jobId": "7", "instanceId": instanceID}
	status = 5
	if _, err := s.write("powerjob/retryFailedInstance", params); err == nil {
		t.Fatal("accepted successful instance")
	}
	actualJob = "8"
	status = 4
	if _, err := s.write("powerjob/retryFailedInstance", params); err == nil {
		t.Fatal("accepted wrong job")
	}
	actualJob = "7"
	if _, err := s.write("powerjob/retryFailedInstance", params); err != nil {
		t.Fatal(err)
	}
	if retryCalls != 1 {
		t.Fatal("unexpected retry count", retryCalls)
	}
}

func TestWriteRejectsInvalidInputBeforeRequest(t *testing.T) {
	s := &session{}
	for _, tc := range []struct {
		method string
		params map[string]any
	}{
		{"powerjob/setJobEnabled", map[string]any{"appId": "2", "jobId": "7", "enabled": "true"}},
		{"powerjob/setJobEnabled", map[string]any{"appId": "2", "jobId": "../../delete", "enabled": true}},
		{"powerjob/retryFailedInstance", map[string]any{"appId": "0", "jobId": "7", "instanceId": "8"}},
		{"powerjob/retryFailedInstance", map[string]any{"appId": "2", "jobId": "7", "instanceId": "bad"}},
		{"powerjob/delete", map[string]any{"appId": "2"}},
	} {
		if _, err := s.write(tc.method, tc.params); err == nil {
			t.Fatalf("accepted %s: %#v", tc.method, tc.params)
		}
	}
}

func TestReadOnlyConnectionRejectsWrites(t *testing.T) {
	s := &session{readOnly: true}
	_, err := s.write("powerjob/setJobEnabled", map[string]any{"appId": "2", "jobId": "7", "enabled": false})
	if err == nil || err.Error() != "DBX connection is read-only; turn off Read-only connection before using job actions" {
		t.Fatalf("unexpected read-only result: %v", err)
	}
}

func TestParseConnectionReadOnlyFlag(t *testing.T) {
	values := map[string]any{"connection": map[string]any{
		"host": "example.test", "port": json.Number("443"), "username": "user",
		"password": "secret", "read_only": true,
	}}
	cfg, err := parseConnection(values)
	if err != nil || !cfg.readOnly {
		t.Fatalf("read-only connection was not recognized: %v", err)
	}
	values["connection"].(map[string]any)["read_only"] = false
	cfg, err = parseConnection(values)
	if err != nil || cfg.readOnly {
		t.Fatalf("writable connection was not recognized: %v", err)
	}
}
