package docker

import (
	"testing"
)

func TestSanitizeImageName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"nginx:alpine", "nginx:alpine"},
		{" nginx:alpine ", "nginx:alpine"},
		{"\"nginx:alpine\"", "nginx:alpine"},
		{"'nginx:alpine'", "nginx:alpine"},
		{"nginx:", "nginx:latest"},
		{"/nginx:alpine", "nginx:alpine"},
		{"nginx:alpine\r", "nginx:alpine"},
	}

	for _, tt := range tests {
		got := sanitizeImageName(tt.input)
		if got != tt.expected {
			t.Errorf("sanitizeImageName(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestInterpolateEnv(t *testing.T) {
	envVars := map[string]string{
		"TAG":      "alpine",
		"PORT":     "8080",
		"REGISTRY": "myregistry.io",
	}

	tests := []struct {
		input    string
		expected string
	}{
		{"image: nginx:${TAG}", "image: nginx:alpine"},
		{"image: ${REGISTRY}/nginx:${TAG}", "image: myregistry.io/nginx:alpine"},
		{"image: nginx:${UNSET_TAG:-latest}", "image: nginx:latest"},
		{"image: nginx:${UNSET_TAG-1.25}", "image: nginx:1.25"},
		{"image: nginx:${VERSION?1.29}", "image: nginx:1.29"},
		{"image: nginx:${VERSION:?1.29}", "image: nginx:1.29"},
		{"image: nginx:${TAG?1.29}", "image: nginx:alpine"},
		{"ports: [\"${PORT}:80\"]", "ports: [\"8080:80\"]"},
		{"price: $$100", "price: $100"},
	}

	for _, tt := range tests {
		got := interpolateEnv(tt.input, envVars)
		if got != tt.expected {
			t.Errorf("interpolateEnv(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}
