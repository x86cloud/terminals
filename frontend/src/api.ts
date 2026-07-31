import type {DirListing, ServerConfig, SessionInfo, Transfer} from './types'

type AnyFn = (...args: any[]) => void

interface WailsWindow extends Window {
    go?: any
    runtime?: any
}

const w = window as WailsWindow

function app(): any {
    const binding = w.go?.main?.App
    if (!binding) {
        throw new Error('Wails 运行时尚未就绪，请通过 wails dev / wails build 启动应用')
    }
    return binding
}

export const API = {
    // 服务器配置
    listServers: (): Promise<ServerConfig[]> => app().ListServers(),
    saveServer: (cfg: ServerConfig): Promise<ServerConfig> => app().SaveServer(cfg),
    deleteServer: (id: string): Promise<void> => app().DeleteServer(id),
    selectPrivateKey: (): Promise<string> => app().SelectPrivateKey(),

    // 会话
    listSessions: (): Promise<SessionInfo[]> => app().ListSessions(),
    connect: (serverId: string, cols: number, rows: number): Promise<SessionInfo> =>
        app().Connect(serverId, cols, rows),
    connectWith: (cfg: ServerConfig, cols: number, rows: number): Promise<SessionInfo> =>
        app().ConnectWithConfig(cfg, cols, rows),
    disconnect: (sessionId: string): Promise<void> => app().Disconnect(sessionId),
    sendInput: (sessionId: string, data: string): Promise<void> => app().SendInput(sessionId, data),
    resize: (sessionId: string, cols: number, rows: number): Promise<void> =>
        app().ResizeTerminal(sessionId, cols, rows),

    // SFTP
    listDir: (sessionId: string, dir: string): Promise<DirListing> => app().ListDir(sessionId, dir),
    homeDir: (sessionId: string): Promise<string> => app().HomeDir(sessionId),
    makeDir: (sessionId: string, parent: string, name: string): Promise<void> =>
        app().MakeDir(sessionId, parent, name),
    removePaths: (sessionId: string, paths: string[]): Promise<void> => app().RemovePaths(sessionId, paths),
    rename: (sessionId: string, target: string, newName: string): Promise<void> =>
        app().RenamePath(sessionId, target, newName),

    // 传输
    chooseLocalFiles: (): Promise<string[]> => app().ChooseLocalFiles(),
    chooseLocalFolder: (): Promise<string> => app().ChooseLocalFolder(),
    uploadPaths: (sessionId: string, remoteDir: string, localPaths: string[]): Promise<void> =>
        app().UploadPaths(sessionId, remoteDir, localPaths),
    uploadData: (sessionId: string, remoteDir: string, name: string, base64Data: string): Promise<void> =>
        app().UploadData(sessionId, remoteDir, name, base64Data),
    downloadPaths: (sessionId: string, remotePaths: string[]): Promise<void> =>
        app().DownloadPaths(sessionId, remotePaths),
    downloadTo: (sessionId: string, remotePaths: string[], localDir: string): Promise<void> =>
        app().DownloadTo(sessionId, remotePaths, localDir),
    listTransfers: (): Promise<Transfer[]> => app().ListTransfers(),
    cancelTransfer: (id: string): Promise<void> => app().CancelTransfer(id),
    clearFinishedTransfers: (): Promise<void> => app().ClearFinishedTransfers(),
}

/* ------------------------------------------------------------------ */
/* 事件总线：Wails 的 EventsOff 会移除该事件全部监听，这里做一层本地分发 */
/* ------------------------------------------------------------------ */

const subscribers = new Map<string, Set<AnyFn>>()
const boundEvents = new Set<string>()

export function subscribe(event: string, handler: AnyFn): () => void {
    let set = subscribers.get(event)
    if (!set) {
        set = new Set()
        subscribers.set(event, set)
    }
    set.add(handler)

    if (!boundEvents.has(event) && w.runtime?.EventsOn) {
        boundEvents.add(event)
        w.runtime.EventsOn(event, (...args: any[]) => {
            subscribers.get(event)?.forEach((fn) => fn(...args))
        })
    }

    return () => {
        subscribers.get(event)?.delete(handler)
    }
}

/** 注册系统级文件拖放（返回 false 表示当前环境不支持，需要走浏览器降级方案） */
export function registerNativeFileDrop(handler: (paths: string[]) => void): boolean {
    const rt = w.runtime
    if (!rt?.OnFileDrop) return false
    rt.OnFileDrop((_x: number, _y: number, paths: string[]) => {
        if (paths && paths.length) handler(paths)
    }, true)
    return true
}

export function unregisterNativeFileDrop(): void {
    w.runtime?.OnFileDropOff?.()
}
