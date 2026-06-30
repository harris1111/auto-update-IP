package signing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
)

func VerifySignature(rawBody []byte, signature string, secret string) error {
	if signature == "" {
		return fmt.Errorf("missing signature in allowlist response")
	}

	var rawJSON map[string]interface{}
	if err := json.Unmarshal(rawBody, &rawJSON); err != nil {
		return fmt.Errorf("failed to parse response JSON: %w", err)
	}

	delete(rawJSON, "signature")

	canonical, err := json.Marshal(rawJSON)
	if err != nil {
		return fmt.Errorf("failed to marshal canonical JSON: %w", err)
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(canonical)
	expectedMAC := mac.Sum(nil)

	expectedB64 := base64.StdEncoding.EncodeToString(expectedMAC)

	if expectedB64 != signature {
		return fmt.Errorf("signature verification failed: payload may be tampered")
	}

	return nil
}
