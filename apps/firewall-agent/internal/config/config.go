package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	AllowlistAPIURL     string
	AgentToken          string
	AppSigningSecret    string
	NftTable            string
	NftDbV4Set          string
	NftDbV6Set          string
	ApplyIntervalSeconds int
	FailClosed           bool
	DryRun              bool
}

func Load() (*Config, error) {
	cfg := &Config{
		AllowlistAPIURL:      getEnv("ALLOWLIST_API_URL", "https://update.0err.com/api/agent/allowlist"),
		AgentToken:           os.Getenv("AGENT_TOKEN"),
		AppSigningSecret:     os.Getenv("APP_SIGNING_SECRET"),
		NftTable:             getEnv("NFT_TABLE", "shared_dedi"),
		NftDbV4Set:           getEnv("NFT_DB_V4_SET", "db_allow_v4"),
		NftDbV6Set:           getEnv("NFT_DB_V6_SET", "db_allow_v6"),
		ApplyIntervalSeconds: getEnvInt("APPLY_INTERVAL_SECONDS", 15),
		FailClosed:           getEnvBool("FAIL_CLOSED", true),
		DryRun:              getEnvBool("DRY_RUN", false),
	}

	if cfg.AgentToken == "" {
		return nil, fmt.Errorf("AGENT_TOKEN environment variable is required")
	}
	if cfg.AppSigningSecret == "" {
		return nil, fmt.Errorf("APP_SIGNING_SECRET environment variable is required")
	}

	return cfg, nil
}

func (c *Config) Validate() error {
	if c.AllowlistAPIURL == "" {
		return fmt.Errorf("ALLOWLIST_API_URL must not be empty")
	}
	if c.NftTable == "" {
		return fmt.Errorf("NFT_TABLE must not be empty")
	}
	if c.NftDbV4Set == "" {
		return fmt.Errorf("NFT_DB_V4_SET must not be empty")
	}
	if c.NftDbV6Set == "" {
		return fmt.Errorf("NFT_DB_V6_SET must not be empty")
	}
	if c.ApplyIntervalSeconds < 5 {
		return fmt.Errorf("APPLY_INTERVAL_SECONDS must be at least 5")
	}
	if c.AppSigningSecret == "" {
		return fmt.Errorf("APP_SIGNING_SECRET must not be empty")
	}
	return nil
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		return defaultVal
	}
	return n
}

func getEnvBool(key string, defaultVal bool) bool {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	switch val {
	case "true", "True", "TRUE", "1":
		return true
	case "false", "False", "FALSE", "0":
		return false
	}
	return defaultVal
}
