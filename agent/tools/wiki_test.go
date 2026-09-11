package tools

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"terminal/agent/events"
	"terminal/agent/guard"
	"terminal/agent/wiki"
	"terminal/core"
)

func TestWiki_FileSystemAndManager(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "wiki_test_*")
	if err != nil {
		t.Fatalf("创建临时目录失败: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	core.SetAppConfigDirForTest(tmpDir)
	defer core.SetAppConfigDirForTest("")

	// 1. 获取目录与初始化
	dir, err := wiki.GetWikiDir()
	if err != nil {
		t.Fatalf("GetWikiDir 失败: %v", err)
	}
	if !strings.HasSuffix(filepath.ToSlash(dir), "/wiki") {
		t.Errorf("目录后缀不符合预期: %s", dir)
	}

	// 2. 创建目录与文档
	folderRel, err := wiki.CreateNode("", "servers", true)
	if err != nil {
		t.Fatalf("创建 servers 目录失败: %v", err)
	}
	if folderRel != "servers" {
		t.Errorf("期望目录 servers，实际 %s", folderRel)
	}

	docRel, err := wiki.CreateNode("servers", "prod-db.md", false)
	if err != nil {
		t.Fatalf("创建 prod-db.md 失败: %v", err)
	}

	// 3. 写入与读取
	content := "# 生产数据库配置 (Prod MySQL)\n\n内网IP: 192.168.1.50\n端口: 3306\n架构: 主从双活\n"
	if err := wiki.SavePage(docRel, content); err != nil {
		t.Fatalf("SavePage 失败: %v", err)
	}

	readBack, err := wiki.ReadPage(docRel)
	if err != nil {
		t.Fatalf("ReadPage 失败: %v", err)
	}
	if !strings.Contains(readBack, "192.168.1.50") {
		t.Errorf("ReadPage 内容不符合预期: %s", readBack)
	}

	// 4. 获取紧凑目录与树
	catalog, err := wiki.GetCatalog()
	if err != nil {
		t.Fatalf("GetCatalog 失败: %v", err)
	}
	var foundProd bool
	for _, c := range catalog {
		if strings.Contains(c.RelPath, "prod-db.md") {
			foundProd = true
			if !strings.Contains(c.Title, "生产数据库配置") {
				t.Errorf("标题提取不符合预期: %s", c.Title)
			}
			if !strings.Contains(c.Summary, "192.168.1.50") {
				t.Errorf("摘要提取不符合预期: %s", c.Summary)
			}
		}
	}
	if !foundProd {
		t.Fatalf("GetCatalog 未找到 prod-db.md: %+v", catalog)
	}

	tree, err := wiki.ListTree()
	if err != nil {
		t.Fatalf("ListTree 失败: %v", err)
	}
	if len(tree) == 0 {
		t.Fatalf("期望树节点大于0")
	}

	// 5. 路径穿越防护测试
	_, err = wiki.ReadPage("../../../etc/shadow")
	if err == nil {
		t.Fatalf("期望拦截路径穿越尝试，但未报错")
	}

	// 6. 重命名与删除
	newRel := "servers/production-mysql.md"
	if err := wiki.RenameNode(docRel, newRel); err != nil {
		t.Fatalf("RenameNode 失败: %v", err)
	}
	renamedContent, err := wiki.ReadPage(newRel)
	if err != nil || !strings.Contains(renamedContent, "3306") {
		t.Fatalf("读取重命名后文档失败: %v", err)
	}

	if err := wiki.DeleteNode(newRel); err != nil {
		t.Fatalf("DeleteNode 失败: %v", err)
	}
	_, err = wiki.ReadPage(newRel)
	if err == nil {
		t.Fatalf("期望已删除文档报错，但未报错")
	}
}

func TestWiki_AgentTools(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "wiki_tools_test_*")
	if err != nil {
		t.Fatalf("创建临时目录失败: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	core.SetAppConfigDirForTest(tmpDir)
	defer core.SetAppConfigDirForTest("")

	g := guard.NewPolicyGuard(true, true, nil)
	eb := events.NewEventBus()
	bus := NewToolBus(g, eb)

	if err := RegisterWikiTools(bus, nil); err != nil {
		t.Fatalf("RegisterWikiTools 失败: %v", err)
	}

	// 1. wiki_write
	writeInput, _ := json.Marshal(WikiWriteInput{
		PagePath: "playbooks/high-load.md",
		Content:  "# 高负载排查 SOP\n\n1. 执行 top / htop 查看 CPU 占用\n2. 查看负载与 io-wait",
		Summary:  "创建高负载排障文档",
	})
	resWrite := bus.Invoke(context.Background(), "trace_w1", "sess_1", "wiki_write", string(writeInput))
	if !resWrite.OK {
		t.Fatalf("wiki_write 失败: %s", resWrite.Error)
	}

	// 2. wiki_list
	listInput, _ := json.Marshal(WikiListInput{
		Keyword: "高负载",
	})
	resList := bus.Invoke(context.Background(), "trace_w2", "sess_1", "wiki_list", string(listInput))
	if !resList.OK {
		t.Fatalf("wiki_list 失败: %s", resList.Error)
	}

	// 3. wiki_read
	readInput, _ := json.Marshal(WikiReadInput{
		PagePath: "playbooks/high-load.md",
	})
	resRead := bus.Invoke(context.Background(), "trace_w3", "sess_1", "wiki_read", string(readInput))
	if !resRead.OK {
		t.Fatalf("wiki_read 失败: %s", resRead.Error)
	}

	// 4. wiki_update (直接传入 updated_content)
	updateInput, _ := json.Marshal(WikiUpdateInput{
		PagePath:       "playbooks/high-load.md",
		UpdatedContent: "# 高负载排查 SOP\n\n1. 执行 top 查看 CPU\n2. 执行 iotop 查看磁盘读写\n3. 执行 vmstat 1",
		Summary:        "补充 vmstat 监控步骤",
	})
	resUpdate := bus.Invoke(context.Background(), "trace_w4", "sess_1", "wiki_update", string(updateInput))
	if !resUpdate.OK {
		t.Fatalf("wiki_update 失败: %s", resUpdate.Error)
	}

	readBack, err := wiki.ReadPage("playbooks/high-load.md")
	if err != nil || !strings.Contains(readBack, "vmstat 1") {
		t.Fatalf("更新后内容不符合预期: %s", readBack)
	}
}
