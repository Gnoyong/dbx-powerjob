package main

import (
	"encoding/json"
	"errors"
	"net/url"
	"strings"
)

// jobForAction keeps the complete console job payload. /job/save expects the
// existing job configuration, not the modified copy returned by /job/export.
func (s *session) jobForAction(appID, jobID string) (map[string]any, error) {
	data, err := s.request("POST", "/job/list", appID, nil, map[string]any{
		"appId": appID, "jobId": json.Number(jobID), "index": 0, "pageSize": 1,
	})
	if err != nil {
		return nil, err
	}
	var page pageResult
	if err := decodeData(data, &page); err != nil {
		return nil, err
	}
	if len(page.Data) != 1 || asString(page.Data[0]["id"]) != jobID || asString(page.Data[0]["appId"]) != appID {
		return nil, errors.New("job was not found in this application")
	}
	if _, ok := page.Data[0]["enable"].(bool); !ok {
		return nil, errors.New("job state is unavailable")
	}
	return page.Data[0], nil
}

// write exposes only the three explicitly supported console operations.
func (s *session) write(method string, params map[string]any) (any, error) {
	if s.readOnly {
		return nil, errors.New("DBX connection is read-only; turn off Read-only connection before using job actions")
	}
	appID, err := requiredID(params, "appId")
	if err != nil {
		return nil, err
	}
	switch method {
	case "powerjob/setJobEnabled":
		jobID, err := requiredID(params, "jobId")
		if err != nil {
			return nil, err
		}
		enabled, ok := params["enabled"].(bool)
		if !ok {
			return nil, errors.New("invalid enabled value")
		}
		// Refresh state at the moment of the write; never trust a stale UI row.
		job, err := s.jobForAction(appID, jobID)
		if err != nil {
			return nil, err
		}
		current := job["enable"].(bool)
		if current == enabled {
			return map[string]any{"success": true, "already": true}, nil
		}
		query := url.Values{"jobId": {jobID}}
		if !enabled {
			_, err = s.request("GET", "/job/disable", appID, query, nil)
		} else {
			for _, field := range []string{"jobName", "processorInfo", "executeType", "processorType", "timeExpressionType"} {
				if job[field] == nil || job[field] == "" {
					return nil, errors.New("job configuration is incomplete")
				}
			}
			job["enable"] = true
			data, saveErr := s.request("POST", "/job/save", appID, nil, job)
			if saveErr != nil {
				return nil, saveErr
			}
			var savedID any
			if err := decodeData(data, &savedID); err != nil || (savedID != nil && asString(savedID) != jobID) {
				return nil, errors.New("PowerJob returned an unexpected saved job ID")
			}
		}
		if err != nil {
			return nil, err
		}
		updated, err := s.jobForAction(appID, jobID)
		if err != nil || updated["enable"] != enabled {
			return nil, errors.New("PowerJob acknowledged the action but job state did not change")
		}
		return map[string]any{"success": true}, nil
	case "powerjob/retryFailedInstance":
		jobID, err := requiredID(params, "jobId")
		if err != nil {
			return nil, err
		}
		instanceID, err := requiredID(params, "instanceId")
		if err != nil {
			return nil, err
		}
		page, err := s.page("/instance/list", appID, map[string]any{
			"appId": appID, "jobId": jobID, "instanceId": instanceID,
			"index": 0, "pageSize": 1, "type": "NORMAL", "status": "",
		}, instanceListFields)
		if err != nil {
			return nil, err
		}
		if len(page.Data) != 1 || page.Data[0]["instanceId"] != instanceID || page.Data[0]["jobId"] != jobID {
			return nil, errors.New("instance was not found for this job")
		}
		status := strings.ToUpper(asString(page.Data[0]["status"]))
		if status != "4" && status != "FAILED" {
			return nil, errors.New("only failed normal instances can be retried")
		}
		_, err = s.request("GET", "/instance/retry", appID, url.Values{"instanceId": {instanceID}, "appId": {appID}}, nil)
		if err != nil {
			return nil, err
		}
		return map[string]any{"success": true}, nil
	default:
		return nil, errors.New("unsupported write operation")
	}
}
