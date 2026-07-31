package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/pkg/sftp"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// FileItem 是远程目录中的一个条目。
type FileItem struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	IsDir   bool   `json:"isDir"`
	IsLink  bool   `json:"isLink"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	ModTime int64  `json:"modTime"`
}

// DirListing 是一次目录读取的结果。
type DirListing struct {
	Path   string     `json:"path"`
	Parent string     `json:"parent"`
	Items  []FileItem `json:"items"`
}

// Transfer 描述一个上传/下载任务。
type Transfer struct {
	ID          string `json:"id"`
	SessionID   string `json:"sessionId"`
	Kind        string `json:"kind"` // upload | download
	Name        string `json:"name"`
	LocalPath   string `json:"localPath"`
	RemotePath  string `json:"remotePath"`
	Size        int64  `json:"size"`
	Transferred int64  `json:"transferred"`
	Status      string `json:"status"` // running | done | error | canceled
	Error       string `json:"error"`
	StartedAt   int64  `json:"startedAt"`
	UpdatedAt   int64  `json:"updatedAt"`
}

const (
	statusRunning  = "running"
	statusDone     = "done"
	statusError    = "error"
	statusCanceled = "canceled"
)

type transferManager struct {
	mu       sync.Mutex
	ctx      context.Context
	items    map[string]*Transfer
	order    []string
	cancels  map[string]context.CancelFunc
	lastEmit map[string]time.Time
}

func newTransferManager() *transferManager {
	return &transferManager{
		items:    make(map[string]*Transfer),
		cancels:  make(map[string]context.CancelFunc),
		lastEmit: make(map[string]time.Time),
	}
}

func (tm *transferManager) setContext(ctx context.Context) {
	tm.ctx = ctx
}

func (tm *transferManager) create(sessionID, kind, name, localPath, remotePath string) (*Transfer, context.Context) {
	t := &Transfer{
		ID:         uuid.NewString(),
		SessionID:  sessionID,
		Kind:       kind,
		Name:       name,
		LocalPath:  localPath,
		RemotePath: remotePath,
		Status:     statusRunning,
		StartedAt:  time.Now().UnixMilli(),
		UpdatedAt:  time.Now().UnixMilli(),
	}
	ctx, cancel := context.WithCancel(context.Background())

	tm.mu.Lock()
	tm.items[t.ID] = t
	tm.order = append(tm.order, t.ID)
	tm.cancels[t.ID] = cancel
	tm.mu.Unlock()

	tm.emit(t, true)
	return t, ctx
}

func (tm *transferManager) emit(t *Transfer, force bool) {
	if tm.ctx == nil {
		return
	}
	tm.mu.Lock()
	last := tm.lastEmit[t.ID]
	now := time.Now()
	if !force && now.Sub(last) < 120*time.Millisecond {
		tm.mu.Unlock()
		return
	}
	tm.lastEmit[t.ID] = now
	snapshot := *t
	tm.mu.Unlock()

	snapshot.UpdatedAt = now.UnixMilli()
	wruntime.EventsEmit(tm.ctx, "transfer:update", snapshot)
}

func (tm *transferManager) addProgress(t *Transfer, n int64) {
	tm.mu.Lock()
	t.Transferred += n
	tm.mu.Unlock()
	tm.emit(t, false)
}

func (tm *transferManager) setSize(t *Transfer, size int64) {
	tm.mu.Lock()
	t.Size = size
	tm.mu.Unlock()
	tm.emit(t, true)
}

func (tm *transferManager) finish(t *Transfer, err error) {
	tm.mu.Lock()
	switch {
	case err == nil:
		t.Status = statusDone
		if t.Size > 0 {
			t.Transferred = t.Size
		}
	case errors.Is(err, context.Canceled):
		t.Status = statusCanceled
		t.Error = "已取消"
	default:
		t.Status = statusError
		t.Error = err.Error()
	}
	delete(tm.cancels, t.ID)
	tm.mu.Unlock()
	tm.emit(t, true)
}

func (tm *transferManager) cancel(id string) {
	tm.mu.Lock()
	cancel := tm.cancels[id]
	tm.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (tm *transferManager) list() []Transfer {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	out := make([]Transfer, 0, len(tm.order))
	for _, id := range tm.order {
		if t, ok := tm.items[id]; ok {
			out = append(out, *t)
		}
	}
	return out
}

func (tm *transferManager) clearFinished() {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	next := tm.order[:0]
	for _, id := range tm.order {
		t := tm.items[id]
		if t == nil {
			continue
		}
		if t.Status == statusRunning {
			next = append(next, id)
			continue
		}
		delete(tm.items, id)
		delete(tm.lastEmit, id)
		delete(tm.cancels, id)
	}
	tm.order = next
}

// progressReader 在读取过程中上报进度，并响应取消。
type progressReader struct {
	r      io.Reader
	ctx    context.Context
	report func(int64)
}

func (p *progressReader) Read(b []byte) (int, error) {
	select {
	case <-p.ctx.Done():
		return 0, context.Canceled
	default:
	}
	n, err := p.r.Read(b)
	if n > 0 && p.report != nil {
		p.report(int64(n))
	}
	return n, err
}

// ---------- 目录浏览 ----------

func normalizeRemote(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return "/"
	}
	p = strings.ReplaceAll(p, "\\", "/")
	if !strings.HasPrefix(p, "/") && !strings.HasPrefix(p, "~") {
		p = "/" + p
	}
	cleaned := path.Clean(p)
	if cleaned == "." {
		return "/"
	}
	return cleaned
}

func (a *App) listDir(sessionID, dir string) (DirListing, error) {
	session, err := a.sessions.get(sessionID)
	if err != nil {
		return DirListing{}, err
	}
	client, err := session.sftpConn()
	if err != nil {
		return DirListing{}, err
	}
	target := normalizeRemote(dir)
	if target == "/" && dir == "" && session.homeDir != "" {
		target = session.homeDir
	}
	if strings.HasPrefix(target, "~") {
		target = normalizeRemote(path.Join(session.homeDir, strings.TrimPrefix(target, "~")))
	}

	entries, err := client.ReadDir(target)
	if err != nil {
		return DirListing{}, fmt.Errorf("读取目录 %s 失败: %w", target, err)
	}

	items := make([]FileItem, 0, len(entries))
	for _, entry := range entries {
		full := path.Join(target, entry.Name())
		isLink := entry.Mode()&os.ModeSymlink != 0
		isDir := entry.IsDir()
		size := entry.Size()
		if isLink {
			if st, err := client.Stat(full); err == nil {
				isDir = st.IsDir()
				size = st.Size()
			}
		}
		items = append(items, FileItem{
			Name:    entry.Name(),
			Path:    full,
			IsDir:   isDir,
			IsLink:  isLink,
			Size:    size,
			Mode:    entry.Mode().String(),
			ModTime: entry.ModTime().Unix(),
		})
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].IsDir != items[j].IsDir {
			return items[i].IsDir
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	return DirListing{
		Path:   target,
		Parent: path.Dir(target),
		Items:  items,
	}, nil
}

// ---------- 基础文件操作 ----------

func (a *App) removeRemote(client *sftp.Client, target string) error {
	st, err := client.Lstat(target)
	if err != nil {
		return err
	}
	if st.IsDir() && st.Mode()&os.ModeSymlink == 0 {
		entries, err := client.ReadDir(target)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if err := a.removeRemote(client, path.Join(target, entry.Name())); err != nil {
				return err
			}
		}
		return client.RemoveDirectory(target)
	}
	return client.Remove(target)
}

// ---------- 上传 ----------

func localTreeSize(root string) (int64, error) {
	var total int64
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		total += info.Size()
		return nil
	})
	return total, err
}

func mkdirAllRemote(client *sftp.Client, dir string) error {
	if dir == "" || dir == "/" || dir == "." {
		return nil
	}
	if st, err := client.Stat(dir); err == nil {
		if st.IsDir() {
			return nil
		}
		return fmt.Errorf("%s 已存在且不是目录", dir)
	}
	if err := mkdirAllRemote(client, path.Dir(dir)); err != nil {
		return err
	}
	if err := client.Mkdir(dir); err != nil {
		if st, serr := client.Stat(dir); serr == nil && st.IsDir() {
			return nil
		}
		return err
	}
	return nil
}

func (a *App) uploadFile(ctx context.Context, client *sftp.Client, localPath, remotePath string, t *Transfer) error {
	src, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer src.Close()

	if err := mkdirAllRemote(client, path.Dir(remotePath)); err != nil {
		return err
	}
	dst, err := client.Create(remotePath)
	if err != nil {
		return fmt.Errorf("创建远程文件 %s 失败: %w", remotePath, err)
	}
	defer dst.Close()

	reader := &progressReader{r: src, ctx: ctx, report: func(n int64) {
		a.transfers.addProgress(t, n)
	}}
	buf := make([]byte, 256*1024)
	if _, err := io.CopyBuffer(dst, reader, buf); err != nil {
		return err
	}
	if info, err := os.Stat(localPath); err == nil {
		_ = client.Chmod(remotePath, info.Mode().Perm())
	}
	return nil
}

func (a *App) uploadTree(ctx context.Context, client *sftp.Client, localRoot, remoteRoot string, t *Transfer) error {
	return filepath.WalkDir(localRoot, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		select {
		case <-ctx.Done():
			return context.Canceled
		default:
		}
		rel, err := filepath.Rel(localRoot, p)
		if err != nil {
			return err
		}
		remote := remoteRoot
		if rel != "." {
			remote = path.Join(remoteRoot, filepath.ToSlash(rel))
		}
		if d.IsDir() {
			return mkdirAllRemote(client, remote)
		}
		if !d.Type().IsRegular() {
			return nil
		}
		return a.uploadFile(ctx, client, p, remote, t)
	})
}

func (a *App) startUpload(sessionID, remoteDir, localPath string) error {
	session, err := a.sessions.get(sessionID)
	if err != nil {
		return err
	}
	client, err := session.sftpConn()
	if err != nil {
		return err
	}
	info, err := os.Stat(localPath)
	if err != nil {
		return err
	}
	remoteDir = normalizeRemote(remoteDir)
	name := filepath.Base(localPath)
	remotePath := path.Join(remoteDir, name)

	t, ctx := a.transfers.create(sessionID, "upload", name, localPath, remotePath)

	go func() {
		var err error
		if info.IsDir() {
			if size, serr := localTreeSize(localPath); serr == nil {
				a.transfers.setSize(t, size)
			}
			err = a.uploadTree(ctx, client, localPath, remotePath, t)
		} else {
			a.transfers.setSize(t, info.Size())
			err = a.uploadFile(ctx, client, localPath, remotePath, t)
		}
		a.transfers.finish(t, err)
		a.notifyDirChanged(sessionID, remoteDir)
	}()
	return nil
}

// ---------- 下载 ----------

func remoteTreeSize(client *sftp.Client, root string) int64 {
	var total int64
	walker := client.Walk(root)
	for walker.Step() {
		if walker.Err() != nil {
			continue
		}
		if !walker.Stat().IsDir() {
			total += walker.Stat().Size()
		}
	}
	return total
}

func (a *App) downloadFile(ctx context.Context, client *sftp.Client, remotePath, localPath string, t *Transfer) error {
	if err := os.MkdirAll(filepath.Dir(localPath), 0o755); err != nil {
		return err
	}
	src, err := client.Open(remotePath)
	if err != nil {
		return fmt.Errorf("打开远程文件 %s 失败: %w", remotePath, err)
	}
	defer src.Close()

	dst, err := os.Create(localPath)
	if err != nil {
		return err
	}
	defer dst.Close()

	reader := &progressReader{r: src, ctx: ctx, report: func(n int64) {
		a.transfers.addProgress(t, n)
	}}
	buf := make([]byte, 256*1024)
	_, err = io.CopyBuffer(dst, reader, buf)
	return err
}

func (a *App) downloadTree(ctx context.Context, client *sftp.Client, remoteRoot, localRoot string, t *Transfer) error {
	walker := client.Walk(remoteRoot)
	for walker.Step() {
		select {
		case <-ctx.Done():
			return context.Canceled
		default:
		}
		if err := walker.Err(); err != nil {
			return err
		}
		remote := walker.Path()
		rel := strings.TrimPrefix(remote, remoteRoot)
		rel = strings.TrimPrefix(rel, "/")
		local := localRoot
		if rel != "" {
			local = filepath.Join(localRoot, filepath.FromSlash(rel))
		}
		st := walker.Stat()
		if st.IsDir() {
			if err := os.MkdirAll(local, 0o755); err != nil {
				return err
			}
			continue
		}
		if !st.Mode().IsRegular() {
			continue
		}
		if err := a.downloadFile(ctx, client, remote, local, t); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) startDownload(sessionID, remotePath, localDir string) error {
	session, err := a.sessions.get(sessionID)
	if err != nil {
		return err
	}
	client, err := session.sftpConn()
	if err != nil {
		return err
	}
	remotePath = normalizeRemote(remotePath)
	st, err := client.Stat(remotePath)
	if err != nil {
		return err
	}
	name := path.Base(remotePath)
	localPath := filepath.Join(localDir, name)

	t, ctx := a.transfers.create(sessionID, "download", name, localPath, remotePath)

	go func() {
		var err error
		if st.IsDir() {
			a.transfers.setSize(t, remoteTreeSize(client, remotePath))
			err = a.downloadTree(ctx, client, remotePath, localPath, t)
		} else {
			a.transfers.setSize(t, st.Size())
			err = a.downloadFile(ctx, client, remotePath, localPath, t)
		}
		a.transfers.finish(t, err)
	}()
	return nil
}

// ---------- 浏览器内存上传（拖拽降级方案） ----------

func (a *App) uploadBase64(sessionID, remoteDir, name, data string) error {
	session, err := a.sessions.get(sessionID)
	if err != nil {
		return err
	}
	client, err := session.sftpConn()
	if err != nil {
		return err
	}
	raw, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return fmt.Errorf("数据解码失败: %w", err)
	}
	remoteDir = normalizeRemote(remoteDir)
	remotePath := path.Join(remoteDir, name)

	t, ctx := a.transfers.create(sessionID, "upload", name, "", remotePath)
	a.transfers.setSize(t, int64(len(raw)))

	go func() {
		err := func() error {
			if err := mkdirAllRemote(client, remoteDir); err != nil {
				return err
			}
			f, err := client.Create(remotePath)
			if err != nil {
				return err
			}
			defer f.Close()
			reader := &progressReader{r: strings.NewReader(string(raw)), ctx: ctx, report: func(n int64) {
				a.transfers.addProgress(t, n)
			}}
			_, err = io.CopyBuffer(f, reader, make([]byte, 256*1024))
			return err
		}()
		a.transfers.finish(t, err)
		a.notifyDirChanged(sessionID, remoteDir)
	}()
	return nil
}

func (a *App) notifyDirChanged(sessionID, dir string) {
	if a.ctx == nil {
		return
	}
	wruntime.EventsEmit(a.ctx, "sftp:changed", map[string]string{
		"sessionId": sessionID,
		"path":      dir,
	})
}
