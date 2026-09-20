package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

type pageResult struct {
	Index      int              `json:"index"`
	PageSize   int              `json:"pageSize"`
	TotalPages int              `json:"totalPages"`
	TotalItems int              `json:"totalItems"`
	Data       []map[string]any `json:"data"`
}

func (s *session) read(method string, params map[string]any) (any, error) {
	index, size, err := pagination(params)
	if err != nil {
		return nil, err
	}
	switch method {
	case "powerjob/apps":
		body := map[string]any{"showMyRelated": true, "index": index, "pageSize": size}
		return s.page("/appInfo/list", "", body, appFields)
	case "powerjob/jobs":
		appID, err := requiredID(params, "appId")
		if err != nil {
			return nil, err
		}
		body := map[string]any{"appId": appID, "index": index, "pageSize": size}
		if keyword := strings.TrimSpace(asString(params["keyword"])); keyword != "" {
			if len(keyword) > 100 {
				return nil, errors.New("keyword is too long")
			}
			body["keyword"] = keyword
		}
		return s.page("/job/list", appID, body, jobListFields)
	case "powerjob/job":
		appID, err := requiredID(params, "appId")
		if err != nil {
			return nil, err
		}
		jobID, err := requiredID(params, "jobId")
		if err != nil {
			return nil, err
		}
		body := map[string]any{"appId": appID, "jobId": json.Number(jobID), "index": 0, "pageSize": 1}
		page, err := s.page("/job/list", appID, body, jobDetailFields)
		if err != nil {
			return nil, err
		}
		if len(page.Data) == 0 {
			return nil, errors.New("job was not found in this application")
		}
		return page.Data[0], nil
	case "powerjob/instances":
		appID, err := requiredID(params, "appId")
		if err != nil {
			return nil, err
		}
		kind := asString(params["type"])
		if kind == "" {
			kind = "NORMAL"
		}
		if kind != "NORMAL" && kind != "WORKFLOW" {
			return nil, errors.New("invalid instance type")
		}
		body := map[string]any{"appId": appID, "index": index, "pageSize": size, "type": kind, "status": ""}
		for _, field := range []string{"jobId", "instanceId"} {
			if asString(params[field]) != "" {
				id, err := requiredID(params, field)
				if err != nil {
					return nil, err
				}
				body[field] = id
			}
		}
		return s.page("/instance/list", appID, body, instanceListFields)
	case "powerjob/instance":
		appID, err := requiredID(params, "appId")
		if err != nil {
			return nil, err
		}
		instanceID, err := requiredID(params, "instanceId")
		if err != nil {
			return nil, err
		}
		data, err := s.request("POST", "/instance/detailPlus", appID, nil,
			map[string]any{"instanceId": instanceID, "customQuery": ""})
		if err != nil {
			return nil, err
		}
		var detail map[string]any
		if err := decodeData(data, &detail); err != nil {
			return nil, err
		}
		return pick(detail, instanceDetailFields), nil
	case "powerjob/log":
		appID, err := requiredID(params, "appId")
		if err != nil {
			return nil, err
		}
		instanceID, err := requiredID(params, "instanceId")
		if err != nil {
			return nil, err
		}
		query := url.Values{"instanceId": {instanceID}, "index": {strconv.Itoa(index)}, "appId": {appID}}
		data, err := s.request("GET", "/instance/log", appID, query, nil)
		if err != nil {
			return nil, err
		}
		var result struct {
			Index      int    `json:"index"`
			TotalPages int    `json:"totalPages"`
			Data       string `json:"data"`
		}
		if err := decodeData(data, &result); err != nil {
			return nil, err
		}
		return result, nil
	}
	return nil, errors.New("unsupported read operation")
}

func (s *session) appsMenuMessage() (string, error) {
	const maxApps = 8
	result, err := s.read("powerjob/apps", map[string]any{"index": "0", "pageSize": strconv.Itoa(maxApps)})
	if err != nil {
		return "", err
	}
	page := result.(pageResult)
	if len(page.Data) == 0 {
		return "No applications found for this connection.", nil
	}
	names := make([]string, 0, len(page.Data))
	for _, app := range page.Data {
		name := strings.Join(strings.Fields(asString(app["appName"])), " ")
		if name == "" {
			name = strings.Join(strings.Fields(asString(app["title"])), " ")
		}
		if name == "" {
			name = "#" + asString(app["id"])
		}
		runes := []rune(name)
		if len(runes) > 40 {
			name = string(runes[:40]) + "…"
		}
		names = append(names, name)
	}
	if page.TotalItems > len(names) {
		return fmt.Sprintf("Applications (%d of %d): %s. Open PowerJob overview for the full list.", len(names), page.TotalItems, strings.Join(names, ", ")), nil
	}
	return fmt.Sprintf("Applications (%d): %s", len(names), strings.Join(names, ", ")), nil
}

func (s *session) page(path, appID string, body any, fields []string) (pageResult, error) {
	data, err := s.request("POST", path, appID, nil, body)
	if err != nil {
		return pageResult{}, err
	}
	var result pageResult
	if err := decodeData(data, &result); err != nil {
		return result, err
	}
	for i, row := range result.Data {
		result.Data[i] = pick(row, fields)
	}
	if result.Data == nil {
		result.Data = []map[string]any{}
	}
	return result, nil
}

func decodeData(raw json.RawMessage, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return errors.New("PowerJob returned unexpected data")
	}
	return nil
}

func pick(row map[string]any, fields []string) map[string]any {
	result := make(map[string]any, len(fields))
	for _, field := range fields {
		if value, ok := row[field]; ok {
			if field == "id" || field == "appId" || field == "jobId" || field == "instanceId" || field == "wfInstanceId" {
				result[field] = asString(value)
			} else {
				result[field] = value
			}
		}
	}
	return result
}

func requiredID(params map[string]any, field string) (string, error) {
	id := asString(params[field])
	if !numericID.MatchString(id) || strings.TrimLeft(id, "0") == "" {
		return "", errors.New("invalid " + field)
	}
	return id, nil
}

func pagination(params map[string]any) (int, int, error) {
	index, size := 0, 20
	if raw := asString(params["index"]); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 0 || value > 10000 {
			return 0, 0, errors.New("invalid page index")
		}
		index = value
	}
	if raw := asString(params["pageSize"]); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 100 {
			return 0, 0, errors.New("page size must be between 1 and 100")
		}
		size = value
	}
	return index, size, nil
}

var appFields = []string{"id", "appName", "title", "namespaceId", "namespaceName", "tags", "gmtCreateStr", "gmtModifiedStr"}
var jobListFields = []string{"id", "jobName", "jobDescription", "appId", "timeExpressionType", "timeExpression", "executeType", "processorType", "processorInfo", "enable", "nextTriggerTimeStr", "gmtModified"}
var jobDetailFields = []string{"id", "jobName", "jobDescription", "appId", "jobParams", "timeExpressionType", "timeExpression", "executeType", "processorType", "processorInfo", "enable", "nextTriggerTimeStr", "maxInstanceNum", "concurrency", "instanceTimeLimit", "instanceRetryNum", "taskRetryNum", "dispatchStrategy", "designatedWorkers", "maxWorkerCount", "lifeCycle", "alarmConfig", "logConfig", "advancedRuntimeConfig", "gmtCreate", "gmtModified"}
var instanceListFields = []string{"jobId", "jobName", "instanceId", "wfInstanceId", "status", "result", "runningTimes", "actualTriggerTime", "finishedTime"}
var instanceDetailFields = []string{"expectedTriggerTime", "actualTriggerTime", "finishedTime", "status", "result", "taskTrackerAddress", "jobParams", "instanceParams", "taskDetail", "queriedTaskDetailInfoList", "subInstanceDetails", "runningTimes"}
