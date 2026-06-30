package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type AllowlistEntry struct {
	ID        string  `json:"id"`
	IPCidr    string  `json:"ipCidr"`
	IPVersion int     `json:"ipVersion"`
	Ports     []int   `json:"ports"`
	Mode      string  `json:"mode"`
	ExpiresAt *string `json:"expiresAt"`
}

type AllowlistResponse struct {
	GeneratedAt string            `json:"generatedAt"`
	Version     int64             `json:"version"`
	Entries     []AllowlistEntry  `json:"entries"`
	Signature   string            `json:"signature"`
}

type ReportPayload struct {
	Status       string `json:"status"`
	ErrorMessage string `json:"errorMessage"`
	AppliedAt    string `json:"appliedAt"`
}

type ReportResponse struct {
	OK bool `json:"ok"`
}

type Client struct {
	apiURL     string
	agentToken string
	httpClient *http.Client
}

func NewClient(apiURL, agentToken string) *Client {
	return &Client{
		apiURL:     apiURL,
		agentToken: agentToken,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *Client) FetchAllowlist() ([]byte, error) {
	req, err := http.NewRequest("GET", c.apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.agentToken)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("api returned status %d: %s", resp.StatusCode, string(body))
	}

	return body, nil
}

func (c *Client) ParseAllowlistResponse(body []byte) (*AllowlistResponse, error) {
	var ar AllowlistResponse
	if err := json.Unmarshal(body, &ar); err != nil {
		return nil, fmt.Errorf("failed to parse allowlist response: %w", err)
	}
	return &ar, nil
}

func (c *Client) ReportStatus(status, errorMessage string) error {
	payload := ReportPayload{
		Status:       status,
		ErrorMessage: errorMessage,
		AppliedAt:    time.Now().UTC().Format(time.RFC3339),
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal report payload: %w", err)
	}

	reportURL := replaceSuffix(c.apiURL, "/allowlist", "/report")

	req, err := http.NewRequest("POST", reportURL, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return fmt.Errorf("failed to create report request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.agentToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("report http request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("report api returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

func replaceSuffix(s, old, new string) string {
	if len(s) >= len(old) && s[len(s)-len(old):] == old {
		return s[:len(s)-len(old)] + new
	}
	return s
}
