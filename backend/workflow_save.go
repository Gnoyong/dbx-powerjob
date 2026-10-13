package main

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Operation journals are connection-session scoped and survive UI reloads, not
// sidecar restarts. They contain no credentials and are bounded and expiring.
type workflowOperations struct {
	mu      sync.Mutex
	entries map[string]*workflowSaveOperation
}
type workflowSaveOperation struct {
	ID              string            `json:"operationId"`
	AppID           string            `json:"appId"`
	WorkflowID      string            `json:"workflowId"`
	State           string            `json:"state"`
	Stage           string            `json:"stage"`
	Error           string            `json:"error,omitempty"`
	NodeIDs         map[string]string `json:"nodeIds"`
	Definition      map[string]any    `json:"definition,omitempty"`
	Updated         int64             `json:"updatedAt"`
	draft           workflowDraft
	nodesDone       bool
	partialBaseline string
	scopeID         string
}

var operationIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)

func (s *session) operations() *workflowOperations {
	s.wfMu.Lock()
	defer s.wfMu.Unlock()
	if s.wfOperations == nil {
		s.wfOperations = &workflowOperations{entries: map[string]*workflowSaveOperation{}}
	}
	return s.wfOperations
}
func operationView(op *workflowSaveOperation) map[string]any {
	// Return a detached snapshot; JSON marshaling by the bridge happens after unlock.
	raw, _ := json.Marshal(op)
	var row map[string]any
	_ = decodeData(raw, &row)
	return row
}
func (s *session) workflowSaveStatus(appID string, params map[string]any) (any, error) {
	ops := s.operations()
	ops.mu.Lock()
	defer ops.mu.Unlock()
	id := asString(params["operationId"])
	op := ops.entries[id]
	if id == "" {
		scope := asString(params["workflowId"])
		for _, candidate := range ops.entries {
			if candidate.AppID == appID && candidate.scopeID == scope && (op == nil || candidate.Updated > op.Updated) {
				op = candidate
			}
		}
	}
	if op == nil || op.AppID != appID {
		return nil, errors.New("save operation unavailable; the connection or sidecar may have restarted")
	}
	return operationView(op), nil
}
func (s *session) startWorkflowSave(appID string, params map[string]any) (any, error) {
	id := asString(params["operationId"])
	if !operationIDPattern.MatchString(id) {
		return nil, errors.New("invalid save operation ID")
	}
	ops := s.operations()
	ops.mu.Lock()
	if op := ops.entries[id]; op != nil {
		if op.AppID != appID {
			ops.mu.Unlock()
			return nil, errors.New("save operation belongs to another application")
		}
		if params["resume"] == true && (op.State == "partial" || op.State == "unverified") {
			for _, other := range ops.entries {
				if other != op && other.AppID == appID && other.scopeID == op.scopeID && other.State == "running" {
					ops.mu.Unlock()
					return nil, errors.New("another save is in progress")
				}
			}
			if op.State == "unverified" {
				op.Stage = "verifying"
			} else {
				op.Stage = "saving"
			}
			op.State = "running"
			op.Error = ""
			op.Updated = time.Now().UnixMilli()
			snapshot := operationView(op)
			ops.mu.Unlock()
			go s.performWorkflowSave(ops, op)
			return snapshot, nil
		}
		snapshot := operationView(op)
		ops.mu.Unlock()
		return snapshot, nil
	}
	raw, err := json.Marshal(params["draft"])
	if err != nil || len(raw) > 1<<20 {
		ops.mu.Unlock()
		return nil, errors.New("invalid or oversized workflow draft")
	}
	var draft workflowDraft
	if err = decodeData(raw, &draft); err != nil {
		ops.mu.Unlock()
		return nil, err
	}
	if err = validateWorkflowDraft(draft); err != nil {
		ops.mu.Unlock()
		return nil, err
	}
	if draft.ID != "" && draft.Fingerprint == "" {
		ops.mu.Unlock()
		return nil, errors.New("reload the workflow before saving")
	}
	now := time.Now().UnixMilli()
	for key, op := range ops.entries {
		if op.State != "running" && now-op.Updated > 24*60*60*1000 {
			delete(ops.entries, key)
			continue
		}
		if op.AppID == appID && op.scopeID == draft.ID && op.State == "running" {
			ops.mu.Unlock()
			return nil, errors.New("another save is in progress")
		}
	}
	if len(ops.entries) >= 128 {
		ops.mu.Unlock()
		return nil, errors.New("save journal limit reached; reconnect after checking outstanding saves")
	}
	op := &workflowSaveOperation{ID: id, AppID: appID, WorkflowID: draft.ID, scopeID: draft.ID, State: "running", Stage: "validating", NodeIDs: map[string]string{}, Updated: now, draft: draft}
	ops.entries[id] = op
	snapshot := operationView(op)
	ops.mu.Unlock()
	go s.performWorkflowSave(ops, op)
	return snapshot, nil
}
func setWorkflowStage(ops *workflowOperations, op *workflowSaveOperation, stage, state, message string) {
	ops.mu.Lock()
	defer ops.mu.Unlock()
	op.Stage = stage
	op.State = state
	op.Error = message
	op.Updated = time.Now().UnixMilli()
}
func uncertainWrite(err error) bool {
	message := err.Error()
	return strings.Contains(message, "could not reach") || strings.Contains(message, "could not be read") || strings.Contains(message, "unexpected") || strings.Contains(message, "HTTP 5")
}
func (s *session) performWorkflowSave(ops *workflowOperations, op *workflowSaveOperation) {
	d := op.draft
	var base map[string]any
	if op.Stage == "verifying" {
		s.verifyWorkflowSave(ops, op)
		return
	}
	if d.ID != "" {
		row, err := s.workflowFetch(op.AppID, d.ID)
		if err != nil {
			state := "failed"
			if op.nodesDone {
				state = "partial"
			}
			setWorkflowStage(ops, op, op.Stage, state, err.Error())
			return
		}
		base = row
		fingerprint := d.Fingerprint
		if op.nodesDone {
			fingerprint = op.partialBaseline
		}
		if fingerprint == "" || asString(base["fingerprint"]) != fingerprint {
			state := "failed"
			if op.nodesDone {
				state = "partial"
			}
			setWorkflowStage(ops, op, "validating", state, "workflow changed; reload and compare the saved node IDs before creating another save")
			return
		}
	}
	validationDraft := d
	if op.nodesDone {
		// Previously validated IDs belong to this journal, including newly created
		// nodes not yet attached to a workflow. Do not accept IDs supplied by a client.
		validationDraft.Nodes = append([]workflowNodeDraft(nil), d.Nodes...)
		for i := range validationDraft.Nodes {
			validationDraft.Nodes[i].NodeID = ""
		}
	}
	if err := s.validateWorkflowReferences(op.AppID, validationDraft, base); err != nil {
		state := "failed"
		if op.nodesDone {
			state = "partial"
		}
		setWorkflowStage(ops, op, "validating", state, err.Error())
		return
	}
	if !op.nodesDone {
		owned := map[string]map[string]any{}
		if base != nil {
			nodes, _ := dagOf(base)["nodes"].([]any)
			for _, raw := range nodes {
				n, _ := raw.(map[string]any)
				owned[asString(n["nodeId"])] = n
			}
		}
		requests := []map[string]any{}
		indices := []int{}
		for i, node := range d.Nodes {
			if node.NodeID == "" || !sameNode(node, owned[node.NodeID]) {
				requests = append(requests, nodeRequest(node, op.AppID))
				indices = append(indices, i)
			}
		}
		if len(requests) > 0 {
			setWorkflowStage(ops, op, "nodes", "running", "")
			raw, err := s.request("POST", "/workflow/saveNode", op.AppID, nil, requests)
			if err != nil {
				state := "failed"
				if uncertainWrite(err) {
					state = "unknown"
				}
				setWorkflowStage(ops, op, "nodes", state, err.Error())
				return
			}
			var saved []map[string]any
			if err = decodeData(raw, &saved); err != nil || len(saved) != len(indices) {
				setWorkflowStage(ops, op, "nodes", "unknown", "node write outcome is unknown; check PowerJob before retrying")
				return
			}
			for j, node := range saved {
				id := asString(node["id"])
				if !numericID.MatchString(id) || strings.TrimLeft(id, "0") == "" || asString(node["appId"]) != op.AppID {
					setWorkflowStage(ops, op, "nodes", "unknown", "PowerJob returned invalid node identities; check before retrying")
					return
				}
				d.Nodes[indices[j]].NodeID = id
			}
		}
		ops.mu.Lock()
		op.draft = d
		op.nodesDone = true
		for _, node := range d.Nodes {
			op.NodeIDs[node.Key] = node.NodeID
		}
		ops.mu.Unlock()
		if d.ID != "" {
			row, err := s.workflowFetch(op.AppID, d.ID)
			if err != nil {
				setWorkflowStage(ops, op, "saving", "partial", "nodes saved; baseline could not be refreshed; reload before another save")
				return
			}
			// Only this operation's node edits may explain a changed baseline. A concurrent
			// console edit to config, topology or another node must not be overwritten.
			expectedBase := cloneWorkflowRow(base)
			nodes, _ := dagOf(expectedBase)["nodes"].([]any)
			for _, raw := range nodes {
				n, _ := raw.(map[string]any)
				for _, draftNode := range d.Nodes {
					if asString(n["nodeId"]) == draftNode.NodeID {
						replacement := expectedWorkflow(workflowDraft{Config: map[string]any{}, Nodes: []workflowNodeDraft{draftNode}})
						list, _ := dagOf(replacement)["nodes"].([]any)
						for k, v := range list[0].(map[string]any) {
							n[k] = v
						}
					}
				}
			}
			if workflowFingerprint(expectedBase) != asString(row["fingerprint"]) {
				setWorkflowStage(ops, op, "saving", "partial", "workflow changed while nodes were being saved; reload and compare before continuing")
				return
			}
			ops.mu.Lock()
			op.partialBaseline = asString(row["fingerprint"])
			ops.mu.Unlock()
		}
	}
	setWorkflowStage(ops, op, "saving", "running", "")
	body := pick(d.Config, workflowConfigFields)
	body["appId"] = json.Number(op.AppID)
	if d.ID != "" {
		body["id"] = json.Number(d.ID)
	}
	nodes := []any{}
	edges := []any{}
	ids := map[string]string{}
	for _, n := range d.Nodes {
		ids[n.Key] = n.NodeID
		nodes = append(nodes, map[string]any{"nodeId": json.Number(n.NodeID)})
	}
	for _, e := range d.Edges {
		edges = append(edges, map[string]any{"from": json.Number(ids[e.From]), "to": json.Number(ids[e.To]), "property": e.Property})
	}
	body["dag"] = map[string]any{"nodes": nodes, "edges": edges}
	raw, err := s.request("POST", "/workflow/save", op.AppID, nil, body)
	if err != nil {
		if uncertainWrite(err) {
			if d.ID != "" {
				row, e := s.workflowFetch(op.AppID, d.ID)
				if e == nil && workflowMatches(d, row) {
					ops.mu.Lock()
					op.Definition = row
					ops.mu.Unlock()
					setWorkflowStage(ops, op, "verifying", "succeeded", "")
					return
				}
			}
			setWorkflowStage(ops, op, "saving", "unknown", "workflow write outcome is unknown; inspect PowerJob before retrying")
			return
		}
		setWorkflowStage(ops, op, "saving", "partial", err.Error())
		return
	}
	var result any
	if err = decodeData(raw, &result); err != nil || !numericID.MatchString(asString(result)) {
		setWorkflowStage(ops, op, "saving", "unknown", "workflow write outcome is unknown; inspect PowerJob before retrying")
		return
	}
	ops.mu.Lock()
	op.WorkflowID = asString(result)
	op.draft.ID = op.WorkflowID
	ops.mu.Unlock()
	s.verifyWorkflowSave(ops, op)
}
func cloneWorkflowRow(row map[string]any) map[string]any {
	raw, _ := json.Marshal(row)
	var copy map[string]any
	_ = decodeData(raw, &copy)
	return copy
}
func (s *session) verifyWorkflowSave(ops *workflowOperations, op *workflowSaveOperation) {
	setWorkflowStage(ops, op, "verifying", "running", "")
	row, err := s.workflowFetch(op.AppID, op.WorkflowID)
	if err != nil {
		setWorkflowStage(ops, op, "verifying", "unverified", "workflow submitted; read-back verification failed: "+err.Error())
		return
	}
	if !workflowMatches(op.draft, row) {
		setWorkflowStage(ops, op, "verifying", "unverified", "workflow submitted; read-back differs from the draft. Compare before saving again.")
		return
	}
	ops.mu.Lock()
	op.Definition = row
	ops.mu.Unlock()
	setWorkflowStage(ops, op, "verifying", "succeeded", "")
}
