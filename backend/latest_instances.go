package main

import (
	"context"
	"errors"
	"sync"
	"time"
)

type latestJobInstance struct {
	JobID    string         `json:"jobId"`
	Instance map[string]any `json:"instance"`
	Error    string         `json:"error,omitempty"`
}

type latestJobInstancesResult struct {
	Data []latestJobInstance `json:"data"`
}

// Keep the whole batch below the bridge's 30 second deadline, including queue time.
// Limits are per session so rapid page/context changes cannot multiply concurrency.
func (s *session) latestJobInstances(params map[string]any) (latestJobInstancesResult, error) {
	result := latestJobInstancesResult{Data: []latestJobInstance{}}
	appID, err := requiredID(params, "appId")
	if err != nil {
		return result, err
	}
	rawIDs, ok := params["jobIds"].([]any)
	if !ok || len(rawIDs) > 20 {
		return result, errors.New("jobIds must be an array of at most 20 IDs")
	}
	seen := make(map[string]bool)
	for _, rawID := range rawIDs {
		id, err := requiredID(map[string]any{"jobId": rawID}, "jobId")
		if err != nil {
			return result, err
		}
		if !seen[id] {
			seen[id] = true
			result.Data = append(result.Data, latestJobInstance{JobID: id})
		}
	}
	s.latestMu.Lock()
	if s.latestSlots == nil {
		s.latestSlots = make(chan struct{}, 4)
	}
	slots := s.latestSlots
	s.latestMu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var workers sync.WaitGroup
	for i := range result.Data {
		workers.Add(1)
		go func(i int) {
			defer workers.Done()
			row := &result.Data[i]
			select {
			case slots <- struct{}{}:
				defer func() { <-slots }()
			case <-ctx.Done():
				row.Error = "Latest instance query timed out"
				return
			}
			// Use the console's gmtModified DESC order; do not apply UI instance filters.
			raw, err := s.requestContext(ctx, "POST", "/instance/list", appID, nil, map[string]any{
				"appId": appID, "jobId": row.JobID, "index": 0, "pageSize": 1, "type": "NORMAL", "status": "",
			})
			if err != nil {
				row.Error = err.Error()
				return
			}
			var page pageResult
			if err := decodeData(raw, &page); err != nil {
				row.Error = err.Error()
				return
			}
			if len(page.Data) == 0 {
				return
			}
			instance := page.Data[0]
			if asString(instance["jobId"]) != row.JobID || asString(instance["instanceId"]) == "" {
				row.Error = "PowerJob returned an unexpected instance"
				return
			}
			row.Instance = pick(instance, []string{"instanceId", "status", "actualTriggerTime", "finishedTime"})
		}(i)
	}
	workers.Wait()
	return result, nil
}
