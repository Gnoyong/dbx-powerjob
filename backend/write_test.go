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

func TestUpdateJobAppliesOnlyEditableChangesAndVerifiesState(t *testing.T) {
	var saved map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/job/list":
			if saved == nil {
				fmt.Fprint(w, `{"success":true,"data":{"data":[{"id":7,"appId":2,"enable":true,"jobName":"old","jobDescription":"keep","processorInfo":"foo","executeType":"STANDALONE","processorType":"BUILT_IN","timeExpressionType":"CRON","concurrency":2,"advancedRuntimeConfig":{"x":123}}]}}`)
				return
			}
			encoded, _ := json.Marshal(saved)
			fmt.Fprintf(w, `{"success":true,"data":{"data":[%s]}}`, encoded)
		case "/job/save":
			decoder := json.NewDecoder(r.Body)
			decoder.UseNumber()
			if err := decoder.Decode(&saved); err != nil {
				t.Fatal(err)
			}
			fmt.Fprint(w, `{"success":true,"data":7}`)
		default:
			t.Errorf("unexpected route: %s", r.URL.Path)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	if err := s.updateJob("2", "7", map[string]any{"jobName": "new", "concurrency": json.Number("4")}); err != nil {
		t.Fatal(err)
	}
	if saved["jobName"] != "new" || saved["jobDescription"] != "keep" || saved["concurrency"] != json.Number("4") {
		t.Fatalf("unexpected saved job: %#v", saved)
	}
}

func TestCreateJobUsesOfficialDefaultsAndAcceptsNullSaveResult(t *testing.T) {
	var saved map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/job/save" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("AppId") != "2" || r.Header.Get("PowerJwt") != "token" {
			t.Error("missing scoped authorization headers")
		}
		decoder := json.NewDecoder(r.Body)
		decoder.UseNumber()
		if err := decoder.Decode(&saved); err != nil {
			t.Fatal(err)
		}
		fmt.Fprint(w, `{"success":true,"data":null}`)
	}))
	defer server.Close()

	s := &session{baseURL: server.URL, client: server.Client(), jwt: "token"}
	result, err := s.write("powerjob/createJob", map[string]any{
		"appId": "2",
		"job": map[string]any{
			"jobName": "demo", "timeExpressionType": "API", "executeType": "STANDALONE",
			"processorType": "BUILT_IN", "processorInfo": "tech.example.Demo", "concurrency": json.Number("8"),
		},
	})
	if err != nil || result.(map[string]any)["success"] != true {
		t.Fatalf("unexpected create result: %#v, %v", result, err)
	}
	if saved["id"] != nil || saved["appId"] != json.Number("2") || saved["jobName"] != "demo" ||
		saved["enable"] != true || saved["concurrency"] != json.Number("8") ||
		saved["taskRetryNum"] != json.Number("1") || saved["dispatchStrategy"] != "HEALTH_FIRST" {
		t.Fatalf("unexpected created job: %#v", saved)
	}
	alarm := saved["alarmConfig"].(map[string]any)
	if alarm["alertThreshold"] != json.Number("0") || alarm["statisticWindowLen"] != json.Number("0") || alarm["silenceWindowLen"] != json.Number("0") {
		t.Fatalf("unexpected alarm defaults: %#v", alarm)
	}
}

func TestCopyJobPreservesCompleteConfigurationAndAppliesDialogValues(t *testing.T) {
	const copiedID = "981965114838090752"
	var calls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.Method+" "+r.URL.Path)
		if r.Header.Get("AppId") != "2" || r.Header.Get("PowerJwt") != "token" {
			t.Error("missing scoped authorization headers")
		}
		switch r.URL.Path {
		case "/job/list":
			var body map[string]any
			decoder := json.NewDecoder(r.Body)
			decoder.UseNumber()
			if err := decoder.Decode(&body); err != nil {
				t.Fatal(err)
			}
			if body["jobId"] != json.Number("7") {
				t.Fatalf("unexpected source job filter: %#v", body)
			}
			fmt.Fprint(w, `{"success":true,"data":{"data":[{"id":7,"appId":2,"enable":true,"jobName":"demo","jobDescription":"original","jobParams":"line1\nline2","timeExpressionType":"CRON","timeExpression":"0 0 * * * ?","executeType":"STANDALONE","processorType":"BUILT_IN","processorInfo":"tech.example.Demo","concurrency":2,"notifyUserIds":[2,4],"advancedRuntimeConfig":{"taskTrackerBehavior":11},"gmtCreate":1720000000000,"nextTriggerTimeStr":"tomorrow"}]}}`)
		case "/job/save":
			var saved map[string]any
			decoder := json.NewDecoder(r.Body)
			decoder.UseNumber()
			if err := decoder.Decode(&saved); err != nil {
				t.Fatal(err)
			}
			if _, ok := saved["id"]; ok {
				t.Fatalf("copied source identity: %#v", saved)
			}
			if _, ok := saved["gmtCreate"]; ok {
				t.Fatalf("copied server timestamp: %#v", saved)
			}
			if _, ok := saved["nextTriggerTimeStr"]; ok {
				t.Fatalf("copied derived schedule field: %#v", saved)
			}
			if saved["appId"] != json.Number("2") || saved["jobName"] != "demo(1)" ||
				saved["jobDescription"] != "edited before creation" || saved["concurrency"] != json.Number("9") ||
				saved["jobParams"] != "line1\nline2" || saved["enable"] != true {
				t.Fatalf("unexpected copied job: %#v", saved)
			}
			notify, ok := saved["notifyUserIds"].([]any)
			if !ok || len(notify) != 2 || notify[0] != json.Number("2") || notify[1] != json.Number("4") {
				t.Fatalf("notification configuration was not preserved: %#v", saved["notifyUserIds"])
			}
			advanced, ok := saved["advancedRuntimeConfig"].(map[string]any)
			if !ok || advanced["taskTrackerBehavior"] != json.Number("11") {
				t.Fatalf("advanced configuration was not preserved: %#v", saved["advancedRuntimeConfig"])
			}
			fmt.Fprintf(w, `{"success":true,"data":%s}`, copiedID)
		default:
			t.Fatalf("unexpected route: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	s := &session{baseURL: server.URL, client: server.Client(), jwt: "token"}
	result, err := s.write("powerjob/copyJob", map[string]any{
		"appId": "2", "jobId": "7",
		"job": map[string]any{
			"jobName": "demo(1)", "jobDescription": "edited before creation", "concurrency": json.Number("9"),
		},
	})
	if err != nil || result.(map[string]any)["jobId"] != copiedID {
		t.Fatalf("unexpected copy result: %#v, %v", result, err)
	}
	if !reflect.DeepEqual(calls, []string{"POST /job/list", "POST /job/save"}) {
		t.Fatalf("unexpected route sequence: %v", calls)
	}
}

func TestCreateJobRejectsInvalidConfigurationBeforeRequest(t *testing.T) {
	s := &session{}
	for _, job := range []map[string]any{
		{"jobName": "missing required fields"},
		{"jobName": "demo", "timeExpressionType": "API", "executeType": "STANDALONE", "processorType": "BUILT_IN", "processorInfo": "demo", "id": json.Number("7")},
	} {
		if _, err := s.write("powerjob/createJob", map[string]any{"appId": "2", "job": job}); err == nil {
			t.Fatalf("accepted invalid job: %#v", job)
		}
	}
}

func TestUpdateJobRejectsNonEditableFieldsBeforeRequest(t *testing.T) {
	s := &session{}
	for _, changes := range []map[string]any{
		{"id": "8"}, {"appId": "3"}, {"enable": "false"}, {"unknown": "x"},
		{"concurrency": "not-a-number"}, {"alarmConfig": []any{"not-an-object"}},
		{"lifeCycle": "1720000000000"},
		{"lifeCycle": map[string]any{"start": json.Number("172000000000"), "end": nil}},
		{"lifeCycle": map[string]any{"start": json.Number("1720000000000"), "end": json.Number("1710000000000")}},
		{"lifeCycle": map[string]any{"start": json.Number("1720000000000"), "end": nil, "unexpected": true}},
		{"alarmConfig": map[string]any{"alertThreshold": json.Number("1")}},
		{"alarmConfig": map[string]any{"alertThreshold": json.Number("1"), "statisticWindowLen": json.Number("2"), "silenceWindowLen": nil}},
		{"logConfig": map[string]any{"type": json.Number("5")}},
		{"advancedRuntimeConfig": map[string]any{"taskTrackerBehavior": json.Number("5")}},
	} {
		if _, err := s.write("powerjob/updateJob", map[string]any{"appId": "2", "jobId": "7", "changes": changes}); err == nil {
			t.Fatalf("accepted unsafe changes: %#v", changes)
		}
	}
	if _, err := s.write("powerjob/copyJob", map[string]any{
		"appId": "2", "jobId": "7", "job": map[string]any{"id": "8"},
	}); err == nil {
		t.Fatal("accepted copied job identity override")
	}
}

func TestUpdateJobDisablesThroughDedicatedRoute(t *testing.T) {
	var calls []string
	enabled := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.Method+" "+r.URL.Path)
		switch r.URL.Path {
		case "/job/list":
			fmt.Fprintf(w, `{"success":true,"data":{"data":[{"id":7,"appId":2,"enable":%t,"jobName":"demo","processorInfo":"foo","executeType":"STANDALONE","processorType":"BUILT_IN","timeExpressionType":"CRON"}]}}`, enabled)
		case "/job/disable":
			if r.Method != http.MethodGet || r.URL.Query().Get("jobId") != "7" {
				t.Errorf("unexpected disable request: %s", r.URL)
			}
			enabled = false
			fmt.Fprint(w, `{"success":true,"data":null}`)
		default:
			t.Errorf("unexpected route: %s", r.URL.Path)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	if err := s.updateJob("2", "7", map[string]any{"enable": false}); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(calls, []string{"POST /job/list", "GET /job/disable", "POST /job/list"}) {
		t.Fatalf("unexpected route sequence: %v", calls)
	}
}

func TestUpdateJobSavesConfigBeforeDisabling(t *testing.T) {
	var calls []string
	job := map[string]any{
		"id": json.Number("7"), "appId": json.Number("2"), "enable": true,
		"jobName": "demo", "processorInfo": "foo", "executeType": "STANDALONE",
		"processorType": "BUILT_IN", "timeExpressionType": "CRON",
		"alarmConfig": map[string]any{"alertThreshold": json.Number("1"), "statisticWindowLen": json.Number("30"), "silenceWindowLen": json.Number("60")},
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.Method+" "+r.URL.Path)
		switch r.URL.Path {
		case "/job/list":
			encoded, _ := json.Marshal(job)
			fmt.Fprintf(w, `{"success":true,"data":{"data":[%s]}}`, encoded)
		case "/job/save":
			decoder := json.NewDecoder(r.Body)
			decoder.UseNumber()
			if err := decoder.Decode(&job); err != nil {
				t.Error(err)
			}
			if job["enable"] != true {
				t.Error("save disabled the job without /job/disable")
			}
			fmt.Fprint(w, `{"success":true,"data":7}`)
		case "/job/disable":
			job["enable"] = false
			fmt.Fprint(w, `{"success":true,"data":null}`)
		default:
			t.Errorf("unexpected route: %s", r.URL.Path)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	config := map[string]any{"alertThreshold": json.Number("2"), "statisticWindowLen": json.Number("30"), "silenceWindowLen": json.Number("60")}
	if err := s.updateJob("2", "7", map[string]any{"alarmConfig": config, "enable": false}); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(calls, []string{"POST /job/list", "POST /job/save", "GET /job/disable", "POST /job/list"}) {
		t.Fatalf("unexpected route sequence: %v", calls)
	}
	if !reflect.DeepEqual(job["alarmConfig"], config) || job["enable"] != false {
		t.Fatalf("unexpected saved config: %#v", job)
	}
}

func TestUpdateJobPreservesMillisecondLifeCycle(t *testing.T) {
	var saved map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/job/list":
			if saved == nil {
				fmt.Fprint(w, `{"success":true,"data":{"data":[{"id":7,"appId":2,"enable":true,"jobName":"demo","processorInfo":"foo","executeType":"STANDALONE","processorType":"BUILT_IN","timeExpressionType":"CRON","lifeCycle":{"start":1720000000123,"end":null}}]}}`)
				return
			}
			encoded, _ := json.Marshal(saved)
			fmt.Fprintf(w, `{"success":true,"data":{"data":[%s]}}`, encoded)
		case "/job/save":
			decoder := json.NewDecoder(r.Body)
			decoder.UseNumber()
			if err := decoder.Decode(&saved); err != nil {
				t.Error(err)
			}
			fmt.Fprint(w, `{"success":true,"data":7}`)
		default:
			t.Errorf("unexpected route: %s", r.URL.Path)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	change := map[string]any{"lifeCycle": map[string]any{"start": json.Number("1720000000123"), "end": json.Number("1730000000456")}}
	if err := s.updateJob("2", "7", change); err != nil {
		t.Fatal(err)
	}
	cycle := saved["lifeCycle"].(map[string]any)
	if cycle["start"] != json.Number("1720000000123") || cycle["end"] != json.Number("1730000000456") {
		t.Fatalf("lifeCycle changed precision: %#v", cycle)
	}
}

func TestUpdateJobAcceptsEquivalentDoubleResponse(t *testing.T) {
	var saved bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/job/list":
			value := "0.0"
			if saved {
				value = "1.0"
			}
			fmt.Fprintf(w, `{"success":true,"data":{"data":[{"id":7,"appId":2,"enable":true,"jobName":"demo","processorInfo":"foo","executeType":"STANDALONE","processorType":"BUILT_IN","timeExpressionType":"CRON","minCpuCores":%s}]}}`, value)
		case "/job/save":
			var body map[string]any
			decoder := json.NewDecoder(r.Body)
			decoder.UseNumber()
			if err := decoder.Decode(&body); err != nil {
				t.Error(err)
			}
			if body["minCpuCores"] != json.Number("1") {
				t.Errorf("unexpected value: %v", body["minCpuCores"])
			}
			saved = true
			fmt.Fprint(w, `{"success":true,"data":7}`)
		default:
			t.Errorf("unexpected route: %s", r.URL.Path)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	if err := s.updateJob("2", "7", map[string]any{"minCpuCores": json.Number("1")}); err != nil {
		t.Fatal(err)
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

func TestDeleteJobUsesScopedRoute(t *testing.T) {
	var calls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.Method+" "+r.URL.Path)
		if r.Header.Get("AppId") != "4" || r.Header.Get("PowerJwt") != "token" {
			t.Error("missing scoped authorization headers")
		}
		switch r.URL.Path {
		case "/job/list":
			fmt.Fprint(w, `{"success":true,"data":{"data":[{"id":147,"appId":4,"enable":false,"jobName":"demo"}]}}`)
		case "/job/delete":
			if r.Method != "GET" || r.URL.Query().Get("jobId") != "147" {
				t.Errorf("unexpected delete request: %s %s", r.Method, r.URL.String())
			}
			fmt.Fprint(w, `{"success":true,"data":null}`)
		default:
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	s := &session{baseURL: server.URL, client: server.Client(), jwt: "token"}
	result, err := s.write("powerjob/deleteJob", map[string]any{"appId": "4", "jobId": "147"})
	if err != nil || result.(map[string]any)["success"] != true {
		t.Fatalf("unexpected delete result: %#v, %v", result, err)
	}
	if !reflect.DeepEqual(calls, []string{"POST /job/list", "GET /job/delete"}) {
		t.Fatal(calls)
	}
}

func TestDeleteJobRejectsWrongApplicationAndReadOnly(t *testing.T) {
	var deleteCalls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/job/delete" {
			deleteCalls++
		}
		fmt.Fprint(w, `{"success":true,"data":{"data":[{"id":147,"appId":5,"enable":true}]}}`)
	}))
	defer server.Close()

	s := &session{baseURL: server.URL, client: server.Client()}
	params := map[string]any{"appId": "4", "jobId": "147"}
	if _, err := s.write("powerjob/deleteJob", params); err == nil || deleteCalls != 0 {
		t.Fatalf("wrong-app job was deleted: %v", err)
	}
	s.readOnly = true
	if _, err := s.write("powerjob/deleteJob", params); err == nil || deleteCalls != 0 {
		t.Fatalf("read-only job was deleted: %v", err)
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
		{"powerjob/runJob", map[string]any{"appId": "2", "jobId": "bad", "instanceParams": "test"}},
		{"powerjob/runJob", map[string]any{"appId": "2", "jobId": "7", "instanceParams": 123}},
		{"powerjob/runJob", map[string]any{"appId": "2", "jobId": "7", "instanceParams": string(make([]byte, 4097))}},
		{"powerjob/deleteJob", map[string]any{"appId": "2", "jobId": "../../delete"}},
		{"powerjob/delete", map[string]any{"appId": "2"}},
	} {
		if _, err := s.write(tc.method, tc.params); err == nil {
			t.Fatalf("accepted %s: %#v", tc.method, tc.params)
		}
	}
}

func TestRunJobUsesScopedQueryAndPreservesInstanceID(t *testing.T) {
	const instanceID = "981965114838090752"
	var runCalls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("AppId") != "4" || r.Header.Get("PowerJwt") != "token" {
			t.Error("missing scoped authorization headers")
		}
		switch r.URL.Path {
		case "/job/list":
			fmt.Fprint(w, `{"success":true,"data":{"data":[{"id":147,"appId":4,"enable":false}]}}`)
		case "/job/run":
			runCalls++
			if r.Method != "GET" || r.URL.Query().Get("jobId") != "147" ||
				r.URL.Query().Get("appId") != "4" || r.URL.Query().Get("instanceParams") != "a&b=测试" {
				t.Errorf("unexpected run request: %s %s", r.Method, r.URL.String())
			}
			fmt.Fprintf(w, `{"success":true,"data":%s}`, instanceID)
		default:
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client(), jwt: "token"}
	result, err := s.write("powerjob/runJob", map[string]any{
		"appId": "4", "jobId": "147", "instanceParams": "a&b=测试",
	})
	if err != nil || result.(map[string]any)["instanceId"] != instanceID || runCalls != 1 {
		t.Fatalf("unexpected run result: %#v, %v, calls=%d", result, err, runCalls)
	}
}

func TestRunJobRejectsWrongApplicationAndReadOnly(t *testing.T) {
	var runCalls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/job/run" {
			runCalls++
		}
		fmt.Fprint(w, `{"success":true,"data":{"data":[{"id":147,"appId":5,"enable":true}]}}`)
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	params := map[string]any{"appId": "4", "jobId": "147", "instanceParams": ""}
	if _, err := s.write("powerjob/runJob", params); err == nil || runCalls != 0 {
		t.Fatalf("wrong-app job was run: %v", err)
	}
	s.readOnly = true
	if _, err := s.write("powerjob/runJob", params); err == nil || runCalls != 0 {
		t.Fatalf("read-only job was run: %v", err)
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
