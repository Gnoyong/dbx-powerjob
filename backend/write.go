package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"reflect"
	"strconv"
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

var editableJobStringFields = map[string]bool{
	"jobName": true, "jobDescription": true, "jobParams": true,
	"timeExpressionType": true, "timeExpression": true,
	"executeType": true, "processorType": true, "processorInfo": true,
	"dispatchStrategy": true, "designatedWorkers": true,
	"dispatchStrategyConfig": true, "tag": true, "extra": true,
}

var editableJobNumberFields = map[string]bool{
	"maxInstanceNum": true, "concurrency": true, "instanceTimeLimit": true,
	"instanceRetryNum": true, "taskRetryNum": true, "maxWorkerCount": true,
}

var editableJobDecimalFields = map[string]bool{
	"minCpuCores": true, "minMemorySpace": true, "minDiskSpace": true,
}

var editableJobObjectFields = map[string]bool{
	"lifeCycle": true, "alarmConfig": true, "logConfig": true, "advancedRuntimeConfig": true,
}

func optionalConfigNumber(value any, allowed ...int64) error {
	if value == nil {
		return nil
	}
	n, err := strconv.ParseInt(asString(value), 10, 32)
	if err != nil || n < 0 {
		return errors.New("invalid config number")
	}
	if len(allowed) > 0 {
		for _, choice := range allowed {
			if n == choice {
				return nil
			}
		}
		return errors.New("invalid config option")
	}
	return nil
}

func validateConfigObject(field string, config map[string]any) error {
	switch field {
	case "alarmConfig":
		if len(config) != 3 {
			return errors.New("invalid alarmConfig")
		}
		for key, value := range config {
			if key != "alertThreshold" && key != "statisticWindowLen" && key != "silenceWindowLen" {
				return errors.New("invalid alarmConfig")
			}
			if value == nil || optionalConfigNumber(value) != nil {
				return errors.New("invalid alarmConfig")
			}
		}
	case "logConfig":
		for key, value := range config {
			switch key {
			case "type":
				if optionalConfigNumber(value, 1, 2, 3, 4, 999) != nil {
					return errors.New("invalid logConfig")
				}
			case "level":
				if optionalConfigNumber(value, 1, 2, 3, 4, 99) != nil {
					return errors.New("invalid logConfig")
				}
			case "loggerName":
				if value != nil {
					name, ok := value.(string)
					if !ok || len(name) > 1024 {
						return errors.New("invalid logConfig")
					}
				}
			default:
				return errors.New("invalid logConfig")
			}
		}
	case "advancedRuntimeConfig":
		for key, value := range config {
			if key != "taskTrackerBehavior" || optionalConfigNumber(value, 1, 11) != nil {
				return errors.New("invalid advancedRuntimeConfig")
			}
		}
	}
	return nil
}

func validateJobChanges(changes map[string]any) error {
	if len(changes) == 0 {
		return errors.New("no job changes supplied")
	}
	for field, raw := range changes {
		switch {
		case field == "enable":
			if _, ok := raw.(bool); !ok {
				return errors.New("invalid enable")
			}
		case editableJobStringFields[field]:
			value, ok := raw.(string)
			if !ok || len(value) > 65536 {
				return fmt.Errorf("invalid %s", field)
			}
		case editableJobNumberFields[field]:
			value := asString(raw)
			n, err := strconv.ParseInt(value, 10, 64)
			if err != nil || n < 0 {
				return fmt.Errorf("invalid %s", field)
			}
		case editableJobDecimalFields[field]:
			value := asString(raw)
			n, err := strconv.ParseFloat(value, 64)
			if err != nil || math.IsNaN(n) || math.IsInf(n, 0) || n < 0 || n > 1e9 {
				return fmt.Errorf("invalid %s", field)
			}
		case editableJobObjectFields[field]:
			if raw == nil {
				continue
			}
			if _, ok := raw.(map[string]any); !ok {
				return fmt.Errorf("invalid %s", field)
			}
			if err := validateConfigObject(field, raw.(map[string]any)); err != nil {
				return err
			}
			if field == "lifeCycle" {
				cycle := raw.(map[string]any)
				if len(cycle) > 2 {
					return errors.New("invalid lifeCycle")
				}
				var start, end int64
				for key, value := range cycle {
					if key != "start" && key != "end" {
						return errors.New("invalid lifeCycle")
					}
					if value == nil {
						continue
					}
					timestamp := asString(value)
					if len(timestamp) != 13 {
						return errors.New("invalid lifeCycle timestamp")
					}
					n, err := strconv.ParseInt(timestamp, 10, 64)
					if err != nil || n <= 0 {
						return errors.New("invalid lifeCycle timestamp")
					}
					if key == "start" {
						start = n
					} else {
						end = n
					}
				}
				if start != 0 && end != 0 && start >= end {
					return errors.New("lifeCycle start must precede end")
				}
			}
			encoded, err := json.Marshal(raw)
			if err != nil || len(encoded) > 65536 {
				return fmt.Errorf("invalid %s", field)
			}
		default:
			return fmt.Errorf("job field cannot be modified: %s", field)
		}
	}
	return nil
}

func updateJobPayload(job map[string]any, changes map[string]any) error {
	if err := validateJobChanges(changes); err != nil {
		return err
	}
	for field, raw := range changes {
		switch {
		case field == "enable":
			job[field] = raw
		case editableJobStringFields[field]:
			value := raw.(string)
			job[field] = value
		case editableJobNumberFields[field]:
			value := asString(raw)
			n, err := strconv.ParseInt(value, 10, 64)
			if err != nil || n < 0 {
				return fmt.Errorf("invalid %s", field)
			}
			job[field] = json.Number(strconv.FormatInt(n, 10))
		case editableJobDecimalFields[field]:
			job[field] = json.Number(asString(raw))
		case editableJobObjectFields[field]:
			if raw == nil {
				job[field] = nil
				continue
			}
			job[field] = raw
		default:
			return fmt.Errorf("job field cannot be modified: %s", field)
		}
	}
	for _, field := range []string{"jobName", "processorInfo", "executeType", "processorType", "timeExpressionType"} {
		if strings.TrimSpace(asString(job[field])) == "" {
			return errors.New("job configuration is incomplete")
		}
	}
	return nil
}

func (s *session) updateJob(appID, jobID string, changes map[string]any) error {
	if err := validateJobChanges(changes); err != nil {
		return err
	}
	job, err := s.jobForAction(appID, jobID)
	if err != nil {
		return err
	}
	wasEnabled := job["enable"].(bool)
	if err := updateJobPayload(job, changes); err != nil {
		return err
	}
	requestedEnabled, changesEnabled := changes["enable"].(bool)
	disable := changesEnabled && !requestedEnabled && wasEnabled
	if len(changes) > 1 || !disable {
		if disable {
			job["enable"] = true
		}
		data, err := s.request("POST", "/job/save", appID, nil, job)
		if err != nil {
			return err
		}
		var savedID any
		if err := decodeData(data, &savedID); err != nil || (savedID != nil && asString(savedID) != jobID) {
			return errors.New("PowerJob returned an unexpected saved job ID")
		}
	}
	if disable {
		if _, err := s.request("GET", "/job/disable", appID, url.Values{"jobId": {jobID}}, nil); err != nil {
			return err
		}
		job["enable"] = false
	}
	updated, err := s.jobForAction(appID, jobID)
	if err != nil {
		return err
	}
	for field := range changes {
		if editableJobDecimalFields[field] {
			actual, actualErr := strconv.ParseFloat(asString(updated[field]), 64)
			expected, expectedErr := strconv.ParseFloat(asString(job[field]), 64)
			if actualErr == nil && expectedErr == nil && actual == expected {
				continue
			}
		}
		if !reflect.DeepEqual(updated[field], job[field]) {
			return errors.New("PowerJob acknowledged the request but the job was not updated")
		}
	}
	return nil
}

// write exposes only the explicitly supported console operations.
func (s *session) write(method string, params map[string]any) (any, error) {
	if s.readOnly {
		return nil, errors.New("DBX connection is read-only; turn off Read-only connection before using job actions")
	}
	appID, err := requiredID(params, "appId")
	if err != nil {
		return nil, err
	}
	switch method {
	case "powerjob/updateJob":
		jobID, err := requiredID(params, "jobId")
		if err != nil {
			return nil, err
		}
		changes, ok := params["changes"].(map[string]any)
		if !ok {
			return nil, errors.New("invalid job changes")
		}
		if err := s.updateJob(appID, jobID, changes); err != nil {
			return nil, err
		}
		return map[string]any{"success": true}, nil
	case "powerjob/runJob":
		jobID, err := requiredID(params, "jobId")
		if err != nil {
			return nil, err
		}
		instanceParams, ok := params["instanceParams"].(string)
		if !ok || len(instanceParams) > 4096 {
			return nil, errors.New("invalid instance parameters")
		}
		if _, err := s.jobForAction(appID, jobID); err != nil {
			return nil, err
		}
		data, err := s.request("GET", "/job/run", appID, url.Values{
			"jobId": {jobID}, "appId": {appID}, "instanceParams": {instanceParams},
		}, nil)
		if err != nil {
			return nil, err
		}
		var instanceID any
		if err := decodeData(data, &instanceID); err != nil || !numericID.MatchString(asString(instanceID)) {
			return nil, errors.New("PowerJob returned an unexpected instance ID")
		}
		return map[string]any{"instanceId": asString(instanceID)}, nil
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
