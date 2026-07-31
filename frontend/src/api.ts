import type {
    DirListing,
    MysqlQueryResult,
    RedisKeysResult,
    RedisSessionInfo,
    RedisValue,
    ServerConfig,
    SessionInfo,
    Transfer,
    MqttSessionInfo,
    MqttSubscription,
} from './types'

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

    // Redis
    redisConnect: (id: string): Promise<boolean> => app().RedisConnect(id),
    redisClose: (id: string): Promise<void> => app().RedisClose(id),
    redisSelectDB: (id: string, db: number): Promise<void> => app().RedisSelectDB(id, db),
    redisKeys: (id: string, pattern: string, cursor: string): Promise<RedisKeysResult> =>
        app().RedisKeys(id, pattern, cursor),
    redisGet: (id: string, key: string): Promise<RedisValue> => app().RedisGet(id, key),
    redisSet: (
        id: string,
        key: string,
        type: string,
        value: string,
        ttl: number
    ): Promise<void> => app().RedisSet(id, key, type, value, ttl),
    redisDelete: (id: string, key: string): Promise<void> => app().RedisDelete(id, key),
    redisExpire: (id: string, key: string, ttl: number): Promise<void> =>
        app().RedisExpire(id, key, ttl),
    redisRaw: (id: string, command: string): Promise<{ result: string }> =>
        app().RedisRaw(id, command),
    redisDBSize: (id: string): Promise<number> => app().RedisDBSize(id),

    // MySQL
    mysqlConnect: (id: string): Promise<boolean> => app().MysqlConnect(id),
    mysqlClose: (id: string): Promise<void> => app().MysqlClose(id),
    mysqlDatabases: (id: string): Promise<string[]> => app().MysqlDatabases(id),
    mysqlTables: (id: string, db: string): Promise<string[]> => app().MysqlTables(id, db),
    mysqlSelect: (id: string, db: string, table: string, limit: number, offset: number): Promise<MysqlQueryResult> =>
        app().MysqlSelect(id, db, table, limit, offset),
    mysqlCount: (id: string, db: string, table: string): Promise<number> =>
        app().MysqlCount(id, db, table),
    mysqlDescribe: (id: string, db: string, table: string): Promise<MysqlQueryResult> =>
        app().MysqlDescribe(id, db, table),
    mysqlRun: (id: string, db: string, sql: string): Promise<MysqlQueryResult> =>
        app().MysqlRun(id, db, sql),
    mysqlInsert: (
        id: string,
        db: string,
        table: string,
        columns: string[],
        values: any[]
    ): Promise<number> => app().MysqlInsert(id, db, table, columns, values),
    mysqlUpdate: (
        id: string,
        db: string,
        table: string,
        setCols: string[],
        setVals: any[],
        whereCols: string[],
        whereVals: any[]
    ): Promise<number> => app().MysqlUpdate(id, db, table, setCols, setVals, whereCols, whereVals),
    mysqlDelete: (
        id: string,
        db: string,
        table: string,
        whereCols: string[],
        whereVals: any[]
    ): Promise<number> => app().MysqlDelete(id, db, table, whereCols, whereVals),
    mysqlExport: (
        id: string,
        db: string,
        mode: string,
        source: string,
        table: string,
        sqlText: string,
        limit: number
    ): Promise<string> => app().MysqlExport(id, db, mode, source, table, sqlText, limit),
    mysqlExportToFile: (
        id: string,
        db: string,
        mode: string,
        source: string,
        table: string,
        sqlText: string,
        limit: number
    ): Promise<string> => app().MysqlExportToFile(id, db, mode, source, table, sqlText, limit),
    mysqlImport: (
        id: string,
        db: string,
        mode: string,
        table: string,
        content: string
    ): Promise<string> => app().MysqlImport(id, db, mode, table, content),
    mysqlImportFromFile: (
        id: string,
        db: string,
        mode: string,
        table: string
    ): Promise<string> => app().MysqlImportFromFile(id, db, mode, table),
    readLocalFile: (filePath: string): Promise<string> => app().ReadLocalFile(filePath),
    writeLocalFile: (filePath: string, content: string): Promise<void> => app().WriteLocalFile(filePath, content),
    mqttConnect: (id: string): Promise<MqttSessionInfo> => app().MqttConnect(id),
    mqttClose: (id: string): Promise<void> => app().MqttClose(id),
    mqttPublish: (
        id: string,
        topic: string,
        payload: string,
        qos: number,
        retained: boolean
    ): Promise<void> => app().MqttPublish(id, topic, payload, qos, retained),
    mqttSubscribe: (id: string, topic: string, qos: number): Promise<void> =>
        app().MqttSubscribe(id, topic, qos),
    mqttUnsubscribe: (id: string, topic: string): Promise<void> =>
        app().MqttUnsubscribe(id, topic),
    mqttSubscriptions: (id: string): Promise<MqttSubscription[]> =>
        app().MqttSubscriptions(id),
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
