package main

import (
	"bytes"
	"encoding/json"
	"log"
	"sync"

	dbxpluginsdk "github.com/t8y2/dbx/plugins/sdk/go/dbx-plugin-sdk"
)

const pluginID = "local.powerjob.readonly"

type plugin struct {
	mu       sync.RWMutex
	sessions map[string]*session
}

func (p *plugin) Handle(_ dbxpluginsdk.RequestContext, method string, params json.RawMessage, _ *dbxpluginsdk.Emitter) (any, *dbxpluginsdk.PluginError) {
	var values map[string]any
	decoder := json.NewDecoder(bytes.NewReader(params))
	decoder.UseNumber()
	if err := decoder.Decode(&values); err != nil {
		return nil, dbxpluginsdk.NewError(-32602, "Invalid request parameters")
	}

	switch method {
	case "connection/test", "connection/connect":
		cfg, err := parseConnection(values)
		if err != nil {
			return nil, dbxpluginsdk.NewError(-32602, err.Error())
		}
		s, err := login(cfg)
		if err != nil {
			return nil, dbxpluginsdk.NewError(-32000, err.Error())
		}
		if method == "connection/test" {
			return map[string]any{"success": true, "message": "PowerJob login verified"}, nil
		}
		id, err := connectionID(values)
		if err != nil {
			return nil, dbxpluginsdk.NewError(-32602, err.Error())
		}
		p.mu.Lock()
		p.sessions[id] = s
		p.mu.Unlock()
		return map[string]any{"success": true}, nil
	case "connection/disconnect":
		id, err := connectionID(values)
		if err != nil {
			return nil, dbxpluginsdk.NewError(-32602, err.Error())
		}
		p.mu.Lock()
		delete(p.sessions, id)
		p.mu.Unlock()
		return map[string]any{"success": true}, nil
	case "powerjob/apps", "powerjob/jobs", "powerjob/job", "powerjob/instances", "powerjob/instance", "powerjob/log":
		id, _ := values["connectionId"].(string)
		p.mu.RLock()
		s := p.sessions[id]
		p.mu.RUnlock()
		if s == nil {
			return nil, dbxpluginsdk.NewError(-32001, "Connection is not active. Reconnect and try again.")
		}
		result, err := s.read(method, values)
		if err != nil {
			return nil, dbxpluginsdk.NewError(-32000, err.Error())
		}
		return result, nil
	default:
		return nil, dbxpluginsdk.MethodNotFound(method)
	}
}

func main() {
	metadata := dbxpluginsdk.Metadata{
		ID:           pluginID,
		Version:      "0.1.2",
		Capabilities: []string{"connections"},
	}
	server := dbxpluginsdk.NewServer(metadata, &plugin{sessions: make(map[string]*session)})
	if err := server.Serve(); err != nil {
		log.Fatal(err)
	}
}
