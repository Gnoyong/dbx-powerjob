package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const maxResponseBytes = 4 << 20

var numericID = regexp.MustCompile(`^[0-9]{1,20}$`)
var hostName = regexp.MustCompile(`^[A-Za-z0-9.-]+$`)

type connectionConfig struct {
	host             string
	runtimeHost      string
	port             int
	username         string
	password         string
	allowInsecureTLS bool
}

type session struct {
	baseURL string
	client  *http.Client
	jwt     string
}

type envelope struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
}

func connectionID(values map[string]any) (string, error) {
	connection, _ := values["connection"].(map[string]any)
	id, _ := connection["id"].(string)
	if id == "" {
		return "", errors.New("missing connection ID")
	}
	return id, nil
}

func parseConnection(values map[string]any) (connectionConfig, error) {
	connection, _ := values["connection"].(map[string]any)
	runtime, _ := values["runtime"].(map[string]any)
	config, _ := connection["external_config"].(map[string]any)
	cfg := connectionConfig{
		host:             strings.TrimSpace(asString(connection["host"])),
		runtimeHost:      strings.TrimSpace(asString(runtime["host"])),
		username:         strings.TrimSpace(asString(connection["username"])),
		password:         asString(connection["password"]),
		allowInsecureTLS: config["allow_insecure_tls"] == true,
	}
	if cfg.host == "" || !validHost(cfg.host) {
		return cfg, errors.New("host must be a hostname or IP address without a scheme or path")
	}
	if cfg.runtimeHost == "" {
		cfg.runtimeHost = cfg.host
	}
	if !validHost(cfg.runtimeHost) {
		return cfg, errors.New("invalid resolved host")
	}
	port, err := asPort(runtime["port"])
	if err != nil || port == 0 {
		port, err = asPort(connection["port"])
	}
	if err != nil || port == 0 {
		return cfg, errors.New("HTTPS port must be between 1 and 65535")
	}
	cfg.port = port
	if cfg.username == "" || cfg.password == "" {
		return cfg, errors.New("username and password are required")
	}
	return cfg, nil
}

func validHost(value string) bool {
	if net.ParseIP(value) != nil {
		return true
	}
	return len(value) <= 253 && !strings.Contains(value, "..") && hostName.MatchString(value)
}

func asPort(value any) (int, error) {
	if value == nil {
		return 0, nil
	}
	n, err := strconv.Atoi(asString(value))
	if err != nil || n < 1 || n > 65535 {
		return 0, errors.New("invalid port")
	}
	return n, nil
}

func asString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case json.Number:
		return v.String()
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	default:
		return ""
	}
}

func login(cfg connectionConfig) (*session, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, errors.New("could not initialize session")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	// Explicit per-connection opt-in for self-signed PowerJob deployments.
	transport.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12, ServerName: cfg.host, InsecureSkipVerify: cfg.allowInsecureTLS}
	base := "https://" + net.JoinHostPort(cfg.runtimeHost, strconv.Itoa(cfg.port))
	s := &session{
		baseURL: base,
		client: &http.Client{
			Timeout:       20 * time.Second,
			Transport:     transport,
			Jar:           jar,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
	originParams, _ := json.Marshal(map[string]string{"username": cfg.username, "password": cfg.password})
	body := map[string]string{"loginType": "PWJB", "originParams": string(originParams)}
	data, err := s.request("POST", "/auth/thirdPartyLoginDirect", "", nil, body)
	if err != nil {
		return nil, errors.New("PowerJob login failed")
	}
	var user struct {
		JWTToken string `json:"jwtToken"`
	}
	if err := json.Unmarshal(data, &user); err != nil {
		return nil, errors.New("PowerJob login returned unexpected data")
	}
	s.jwt = user.JWTToken
	if s.jwt == "" {
		return nil, errors.New("PowerJob login returned no session token")
	}
	// The server currently requires the PowerJwt header; cookies alone do not authenticate.
	data, err = s.request("GET", "/auth/ifLogin", "", nil, nil)
	if err != nil || bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		return nil, errors.New("PowerJob login could not be verified")
	}
	return s, nil
}

// request is private to this file. No RPC method can choose an HTTP path or method.
func (s *session) request(method, path, appID string, query url.Values, body any) (json.RawMessage, error) {
	u := s.baseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	var payload io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return nil, errors.New("invalid request")
		}
		payload = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, u, payload)
	if err != nil {
		return nil, errors.New("invalid request")
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if appID != "" {
		req.Header.Set("AppId", appID)
	}
	if s.jwt != "" {
		req.Header.Set("PowerJwt", s.jwt)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, errors.New("could not reach PowerJob over HTTPS")
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, errors.New("PowerJob session expired or access denied")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("PowerJob returned HTTP %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes+1))
	if err != nil || len(raw) > maxResponseBytes {
		return nil, errors.New("PowerJob response could not be read")
	}
	var result envelope
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, errors.New("PowerJob returned an unexpected response")
	}
	if !result.Success {
		return nil, errors.New("PowerJob rejected the request or denied access")
	}
	return result.Data, nil
}
