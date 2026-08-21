import { Events } from '@wailsio/runtime'
import * as SystemService from '../bindings/terminal/services/systemservice'
import * as SshService from '../bindings/terminal/services/sshservice'
import * as SftpService from '../bindings/terminal/services/sftpservice'
import * as RedisService from '../bindings/terminal/services/redisservice'
import * as MysqlService from '../bindings/terminal/services/mysqlservice'
import * as MongoService from '../bindings/terminal/services/mongoservice'
import * as SqliteService from '../bindings/terminal/services/sqliteservice'
import * as MqttService from '../bindings/terminal/services/mqttservice'
import * as ApiService from '../bindings/terminal/services/apiservice'
import * as AgentService from '../bindings/terminal/services/agentservice'

import type {
    DirListing,
    MysqlQueryResult,
    RedisKeysResult,
    RedisValue,
    RedisPipelineResult,
    RedisTransactionResult,
    RedisQueueItem,
    RedisSlowLogEntry,
    RedisMonitorInfo,
    ServerConfig,
    SessionInfo,
    Transfer,
    ApiRequest,
    ApiResponse,
    MongoURIInfo,
    MongoQuerySpec,
    MongoFindResult,
    MongoValidatorInfo,
    MongoBulkOp,
    MongoBulkResult,
    MongoTxOp,
    MongoDatabaseInfo,
    MongoCollectionInfo,
    MongoCollectionStats,
    MongoHealthInfo,
    MongoServerStatus,
    MongoFieldInfo,
    MongoValidationResult,
    MongoIndexInfo,
    MqttSubscription,
    SqliteTableInfo,
    SqliteColumnInfo,
    SqliteIndexInfo,
    ServerGroup,
    SSHDashboardInfo,
    SSHProcessInfo,
    SSHServiceInfo,
    SSHCronItem,
    SSHDockerContainer,
    SSHDockerImage,
    AppSettings,
    AiMessage,
    AgentSessionItem,
    AgentJobItem,
    AgentJobOutputItem,
    AgentSubagentItem,
    AgentAuditLogItem,
    AgentSkillItem,
    AgentPlan,
    AgentPlanStep,
    AgentApprovalRequest,
    AgentAskRequest,
    FrontendMessage,
} from './types'

type AnyFn = (...args: any[]) => void

export const API = {
    // 设置持久化
    getAppSettings: (): Promise<AppSettings> => SystemService.GetAppSettings() as any,
    saveAppSettings: (settings: AppSettings): Promise<AppSettings> => SystemService.SaveAppSettings(settings as any) as any,

    // 服务器配置
    listServers: (): Promise<ServerConfig[]> => SystemService.ListServers().then(r => r || []) as any,
    saveServer: (cfg: ServerConfig): Promise<ServerConfig> => SystemService.SaveServer(cfg as any) as any,
    deleteServer: (id: string): Promise<void> => SystemService.DeleteServer(id) as any,
    selectPrivateKey: (): Promise<string> => SystemService.SelectPrivateKey(),
    selectCertFile: (): Promise<string> => (SystemService as any).SelectCertFile?.() || SystemService.SelectPrivateKey(),

    // 分组管理
    listGroups: (): Promise<ServerGroup[]> => SystemService.ListGroups().then(r => r || []) as any,
    saveGroup: (g: ServerGroup): Promise<ServerGroup> => SystemService.SaveGroup(g as any) as any,
    deleteGroup: (id: string): Promise<void> => SystemService.DeleteGroup(id),
    moveServerToGroup: (serverId: string, groupId: string): Promise<void> =>
        SystemService.MoveServerToGroup(serverId, groupId),

    // 会话
    listSessions: (): Promise<SessionInfo[]> => SshService.ListSessions().then(r => (r || []) as any),
    connect: (serverId: string, cols: number, rows: number): Promise<SessionInfo> =>
        SshService.Connect(serverId, cols, rows) as any,
    connectWithConfig: (cfg: ServerConfig, cols: number, rows: number): Promise<SessionInfo> =>
        SshService.ConnectWithConfig(cfg as any, cols, rows) as any,
    disconnect: (sessionId: string): Promise<void> => SshService.Disconnect(sessionId),
    sendInput: (sessionId: string, data: string): Promise<void> => SshService.SendInput(sessionId, data),
    resizeTerminal: (sessionId: string, cols: number, rows: number): Promise<void> =>
        SshService.ResizeTerminal(sessionId, cols, rows),
    resize: (sessionId: string, cols: number, rows: number): Promise<void> =>
        SshService.ResizeTerminal(sessionId, cols, rows),

    // SFTP
    listDir: (sessionId: string, dir: string): Promise<DirListing> => SftpService.ListDir(sessionId, dir) as any,
    homeDir: (sessionId: string): Promise<string> => SftpService.HomeDir(sessionId),
    makeDir: (sessionId: string, parent: string, name: string): Promise<void> =>
        SftpService.MakeDir(sessionId, parent, name),
    removePath: (sessionId: string, target: string): Promise<void> => SftpService.RemovePath(sessionId, target),
    removePaths: (sessionId: string, targets: string[]): Promise<void> => SftpService.RemovePaths(sessionId, targets),
    renamePath: (sessionId: string, target: string, newName: string): Promise<void> =>
        SftpService.RenamePath(sessionId, target, newName),
    rename: (sessionId: string, target: string, newName: string): Promise<void> =>
        SftpService.RenamePath(sessionId, target, newName),
    readRemoteFile: (sessionId: string, remotePath: string): Promise<string> =>
        SftpService.ReadRemoteFile(sessionId, remotePath),
    writeRemoteFile: (sessionId: string, remotePath: string, content: string): Promise<void> =>
        SftpService.WriteRemoteFile(sessionId, remotePath, content),

    // 本地文件与传输
    chooseLocalFiles: (): Promise<string[]> => SftpService.ChooseLocalFiles().then(r => r || []),
    chooseLocalFolder: (): Promise<string> => SftpService.ChooseLocalFolder(),
    saveMysqlFile: (defaultName: string): Promise<string> => SftpService.SaveMysqlFile(defaultName),
    readLocalFile: (filePath: string): Promise<string> => SftpService.ReadLocalFile(filePath),
    writeLocalFile: (filePath: string, content: string): Promise<void> => SftpService.WriteLocalFile(filePath, content),
    readLocalFileBase64: (filePath: string): Promise<string> => SftpService.ReadLocalFileBase64(filePath),
    uploadPaths: (sessionId: string, remoteDir: string, localPaths: string[]): Promise<void> =>
        SftpService.UploadPaths(sessionId, remoteDir, localPaths),
    uploadData: (sessionId: string, remoteDir: string, name: string, base64Data: string): Promise<void> =>
        SftpService.UploadData(sessionId, remoteDir, name, base64Data),
    downloadPaths: (sessionId: string, remotePaths: string[]): Promise<void> =>
        SftpService.DownloadPaths(sessionId, remotePaths),
    downloadTo: (sessionId: string, remotePaths: string[], localDir: string): Promise<void> =>
        SftpService.DownloadTo(sessionId, remotePaths, localDir),
    listTransfers: (): Promise<Transfer[]> => SftpService.ListTransfers().then(r => (r || []) as any),
    cancelTransfer: (id: string): Promise<void> => SftpService.CancelTransfer(id),
    clearFinishedTransfers: (): Promise<void> => SftpService.ClearFinishedTransfers(),

    // Redis
    redisConnect: (id: string): Promise<boolean> => RedisService.RedisConnect(id),
    redisTestConnection: (cfg: ServerConfig): Promise<{ connected: boolean; pingMs: number }> =>
        (RedisService as any).RedisTestConnection?.(cfg as any) || Promise.resolve({ connected: true, pingMs: 0 }),
    redisClose: (id: string): Promise<void> => RedisService.RedisClose(id),
    redisSelectDB: (id: string, db: number): Promise<void> => RedisService.RedisSelectDB(id, db),
    redisKeys: (id: string, pattern: string, cursor: string): Promise<RedisKeysResult> =>
        RedisService.RedisKeys(id, pattern, cursor) as any,
    redisGet: (id: string, key: string): Promise<RedisValue> => RedisService.RedisGet(id, key) as any,
    redisSet: (id: string, key: string, typ: string, val: string, ttl: number): Promise<void> =>
        RedisService.RedisSet(id, key, typ, val, ttl),
    redisDelete: (id: string, key: string): Promise<void> => RedisService.RedisDelete(id, key),
    redisExpire: (id: string, key: string, ttl: number): Promise<void> => RedisService.RedisExpire(id, key, ttl),
    redisRaw: (id: string, cmd: string): Promise<Record<string, any>> => RedisService.RedisRaw(id, cmd).then(r => (r || {}) as any),
    redisDBSize: (id: string): Promise<number> => RedisService.RedisDBSize(id),
    redisModeInfo: (id: string): Promise<Record<string, any>> => RedisService.RedisModeInfo(id).then(r => (r || {}) as any),
    redisStringAppend: (id: string, key: string, value: string): Promise<number> =>
        RedisService.RedisStringAppend(id, key, value),
    redisHashFieldSet: (id: string, key: string, field: string, value: string): Promise<void> =>
        RedisService.RedisHashFieldSet(id, key, field, value),
    redisHashFieldGet: (id: string, key: string, field: string): Promise<string> =>
        RedisService.RedisHashFieldGet(id, key, field),
    redisHashFieldDel: (id: string, key: string, fields: string[]): Promise<number> =>
        RedisService.RedisHashFieldDel(id, key, fields),
    redisListPush: (id: string, key: string, value: string, left: boolean): Promise<number> =>
        RedisService.RedisListPush(id, key, value, left),
    redisListPop: (id: string, key: string, left: boolean): Promise<string> =>
        RedisService.RedisListPop(id, key, left),
    redisSetAdd: (id: string, key: string, members: string[]): Promise<number> =>
        RedisService.RedisSetAdd(id, key, members),
    redisSetRem: (id: string, key: string, members: string[]): Promise<number> =>
        RedisService.RedisSetRem(id, key, members),
    redisZSetAdd: (id: string, key: string, member: string, score: number): Promise<number> =>
        RedisService.RedisZSetAdd(id, key, member, score),
    redisZSetRem: (id: string, key: string, members: string[]): Promise<number> =>
        RedisService.RedisZSetRem(id, key, members),
    redisPipeline: (id: string, commands: string[]): Promise<RedisPipelineResult> =>
        RedisService.RedisPipeline(id, commands) as any,
    redisTransaction: (id: string, watch: string[], commands: string[]): Promise<RedisTransactionResult> =>
        RedisService.RedisTransaction(id, watch, commands) as any,
    redisPublish: (id: string, channel: string, message: string): Promise<number> =>
        RedisService.RedisPublish(id, channel, message),
    redisSubscribe: (id: string, channel: string): Promise<void> => RedisService.RedisSubscribe(id, channel),
    redisPSubscribe: (id: string, pattern: string): Promise<void> => RedisService.RedisPSubscribe(id, pattern),
    redisUnsubscribe: (id: string, channel: string): Promise<void> => RedisService.RedisUnsubscribe(id, channel),
    redisSubscriptions: (id: string): Promise<string[]> => RedisService.RedisSubscriptions(id).then(r => r || []),
    redisKeyspaceNotify: (id: string, db: number, event: string): Promise<void> =>
        RedisService.RedisKeyspaceNotify(id, db, event),
    redisQueueEnqueue: (id: string, queue: string, payload: string, mode: string): Promise<string> =>
        RedisService.RedisQueueEnqueue(id, queue, payload, mode),
    redisQueueDequeue: (id: string, queue: string, mode: string, timeout: number): Promise<RedisQueueItem | null> =>
        RedisService.RedisQueueDequeue(id, queue, mode, timeout) as any,
    redisQueueLength: (id: string, queue: string, mode: string): Promise<number> =>
        RedisService.RedisQueueLength(id, queue, mode),
    redisSlowLog: (id: string, count: number): Promise<RedisSlowLogEntry[]> =>
        RedisService.RedisSlowLog(id, count).then(r => (r || []) as any),
    redisInfo: (id: string, section: string): Promise<string> => RedisService.RedisInfo(id, section),
    redisMonitor: (id: string): Promise<RedisMonitorInfo | null> => RedisService.RedisMonitor(id) as any,

    // MySQL
    mysqlConnect: (serverID: string): Promise<boolean> => MysqlService.MysqlConnect(serverID),
    mysqlClose: (serverID: string): Promise<void> => MysqlService.MysqlClose(serverID),
    mysqlDatabases: (serverID: string): Promise<string[]> => MysqlService.MysqlDatabases(serverID).then(r => r || []),
    mysqlTables: (serverID: string, dbName: string): Promise<string[]> =>
        MysqlService.MysqlTables(serverID, dbName).then(r => r || []),
    mysqlSelect: (serverID: string, dbName: string, table: string, limit: number, offset: number): Promise<MysqlQueryResult> =>
        MysqlService.MysqlSelect(serverID, dbName, table, limit, offset) as any,
    mysqlCount: (serverID: string, dbName: string, table: string): Promise<number> =>
        MysqlService.MysqlCount(serverID, dbName, table),
    mysqlDescribe: (serverID: string, dbName: string, table: string): Promise<MysqlQueryResult> =>
        MysqlService.MysqlDescribe(serverID, dbName, table) as any,
    mysqlRun: (serverID: string, dbName: string, sqlText: string): Promise<MysqlQueryResult> =>
        MysqlService.MysqlRun(serverID, dbName, sqlText) as any,
    mysqlInsert: (serverID: string, dbName: string, table: string, columns: string[], values: any[]): Promise<number> =>
        MysqlService.MysqlInsert(serverID, dbName, table, columns, values),
    mysqlUpdate: (
        serverID: string,
        dbName: string,
        table: string,
        setCols: string[],
        setVals: any[],
        whereCols: string[],
        whereVals: any[]
    ): Promise<number> => MysqlService.MysqlUpdate(serverID, dbName, table, setCols, setVals, whereCols, whereVals),
    mysqlDelete: (serverID: string, dbName: string, table: string, whereCols: string[], whereVals: any[]): Promise<number> =>
        MysqlService.MysqlDelete(serverID, dbName, table, whereCols, whereVals),
    mysqlExport: (
        serverID: string,
        dbName: string,
        mode: string,
        source: string,
        table: string,
        sqlText: string,
        limit: number
    ): Promise<string> => MysqlService.MysqlExport(serverID, dbName, mode, source, table, sqlText, limit),
    mysqlExportToFile: (
        serverID: string,
        dbName: string,
        mode: string,
        source: string,
        table: string,
        sqlText: string,
        limit: number
    ): Promise<string> => MysqlService.MysqlExportToFile(serverID, dbName, mode, source, table, sqlText, limit),
    mysqlImport: (serverID: string, dbName: string, mode: string, table: string, content: string): Promise<string> =>
        MysqlService.MysqlImport(serverID, dbName, mode, table, content),
    mysqlImportFromFile: (serverID: string, dbName: string, mode: string, table: string): Promise<string> =>
        MysqlService.MysqlImportFromFile(serverID, dbName, mode, table),
    mysqlConnectEx: (serverID: string): Promise<boolean> => MysqlService.MysqlConnect(serverID),
    mysqlTestConnection: (cfg: ServerConfig): Promise<{ connected: boolean; pingMs: number }> =>
        (MysqlService as any).MysqlTestConnection?.(cfg as any) || Promise.resolve({ connected: true, pingMs: 0 }),
    mysqlCloseEx: (serverID: string): Promise<void> => MysqlService.MysqlClose(serverID),
    mysqlCreateDatabase: (serverID: string, name: string, charset: string): Promise<void> =>
        MysqlService.MysqlCreateDatabase(serverID, name, charset),
    mysqlDropDatabase: (serverID: string, name: string): Promise<void> =>
        MysqlService.MysqlDropDatabase(serverID, name),
    mysqlCreateTable: (serverID: string, dbName: string, table: string, defs: string): Promise<void> =>
        MysqlService.MysqlCreateTable(serverID, dbName, table, defs),
    mysqlDropTable: (serverID: string, dbName: string, table: string): Promise<void> =>
        MysqlService.MysqlDropTable(serverID, dbName, table),
    mysqlTruncateTable: (serverID: string, dbName: string, table: string): Promise<void> =>
        MysqlService.MysqlTruncateTable(serverID, dbName, table),
    mysqlTableStatus: (serverID: string, dbName: string): Promise<Array<Record<string, any>>> =>
        MysqlService.MysqlTableStatus(serverID, dbName).then(r => (r || []) as any),
    mysqlIndexes: (serverID: string, dbName: string, table: string): Promise<Array<Record<string, any>>> =>
        MysqlService.MysqlIndexes(serverID, dbName, table).then(r => (r || []) as any),
    mysqlCreateIndex: (
        serverID: string,
        dbName: string,
        table: string,
        name: string,
        colsCSV: string,
        unique: boolean
    ): Promise<void> => MysqlService.MysqlCreateIndex(serverID, dbName, table, name, colsCSV, unique),
    mysqlDropIndex: (serverID: string, dbName: string, table: string, name: string): Promise<void> =>
        MysqlService.MysqlDropIndex(serverID, dbName, table, name),
    mysqlUsers: (serverID: string): Promise<Array<Record<string, any>>> =>
        MysqlService.MysqlUsers(serverID).then(r => (r || []) as any),
    mysqlGrants: (serverID: string, user: string, host: string): Promise<string> =>
        MysqlService.MysqlGrants(serverID, user, host),
    mysqlCreateUser: (serverID: string, user: string, host: string, password: string, authPlugin: string, lock: boolean): Promise<void> =>
        MysqlService.MysqlCreateUser(serverID, user, host, password, authPlugin, lock),
    mysqlDropUser: (serverID: string, user: string, host: string): Promise<void> =>
        MysqlService.MysqlDropUser(serverID, user, host),
    mysqlChangeUserPassword: (serverID: string, user: string, host: string, newPassword: string): Promise<void> =>
        MysqlService.MysqlChangeUserPassword(serverID, user, host, newPassword),
    mysqlToggleUserLock: (serverID: string, user: string, host: string, lock: boolean): Promise<void> =>
        MysqlService.MysqlToggleUserLock(serverID, user, host, lock),
    mysqlGrantPrivileges: (serverID: string, user: string, host: string, dbName: string, table: string, privs: string[], withGrantOption: boolean): Promise<void> =>
        MysqlService.MysqlGrantPrivileges(serverID, user, host, dbName, table, privs, withGrantOption),
    mysqlRevokePrivileges: (serverID: string, user: string, host: string, dbName: string, table: string, privs: string[]): Promise<void> =>
        MysqlService.MysqlRevokePrivileges(serverID, user, host, dbName, table, privs),
    mysqlRevokeAllPrivileges: (serverID: string, user: string, host: string): Promise<void> =>
        MysqlService.MysqlRevokeAllPrivileges(serverID, user, host),
    mysqlStatus: (serverID: string): Promise<Record<string, any>> => MysqlService.MysqlStatus(serverID).then(r => (r || {}) as any),
    mysqlVariables: (serverID: string): Promise<Record<string, any>> => MysqlService.MysqlVariables(serverID).then(r => (r || {}) as any),
    mysqlProcessList: (serverID: string): Promise<Array<Record<string, any>>> =>
        MysqlService.MysqlProcessList(serverID).then(r => (r || []) as any),
    mysqlSlowLog: (serverID: string, limit: number): Promise<Array<Record<string, any>>> =>
        MysqlService.MysqlSlowLog(serverID, limit).then(r => (r || []) as any),
    mysqlSchema: (serverID: string, dbName: string): Promise<Record<string, any>> =>
        MysqlService.MysqlSchema(serverID, dbName).then(r => (r || {}) as any),
    mysqlExportJSON: (
        serverID: string,
        dbName: string,
        source: string,
        table: string,
        sqlText: string,
        limit: number
    ): Promise<string> => MysqlService.MysqlExportJSON(serverID, dbName, source, table, sqlText, limit),
    mysqlImportJSON: (serverID: string, dbName: string, table: string, content: string): Promise<string> =>
        MysqlService.MysqlImportJSON(serverID, dbName, table, content),
    mysqlExportToFileEx: (
        serverID: string,
        dbName: string,
        mode: string,
        source: string,
        table: string,
        sqlText: string,
        limit: number
    ): Promise<string> => MysqlService.MysqlExportToFile(serverID, dbName, mode, source, table, sqlText, limit),
    mysqlImportFromFileEx: (serverID: string, dbName: string, mode: string, table: string): Promise<string> =>
        MysqlService.MysqlImportFromFile(serverID, dbName, mode, table),
    mysqlQueryCSV: (serverID: string, dbName: string, sqlText: string, limit: number): Promise<string> =>
        MysqlService.MysqlQueryCSV(serverID, dbName, sqlText, limit),
    mysqlBackup: (serverID: string, dbName: string): Promise<string> => MysqlService.MysqlBackup(serverID, dbName),
    mysqlBackupToFile: (serverID: string, dbName: string): Promise<string> =>
        MysqlService.MysqlBackupToFile(serverID, dbName),

    // MQTT
    mqttConnect: (id: string): Promise<boolean> => MqttService.MqttConnect(id),
    mqttClose: (id: string): Promise<void> => MqttService.MqttClose(id),
    mqttPublish: (id: string, topic: string, payload: string, qos: number, retained: boolean): Promise<void> =>
        MqttService.MqttPublish(id, topic, payload, qos, retained),
    mqttSubscribe: (id: string, topic: string, qos: number): Promise<void> =>
        MqttService.MqttSubscribe(id, topic, qos),
    mqttUnsubscribe: (id: string, topic: string): Promise<void> => MqttService.MqttUnsubscribe(id, topic),
    mqttSubscriptions: (id: string): Promise<MqttSubscription[]> =>
        MqttService.MqttSubscriptions(id).then(r => (r || []) as any),
    mqttTestConnection: (cfg: ServerConfig): Promise<{ connected: boolean; pingMs: number }> =>
        (MqttService as any).MqttTestConnection?.(cfg as any) || Promise.resolve({ connected: true, pingMs: 0 }),

    // API & WS
    apiRequest: (req: ApiRequest): Promise<ApiResponse> => ApiService.ApiRequest(req as any) as any,
    wsConnect: (
        urlOrReq: any,
        headers?: any[],
        insecureTLS?: boolean,
        auth?: any,
        protocols?: string[]
    ): Promise<any> => {
        if (typeof urlOrReq === 'string') {
            return ApiService.WsConnect({
                url: urlOrReq,
                headers: (headers || []).map((h: any) => ({ name: h.name, value: h.value, enabled: !!h.enabled })),
                insecureTLS: !!insecureTLS,
                auth: auth || { type: 'none' },
                protocols: protocols || [],
            } as any)
        }
        return ApiService.WsConnect(urlOrReq)
    },
    wsSend: (id: string, message: string): Promise<void> => ApiService.WsSend(id, message),
    wsClose: (id: string): Promise<void> => ApiService.WsClose(id),

    // MongoDB
    mongoConnect: (id: string): Promise<boolean> => MongoService.MongoConnect(id),
    mongoClose: (id: string): Promise<void> => MongoService.MongoClose(id),
    mongoParseURI: (uri: string): Promise<MongoURIInfo> => MongoService.MongoParseURI(uri) as any,
    mongoTestConnection: (cfg: ServerConfig): Promise<Record<string, any>> =>
        MongoService.MongoTestConnection(cfg as any).then(r => (r || {}) as any),
    mongoHealthCheck: (id: string): Promise<MongoHealthInfo | null> => MongoService.MongoHealthCheck(id) as any,
    mongoServerStatus: (id: string): Promise<MongoServerStatus | null> => MongoService.MongoServerStatus(id) as any,
    mongoClientStats: (id: string): Promise<Record<string, any>> => MongoService.MongoClientStats(id).then(r => (r || {}) as any),
    mongoCurrentOps: (id: string): Promise<string[]> => MongoService.MongoCurrentOps(id).then(r => r || []),
    mongoDatabases: (id: string): Promise<MongoDatabaseInfo[]> =>
        MongoService.MongoDatabases(id).then(r => (r || []) as any),
    mongoCollections: (id: string, dbName: string): Promise<MongoCollectionInfo[]> =>
        MongoService.MongoCollections(id, dbName).then(r => (r || []) as any),
    mongoCreateDatabase: (id: string, dbName: string, firstCollection: string): Promise<void> =>
        MongoService.MongoCreateDatabase(id, dbName, firstCollection),
    mongoDropDatabase: (id: string, dbName: string): Promise<void> => MongoService.MongoDropDatabase(id, dbName),
    mongoCreateCollection: (id: string, dbName: string, coll: string): Promise<void> =>
        MongoService.MongoCreateCollection(id, dbName, coll),
    mongoDropCollection: (id: string, dbName: string, coll: string): Promise<void> =>
        MongoService.MongoDropCollection(id, dbName, coll),
    mongoRenameCollection: (id: string, dbName: string, coll: string, newName: string): Promise<void> =>
        MongoService.MongoRenameCollection(id, dbName, coll, newName),
    mongoCollectionStats: (id: string, dbName: string, coll: string): Promise<MongoCollectionStats | null> =>
        MongoService.MongoCollectionStats(id, dbName, coll).then(r => (r || null) as any),
    mongoInferSchema: (id: string, dbName: string, coll: string, sampleSize: number): Promise<MongoFieldInfo[]> =>
        MongoService.MongoInferSchema(id, dbName, coll, sampleSize).then(r => (r || []) as any),
    mongoGetValidator: (id: string, dbName: string, coll: string): Promise<MongoValidatorInfo> =>
        MongoService.MongoGetValidator(id, dbName, coll) as any,
    mongoSetValidator: (
        id: string,
        dbName: string,
        coll: string,
        validatorJSON: string,
        level: string,
        action: string
    ): Promise<void> => MongoService.MongoSetValidator(id, dbName, coll, validatorJSON, level, action),
    mongoValidateDocument: (id: string, dbName: string, coll: string, docJSON: string): Promise<MongoValidationResult | null> =>
        MongoService.MongoValidateDocument(id, dbName, coll, docJSON) as any,
    mongoFind: (id: string, spec: MongoQuerySpec): Promise<MongoFindResult> =>
        MongoService.MongoFind(id, spec as any) as any,
    mongoCountDocuments: (id: string, dbName: string, coll: string, filterJSON: string): Promise<number> =>
        MongoService.MongoCountDocuments(id, dbName, coll, filterJSON),
    mongoDistinct: (id: string, dbName: string, coll: string, field: string, filterJSON: string): Promise<string[]> =>
        MongoService.MongoDistinct(id, dbName, coll, field, filterJSON).then(r => r || []),
    mongoExplain: (id: string, spec: MongoQuerySpec, verbosity: string): Promise<string> =>
        MongoService.MongoExplain(id, spec as any, verbosity),
    mongoInsertOne: (id: string, dbName: string, coll: string, docJSON: string): Promise<string> =>
        MongoService.MongoInsertOne(id, dbName, coll, docJSON),
    mongoInsertMany: (id: string, dbName: string, coll: string, docsJSON: string, ordered: boolean): Promise<Record<string, any>> =>
        MongoService.MongoInsertMany(id, dbName, coll, docsJSON, ordered).then(r => (r || {}) as any),
    mongoUpdateOne: (
        id: string,
        dbName: string,
        coll: string,
        filterJSON: string,
        updateJSON: string,
        upsert: boolean
    ): Promise<Record<string, any>> => MongoService.MongoUpdateOne(id, dbName, coll, filterJSON, updateJSON, upsert).then(r => (r || {}) as any),
    mongoUpdateMany: (
        id: string,
        dbName: string,
        coll: string,
        filterJSON: string,
        updateJSON: string,
        upsert: boolean
    ): Promise<Record<string, any>> => MongoService.MongoUpdateMany(id, dbName, coll, filterJSON, updateJSON, upsert).then(r => (r || {}) as any),
    mongoReplaceOne: (
        id: string,
        dbName: string,
        coll: string,
        filterJSON: string,
        docJSON: string,
        upsert: boolean
    ): Promise<Record<string, any>> => MongoService.MongoReplaceOne(id, dbName, coll, filterJSON, docJSON, upsert).then(r => (r || {}) as any),
    mongoDeleteOne: (id: string, dbName: string, coll: string, filterJSON: string): Promise<number> =>
        MongoService.MongoDeleteOne(id, dbName, coll, filterJSON),
    mongoDeleteMany: (id: string, dbName: string, coll: string, filterJSON: string): Promise<number> =>
        MongoService.MongoDeleteMany(id, dbName, coll, filterJSON),
    mongoFindOneAndUpdate: (
        id: string,
        dbName: string,
        coll: string,
        filterJSON: string,
        updateJSON: string,
        returnNew: boolean
    ): Promise<string> => MongoService.MongoFindOneAndUpdate(id, dbName, coll, filterJSON, updateJSON, returnNew),
    mongoBulkWrite: (id: string, dbName: string, coll: string, ops: MongoBulkOp[], ordered: boolean): Promise<Record<string, any>> =>
        MongoService.MongoBulkWrite(id, dbName, coll, ops as any, ordered).then(r => (r || {}) as any),
    mongoAggregate: (
        id: string,
        dbName: string,
        coll: string,
        pipelineJSON: string,
        allowDiskUse: boolean,
        maxTimeMS: number
    ): Promise<MongoFindResult> =>
        MongoService.MongoAggregate(id, dbName, coll, pipelineJSON, allowDiskUse, maxTimeMS) as any,
    mongoAggregateExplain: (id: string, dbName: string, coll: string, pipelineJSON: string): Promise<string> =>
        MongoService.MongoAggregateExplain(id, dbName, coll, pipelineJSON),
    mongoRunCommand: (id: string, dbName: string, commandJSON: string): Promise<string> =>
        MongoService.MongoRunCommand(id, dbName, commandJSON),
    mongoIndexes: (id: string, dbName: string, coll: string): Promise<MongoIndexInfo[]> =>
        MongoService.MongoIndexes(id, dbName, coll).then(r => (r || []) as any),
    mongoCreateIndex: (
        id: string,
        dbName: string,
        coll: string,
        keysJSON: string,
        name: string,
        unique: boolean,
        sparse: boolean,
        expireAfterSeconds: number
    ): Promise<string> =>
        MongoService.MongoCreateIndex(id, dbName, coll, keysJSON, name, unique, sparse, expireAfterSeconds),
    mongoDropIndex: (id: string, dbName: string, coll: string, name: string): Promise<void> =>
        MongoService.MongoDropIndex(id, dbName, coll, name),
    mongoIndexStats: (id: string, dbName: string, coll: string): Promise<string[]> =>
        MongoService.MongoIndexStats(id, dbName, coll).then(r => r || []),
    mongoTransaction: (id: string, ops: MongoTxOp[]): Promise<Record<string, any>> =>
        MongoService.MongoTransaction(id, ops as any).then(r => (r || {}) as any),
    mongoWatch: (
        id: string,
        scope: string,
        dbName: string,
        coll: string,
        pipelineJSON: string,
        fullDocument: string
    ): Promise<string> => MongoService.MongoWatch(id, scope, dbName, coll, pipelineJSON, fullDocument),
    mongoUnwatch: (id: string, watchKey: string): Promise<void> => MongoService.MongoUnwatch(id, watchKey),
    mongoWatchList: (id: string): Promise<string[]> => MongoService.MongoWatchList(id).then(r => r || []),

    // SQLite
    sqliteOpenFile: (): Promise<string> => SqliteService.SqliteOpenFile(),
    sqliteConnect: (id: string, filePath: string): Promise<boolean> => SqliteService.SqliteConnect(id, filePath),
    sqliteClose: (id: string): Promise<void> => SqliteService.SqliteClose(id),
    sqliteInfo: (id: string): Promise<Record<string, any>> => SqliteService.SqliteInfo(id).then(r => (r || {}) as any),
    sqliteTables: (id: string): Promise<SqliteTableInfo[]> =>
        SqliteService.SqliteTables(id).then(r => (r || []) as any),
    sqliteDescribe: (id: string, table: string): Promise<SqliteColumnInfo[]> =>
        SqliteService.SqliteDescribe(id, table).then(r => (r || []) as any),
    sqliteSelect: (id: string, table: string, limit: number, offset: number): Promise<Record<string, any>> =>
        SqliteService.SqliteSelect(id, table, limit, offset).then(r => (r || {}) as any),
    sqliteCount: (id: string, table: string): Promise<number> => SqliteService.SqliteCount(id, table),
    sqliteIndexes: (id: string, table: string): Promise<SqliteIndexInfo[]> =>
        SqliteService.SqliteIndexes(id, table).then(r => (r || []) as any),
    sqliteRun: (id: string, sqlText: string): Promise<Record<string, any>> => SqliteService.SqliteRun(id, sqlText).then(r => (r || {}) as any),
    sqliteSchema: (id: string): Promise<Record<string, any>> => SqliteService.SqliteSchema(id).then(r => (r || {}) as any),

    // SSH 扩展运维
    sshDashboardStats: (sessionId: string): Promise<SSHDashboardInfo> =>
        SshService.SSHDashboardStats(sessionId) as any,
    sshProcessList: (sessionId: string): Promise<SSHProcessInfo[]> =>
        SshService.SSHProcessList(sessionId).then(r => (r || []) as any),
    sshKillProcess: (sessionId: string, pid: number): Promise<void> => SshService.SSHKillProcess(sessionId, pid),
    sshServiceList: (sessionId: string): Promise<SSHServiceInfo[]> =>
        SshService.SSHServiceList(sessionId).then(r => (r || []) as any),
    sshControlService: (sessionId: string, serviceName: string, action: string): Promise<void> =>
        SshService.SSHControlService(sessionId, serviceName, action),
    sshServiceLogs: (sessionId: string, serviceName: string): Promise<string> =>
        SshService.SSHServiceLogs(sessionId, serviceName),
    sshCronList: (sessionId: string): Promise<SSHCronItem[]> =>
        SshService.SSHCronList(sessionId).then(r => (r || []) as any),
    sshSaveCronList: (sessionId: string, items: SSHCronItem[]): Promise<void> =>
        SshService.SSHSaveCronList(sessionId, items as any),
    sshRunCronCommand: (sessionId: string, command: string): Promise<string> =>
        SshService.SSHRunCronCommand(sessionId, command),
    sshDockerContainerList: (sessionId: string): Promise<SSHDockerContainer[]> =>
        SshService.SSHDockerContainerList(sessionId).then(r => (r || []) as any),
    sshDockerControlContainer: (sessionId: string, containerId: string, action: string): Promise<void> =>
        SshService.SSHDockerControlContainer(sessionId, containerId, action),
    sshDockerContainerLogs: (sessionId: string, containerId: string, tail: number): Promise<string> =>
        SshService.SSHDockerContainerLogs(sessionId, containerId, tail),
    sshDockerImageList: (sessionId: string): Promise<SSHDockerImage[]> =>
        SshService.SSHDockerImageList(sessionId).then(r => (r || []) as any),
    sshDockerRemoveImage: (sessionId: string, imageId: string): Promise<void> =>
        SshService.SSHDockerRemoveImage(sessionId, imageId),
    sshDockerPullImage: (sessionId: string, imageName: string): Promise<string> =>
        SshService.SSHDockerPullImage(sessionId, imageName),

    // AI Agent 2.0
    agentSend: (sessionId: string, messages: FrontendMessage[]): Promise<string> =>
        AgentService.AgentSend(sessionId, messages as any),
    agentStopSend: (sessionId: string): Promise<boolean> => AgentService.AgentStopSend(sessionId),
    agentProposePlan: (sessionId: string, objective: string): Promise<AgentPlan> =>
        AgentService.AgentProposePlan(sessionId, objective) as any,
    agentApprovePlan: (planId: string): Promise<boolean> => AgentService.AgentApprovePlan(planId).then(r => !!r),
    agentCancelPlan: (planId: string): Promise<boolean> => Promise.resolve(AgentService.AgentCancelPlan(planId)),
    agentRetryPlanStep: (planId: string, stepId: string): Promise<AgentPlanStep> =>
        AgentService.AgentRetryPlanStep(planId, stepId) as any,
    agentSelectWorkspaceDir: (): Promise<string> => AgentService.AgentSelectWorkspaceDir(),
    agentSetWorkspaceDir: (dir: string): Promise<string> => Promise.resolve(AgentService.AgentSetWorkspaceDir(dir)),
    agentGetWorkspaceDir: (): Promise<string> => Promise.resolve(AgentService.AgentGetWorkspaceDir()),
    agentConfirmTool: (confirmId: string, approved: boolean): Promise<boolean> =>
        Promise.resolve(AgentService.AgentConfirmTool(confirmId, approved)),
    agentDecideApproval: (confirmId: string, approved: boolean, remember: boolean, reason?: string): Promise<boolean> =>
        Promise.resolve(AgentService.AgentDecideApproval(confirmId, approved, remember, reason || '')),
    agentGetPendingApprovals: (): Promise<AgentApprovalRequest[]> =>
        AgentService.AgentGetPendingApprovals().then(r => (r || []) as any),
    agentAnswerAsk: (askId: string, answer: string): Promise<boolean> =>
        Promise.resolve(AgentService.AgentAnswerAsk(askId, answer)),
    agentGetPendingAsks: (): Promise<AgentAskRequest[]> =>
        AgentService.AgentGetPendingAsks().then(r => (r || []) as any),
    agentListSessions: (): Promise<AgentSessionItem[]> =>
        AgentService.AgentListSessions().then(r => (r || []) as any),
    agentCreateSession: (title: string): Promise<AgentSessionItem> =>
        AgentService.AgentCreateSession(title) as any,
    agentDeleteSession: (sessionId: string): Promise<boolean> =>
        Promise.resolve(AgentService.AgentDeleteSession(sessionId)),
    agentGetSessionMessages: (sessionId: string): Promise<AiMessage[]> =>
        AgentService.AgentGetSessionMessages(sessionId).then(r => (r || []) as any),
    agentSaveSessionMessages: (sessionId: string, messages: AiMessage[]): Promise<void> =>
        AgentService.AgentSaveSessionMessages(sessionId, messages as any),
    agentListJobs: (sessionId: string): Promise<AgentJobItem[]> =>
        AgentService.AgentListJobs(sessionId).then(r => (r || []) as any),
    agentGetJob: (jobId: string): Promise<AgentJobItem> =>
        AgentService.AgentGetJob(jobId) as any,
    agentGetJobOutput: (jobId: string, fromSeq: number): Promise<AgentJobOutputItem[]> =>
        AgentService.AgentGetJobOutput(jobId, fromSeq).then(r => (r || []) as any),
    agentKillJob: (jobId: string): Promise<boolean> => Promise.resolve(AgentService.AgentKillJob(jobId)),
    agentListSubagents: (sessionId: string): Promise<AgentSubagentItem[]> =>
        AgentService.AgentListSubagents(sessionId).then(r => (r || []) as any),
    agentSendSubagent: (subId: string, message: string): Promise<string> =>
        AgentService.AgentSendSubagent(subId, message),
    agentInterruptSubagent: (subId: string): Promise<boolean> =>
        Promise.resolve(AgentService.AgentInterruptSubagent(subId)),
    agentGetAuditLogs: (sessionId: string, limit: number): Promise<AgentAuditLogItem[]> =>
        AgentService.AgentGetAuditLogs(sessionId, limit).then(r => (r || []) as any),
    agentListSkills: (): Promise<AgentSkillItem[]> =>
        Promise.resolve(AgentService.AgentListSkills() || []) as any,
    agentGetSkillsDir: (): Promise<string> => Promise.resolve(AgentService.AgentGetSkillsDir()),
    agentOpenSkillsDir: (): Promise<string> => AgentService.AgentOpenSkillsDir(),
    agentRecallMemories: (query: string, limit: number): Promise<string[]> =>
        AgentService.AgentRecallMemories(query, limit).then(r => r || []),
    agentSaveMemory: (kind: string, content: string, tags: string, source: string): Promise<void> =>
        AgentService.AgentSaveMemory(kind, content, tags, source),
    agentGetHistory: (): Promise<AiMessage[]> =>
        AgentService.AgentGetHistory().then(r => (r || []) as any),
    agentSaveHistory: (messages: AiMessage[]): Promise<void> =>
        AgentService.AgentSaveHistory(messages as any),
    agentClearHistory: (): Promise<void> => AgentService.AgentClearHistory(),
}

/* ------------------------------------------------------------------ */
/* 事件总线：基于 @wailsio/runtime Events */
/* ------------------------------------------------------------------ */

const subscribers = new Map<string, Set<AnyFn>>()
const boundUnsubscribers = new Map<string, () => void>()

export function subscribe(event: string, handler: AnyFn): () => void {
    let set = subscribers.get(event)
    if (!set) {
        set = new Set()
        subscribers.set(event, set)
    }
    set.add(handler)

    if (!boundUnsubscribers.has(event)) {
        const unsub = Events.On(event, (eventObj: any) => {
            const data = eventObj?.data !== undefined ? eventObj.data : eventObj
            subscribers.get(event)?.forEach((fn) => fn(data))
        })
        boundUnsubscribers.set(event, unsub)
    }

    return () => {
        const s = subscribers.get(event)
        if (s) {
            s.delete(handler)
            if (s.size === 0) {
                subscribers.delete(event)
                const unsub = boundUnsubscribers.get(event)
                if (unsub) {
                    unsub()
                    boundUnsubscribers.delete(event)
                }
            }
        }
    }
}

let pendingAskPrompt: string | null = null

export function setPendingAsk(prompt: string): void {
    pendingAskPrompt = prompt
}

export function consumePendingAsk(): string | null {
    const p = pendingAskPrompt
    pendingAskPrompt = null
    return p
}

export function emitEvent(event: string, ...args: any[]): void {
    subscribers.get(event)?.forEach((fn) => fn(...args))
    Events.Emit(event, args.length === 1 ? args[0] : args)
}

/** 注册系统级文件拖放 */
export function registerNativeFileDrop(handler: (paths: string[]) => void): boolean {
    return false // Wails v3 file drop fallback
}

export function unregisterNativeFileDrop(): void {}
