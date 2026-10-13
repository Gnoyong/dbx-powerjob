package main

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

var workflowFields = []string{"id", "appId", "wfName", "wfDescription", "timeExpressionType", "timeExpression", "maxWfInstanceNum", "enable", "notifyUserIds", "lifeCycle", "peworkflowDAG", "gmtCreate", "gmtModified"}
var workflowInstanceFields = []string{"workflowId", "wfInstanceId", "workflowName", "wfInitParams", "wfContext", "status", "peworkflowDAG", "result", "expectedTriggerTime", "actualTriggerTime", "finishedTime"}
var workflowConfigFields = []string{"wfName", "wfDescription", "timeExpressionType", "timeExpression", "maxWfInstanceNum", "enable", "notifyUserIds", "lifeCycle"}

// Normalize IDs recursively before the JSON crosses into JavaScript.
func workflowIDs(value any) any {
	switch v := value.(type) {
	case map[string]any:
		for k, x := range v {
			switch k {
			case "id", "appId", "workflowId", "wfInstanceId", "nodeId", "jobId", "instanceId", "from", "to":
				if x != nil {
					v[k] = asString(x)
				}
			case "notifyUserIds":
				if list, ok := x.([]any); ok {
					for i, id := range list {
						list[i] = asString(id)
					}
				}
			default:
				v[k] = workflowIDs(x)
			}
		}
	case []any:
		for i, x := range v {
			v[i] = workflowIDs(x)
		}
	}
	return value
}

func dagOf(row map[string]any) map[string]any {
	dag, _ := row["peworkflowDAG"].(map[string]any)
	return dag
}

func canonicalWorkflow(row map[string]any) map[string]any {
	result := pick(row, workflowConfigFields)
	nodes := []any{}
	edges := []any{}
	if dag := dagOf(row); dag != nil {
		if list, ok := dag["nodes"].([]any); ok {
			for _, raw := range list {
				if n, ok := raw.(map[string]any); ok {
					nodes = append(nodes, pick(n, []string{"nodeId", "nodeType", "jobId", "nodeName", "nodeParams", "enable", "skipWhenFailed"}))
				}
			}
		}
		if list, ok := dag["edges"].([]any); ok {
			for _, raw := range list {
				if e, ok := raw.(map[string]any); ok {
					item := pick(e, []string{"from", "to"})
					item["property"] = asString(e["property"])
					edges = append(edges, item)
				}
			}
		}
	}
	sort.Slice(nodes, func(i, j int) bool {
		a, _ := json.Marshal(nodes[i])
		b, _ := json.Marshal(nodes[j])
		return string(a) < string(b)
	})
	sort.Slice(edges, func(i, j int) bool {
		a, _ := json.Marshal(edges[i])
		b, _ := json.Marshal(edges[j])
		return string(a) < string(b)
	})
	result["dag"] = map[string]any{"nodes": nodes, "edges": edges}
	return result
}

func workflowFingerprint(row map[string]any) string {
	raw, _ := json.Marshal(canonicalWorkflow(row))
	return fmt.Sprintf("%x", sha256.Sum256(raw))
}

func (s *session) workflowFetch(appID, workflowID string) (map[string]any, error) {
	// Older consoles bind appId from query parameters; newer releases use AppId
	// headers. Send both, matching the official console, and still verify ownership.
	raw, err := s.request("GET", "/workflow/fetch", appID, url.Values{"workflowId": {workflowID}, "appId": {appID}}, nil)
	if err != nil {
		return nil, err
	}
	var row map[string]any
	if err = decodeData(raw, &row); err != nil {
		return nil, err
	}
	workflowIDs(row)
	if asString(row["id"]) != workflowID || asString(row["appId"]) != appID {
		return nil, errors.New("workflow was not found in this application")
	}
	row = pick(row, workflowFields)
	row["fingerprint"] = workflowFingerprint(row)
	return row, nil
}

func (s *session) workflowInstanceFetch(appID, id string) (map[string]any, error) {
	raw, err := s.request("GET", "/wfInstance/info", appID, url.Values{"wfInstanceId": {id}, "appId": {appID}}, nil)
	if err != nil {
		return nil, err
	}
	var row map[string]any
	if err = decodeData(raw, &row); err != nil {
		return nil, err
	}
	workflowIDs(row)
	if asString(row["wfInstanceId"]) != id {
		return nil, errors.New("workflow instance was not found")
	}
	// /wfInstance/info verifies AppId in WorkflowInstanceService.fetchWfInstance.
	return pick(row, workflowInstanceFields), nil
}

func (s *session) workflow(method string, params map[string]any) (any, error) {
	appID, err := requiredID(params, "appId")
	if err != nil {
		return nil, err
	}
	switch method {
	case "powerjob/workflowCapabilities":
		return map[string]any{"readOnly": s.readOnly}, nil
	case "powerjob/workflows", "powerjob/workflowInstances":
		index, size, err := pagination(params)
		if err != nil {
			return nil, err
		}
		body := map[string]any{"appId": json.Number(appID), "index": index, "pageSize": size}
		path, fields := "/workflow/list", workflowFields
		if method == "powerjob/workflowInstances" {
			path, fields = "/wfInstance/list", workflowInstanceFields
			status := asString(params["status"])
			if status != "" && !strings.Contains(",WAITING,RUNNING,FAILED,SUCCEED,STOPPED,", ","+status+",") {
				return nil, errors.New("invalid workflow instance status")
			}
			body["status"] = status
		} else if keyword := strings.TrimSpace(asString(params["keyword"])); keyword != "" {
			if len(keyword) > 100 {
				return nil, errors.New("keyword is too long")
			}
			body["keyword"] = keyword
		}
		for _, field := range []string{"workflowId", "wfInstanceId"} {
			if asString(params[field]) != "" {
				id, e := requiredID(params, field)
				if e != nil {
					return nil, e
				}
				body[field] = json.Number(id)
			}
		}
		raw, e := s.request("POST", path, appID, nil, body)
		if e != nil {
			return nil, e
		}
		var page pageResult
		if e = decodeData(raw, &page); e != nil {
			return nil, e
		}
		filtered := []map[string]any{}
		for _, row := range page.Data {
			// The upstream list-by-workflowId branch does not scope its DB query by appId.
			if path == "/workflow/list" && asString(row["appId"]) != appID {
				return nil, errors.New("workflow was not found in this application")
			}
			workflowIDs(row)
			filtered = append(filtered, pick(row, fields))
		}
		page.Data = filtered
		return page, nil
	case "powerjob/workflow":
		id, e := requiredID(params, "workflowId")
		if e != nil {
			return nil, e
		}
		return s.workflowFetch(appID, id)
	case "powerjob/workflowInstance":
		id, e := requiredID(params, "wfInstanceId")
		if e != nil {
			return nil, e
		}
		return s.workflowInstanceFetch(appID, id)
	case "powerjob/workflowSaveStatus":
		return s.workflowSaveStatus(appID, params)
	}
	if s.readOnly {
		return nil, errors.New("connection is read-only")
	}
	if method == "powerjob/saveWorkflow" {
		return s.startWorkflowSave(appID, params)
	}
	if method == "powerjob/stopWorkflowInstance" || method == "powerjob/retryWorkflowInstance" || method == "powerjob/markWorkflowNodeSuccess" {
		id, e := requiredID(params, "wfInstanceId")
		if e != nil {
			return nil, e
		}
		row, e := s.workflowInstanceFetch(appID, id)
		if e != nil {
			return nil, e
		}
		status := asString(row["status"])
		query := url.Values{"wfInstanceId": {id}, "appId": {appID}}
		path := "/wfInstance/stop"
		if method == "powerjob/stopWorkflowInstance" && status != "1" && status != "2" {
			return nil, errors.New("workflow instance is not running")
		}
		if method == "powerjob/retryWorkflowInstance" {
			if status != "3" && status != "10" {
				return nil, errors.New("only failed or stopped workflow instances can be retried")
			}
			path = "/wfInstance/retry"
		}
		if method == "powerjob/markWorkflowNodeSuccess" {
			if status != "3" && status != "10" {
				return nil, errors.New("workflow instance is running or successful")
			}
			nodeID, e := requiredID(params, "nodeId")
			if e != nil {
				return nil, e
			}
			eligible := false
			nodes, _ := dagOf(row)["nodes"].([]any)
			for _, raw := range nodes {
				n, _ := raw.(map[string]any)
				if asString(n["nodeId"]) == nodeID {
					eligible = asString(n["status"]) == "4" && asString(n["instanceId"]) != "" && n["skipWhenFailed"] != true
				}
			}
			if !eligible {
				return nil, errors.New("only failed nodes which disallow skipping can be marked successful")
			}
			query.Set("nodeId", nodeID)
			path = "/wfInstance/markNodeAsSuccess"
		}
		_, e = s.request("GET", path, appID, query, nil)
		if e != nil {
			return nil, e
		}
		updated, e := s.workflowInstanceFetch(appID, id)
		if e != nil {
			return map[string]any{"success": true, "verified": false}, nil
		}
		verified := true
		if method == "powerjob/stopWorkflowInstance" {
			verified = asString(updated["status"]) == "10"
		}
		if method == "powerjob/markWorkflowNodeSuccess" {
			verified = false
			nodes, _ := dagOf(updated)["nodes"].([]any)
			for _, raw := range nodes {
				n, _ := raw.(map[string]any)
				if asString(n["nodeId"]) == query.Get("nodeId") {
					verified = asString(n["status"]) == "5"
				}
			}
		}
		return map[string]any{"success": true, "verified": verified, "instance": updated}, nil
	}
	id, e := requiredID(params, "workflowId")
	if e != nil {
		return nil, e
	}
	row, e := s.workflowFetch(appID, id)
	if e != nil {
		return nil, e
	}
	query := url.Values{"workflowId": {id}, "appId": {appID}}
	switch method {
	case "powerjob/runWorkflow":
		delay := asString(params["delay"])
		if delay == "" {
			delay = "0"
		}
		n, e := strconv.ParseInt(delay, 10, 64)
		if e != nil || n < 0 {
			return nil, errors.New("invalid delay")
		}
		initParams := asString(params["initParams"])
		if len(initParams) > 65536 {
			return nil, errors.New("initial parameters are too long")
		}
		query.Set("delay", delay)
		query.Set("initParams", initParams)
		raw, e := s.request("GET", "/workflow/run", appID, query, nil)
		if e != nil {
			return nil, e
		}
		var result any
		if e = decodeData(raw, &result); e != nil {
			return nil, e
		}
		resultID := asString(result)
		if !numericID.MatchString(resultID) {
			return nil, errors.New("PowerJob returned an invalid workflow instance ID")
		}
		return map[string]any{"wfInstanceId": resultID}, nil
	case "powerjob/copyWorkflow":
		raw, e := s.request("POST", "/workflow/copy", appID, query, nil)
		if e != nil {
			return nil, e
		}
		var result any
		if e = decodeData(raw, &result); e != nil {
			return nil, e
		}
		copied, e := s.workflowFetch(appID, asString(result))
		if e != nil {
			return nil, e
		}
		return copied, nil
	case "powerjob/setWorkflowEnabled":
		enabled, ok := params["enabled"].(bool)
		if !ok {
			return nil, errors.New("invalid enabled state")
		}
		if row["enable"] != enabled {
			path := "/workflow/disable"
			if enabled {
				path = "/workflow/enable"
			}
			if _, e = s.request("GET", path, appID, query, nil); e != nil {
				return nil, e
			}
		}
		updated, e := s.workflowFetch(appID, id)
		if e != nil {
			return nil, e
		}
		if updated["enable"] != enabled {
			return nil, errors.New("workflow state did not change")
		}
		return updated, nil
	case "powerjob/deleteWorkflow":
		_, e = s.request("GET", "/workflow/delete", appID, query, nil)
		if e != nil {
			return nil, e
		}
		return map[string]any{"success": true}, nil
	}
	return nil, errors.New("unsupported workflow operation")
}

type workflowNodeDraft struct {
	Key    string `json:"key"`
	NodeID string `json:"nodeId,omitempty"`
	Type   int    `json:"nodeType"`
	JobID  string `json:"jobId,omitempty"`
	Name   string `json:"nodeName"`
	Params string `json:"nodeParams"`
	Enable bool   `json:"enable"`
	Skip   bool   `json:"skipWhenFailed"`
}
type workflowEdgeDraft struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Property string `json:"property,omitempty"`
}
type workflowDraft struct {
	ID          string              `json:"id,omitempty"`
	Config      map[string]any      `json:"config"`
	Nodes       []workflowNodeDraft `json:"nodes"`
	Edges       []workflowEdgeDraft `json:"edges"`
	Fingerprint string              `json:"fingerprint,omitempty"`
}

func validateWorkflowDraft(d workflowDraft) error {
	if d.ID != "" && !numericID.MatchString(d.ID) {
		return errors.New("invalid workflow ID")
	}
	if len(d.Nodes) == 0 || len(d.Nodes) > 500 || len(d.Edges) > 5000 {
		return errors.New("workflow must have 1 to 500 nodes and at most 5000 edges")
	}
	if strings.TrimSpace(asString(d.Config["wfName"])) == "" || len(asString(d.Config["wfName"])) > 255 {
		return errors.New("workflow name is required (max 255 bytes)")
	}
	kind := asString(d.Config["timeExpressionType"])
	if kind != "API" && kind != "CRON" && kind != "FIX_RATE" && kind != "FIX_DELAY" {
		return errors.New("invalid workflow schedule")
	}
	if kind == "CRON" && strings.TrimSpace(asString(d.Config["timeExpression"])) == "" {
		return errors.New("CRON expression is required")
	}
	if _, ok := d.Config["enable"].(bool); !ok {
		return errors.New("invalid workflow enabled state")
	}
	n, err := strconv.Atoi(asString(d.Config["maxWfInstanceNum"]))
	if err != nil || n < 1 || n > 100000 {
		return errors.New("invalid maximum workflow instances")
	}
	if life, ok := d.Config["lifeCycle"].(map[string]any); ok {
		var start, end int64
		for key, v := range life {
			if key != "start" && key != "end" {
				return errors.New("invalid lifecycle")
			}
			if v == nil {
				continue
			}
			num, e := strconv.ParseInt(asString(v), 10, 64)
			if e != nil || num < 0 {
				return errors.New("invalid lifecycle")
			}
			if key == "start" {
				start = num
			} else {
				end = num
			}
		}
		if start != 0 && end != 0 && start >= end {
			return errors.New("lifecycle start must precede end")
		}
	}
	if list, ok := d.Config["notifyUserIds"].([]any); ok {
		for _, v := range list {
			if !numericID.MatchString(asString(v)) {
				return errors.New("invalid notification user ID")
			}
		}
	}
	nodes := map[string]workflowNodeDraft{}
	ids := map[string]bool{}
	for _, node := range d.Nodes {
		if node.Key == "" || len(node.Key) > 100 || nodes[node.Key].Key != "" {
			return errors.New("duplicate or invalid node key")
		}
		if node.NodeID != "" {
			if !numericID.MatchString(node.NodeID) || ids[node.NodeID] {
				return errors.New("duplicate or invalid node ID")
			}
			ids[node.NodeID] = true
		}
		if node.Type < 1 || node.Type > 3 {
			return errors.New("invalid node type")
		}
		if node.Type != 2 && (!numericID.MatchString(node.JobID) || strings.TrimLeft(node.JobID, "0") == "") {
			return errors.New("a job or workflow reference is required")
		}
		if node.Type == 2 && strings.TrimSpace(node.Params) == "" {
			return errors.New("decision script is required")
		}
		if len(node.Params) > 65536 || len(node.Name) > 255 {
			return errors.New("node fields are too long")
		}
		nodes[node.Key] = node
	}
	adjacency := map[string][]string{}
	indegree := map[string]int{}
	seen := map[string]bool{}
	branches := map[string]map[string]bool{}
	for _, edge := range d.Edges {
		if nodes[edge.From].Key == "" || nodes[edge.To].Key == "" || edge.From == edge.To {
			return errors.New("invalid edge endpoint")
		}
		key := edge.From + "\x00" + edge.To
		if seen[key] {
			return errors.New("duplicate edge")
		}
		seen[key] = true
		if nodes[edge.From].Type == 2 {
			if edge.Property != "true" && edge.Property != "false" {
				return errors.New("decision exits must be true and false")
			}
			if branches[edge.From] == nil {
				branches[edge.From] = map[string]bool{}
			}
			if branches[edge.From][edge.Property] {
				return errors.New("duplicate decision exit")
			}
			branches[edge.From][edge.Property] = true
		} else if edge.Property != "" {
			return errors.New("only decision edges may have a branch")
		}
		adjacency[edge.From] = append(adjacency[edge.From], edge.To)
		indegree[edge.To]++
	}
	queue := []string{}
	for key, node := range nodes {
		if node.Type == 2 && len(branches[key]) != 2 {
			return errors.New("decision nodes require true and false exits")
		}
		if indegree[key] == 0 {
			queue = append(queue, key)
		}
	}
	visited := 0
	for len(queue) > 0 {
		key := queue[0]
		queue = queue[1:]
		visited++
		for _, next := range adjacency[key] {
			indegree[next]--
			if indegree[next] == 0 {
				queue = append(queue, next)
			}
		}
	}
	if visited != len(nodes) {
		return errors.New("workflow contains a cycle")
	}
	return nil
}

func (s *session) validateWorkflowReferences(appID string, d workflowDraft, base map[string]any) error {
	owned := map[string]map[string]any{}
	if base != nil {
		nodes, _ := dagOf(base)["nodes"].([]any)
		for _, raw := range nodes {
			n, _ := raw.(map[string]any)
			owned[asString(n["nodeId"])] = n
		}
	}
	checked := map[string]bool{}
	for _, node := range d.Nodes {
		if node.NodeID != "" && owned[node.NodeID] == nil {
			return errors.New("node does not belong to this workflow")
		}
		ref := fmt.Sprintf("%d:%s", node.Type, node.JobID)
		if checked[ref] {
			continue
		}
		checked[ref] = true
		if node.Type == 1 {
			if _, err := s.jobForAction(appID, node.JobID); err != nil {
				return err
			}
		}
		if node.Type == 3 {
			if node.JobID == d.ID {
				return errors.New("a workflow cannot reference itself")
			}
			row, err := s.workflowFetch(appID, node.JobID)
			if err != nil {
				return err
			}
			nodes, _ := dagOf(row)["nodes"].([]any)
			for _, raw := range nodes {
				n, _ := raw.(map[string]any)
				if asString(n["nodeType"]) == "3" {
					return errors.New("nested workflows cannot contain another nested workflow")
				}
			}
		}
	}
	return nil
}

func nodeRequest(node workflowNodeDraft, appID string) map[string]any {
	req := map[string]any{"appId": json.Number(appID), "type": node.Type, "nodeName": node.Name, "nodeParams": node.Params, "enable": node.Enable, "skipWhenFailed": node.Skip}
	if node.NodeID != "" {
		req["id"] = json.Number(node.NodeID)
	}
	if node.Type != 2 {
		req["jobId"] = json.Number(node.JobID)
	}
	return req
}
func sameNode(node workflowNodeDraft, raw map[string]any) bool {
	return node.Type == intNumber(raw["nodeType"]) && node.JobID == asString(raw["jobId"]) && node.Name == asString(raw["nodeName"]) && node.Params == asString(raw["nodeParams"]) && node.Enable == (raw["enable"] == true) && node.Skip == (raw["skipWhenFailed"] == true)
}
func intNumber(v any) int { n, _ := strconv.Atoi(asString(v)); return n }

func expectedWorkflow(d workflowDraft) map[string]any {
	row := pick(d.Config, workflowConfigFields)
	nodes := []any{}
	edges := []any{}
	ids := map[string]string{}
	for _, n := range d.Nodes {
		ids[n.Key] = n.NodeID
		node := map[string]any{"nodeId": n.NodeID, "nodeType": json.Number(strconv.Itoa(n.Type)), "nodeName": n.Name, "nodeParams": n.Params, "enable": n.Enable, "skipWhenFailed": n.Skip}
		if n.Type != 2 {
			node["jobId"] = n.JobID
		} else {
			node["jobId"] = nil
		}
		nodes = append(nodes, node)
	}
	for _, e := range d.Edges {
		edges = append(edges, map[string]any{"from": ids[e.From], "to": ids[e.To], "property": e.Property})
	}
	row["peworkflowDAG"] = map[string]any{"nodes": nodes, "edges": edges}
	return row
}

func workflowMatches(d workflowDraft, row map[string]any) bool {
	a, b := canonicalWorkflow(expectedWorkflow(d)), canonicalWorkflow(row)
	// Normalize optional empty fields emitted as null by older servers.
	for _, v := range []map[string]any{a, b} {
		if v["wfDescription"] == nil {
			v["wfDescription"] = ""
		}
		if v["timeExpression"] == nil {
			v["timeExpression"] = ""
		}
		if v["notifyUserIds"] == nil {
			v["notifyUserIds"] = []any{}
		}
	}
	return reflect.DeepEqual(a, b)
}
