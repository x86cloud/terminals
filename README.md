# Terminal — SSH / SFTP 桌面客户端

基于 [Wails v2](https://wails.io) + React + TypeScript + xterm.js 的跨平台桌面终端客户端。
可同时连接多台 Linux 服务器进行终端操作，并在同一窗口内通过 SFTP 管理远程文件。

## 功能

**终端**
- 多服务器、多会话，标签页切换，会话切走后输出不丢失
- 真实 PTY（`xterm-256color`），支持窗口自适应、颜色、鼠标滚动、超链接
- 支持密码认证与私钥认证（可带 passphrase），30s 心跳保活
- 右键菜单：复制 / 粘贴 / 清屏

**SFTP 文件管理（与终端复用同一条 SSH 连接）**
- 目录浏览、面包屑导航、路径直达、过滤、隐藏文件开关
- **拖拽上传**：从系统文件管理器直接把文件/文件夹拖到右侧文件面板即可上传（自动递归目录）
- **右键菜单**：下载、删除（目录递归删除）、重命名、复制路径、新建文件夹、上传
- 多选（Ctrl / Shift）批量下载与删除
- 传输队列：实时进度、速率占比、失败原因、单任务取消、清除已完成

**连接管理**
- 服务器配置本地持久化，密码 / 私钥 / passphrase 使用 AES-GCM 加密存储
- 配置目录：`%APPDATA%/WailsTerminal`（Windows）、`~/.config/WailsTerminal`（Linux/macOS）

## 目录结构

```
app.go        // 绑定给前端的 API 门面
ssh.go        // SSH 连接、PTY shell、输出推流、会话管理
sftp.go       // SFTP 目录/文件操作、上传下载、传输队列与进度
config.go     // 服务器配置持久化与敏感字段加密
main.go       // Wails 应用入口与窗口选项（启用系统级文件拖放）
frontend/src
  api.ts               // Wails 绑定封装 + 事件总线
  components/
    Sidebar.tsx        // 服务器列表
    ServerDialog.tsx   // 新建/编辑服务器
    SessionWorkspace.tsx // 终端 + 文件面板分栏
    TerminalView.tsx   // xterm 终端
    FilePanel.tsx      // SFTP 文件管理器
    TransferBar.tsx    // 传输任务栏
```

## 开发

```bash
wails dev
```

## 构建

```bash
wails build
```

> 说明：系统级文件拖放依赖 Wails 的 `DragAndDrop.EnableFileDrop`，需在打包后的桌面窗口中使用；
> 浏览器调试模式下会自动降级为读取文件内容上传。
