import type {
    DirListing,
    MysqlQueryResult,
    RedisKeysResult,
    RedisSessionInfo,
    RedisValue,
    RedisPipelineResult,
    RedisTransactionResult,
    RedisQueueItem,
    RedisSlowLogEntry,
    RedisMonitorInfo,
    ServerConfig,
    SessionInfo,
    Transfer,
    MqttSessionInfo,
    MqttSubscription,
    ApiRequest,
    ApiResponse,
    ApiHeader,
    ApiAuth,
    ApiMode,
    WsStatus,
    WsConnectResult,
    WsMessage,
    MongoSessionInfo,
    MongoURIInfo,
    MongoHealthInfo,
    MongoDatabaseInfo,
    MongoCollectionInfo,
    MongoCollectionStats,
    MongoQuerySpec,
    MongoFindResult,
    MongoFieldInfo,
    MongoValidatorInfo,
    MongoValidationResult,
    MongoIndexInfo,
    MongoAggregateResult,
    MongoBulkOp,
    MongoBulkResult,
    MongoTxOp,
    MongoTxResult,
    MongoServerStatus,
    SqliteSessionInfo,
    SqliteTableInfo,
    SqliteColumnInfo,
    SqliteIndexInfo,
    SqliteQueryResult,
    SqliteInfo,
    SqliteSchema,
    ServerGroup,
    SSHDashboardInfo,
    SSHProcessInfo,
    SSHServiceInfo,
    SSHCronItem,
    SSHDockerContainer,
    SSHDockerImage,
    AppSettings,
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
    // 设置持久化
    getAppSettings: (): Promise<AppSettings> => app().GetAppSettings(),
    saveAppSettings: (settings: AppSettings): Promise<AppSettings> => app().SaveAppSettings(settings),

    // 服务器配置
    listServers: (): Promise<ServerConfig[]> => app().ListServers(),
    saveServer: (cfg: ServerConfig): Promise<ServerConfig> => app().SaveServer(cfg),
    deleteServer: (id: string): Promise<void> => app().DeleteServer(id),
    selectPrivateKey: (): Promise<string> => app().SelectPrivateKey(),

    // 分组管理
    listGroups: (): Promise<ServerGroup[]> => app().ListGroups(),
    saveGroup: (g: ServerGroup): Promise<ServerGroup> => app().SaveGroup(g),
    deleteGroup: (id: string): Promise<void> => app().DeleteGroup(id),
    moveServerToGroup: (serverId: string, groupId: string): Promise<void> =>
        app().MoveServerToGroup(serverId, groupId),

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
    sshDashboardStats: (sessionId: string): Promise<SSHDashboardInfo> =>
        app().SSHDashboardStats(sessionId),
    sshProcessList: (sessionId: string): Promise<SSHProcessInfo[]> =>
        app().SSHProcessList(sessionId),
    sshKillProcess: (sessionId: string, pid: number): Promise<void> =>
        app().SSHKillProcess(sessionId, pid),
    sshServiceList: (sessionId: string): Promise<SSHServiceInfo[]> =>
        app().SSHServiceList(sessionId),
    sshControlService: (sessionId: string, serviceName: string, action: string): Promise<void> =>
        app().SSHControlService(sessionId, serviceName, action),
    sshServiceLogs: (sessionId: string, serviceName: string): Promise<string> =>
        app().SSHServiceLogs(sessionId, serviceName),
    sshCronList: (sessionId: string): Promise<SSHCronItem[]> =>
        app().SSHCronList(sessionId),
    sshSaveCronList: (sessionId: string, items: SSHCronItem[]): Promise<void> =>
        app().SSHSaveCronList(sessionId, items),
    sshRunCronCommand: (sessionId: string, command: string): Promise<string> =>
        app().SSHRunCronCommand(sessionId, command),
    sshDockerContainerList: (sessionId: string): Promise<SSHDockerContainer[]> =>
        app().SSHDockerContainerList(sessionId),
    sshDockerControlContainer: (sessionId: string, containerId: string, action: string): Promise<void> =>
        app().SSHDockerControlContainer(sessionId, containerId, action),
    sshDockerContainerLogs: (sessionId: string, containerId: string, tail: number): Promise<string> =>
        app().SSHDockerContainerLogs(sessionId, containerId, tail),
    sshDockerImageList: (sessionId: string): Promise<SSHDockerImage[]> =>
        app().SSHDockerImageList(sessionId),
    sshDockerRemoveImage: (sessionId: string, imageId: string): Promise<void> =>
        app().SSHDockerRemoveImage(sessionId, imageId),
    sshDockerPullImage: (sessionId: string, imageName: string): Promise<string> =>
        app().SSHDockerPullImage(sessionId, imageName),

    // SFTP
    listDir: (sessionId: string, dir: string): Promise<DirListing> => app().ListDir(sessionId, dir),
    homeDir: (sessionId: string): Promise<string> => app().HomeDir(sessionId),
    makeDir: (sessionId: string, parent: string, name: string): Promise<void> =>
        app().MakeDir(sessionId, parent, name),
    removePaths: (sessionId: string, paths: string[]): Promise<void> => app().RemovePaths(sessionId, paths),
    rename: (sessionId: string, target: string, newName: string): Promise<void> =>
        app().RenamePath(sessionId, target, newName),
    readRemoteFile: (sessionId: string, path: string): Promise<string> =>
        app().ReadRemoteFile(sessionId, path),
    writeRemoteFile: (sessionId: string, path: string, content: string): Promise<void> =>
        app().WriteRemoteFile(sessionId, path, content),

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

    // Redis 扩展能力
    redisModeInfo: (id: string): Promise<Record<string, any>> => app().RedisModeInfo(id),
    redisStringAppend: (id: string, key: string, value: string): Promise<number> =>
        app().RedisStringAppend(id, key, value),
    redisHashFieldSet: (id: string, key: string, field: string, value: string): Promise<void> =>
        app().RedisHashFieldSet(id, key, field, value),
    redisHashFieldGet: (id: string, key: string, field: string): Promise<string> =>
        app().RedisHashFieldGet(id, key, field),
    redisHashFieldDel: (id: string, key: string, fields: string[]): Promise<number> =>
        app().RedisHashFieldDel(id, key, fields),
    redisListPush: (id: string, key: string, value: string, left: boolean): Promise<number> =>
        app().RedisListPush(id, key, value, left),
    redisListPop: (id: string, key: string, left: boolean): Promise<string> =>
        app().RedisListPop(id, key, left),
    redisSetAdd: (id: string, key: string, members: string[]): Promise<number> =>
        app().RedisSetAdd(id, key, members),
    redisSetRem: (id: string, key: string, members: string[]): Promise<number> =>
        app().RedisSetRem(id, key, members),
    redisZSetAdd: (id: string, key: string, member: string, score: number): Promise<number> =>
        app().RedisZSetAdd(id, key, member, score),
    redisZSetRem: (id: string, key: string, members: string[]): Promise<number> =>
        app().RedisZSetRem(id, key, members),
    redisPipeline: (id: string, commands: string[]): Promise<RedisPipelineResult> =>
        app().RedisPipeline(id, commands),
    redisTransaction: (id: string, watch: string[], commands: string[]): Promise<RedisTransactionResult> =>
        app().RedisTransaction(id, watch, commands),
    redisPublish: (id: string, channel: string, message: string): Promise<number> =>
        app().RedisPublish(id, channel, message),
    redisSubscribe: (id: string, channel: string): Promise<void> =>
        app().RedisSubscribe(id, channel),
    redisPSubscribe: (id: string, pattern: string): Promise<void> =>
        app().RedisPSubscribe(id, pattern),
    redisUnsubscribe: (id: string, channel: string): Promise<void> =>
        app().RedisUnsubscribe(id, channel),
    redisSubscriptions: (id: string): Promise<string[]> => app().RedisSubscriptions(id),
    redisKeyspaceNotify: (id: string, db: number, event: string): Promise<void> =>
        app().RedisKeyspaceNotify(id, db, event),
    redisQueueEnqueue: (id: string, queue: string, payload: string, mode: string): Promise<string> =>
        app().RedisQueueEnqueue(id, queue, payload, mode),
    redisQueueDequeue: (id: string, queue: string, mode: string, timeout: number): Promise<RedisQueueItem> =>
        app().RedisQueueDequeue(id, queue, mode, timeout),
    redisQueueLength: (id: string, queue: string, mode: string): Promise<number> =>
        app().RedisQueueLength(id, queue, mode),
    redisSlowLog: (id: string, count: number): Promise<RedisSlowLogEntry[]> =>
        app().RedisSlowLog(id, count),
    redisInfo: (id: string, section: string): Promise<string> => app().RedisInfo(id, section),
    redisMonitor: (id: string): Promise<RedisMonitorInfo> => app().RedisMonitor(id),

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

    // MySQL 扩展能力（支持 SSH/SSL/连接池）
    mysqlConnectEx: (id: string): Promise<boolean> => app().MysqlConnectEx(id),
    mysqlCloseEx: (id: string): Promise<void> => app().MysqlCloseEx(id),
    mysqlCreateDatabase: (id: string, name: string, charset: string): Promise<void> =>
        app().MysqlCreateDatabase(id, name, charset),
    mysqlDropDatabase: (id: string, name: string): Promise<void> =>
        app().MysqlDropDatabase(id, name),
    mysqlCreateTable: (id: string, db: string, table: string, defs: string): Promise<void> =>
        app().MysqlCreateTable(id, db, table, defs),
    mysqlDropTable: (id: string, db: string, table: string): Promise<void> =>
        app().MysqlDropTable(id, db, table),
    mysqlTruncateTable: (id: string, db: string, table: string): Promise<void> =>
        app().MysqlTruncateTable(id, db, table),
    mysqlTableStatus: (id: string, db: string): Promise<Record<string, any>[]> =>
        app().MysqlTableStatus(id, db),
    mysqlIndexes: (id: string, db: string, table: string): Promise<Record<string, any>[]> =>
        app().MysqlIndexes(id, db, table),
    mysqlCreateIndex: (
        id: string, db: string, table: string, name: string, colsCSV: string, unique: boolean
    ): Promise<void> => app().MysqlCreateIndex(id, db, table, name, colsCSV, unique),
    mysqlDropIndex: (id: string, db: string, table: string, name: string): Promise<void> =>
        app().MysqlDropIndex(id, db, table, name),
    mysqlUsers: (id: string): Promise<Record<string, any>[]> => app().MysqlUsers(id),
    mysqlGrants: (id: string, user: string, host: string): Promise<string> =>
        app().MysqlGrants(id, user, host),
    mysqlStatus: (id: string): Promise<Record<string, any>> => app().MysqlStatus(id),
    mysqlVariables: (id: string): Promise<Record<string, any>> => app().MysqlVariables(id),
    mysqlProcessList: (id: string): Promise<Record<string, any>[]> => app().MysqlProcessList(id),
    mysqlSlowLog: (id: string, limit: number): Promise<Record<string, any>[]> =>
        app().MysqlSlowLog(id, limit),
    mysqlSchema: (id: string, db: string): Promise<Record<string, any>> => app().MysqlSchema(id, db),
    mysqlExportJSON: (
        id: string, db: string, source: string, table: string, sqlText: string, limit: number
    ): Promise<string> => app().MysqlExportJSON(id, db, source, table, sqlText, limit),
    mysqlImportJSON: (id: string, db: string, table: string, content: string): Promise<string> =>
        app().MysqlImportJSON(id, db, table, content),
    mysqlExportToFileEx: (
        id: string, db: string, mode: string, source: string, table: string, sqlText: string, limit: number
    ): Promise<string> => app().MysqlExportToFileEx(id, db, mode, source, table, sqlText, limit),
    mysqlImportFromFileEx: (id: string, db: string, mode: string, table: string): Promise<string> =>
        app().MysqlImportFromFileEx(id, db, mode, table),
    mysqlQueryCSV: (id: string, db: string, sqlText: string, limit: number): Promise<string> =>
        app().MysqlQueryCSV(id, db, sqlText, limit),
    mysqlBackup: (id: string, db: string): Promise<string> => app().MysqlBackup(id, db),
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

    // MongoDB
    mongoConnect: (id: string): Promise<boolean> => app().MongoConnect(id),
    mongoClose: (id: string): Promise<void> => app().MongoClose(id),
    mongoParseURI: (uri: string): Promise<MongoURIInfo> => app().MongoParseURI(uri),
    mongoTestConnection: (cfg: ServerConfig): Promise<MongoHealthInfo> => app().MongoTestConnection(cfg),
    mongoHealthCheck: (id: string): Promise<MongoHealthInfo> => app().MongoHealthCheck(id),
    mongoServerStatus: (id: string): Promise<MongoServerStatus> => app().MongoServerStatus(id),
    mongoClientStats: (id: string): Promise<Record<string, any>> => app().MongoClientStats(id),
    mongoCurrentOps: (id: string): Promise<string[]> => app().MongoCurrentOps(id),

    mongoDatabases: (id: string): Promise<MongoDatabaseInfo[]> => app().MongoDatabases(id),
    mongoCollections: (id: string, db: string): Promise<MongoCollectionInfo[]> => app().MongoCollections(id, db),
    mongoCreateDatabase: (id: string, db: string, firstCollection: string): Promise<void> =>
        app().MongoCreateDatabase(id, db, firstCollection),
    mongoDropDatabase: (id: string, db: string): Promise<void> => app().MongoDropDatabase(id, db),
    mongoCreateCollection: (id: string, db: string, coll: string): Promise<void> =>
        app().MongoCreateCollection(id, db, coll),
    mongoDropCollection: (id: string, db: string, coll: string): Promise<void> =>
        app().MongoDropCollection(id, db, coll),
    mongoRenameCollection: (id: string, db: string, coll: string, newName: string): Promise<void> =>
        app().MongoRenameCollection(id, db, coll, newName),
    mongoCollectionStats: (id: string, db: string, coll: string): Promise<MongoCollectionStats> =>
        app().MongoCollectionStats(id, db, coll),

    mongoInferSchema: (id: string, db: string, coll: string, sampleSize: number): Promise<MongoFieldInfo[]> =>
        app().MongoInferSchema(id, db, coll, sampleSize),
    mongoGetValidator: (id: string, db: string, coll: string): Promise<MongoValidatorInfo> =>
        app().MongoGetValidator(id, db, coll),
    mongoSetValidator: (
        id: string, db: string, coll: string, validatorJSON: string, level: string, action: string
    ): Promise<void> => app().MongoSetValidator(id, db, coll, validatorJSON, level, action),
    mongoValidateDocument: (
        id: string, db: string, coll: string, docJSON: string
    ): Promise<MongoValidationResult> => app().MongoValidateDocument(id, db, coll, docJSON),

    mongoFind: (id: string, spec: MongoQuerySpec): Promise<MongoFindResult> => app().MongoFind(id, spec),
    mongoCountDocuments: (id: string, db: string, coll: string, filterJSON: string): Promise<number> =>
        app().MongoCountDocuments(id, db, coll, filterJSON),
    mongoDistinct: (id: string, db: string, coll: string, field: string, filterJSON: string): Promise<string[]> =>
        app().MongoDistinct(id, db, coll, field, filterJSON),
    mongoExplain: (id: string, spec: MongoQuerySpec, verbosity: string): Promise<string> =>
        app().MongoExplain(id, spec, verbosity),

    mongoInsertOne: (id: string, db: string, coll: string, docJSON: string): Promise<string> =>
        app().MongoInsertOne(id, db, coll, docJSON),
    mongoInsertMany: (
        id: string, db: string, coll: string, docsJSON: string, ordered: boolean
    ): Promise<Record<string, any>> => app().MongoInsertMany(id, db, coll, docsJSON, ordered),
    mongoUpdateOne: (
        id: string, db: string, coll: string, filterJSON: string, updateJSON: string, upsert: boolean
    ): Promise<Record<string, any>> => app().MongoUpdateOne(id, db, coll, filterJSON, updateJSON, upsert),
    mongoUpdateMany: (
        id: string, db: string, coll: string, filterJSON: string, updateJSON: string, upsert: boolean
    ): Promise<Record<string, any>> => app().MongoUpdateMany(id, db, coll, filterJSON, updateJSON, upsert),
    mongoReplaceOne: (
        id: string, db: string, coll: string, filterJSON: string, docJSON: string, upsert: boolean
    ): Promise<Record<string, any>> => app().MongoReplaceOne(id, db, coll, filterJSON, docJSON, upsert),
    mongoDeleteOne: (id: string, db: string, coll: string, filterJSON: string): Promise<number> =>
        app().MongoDeleteOne(id, db, coll, filterJSON),
    mongoDeleteMany: (id: string, db: string, coll: string, filterJSON: string): Promise<number> =>
        app().MongoDeleteMany(id, db, coll, filterJSON),
    mongoFindOneAndUpdate: (
        id: string, db: string, coll: string, filterJSON: string, updateJSON: string, returnNew: boolean
    ): Promise<string> => app().MongoFindOneAndUpdate(id, db, coll, filterJSON, updateJSON, returnNew),

    mongoBulkWrite: (
        id: string, db: string, coll: string, ops: MongoBulkOp[], ordered: boolean
    ): Promise<MongoBulkResult> => app().MongoBulkWrite(id, db, coll, ops, ordered),

    mongoAggregate: (
        id: string, db: string, coll: string, pipelineJSON: string, allowDiskUse: boolean, maxTimeMS: number
    ): Promise<MongoAggregateResult> => app().MongoAggregate(id, db, coll, pipelineJSON, allowDiskUse, maxTimeMS),
    mongoAggregateExplain: (id: string, db: string, coll: string, pipelineJSON: string): Promise<string> =>
        app().MongoAggregateExplain(id, db, coll, pipelineJSON),
    mongoRunCommand: (id: string, db: string, commandJSON: string): Promise<string> =>
        app().MongoRunCommand(id, db, commandJSON),

    mongoIndexes: (id: string, db: string, coll: string): Promise<MongoIndexInfo[]> =>
        app().MongoIndexes(id, db, coll),
    mongoCreateIndex: (
        id: string, db: string, coll: string, keysJSON: string, name: string,
        unique: boolean, sparse: boolean, expireAfterSeconds: number
    ): Promise<string> => app().MongoCreateIndex(id, db, coll, keysJSON, name, unique, sparse, expireAfterSeconds),
    mongoDropIndex: (id: string, db: string, coll: string, name: string): Promise<void> =>
        app().MongoDropIndex(id, db, coll, name),
    mongoIndexStats: (id: string, db: string, coll: string): Promise<string[]> =>
        app().MongoIndexStats(id, db, coll),

    mongoTransaction: (id: string, ops: MongoTxOp[]): Promise<MongoTxResult> => app().MongoTransaction(id, ops),

    mongoWatch: (
        id: string, scope: string, db: string, coll: string, pipelineJSON: string, fullDocument: string
    ): Promise<string> => app().MongoWatch(id, scope, db, coll, pipelineJSON, fullDocument),
    mongoUnwatch: (id: string, watchKey: string): Promise<void> => app().MongoUnwatch(id, watchKey),
    mongoWatchList: (id: string): Promise<string[]> => app().MongoWatchList(id),

    // API 调试工具
    apiRequest: (req: ApiRequest): Promise<ApiResponse> => app().ApiRequest(req),

    // WebSocket
    wsConnect: (url: string, headers: ApiHeader[], insecureTLS: boolean, auth?: ApiAuth, protocols?: string[]): Promise<WsConnectResult> =>
        app().WsConnect({ url, headers, insecureTLS, auth, protocols }),
    wsSend: (id: string, message: string): Promise<void> => app().WsSend(id, message),
    wsClose: (id: string): Promise<void> => app().WsClose(id),

    // SQLite（本地文件）
    sqliteOpenFile: (): Promise<string> => app().SqliteOpenFile(),
    sqliteConnect: (id: string, path: string): Promise<boolean> => app().SqliteConnect(id, path),
    sqliteClose: (id: string): Promise<void> => app().SqliteClose(id),
    sqliteInfo: (id: string): Promise<SqliteInfo> => app().SqliteInfo(id),
    sqliteTables: (id: string): Promise<SqliteTableInfo[]> => app().SqliteTables(id),
    sqliteDescribe: (id: string, table: string): Promise<SqliteColumnInfo[]> => app().SqliteDescribe(id, table),
    sqliteSelect: (id: string, table: string, limit: number, offset: number): Promise<SqliteQueryResult> =>
        app().SqliteSelect(id, table, limit, offset),
    sqliteCount: (id: string, table: string): Promise<number> => app().SqliteCount(id, table),
    sqliteIndexes: (id: string, table: string): Promise<SqliteIndexInfo[]> => app().SqliteIndexes(id, table),
    sqliteRun: (id: string, sqlText: string): Promise<SqliteQueryResult> => app().SqliteRun(id, sqlText),
    sqliteSchema: (id: string): Promise<SqliteSchema> => app().SqliteSchema(id),
    sqliteInsert: (id: string, table: string, columns: string[], values: any[]): Promise<number> =>
        app().SqliteInsert(id, table, columns, values),
    sqliteUpdate: (
        id: string,
        table: string,
        setCols: string[],
        setVals: any[],
        whereCols: string[],
        whereVals: any[]
    ): Promise<number> => app().SqliteUpdate(id, table, setCols, setVals, whereCols, whereVals),
    sqliteDelete: (id: string, table: string, whereCols: string[], whereVals: any[]): Promise<number> =>
        app().SqliteDelete(id, table, whereCols, whereVals),
    sqliteCreateTable: (id: string, table: string, defs: string): Promise<void> =>
        app().SqliteCreateTable(id, table, defs),
    sqliteDropTable: (id: string, table: string): Promise<void> => app().SqliteDropTable(id, table),
    sqliteCreateIndex: (id: string, table: string, name: string, colsCSV: string, unique: boolean): Promise<void> =>
        app().SqliteCreateIndex(id, table, name, colsCSV, unique),
    sqliteDropIndex: (id: string, table: string, name: string): Promise<void> =>
        app().SqliteDropIndex(id, table, name),
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
        const s = subscribers.get(event)
        if (s) {
            s.delete(handler)
            if (s.size === 0) {
                subscribers.delete(event)
                boundEvents.delete(event)
                if (w.runtime?.EventsOff) {
                    try {
                        w.runtime.EventsOff(event)
                    } catch {
                        /* ignore */
                    }
                }
            }
        }
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
