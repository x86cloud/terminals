package core

import (
	"testing"
)

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		v1       string
		v2       string
		expected int
	}{
		{"v1.0.3", "v1.0.3", 0},
		{"1.0.3", "v1.0.3", 0},
		{"v1.0.2", "v1.0.3", -1},
		{"v1.0.4", "v1.0.3", 1},
		{"v1.1.0", "v1.0.9", 1},
		{"v2.0.0", "v1.9.9", 1},
		{"dev", "v1.0.3", -1},
		{"v1.0.3", "dev", 1},
		{"v1.0.3-beta", "v1.0.3", 0},
		{"v1.0.3", "v1.0.4-beta", -1},
	}

	for _, tt := range tests {
		res := CompareVersions(tt.v1, tt.v2)
		if res != tt.expected {
			t.Errorf("CompareVersions(%q, %q) = %d; want %d", tt.v1, tt.v2, res, tt.expected)
		}
	}
}

func TestGetAppVersionInfo(t *testing.T) {
	info := GetAppVersionInfo()
	if info.Version == "" {
		t.Errorf("expected non-empty version, got empty")
	}
	if info.Platform == "" {
		t.Errorf("expected non-empty platform, got empty")
	}
}
