package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func testWorkflowDraft() workflowDraft {
	return workflowDraft{Config: map[string]any{"wfName": "example", "wfDescription": "", "timeExpressionType": "API", "timeExpression": "", "enable": false, "maxWfInstanceNum": json.Number("1"), "notifyUserIds": []any{}, "lifeCycle": nil}, Nodes: []workflowNodeDraft{{Key: "draft-a", Type: 1, JobID: "7", Name: "task", Params: "{}", Enable: true}}, Edges: []workflowEdgeDraft{}}
}
func TestWorkflowDAGValidation(t *testing.T) {
	d := testWorkflowDraft()
	if err := validateWorkflowDraft(d); err != nil {
		t.Fatal(err)
	}
	d.Nodes = append(d.Nodes, workflowNodeDraft{Key: "decision", Type: 2, Params: "return true", Enable: true}, workflowNodeDraft{Key: "b", Type: 1, JobID: "8", Enable: true})
	d.Edges = []workflowEdgeDraft{{From: "decision", To: "draft-a", Property: "true"}, {From: "decision", To: "b", Property: "false"}}
	if err := validateWorkflowDraft(d); err != nil {
		t.Fatal(err)
	}
	d.Edges = append(d.Edges, workflowEdgeDraft{From: "draft-a", To: "decision"})
	if err := validateWorkflowDraft(d); err == nil || !strings.Contains(err.Error(), "cycle") {
		t.Fatalf("expected cycle rejection: %v", err)
	}
	d.Edges = d.Edges[:1]
	if err := validateWorkflowDraft(d); err == nil {
		t.Fatal("accepted incomplete decision exits")
	}
	d = testWorkflowDraft()
	d.Nodes[0].NodeID = "0"
	d.Nodes = append(d.Nodes, d.Nodes[0])
	if err := validateWorkflowDraft(d); err == nil {
		t.Fatal("accepted duplicate identities")
	}
}
func TestWorkflowInstanceProjectionAndActions(t *testing.T) {
	const large = "981844507211334656"
	calls := []string{}
	status := 3
	nodeStatus := 4
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.URL.Path)
		if r.Method == http.MethodGet && r.URL.Query().Get("appId") != "2" {
			t.Errorf("legacy workflow endpoint requires appId query: %s", r.URL.Path)
			fmt.Fprint(w, `{"success":false,"message":"Permission denied!"}`)
			return
		}
		if r.Header.Get("AppId") != "2" || r.Header.Get("PowerJwt") != "token" {
			t.Error("missing scoped authentication headers")
		}
		switch r.URL.Path {
		case "/wfInstance/list":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["status"] != "FAILED" || body["workflowId"] != float64(77) {
				t.Errorf("wrong filters: %v", body)
			}
			fmt.Fprintf(w, `{"success":true,"data":{"index":0,"pageSize":20,"totalPages":1,"totalItems":1,"data":[{"wfInstanceId":%s,"workflowId":77,"status":3,"secret":"private"}]}}`, large)
		case "/wfInstance/info":
			fmt.Fprintf(w, `{"success":true,"data":{"wfInstanceId":"%s","workflowId":"77","status":%d,"peworkflowDAG":{"nodes":[{"nodeId":%s,"nodeType":1,"instanceId":"%s","status":%d,"skipWhenFailed":false}],"edges":[]}}}`, large, status, large, large, nodeStatus)
		case "/wfInstance/markNodeAsSuccess":
			nodeStatus = 5
			fmt.Fprint(w, `{"success":true,"data":null}`)
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
		}
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client(), jwt: "token"}
	pageRaw, err := s.workflow("powerjob/workflowInstances", map[string]any{"appId": "2", "workflowId": "77", "status": "FAILED"})
	if err != nil {
		t.Fatal(err)
	}
	page := pageRaw.(pageResult)
	if page.Data[0]["wfInstanceId"] != large || page.Data[0]["secret"] != nil {
		t.Fatalf("bad projection: %v", page)
	}
	row, err := s.workflowInstanceFetch("2", large)
	if err != nil {
		t.Fatal(err)
	}
	node := dagOf(row)["nodes"].([]any)[0].(map[string]any)
	if node["nodeId"] != large {
		t.Fatal("nested ID lost precision")
	}
	result, err := s.workflow("powerjob/markWorkflowNodeSuccess", map[string]any{"appId": "2", "wfInstanceId": large, "nodeId": large})
	if err != nil || result.(map[string]any)["verified"] != true {
		t.Fatalf("mark failed: %v, %v", result, err)
	}
	status = 2
	before := len(calls)
	if _, err = s.workflow("powerjob/retryWorkflowInstance", map[string]any{"appId": "2", "wfInstanceId": large}); err == nil {
		t.Fatal("accepted retry of running instance")
	}
	if len(calls) != before+1 {
		t.Fatal("ineligible instance caused a write")
	}
}

func TestWorkflowFetchIncludesHeaderAndQueryApplicationScope(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || r.URL.Path != "/workflow/fetch" || r.Header.Get("AppId") != "2" || r.Header.Get("PowerJwt") != "token" {
			t.Error("invalid scoped request")
		}
		if r.URL.Query().Get("workflowId") != "17" || r.URL.Query().Get("appId") != "2" {
			fmt.Fprint(w, `{"success":false,"message":"Permission denied!"}`)
			return
		}
		fmt.Fprint(w, `{"success":true,"data":{"id":17,"appId":2,"wfName":"example","peworkflowDAG":{"nodes":[],"edges":[]}}}`)
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client(), jwt: "token"}
	row, err := s.workflowFetch("2", "17")
	if err != nil {
		t.Fatal(err)
	}
	if row["id"] != "17" || row["appId"] != "2" {
		t.Fatalf("incorrect ownership projection: %v", row)
	}
}
func TestWorkflowRejectsCrossAppAndReadonly(t *testing.T) {
	writes := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writes++
		fmt.Fprint(w, `{"success":true,"data":{"id":77,"appId":9,"wfName":"other"}}`)
	}))
	defer server.Close()
	s := &session{baseURL: server.URL, client: server.Client()}
	if _, err := s.workflow("powerjob/deleteWorkflow", map[string]any{"appId": "2", "workflowId": "77"}); err == nil {
		t.Fatal("accepted cross-app workflow")
	}
	if writes != 1 {
		t.Fatal("delete was forwarded")
	}
	s.readOnly = true
	before := writes
	for _, method := range []string{"powerjob/saveWorkflow", "powerjob/deleteWorkflow", "powerjob/runWorkflow", "powerjob/markWorkflowNodeSuccess"} {
		if _, err := s.workflow(method, map[string]any{"appId": "2", "workflowId": "77"}); err == nil {
			t.Fatal("accepted readonly write")
		}
	}
	if writes != before {
		t.Fatal("readonly request contacted server")
	}
}
func waitWorkflowOperation(t *testing.T, s *session, id string) map[string]any {
	t.Helper()
	until := time.Now().Add(3 * time.Second)
	for time.Now().Before(until) {
		value, err := s.workflowSaveStatus("2", map[string]any{"operationId": id})
		if err != nil {
			t.Fatal(err)
		}
		row := value.(map[string]any)
		if row["state"] != "running" {
			return row
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("save did not finish")
	return nil
}
func TestWorkflowSaveResumeAndUncertainOutcomes(t *testing.T) {
	for _, mode := range []string{"success", "partial", "unknown", "unverified"} {
		t.Run(mode, func(t *testing.T) {
			var mu sync.Mutex
			nodeCalls, saveCalls, fetchCalls := 0, 0, 0
			var definition map[string]any
			var savedNode map[string]any
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				mu.Lock()
				defer mu.Unlock()
				switch r.URL.Path {
				case "/job/list":
					fmt.Fprint(w, `{"success":true,"data":{"data":[{"id":7,"appId":2,"enable":true}]}}`)
				case "/workflow/saveNode":
					nodeCalls++
					var list []map[string]any
					decoder := json.NewDecoder(r.Body)
					decoder.UseNumber()
					_ = decoder.Decode(&list)
					savedNode = list[0]
					savedNode["id"] = json.Number("981844507211334656")
					_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": []any{savedNode}})
				case "/workflow/save":
					saveCalls++
					if mode == "partial" && saveCalls == 1 {
						fmt.Fprint(w, `{"success":false}`)
						return
					}
					if mode == "unknown" {
						http.Error(w, "unavailable", 500)
						return
					}
					decoder := json.NewDecoder(r.Body)
					decoder.UseNumber()
					_ = decoder.Decode(&definition)
					definition["id"] = json.Number("77")
					dag := definition["dag"].(map[string]any)
					n := cloneWorkflowRow(savedNode)
					n["nodeId"] = n["id"]
					n["nodeType"] = n["type"]
					dag["nodes"] = []any{n}
					definition["peworkflowDAG"] = dag
					delete(definition, "dag")
					fmt.Fprint(w, `{"success":true,"data":77}`)
				case "/workflow/fetch":
					fetchCalls++
					if mode == "unverified" && fetchCalls == 1 {
						http.Error(w, "unavailable", 500)
						return
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": definition})
				default:
					t.Errorf("unexpected request %s", r.URL.Path)
				}
			}))
			defer server.Close()
			s := &session{baseURL: server.URL, client: server.Client()}
			d := testWorkflowDraft()
			raw, _ := json.Marshal(d)
			var draft map[string]any
			_ = decodeData(raw, &draft)
			if _, err := s.workflow("powerjob/saveWorkflow", map[string]any{"appId": "2", "operationId": "op1", "draft": draft}); err != nil {
				t.Fatal(err)
			}
			row := waitWorkflowOperation(t, s, "op1")
			expected := map[string]string{"success": "succeeded", "partial": "partial", "unknown": "unknown", "unverified": "unverified"}[mode]
			if row["state"] != expected {
				t.Fatalf("expected %s: %v", expected, row)
			}
			if _, err := s.workflow("powerjob/saveWorkflow", map[string]any{"appId": "2", "operationId": "op1", "resume": mode == "partial" || mode == "unverified"}); err != nil {
				t.Fatal(err)
			}
			row = waitWorkflowOperation(t, s, "op1")
			if mode != "unknown" && row["state"] != "succeeded" {
				t.Fatalf("resume failed: %v", row)
			}
			mu.Lock()
			defer mu.Unlock()
			if nodeCalls != 1 {
				t.Fatalf("nodes written %d times", nodeCalls)
			}
			want := 1
			if mode == "partial" {
				want = 2
			}
			if saveCalls != want {
				t.Fatalf("workflow written %d times, expected %d", saveCalls, want)
			}
		})
	}
}

func TestWorkflowEditChecksDriftAndPreservesExistingNodeIdentity(t *testing.T) {
	for _, drift := range []bool{false, true} {
		t.Run(fmt.Sprint(drift), func(t *testing.T) {
			d := testWorkflowDraft()
			d.ID = "77"
			d.Nodes[0].NodeID = "101"
			d.Nodes[0].Key = "101"
			base := expectedWorkflow(d)
			base["id"] = "77"
			base["appId"] = "2"
			nodeWrites, workflowWrites := 0, 0
			var mu sync.Mutex
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				mu.Lock()
				defer mu.Unlock()
				switch r.URL.Path {
				case "/workflow/fetch":
					_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": base})
				case "/job/list":
					fmt.Fprint(w, `{"success":true,"data":{"data":[{"id":7,"appId":2,"enable":true}]}}`)
				case "/workflow/saveNode":
					nodeWrites++
					var requests []map[string]any
					decoder := json.NewDecoder(r.Body)
					decoder.UseNumber()
					_ = decoder.Decode(&requests)
					if asString(requests[0]["id"]) != "101" {
						t.Error("existing node was recreated")
					}
					node := cloneWorkflowRow(requests[0])
					node["nodeId"] = "101"
					node["nodeType"] = node["type"]
					node["id"] = "101"
					dagOf(base)["nodes"] = []any{node}
					_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": []any{node}})
				case "/workflow/save":
					workflowWrites++
					var config map[string]any
					decoder := json.NewDecoder(r.Body)
					decoder.UseNumber()
					_ = decoder.Decode(&config)
					for _, key := range workflowConfigFields {
						base[key] = config[key]
					}
					fmt.Fprint(w, `{"success":true,"data":77}`)
				default:
					t.Errorf("unexpected request %s", r.URL.Path)
				}
			}))
			defer server.Close()
			s := &session{baseURL: server.URL, client: server.Client()}
			initial, err := s.workflowFetch("2", "77")
			if err != nil {
				t.Fatal(err)
			}
			d.Fingerprint = asString(initial["fingerprint"])
			d.Nodes[0].Name = "edited"
			d.Config["wfDescription"] = "changed"
			if drift {
				mu.Lock()
				base["wfDescription"] = "changed in console"
				mu.Unlock()
			}
			if _, err = s.workflow("powerjob/saveWorkflow", map[string]any{"appId": "2", "operationId": "edit", "draft": d}); err != nil {
				t.Fatal(err)
			}
			result := waitWorkflowOperation(t, s, "edit")
			mu.Lock()
			defer mu.Unlock()
			if drift {
				if result["state"] != "failed" || nodeWrites != 0 || workflowWrites != 0 {
					t.Fatalf("drift was overwritten: %v", result)
				}
			} else {
				if result["state"] != "succeeded" || nodeWrites != 1 || workflowWrites != 1 {
					t.Fatalf("edit failed: %v", result)
				}
			}
		})
	}
}
