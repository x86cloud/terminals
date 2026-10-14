package services

import (
	"encoding/json"
	"testing"
	"time"

	"terminal/core"
)

func TestServersExportData_Serialization(t *testing.T) {
	data := ServersExportData{
		Version:    "1.0",
		ExportedAt: time.Now().Format(time.RFC3339),
		Servers: []core.ServerConfig{
			{
				ID:       "srv-1",
				Name:     "Test SSH Server",
				Host:     "192.168.1.100",
				Port:     22,
				Username: "root",
				Type:     "ssh",
				GroupID:  "grp-1",
			},
			{
				ID:       "srv-2",
				Name:     "Test Redis",
				Host:     "127.0.0.1",
				Port:     6379,
				Type:     "redis",
				GroupID:  "",
			},
		},
		Groups: []core.ServerGroup{
			{
				ID:   "grp-1",
				Name: "生产环境",
			},
		},
	}

	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		t.Fatalf("JSON marshal failed: %v", err)
	}

	var parsed ServersExportData
	if err := json.Unmarshal(bytes, &parsed); err != nil {
		t.Fatalf("JSON unmarshal failed: %v", err)
	}

	if len(parsed.Servers) != 2 {
		t.Errorf("expected 2 servers, got %d", len(parsed.Servers))
	}
	if len(parsed.Groups) != 1 {
		t.Errorf("expected 1 group, got %d", len(parsed.Groups))
	}
	if parsed.Servers[0].Name != "Test SSH Server" {
		t.Errorf("expected 'Test SSH Server', got '%s'", parsed.Servers[0].Name)
	}
	if parsed.Groups[0].Name != "生产环境" {
		t.Errorf("expected '生产环境', got '%s'", parsed.Groups[0].Name)
	}
}

func TestServersExportData_LegacyListFallback(t *testing.T) {
	// 验证兼容旧版裸列表 []core.ServerConfig 格式
	legacyList := []core.ServerConfig{
		{
			ID:       "srv-legacy",
			Name:     "Legacy Server",
			Host:     "10.0.0.1",
			Port:     22,
			Username: "admin",
			Type:     "ssh",
		},
	}

	bytes, err := json.Marshal(legacyList)
	if err != nil {
		t.Fatalf("marshal legacy list failed: %v", err)
	}

	var exportData ServersExportData
	if err := json.Unmarshal(bytes, &exportData); err != nil || (len(exportData.Servers) == 0 && len(exportData.Groups) == 0) {
		var fallback []core.ServerConfig
		if errFallback := json.Unmarshal(bytes, &fallback); errFallback == nil && len(fallback) > 0 {
			exportData.Servers = fallback
		} else {
			t.Fatalf("failed to parse fallback legacy servers")
		}
	}

	if len(exportData.Servers) != 1 {
		t.Fatalf("expected 1 fallback server, got %d", len(exportData.Servers))
	}
	if exportData.Servers[0].ID != "srv-legacy" {
		t.Errorf("expected 'srv-legacy', got '%s'", exportData.Servers[0].ID)
	}
}
