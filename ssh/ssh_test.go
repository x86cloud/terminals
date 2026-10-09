package ssh

import (
	"testing"
	"terminal/core"
)

func TestSessionManager_TestConnection_Validation(t *testing.T) {
	mgr := NewSessionManager()

	// 1. 空主机地址校验
	cfg := core.ServerConfig{
		Type:     "ssh",
		Username: "root",
	}
	_, err := mgr.TestConnection(cfg)
	if err == nil {
		t.Fatal("预期空主机地址返回错误，实际无错误")
	}

	// 2. 空用户名校验
	cfg = core.ServerConfig{
		Type: "ssh",
		Host: "127.0.0.1",
		Port: 22,
	}
	_, err = mgr.TestConnection(cfg)
	if err == nil {
		t.Fatal("预期空用户名返回错误，实际无错误")
	}

	// 3. 缺少认证信息校验
	cfg = core.ServerConfig{
		Type:     "ssh",
		Host:     "127.0.0.1",
		Port:     22,
		Username: "root",
	}
	_, err = mgr.TestConnection(cfg)
	if err == nil {
		t.Fatal("预期缺少认证凭证返回错误，实际无错误")
	}

	// 4. 不可达目标地址（快速超时）
	cfg = core.ServerConfig{
		Type:     "ssh",
		Host:     "127.0.0.1",
		Port:     59999,
		Username: "root",
		Password: "password",
	}
	_, err = mgr.TestConnection(cfg)
	if err == nil {
		t.Fatal("预期不可达地址返回错误，实际无错误")
	}
}
