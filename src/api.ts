import { invoke } from '@tauri-apps/api/core'
import { listen, emit } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

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
    UploadEstimate,
    ApiRequest,
    ApiResponse,
    MongoURIInfo,
    MongoQuerySpec,
    MongoFindResult,
    MongoValidatorInfo,
    MongoBulkOp,
    MongoTxOp,
    MongoDatabaseInfo,
    MongoCollectionInfo,
    MongoCollectionStats,
    MongoHealthInfo,
    MongoServerStatus,
    MongoFieldInfo,
    MongoValidationResult,
    MongoIndexInfo,
    MongoUserInfo,
    MongoCreateUserReq,
    MongoUpdateUserReq,
    MongoCreateCollOptions,
    MongoCloneCollReq,
    MqttSubscription,
    SqliteTableInfo,
    SqliteColumnInfo,
    SqliteIndexInfo,
    ServerGroup,
    SSHDashboardInfo,
    SSHProcessInfo,
    SSHServiceInfo,
    SSHCronItem,
    AppSettings,
    DockerOverview,
    DockerContainerInfo,
    DockerImageInfo,
    DockerVolumeInfo,
    DockerNetworkInfo,
    DockerPruneReport,
    DockerComposeStackInfo,
    DockerComposeRecord,
    K8sOverview,
    K8sNamespaceInfo,
    K8sNodeInfo,
    K8sPodInfo,
    K8sDeploymentInfo,
    K8sServiceInfo,
    K8sIngressInfo,
    K8sConfigMapInfo,
    K8sSecretInfo,
    K8sPVCInfo,
    KubeconfigContextInfo,
    K8sApplyResult,
    K8sOrchestrationRecord,
    K8sDeleteResult,
    AppVersionInfo,
    UpdateCheckResult,
    ConfigIOResult,
    AgentStatusInfo,
    ApprovalDecision,
    ChatSendRequest,
    ChatSendResult,
    SubAgentInfo,
    AgentSessionRecord,
    ConversationDetail,
    WikiInfo,
    WikiTreeNode,
    WikiPageDetail,
    WikiSearchHit,
    WikiGraphData,
    WikiLintReport,
    WikiIngestResult,
} from './types'

type AnyFn = (...args: any[]) => void

export interface ActiveConnectionInfo {
    protocol: string
    id: string
    name: string
    host?: string
    port?: number
    database?: string
    namespace?: string
    path?: string
}

export const API = {
    // 版本信息与更新
    getAppVersion: (): Promise<AppVersionInfo> =>
        invoke<AppVersionInfo>('get_app_version').catch(() => ({
            version: 'v1.0.6',
            gitCommit: 'dev',
            buildDate: '',
            goVersion: '',
            platform: 'windows/amd64',
        })),
    checkForUpdates: (): Promise<UpdateCheckResult> =>
        invoke<UpdateCheckResult>('check_for_updates').catch(() => ({
            currentVersion: 'v1.0.6',
            latestVersion: 'v1.0.6',
            hasUpdate: false,
            releaseUrl: 'https://github.com/x86cloud/terminals/releases',
            repoUrl: 'https://github.com/x86cloud/terminals',
            checkedAt: new Date().toLocaleString(),
        })),
    openBrowser: async (targetUrl: string): Promise<void> => {
        try {
            await invoke('open_browser', { targetUrl })
        } catch {
            window.open(targetUrl, '_blank')
        }
    },

    // 窗口与系统操作
    hideWindow: async (): Promise<void> => {
        try {
            await invoke('hide_window')
            return
        } catch {}
        try {
            await getCurrentWindow().hide()
        } catch (e) {
            console.warn('hideWindow failed:', e)
        }
    },
    quitApp: async (): Promise<void> => {
        try {
            await invoke('quit_app')
            return
        } catch {}
        try {
            await getCurrentWindow().close()
        } catch (e) {
            console.warn('quitApp failed:', e)
        }
    },

    // 设置持久化
    getAppSettings: (): Promise<AppSettings> => invoke<AppSettings>('get_app_settings'),
    saveAppSettings: (settings: AppSettings): Promise<AppSettings> =>
        invoke<AppSettings>('save_app_settings', { settings }),

    // 服务器配置
    listServers: (): Promise<ServerConfig[]> =>
        invoke<ServerConfig[]>('list_servers').then((r) => r || []),
    saveServer: (cfg: ServerConfig): Promise<ServerConfig> =>
        invoke<ServerConfig>('save_server', { cfg }),
    deleteServer: (id: string): Promise<void> => invoke<void>('delete_server', { id }),
    selectPrivateKey: (): Promise<string> => invoke<string>('select_private_key'),
    selectCertFile: (): Promise<string> => invoke<string>('select_cert_file'),

    // 分组管理
    listGroups: (): Promise<ServerGroup[]> =>
        invoke<ServerGroup[]>('list_groups').then((r) => r || []),
    saveGroup: (g: ServerGroup): Promise<ServerGroup> =>
        invoke<ServerGroup>('save_group', { g }),
    deleteGroup: (id: string): Promise<void> => invoke<void>('delete_group', { id }),
    moveServerToGroup: (serverId: string, groupId: string): Promise<void> =>
        invoke<void>('move_server_to_group', { serverId, groupId }),

    // 配置导入/导出
    exportServersConfig: (): Promise<ConfigIOResult> =>
        invoke<ConfigIOResult>('export_servers_config'),
    importServersConfig: (): Promise<ConfigIOResult> =>
        invoke<ConfigIOResult>('import_servers_config'),

    // 会话
    listSessions: (): Promise<SessionInfo[]> =>
        invoke<SessionInfo[]>('list_sessions').then((r) => r || []),
    connect: (serverId: string, cols: number, rows: number): Promise<SessionInfo> =>
        invoke<SessionInfo>('ssh_connect', { serverId, cols, rows }),
    connectWithConfig: (cfg: ServerConfig, cols: number, rows: number): Promise<SessionInfo> =>
        invoke<SessionInfo>('ssh_connect_with_config', { cfg, cols, rows }),
    sshTestConnection: (cfg: ServerConfig): Promise<{ connected: boolean; pingMs: number }> =>
        invoke<{ connected: boolean; pingMs: number }>('ssh_test_connection', { cfg }).then(
            (r) => r || { connected: true, pingMs: 0 }
        ),
    disconnect: (sessionId: string): Promise<void> =>
        invoke<void>('ssh_disconnect', { sessionId }),
    reconnect: (sessionId: string, cols: number, rows: number): Promise<SessionInfo> =>
        invoke<SessionInfo>('ssh_reconnect', { sessionId, cols, rows }),
    sshCheckConnection: (sessionId: string): Promise<boolean> =>
        invoke<boolean>('ssh_check_connection', { sessionId }),
    sendInput: (sessionId: string, data: string): Promise<void> =>
        invoke<void>('ssh_send_input', { sessionId, data }),
    resizeTerminal: (sessionId: string, cols: number, rows: number): Promise<void> =>
        invoke<void>('ssh_resize_terminal', { sessionId, cols, rows }),
    resize: (sessionId: string, cols: number, rows: number): Promise<void> =>
        invoke<void>('ssh_resize_terminal', { sessionId, cols, rows }),
    terminalAttach: (sessionId: string, cols?: number, rows?: number): Promise<void> =>
        invoke<void>('ssh_terminal_attach', { sessionId, cols: cols || 0, rows: rows || 0 }),

    // SFTP
    listDir: (sessionId: string, dir: string): Promise<DirListing> =>
        invoke<DirListing>('sftp_list_dir', { sessionId, dir }),
    homeDir: (sessionId: string): Promise<string> =>
        invoke<string>('sftp_home_dir', { sessionId }),
    makeDir: (sessionId: string, parent: string, name: string): Promise<void> =>
        invoke<void>('sftp_make_dir', { sessionId, parent, name }),
    removePath: (sessionId: string, target: string): Promise<void> =>
        invoke<void>('sftp_remove_path', { sessionId, target }),
    removePaths: (sessionId: string, targets: string[]): Promise<void> =>
        invoke<void>('sftp_remove_paths', { sessionId, targets }),
    renamePath: (sessionId: string, target: string, newName: string): Promise<void> =>
        invoke<void>('sftp_rename_path', { sessionId, target, newName }),
    rename: (sessionId: string, target: string, newName: string): Promise<void> =>
        invoke<void>('sftp_rename_path', { sessionId, target, newName }),
    readRemoteFile: (sessionId: string, remotePath: string): Promise<string> =>
        invoke<string>('sftp_read_remote_file', { sessionId, remotePath }),
    writeRemoteFile: (sessionId: string, remotePath: string, content: string): Promise<void> =>
        invoke<void>('sftp_write_remote_file', { sessionId, remotePath, content }),

    // 本地文件与传输
    chooseLocalFiles: (): Promise<string[]> =>
        invoke<string[]>('sftp_choose_local_files').then((r) => r || []),
    chooseLocalFolder: (): Promise<string> => invoke<string>('sftp_choose_local_folder'),
    saveMysqlFile: (defaultName: string): Promise<string> =>
        invoke<string>('sftp_save_mysql_file', { defaultName }),
    readLocalFile: (filePath: string): Promise<string> =>
        invoke<string>('sftp_read_local_file', { filePath }),
    writeLocalFile: (filePath: string, content: string): Promise<void> =>
        invoke<void>('sftp_write_local_file', { filePath, content }),
    readLocalFileBase64: (filePath: string): Promise<string> =>
        invoke<string>('sftp_read_local_file_base64', { filePath }),
    uploadPaths: (sessionId: string, remoteDir: string, localPaths: string[]): Promise<void> =>
        invoke<void>('sftp_upload_paths', { sessionId, remoteDir, localPaths }),
    uploadData: (sessionId: string, remoteDir: string, name: string, base64Data: string): Promise<void> =>
        invoke<void>('sftp_upload_data', { sessionId, remoteDir, name, base64Data }),
    beginDropUpload: (
        sessionId: string,
        remoteDir: string,
        name: string,
        totalSize: number
    ): Promise<string> =>
        invoke<string>('sftp_begin_drop_upload', { sessionId, remoteDir, name, totalSize }),
    dropUploadMkdir: (uploadId: string, relativeDir: string): Promise<void> =>
        invoke<void>('sftp_drop_upload_mkdir', { uploadId, relativeDir }),
    dropUploadWriteChunk: (
        uploadId: string,
        relativePath: string,
        dataBase64: string,
        isFirstChunk: boolean,
        isLastChunk: boolean
    ): Promise<void> =>
        invoke<void>('sftp_drop_upload_write_chunk', {
            uploadId,
            relativePath,
            dataBase64,
            isFirstChunk,
            isLastChunk,
        }),
    finishDropUpload: (uploadId: string, errorMsg?: string | null): Promise<void> =>
        invoke<void>('sftp_finish_drop_upload', { uploadId, errorMsg: errorMsg ?? null }),
    estimateUpload: (sessionId: string, remoteDir: string, localPaths: string[]): Promise<UploadEstimate> =>
        invoke<UploadEstimate>('sftp_estimate_upload', { sessionId, remoteDir, localPaths }),
    estimateUploadData: (sessionId: string, remoteDir: string, dataSize: number): Promise<UploadEstimate> =>
        invoke<UploadEstimate>('sftp_estimate_upload_data', { sessionId, remoteDir, dataSize }),
    downloadPaths: (sessionId: string, remotePaths: string[]): Promise<void> =>
        invoke<void>('sftp_download_paths', { sessionId, remotePaths }),
    downloadTo: (sessionId: string, remotePaths: string[], localDir: string): Promise<void> =>
        invoke<void>('sftp_download_to', { sessionId, remotePaths, localDir }),
    listTransfers: (): Promise<Transfer[]> =>
        invoke<Transfer[]>('sftp_list_transfers').then((r) => r || []),
    cancelTransfer: (id: string): Promise<void> =>
        invoke<void>('sftp_cancel_transfer', { id }),
    clearFinishedTransfers: (): Promise<void> =>
        invoke<void>('sftp_clear_finished_transfers'),

    // Redis
    redisConnect: (id: string): Promise<boolean> => invoke<boolean>('redis_connect', { id }),
    redisTestConnection: (cfg: ServerConfig): Promise<{ connected: boolean; pingMs: number }> =>
        invoke<{ connected: boolean; pingMs: number }>('redis_test_connection', { cfg }).then(
            (r) => r || { connected: true, pingMs: 0 }
        ),
    redisClose: (id: string): Promise<void> => invoke<void>('redis_close', { id }),
    redisSelectDB: (id: string, db: number): Promise<void> =>
        invoke<void>('redis_select_db', { id, db }),
    redisKeys: (id: string, pattern: string, cursor: string): Promise<RedisKeysResult> =>
        invoke<RedisKeysResult>('redis_keys', { id, pattern, cursor }),
    redisGet: (id: string, key: string): Promise<RedisValue> =>
        invoke<RedisValue>('redis_get', { id, key }),
    redisSet: (id: string, key: string, typ: string, val: string, ttl: number): Promise<void> =>
        invoke<void>('redis_set', { id, key, typ, val, ttl }),
    redisDelete: (id: string, key: string): Promise<void> =>
        invoke<void>('redis_delete', { id, key }),
    redisExpire: (id: string, key: string, ttl: number): Promise<void> =>
        invoke<void>('redis_expire', { id, key, ttl }),
    redisRenameKey: (id: string, oldKey: string, newKey: string): Promise<void> =>
        invoke<void>('redis_rename_key', { id, oldKey, newKey }),
    redisRaw: (id: string, cmd: string): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('redis_raw', { id, cmd }).then((r) => r || {}),
    redisDBSize: (id: string): Promise<number> => invoke<number>('redis_db_size', { id }),
    redisModeInfo: (id: string): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('redis_mode_info', { id }).then((r) => r || {}),
    redisStringAppend: (id: string, key: string, value: string): Promise<number> =>
        invoke<number>('redis_string_append', { id, key, value }),
    redisHashFieldSet: (id: string, key: string, field: string, value: string): Promise<void> =>
        invoke<void>('redis_hash_field_set', { id, key, field, value }),
    redisHashFieldGet: (id: string, key: string, field: string): Promise<string> =>
        invoke<string>('redis_hash_field_get', { id, key, field }),
    redisHashFieldDel: (id: string, key: string, fields: string[]): Promise<number> =>
        invoke<number>('redis_hash_field_del', { id, key, fields }),
    redisListPush: (id: string, key: string, value: string, left: boolean): Promise<number> =>
        invoke<number>('redis_list_push', { id, key, value, left }),
    redisListPop: (id: string, key: string, left: boolean): Promise<string> =>
        invoke<string>('redis_list_pop', { id, key, left }),
    redisSetAdd: (id: string, key: string, members: string[]): Promise<number> =>
        invoke<number>('redis_set_add', { id, key, members }),
    redisSetRem: (id: string, key: string, members: string[]): Promise<number> =>
        invoke<number>('redis_set_rem', { id, key, members }),
    redisZSetAdd: (id: string, key: string, member: string, score: number): Promise<number> =>
        invoke<number>('redis_zset_add', { id, key, member, score }),
    redisZSetRem: (id: string, key: string, members: string[]): Promise<number> =>
        invoke<number>('redis_zset_rem', { id, key, members }),
    redisPipeline: (id: string, commands: string[]): Promise<RedisPipelineResult> =>
        invoke<RedisPipelineResult>('redis_pipeline', { id, commands }),
    redisTransaction: (id: string, watch: string[], commands: string[]): Promise<RedisTransactionResult> =>
        invoke<RedisTransactionResult>('redis_transaction', { id, watch, commands }),
    redisPublish: (id: string, channel: string, message: string): Promise<number> =>
        invoke<number>('redis_publish', { id, channel, message }),
    redisSubscribe: (id: string, channel: string): Promise<void> =>
        invoke<void>('redis_subscribe', { id, channel }),
    redisPSubscribe: (id: string, pattern: string): Promise<void> =>
        invoke<void>('redis_psubscribe', { id, pattern }),
    redisUnsubscribe: (id: string, channel: string): Promise<void> =>
        invoke<void>('redis_unsubscribe', { id, channel }),
    redisSubscriptions: (id: string): Promise<string[]> =>
        invoke<string[]>('redis_subscriptions', { id }).then((r) => r || []),
    redisKeyspaceNotify: (id: string, db: number, event: string): Promise<void> =>
        invoke<void>('redis_keyspace_notify', { id, db, event }),
    redisQueueEnqueue: (id: string, queue: string, payload: string, mode: string): Promise<string> =>
        invoke<string>('redis_queue_enqueue', { id, queue, payload, mode }),
    redisQueueDequeue: (id: string, queue: string, mode: string, timeout: number): Promise<RedisQueueItem | null> =>
        invoke<RedisQueueItem | null>('redis_queue_dequeue', { id, queue, mode, timeout }),
    redisQueueLength: (id: string, queue: string, mode: string): Promise<number> =>
        invoke<number>('redis_queue_length', { id, queue, mode }),
    redisSlowLog: (id: string, count: number): Promise<RedisSlowLogEntry[]> =>
        invoke<RedisSlowLogEntry[]>('redis_slow_log', { id, count }).then((r) => r || []),
    redisInfo: (id: string, section: string): Promise<string> =>
        invoke<string>('redis_info', { id, section }),
    redisMonitor: (id: string): Promise<RedisMonitorInfo | null> =>
        invoke<RedisMonitorInfo | null>('redis_monitor', { id }),

    // MySQL
    mysqlConnect: (serverId: string): Promise<boolean> =>
        invoke<any>('mysql_connect', { serverId }).then((r) => !!r),
    mysqlClose: (serverId: string): Promise<void> =>
        invoke<void>('mysql_close', { serverId }),
    mysqlDatabases: (serverId: string): Promise<string[]> =>
        invoke<string[]>('mysql_databases', { serverId }).then((r) => r || []),
    mysqlTables: (serverId: string, dbName: string): Promise<string[]> =>
        invoke<string[]>('mysql_tables', { serverId, dbName }).then((r) => r || []),
    mysqlSelect: (
        serverId: string,
        dbName: string,
        table: string,
        limit: number,
        offset: number
    ): Promise<MysqlQueryResult> =>
        invoke<MysqlQueryResult>('mysql_select', { serverId, dbName, table, limit, offset }),
    mysqlCount: (serverId: string, dbName: string, table: string): Promise<number> =>
        invoke<number>('mysql_count', { serverId, dbName, table }),
    mysqlDescribe: (serverId: string, dbName: string, table: string): Promise<Array<Record<string, any>>> =>
        invoke<Array<Record<string, any>>>('mysql_describe', { serverId, dbName, table }),
    mysqlRun: (serverId: string, dbName: string, sqlText: string): Promise<MysqlQueryResult> =>
        invoke<MysqlQueryResult>('mysql_run', { serverId, dbName, sqlText }),
    mysqlInsert: (
        serverId: string,
        dbName: string,
        table: string,
        columns: string[],
        values: any[]
    ): Promise<number> =>
        invoke<number>('mysql_insert', { serverId, dbName, table, columns, values }),
    mysqlUpdate: (
        serverId: string,
        dbName: string,
        table: string,
        setCols: string[],
        setVals: any[],
        whereCols: string[],
        whereVals: any[]
    ): Promise<number> =>
        invoke<number>('mysql_update', {
            serverId,
            dbName,
            table,
            setCols,
            setVals,
            whereCols,
            whereVals,
        }),
    mysqlDelete: (
        serverId: string,
        dbName: string,
        table: string,
        whereCols: string[],
        whereVals: any[]
    ): Promise<number> =>
        invoke<number>('mysql_delete', { serverId, dbName, table, whereCols, whereVals }),
    mysqlExport: (
        serverId: string,
        dbName: string,
        mode: string,
        source: string,
        table: string,
        sqlText: string,
        limit: number
    ): Promise<string> =>
        invoke<string>('mysql_export', {
            serverId,
            dbName,
            mode,
            source,
            table,
            sqlText,
            limit,
        }),
    mysqlExportToFile: (
        serverId: string,
        dbName: string,
        mode: string,
        source: string,
        table: string,
        sqlText: string,
        limit: number
    ): Promise<string> =>
        invoke<string>('mysql_export_to_file', {
            serverId,
            dbName,
            mode,
            source,
            table,
            sqlText,
            limit,
        }),
    mysqlImport: (
        serverId: string,
        dbName: string,
        mode: string,
        table: string,
        content: string
    ): Promise<string> =>
        invoke<string>('mysql_import', { serverId, dbName, mode, table, content }),
    mysqlImportFromFile: (
        serverId: string,
        dbName: string,
        mode: string,
        table: string
    ): Promise<string> =>
        invoke<string>('mysql_import_from_file', { serverId, dbName, mode, table }),
    mysqlConnectEx: (serverId: string): Promise<boolean> =>
        invoke<any>('mysql_connect', { serverId }).then((r) => !!r),
    mysqlTestConnection: (cfg: ServerConfig): Promise<{ connected: boolean; pingMs: number }> =>
        invoke<{ connected: boolean; pingMs: number }>('mysql_test_connection', { cfg }).then(
            (r) => r || { connected: true, pingMs: 0 }
        ),
    mysqlCloseEx: (serverId: string): Promise<void> =>
        invoke<void>('mysql_close', { serverId }),
    mysqlCreateDatabase: (serverId: string, name: string, charset: string): Promise<void> =>
        invoke<void>('mysql_create_database', { serverId, name, charset }),
    mysqlDropDatabase: (serverId: string, name: string): Promise<void> =>
        invoke<void>('mysql_drop_database', { serverId, name }),
    mysqlCreateTable: (serverId: string, dbName: string, table: string, defs: string): Promise<void> =>
        invoke<void>('mysql_create_table', { serverId, dbName, table, defs }),
    mysqlDropTable: (serverId: string, dbName: string, table: string): Promise<void> =>
        invoke<void>('mysql_drop_table', { serverId, dbName, table }),
    mysqlTruncateTable: (serverId: string, dbName: string, table: string): Promise<void> =>
        invoke<void>('mysql_truncate_table', { serverId, dbName, table }),
    mysqlTableStatus: (serverId: string, dbName: string): Promise<Array<Record<string, any>>> =>
        invoke<Array<Record<string, any>>>('mysql_table_status', { serverId, dbName }).then(
            (r) => r || []
        ),
    mysqlIndexes: (serverId: string, dbName: string, table: string): Promise<Array<Record<string, any>>> =>
        invoke<Array<Record<string, any>>>('mysql_indexes', { serverId, dbName, table }).then(
            (r) => r || []
        ),
    mysqlCreateIndex: (
        serverId: string,
        dbName: string,
        table: string,
        name: string,
        colsCsv: string,
        unique: boolean
    ): Promise<void> =>
        invoke<void>('mysql_create_index', { serverId, dbName, table, name, colsCsv, unique }),
    mysqlDropIndex: (serverId: string, dbName: string, table: string, name: string): Promise<void> =>
        invoke<void>('mysql_drop_index', { serverId, dbName, table, name }),
    mysqlUsers: (serverId: string): Promise<Array<Record<string, any>>> =>
        invoke<Array<Record<string, any>>>('mysql_users', { serverId }).then((r) => r || []),
    mysqlGrants: (serverId: string, user: string, host: string): Promise<string> =>
        invoke<string | string[]>('mysql_grants', { serverId, user, host }).then((r) =>
            Array.isArray(r) ? r.join('\n') : (r || '')
        ),
    mysqlCreateUser: (
        serverId: string,
        user: string,
        host: string,
        password: string,
        authPlugin: string,
        lock: boolean
    ): Promise<void> =>
        invoke<void>('mysql_create_user', { serverId, user, host, password, authPlugin, lock }),
    mysqlDropUser: (serverId: string, user: string, host: string): Promise<void> =>
        invoke<void>('mysql_drop_user', { serverId, user, host }),
    mysqlChangeUserPassword: (
        serverId: string,
        user: string,
        host: string,
        newPassword: string
    ): Promise<void> =>
        invoke<void>('mysql_change_user_password', { serverId, user, host, newPassword }),
    mysqlToggleUserLock: (
        serverId: string,
        user: string,
        host: string,
        lock: boolean
    ): Promise<void> =>
        invoke<void>('mysql_toggle_user_lock', { serverId, user, host, lock }),
    mysqlGrantPrivileges: (
        serverId: string,
        user: string,
        host: string,
        dbName: string,
        table: string,
        privs: string[],
        withGrantOption: boolean
    ): Promise<void> =>
        invoke<void>('mysql_grant_privileges', {
            serverId,
            user,
            host,
            dbName,
            table,
            privs,
            withGrantOption,
        }),
    mysqlRevokePrivileges: (
        serverId: string,
        user: string,
        host: string,
        dbName: string,
        table: string,
        privs: string[]
    ): Promise<void> =>
        invoke<void>('mysql_revoke_privileges', { serverId, user, host, dbName, table, privs }),
    mysqlRevokeAllPrivileges: (serverId: string, user: string, host: string): Promise<void> =>
        invoke<void>('mysql_revoke_all_privileges', { serverId, user, host }),
    mysqlStatus: (serverId: string): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('mysql_status', { serverId }).then((r) => r || {}),
    mysqlVariables: (serverId: string): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('mysql_variables', { serverId }).then((r) => r || {}),
    mysqlProcessList: (serverId: string): Promise<Array<Record<string, any>>> =>
        invoke<Array<Record<string, any>>>('mysql_process_list', { serverId }).then((r) => r || []),
    mysqlSlowLog: (serverId: string, limit: number): Promise<Array<Record<string, any>>> =>
        invoke<Array<Record<string, any>>>('mysql_slow_log', { serverId, limit }).then(
            (r) => r || []
        ),
    mysqlSchema: (serverId: string, dbName: string): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('mysql_schema', { serverId, dbName }).then((r) => r || {}),
    mysqlExportJSON: (
        serverId: string,
        dbName: string,
        source: string,
        table: string,
        sqlText: string,
        limit: number
    ): Promise<string> =>
        invoke<string>('mysql_export_json', { serverId, dbName, source, table, sqlText, limit }),
    mysqlImportJSON: (
        serverId: string,
        dbName: string,
        table: string,
        content: string
    ): Promise<string> =>
        invoke<string>('mysql_import_json', { serverId, dbName, table, content }),
    mysqlExportToFileEx: (
        serverId: string,
        dbName: string,
        mode: string,
        source: string,
        table: string,
        sqlText: string,
        limit: number
    ): Promise<string> =>
        invoke<string>('mysql_export_to_file', {
            serverId,
            dbName,
            mode,
            source,
            table,
            sqlText,
            limit,
        }),
    mysqlImportFromFileEx: (
        serverId: string,
        dbName: string,
        mode: string,
        table: string
    ): Promise<string> =>
        invoke<string>('mysql_import_from_file', { serverId, dbName, mode, table }),
    mysqlQueryCSV: (
        serverId: string,
        dbName: string,
        sqlText: string,
        limit: number
    ): Promise<string> =>
        invoke<string>('mysql_query_csv', { serverId, dbName, sqlText, limit }),
    mysqlBackup: (serverId: string, dbName: string): Promise<string> =>
        invoke<string>('mysql_backup', { serverId, dbName }),
    mysqlBackupToFile: (serverId: string, dbName: string): Promise<string> =>
        invoke<string>('mysql_backup_to_file', { serverId, dbName }),

    // PostgreSQL
    postgresTestConnection: (cfg: ServerConfig): Promise<{ connected: boolean; pingMs: number }> =>
        invoke<{ connected: boolean; pingMs: number }>('postgres_test_connection', { cfg }).then(
            (r) => r || { connected: true, pingMs: 0 }
        ),
    postgresConnect: (serverId: string): Promise<boolean> =>
        invoke<boolean>('postgres_connect', { serverId }),
    postgresClose: (serverId: string): Promise<void> =>
        invoke<void>('postgres_close', { serverId }),
    postgresDatabases: (serverId: string): Promise<any[]> =>
        invoke<any[]>('postgres_databases', { serverId }).then((r) => r || []),
    postgresSchemas: (serverId: string, dbName: string): Promise<any[]> =>
        invoke<any[]>('postgres_schemas', { serverId, dbName }).then((r) => r || []),
    postgresTables: (serverId: string, dbName: string, schema: string): Promise<any[]> =>
        invoke<any[]>('postgres_tables', { serverId, dbName, schema }).then((r) => r || []),
    postgresSequences: (serverId: string, dbName: string, schema: string): Promise<any[]> =>
        invoke<any[]>('postgres_sequences', { serverId, dbName, schema }).then((r) => r || []),
    postgresFunctions: (serverId: string, dbName: string, schema: string): Promise<any[]> =>
        invoke<any[]>('postgres_functions', { serverId, dbName, schema }).then((r) => r || []),
    postgresDescribe: (serverId: string, dbName: string, schema: string, table: string): Promise<any> =>
        invoke<any>('postgres_describe', { serverId, dbName, schema, table }),
    postgresTableDDL: (serverId: string, dbName: string, schema: string, table: string): Promise<string> =>
        invoke<string>('postgres_table_ddl', { serverId, dbName, schema, table }),
    postgresSelect: (
        serverId: string,
        dbName: string,
        schema: string,
        table: string,
        limit: number,
        offset: number,
        sortCol: string,
        sortOrder: string,
        whereClause: string
    ): Promise<any> =>
        invoke<any>('postgres_select', {
            serverId,
            dbName,
            schema,
            table,
            limit,
            offset,
            sortCol,
            sortOrder,
            whereClause,
        }),
    postgresCount: (
        serverId: string,
        dbName: string,
        schema: string,
        table: string,
        whereClause: string
    ): Promise<number> =>
        invoke<number>('postgres_count', { serverId, dbName, schema, table, whereClause }),
    postgresInsert: (
        serverId: string,
        dbName: string,
        schema: string,
        table: string,
        columns: string[],
        values: any[]
    ): Promise<number> =>
        invoke<number>('postgres_insert', { serverId, dbName, schema, table, columns, values }),
    postgresUpdate: (
        serverId: string,
        dbName: string,
        schema: string,
        table: string,
        setCols: string[],
        setVals: any[],
        whereCols: string[],
        whereVals: any[]
    ): Promise<number> =>
        invoke<number>('postgres_update', {
            serverId,
            dbName,
            schema,
            table,
            setCols,
            setVals,
            whereCols,
            whereVals,
        }),
    postgresDelete: (
        serverId: string,
        dbName: string,
        schema: string,
        table: string,
        whereCols: string[],
        whereVals: any[]
    ): Promise<number> =>
        invoke<number>('postgres_delete', { serverId, dbName, schema, table, whereCols, whereVals }),
    postgresRun: (serverId: string, dbName: string, sqlText: string): Promise<any> =>
        invoke<any>('postgres_run', { serverId, dbName, sqlText }),
    postgresExplain: (
        serverId: string,
        dbName: string,
        sqlText: string,
        analyze: boolean,
        buffers: boolean,
        verbose: boolean
    ): Promise<string> =>
        invoke<string>('postgres_explain', {
            serverId,
            dbName,
            sqlText,
            analyze,
            buffers,
            verbose,
        }),
    postgresSessions: (serverId: string, dbName: string): Promise<any[]> =>
        invoke<any[]>('postgres_sessions', { serverId, dbName }).then((r) => r || []),
    postgresKillSession: (
        serverId: string,
        dbName: string,
        pid: number,
        terminate: boolean
    ): Promise<boolean> =>
        invoke<boolean>('postgres_kill_session', { serverId, dbName, pid, terminate }),
    postgresStatus: (serverId: string, dbName: string): Promise<any> =>
        invoke<any>('postgres_status', { serverId, dbName }),
    postgresRoles: (serverId: string): Promise<any[]> =>
        invoke<any[]>('postgres_roles', { serverId }).then((r) => r || []),
    postgresCreateRole: (
        serverId: string,
        roleName: string,
        password: string,
        superUser: boolean,
        canLogin: boolean,
        createDb: boolean,
        createRole: boolean,
        connLimit: number
    ): Promise<void> =>
        invoke<void>('postgres_create_role', {
            serverId,
            roleName,
            password,
            superUser,
            canLogin,
            createDb,
            createRole,
            connLimit,
        }),
    postgresUpdateRolePassword: (
        serverId: string,
        roleName: string,
        newPassword: string
    ): Promise<void> =>
        invoke<void>('postgres_update_role_password', { serverId, roleName, newPassword }),
    postgresDropRole: (serverId: string, roleName: string): Promise<void> =>
        invoke<void>('postgres_drop_role', { serverId, roleName }),
    postgresGrantPrivileges: (
        serverId: string,
        dbName: string,
        roleName: string,
        schema: string,
        table: string,
        privileges: string,
        isGrant: boolean
    ): Promise<void> =>
        invoke<void>('postgres_grant_privileges', {
            serverId,
            dbName,
            roleName,
            schema,
            table,
            privileges,
            isGrant,
        }),
    postgresCreateDatabase: (
        serverId: string,
        name: string,
        owner: string,
        encoding: string,
        template: string
    ): Promise<void> =>
        invoke<void>('postgres_create_database', { serverId, name, owner, encoding, template }),
    postgresDropDatabase: (serverId: string, name: string): Promise<void> =>
        invoke<void>('postgres_drop_database', { serverId, name }),
    postgresCreateSchema: (
        serverId: string,
        dbName: string,
        schema: string,
        owner: string
    ): Promise<void> =>
        invoke<void>('postgres_create_schema', { serverId, dbName, schema, owner }),
    postgresDropSchema: (
        serverId: string,
        dbName: string,
        schema: string,
        cascade: boolean
    ): Promise<void> =>
        invoke<void>('postgres_drop_schema', { serverId, dbName, schema, cascade }),
    postgresCreateTable: (
        serverId: string,
        dbName: string,
        schema: string,
        table: string,
        defs: string
    ): Promise<void> =>
        invoke<void>('postgres_create_table', { serverId, dbName, schema, table, defs }),
    postgresDropTable: (
        serverId: string,
        dbName: string,
        schema: string,
        table: string,
        cascade: boolean
    ): Promise<void> =>
        invoke<void>('postgres_drop_table', { serverId, dbName, schema, table, cascade }),
    postgresTruncateTable: (
        serverId: string,
        dbName: string,
        schema: string,
        table: string,
        restartIdentity: boolean,
        cascade: boolean
    ): Promise<void> =>
        invoke<void>('postgres_truncate_table', {
            serverId,
            dbName,
            schema,
            table,
            restartIdentity,
            cascade,
        }),
    postgresExport: (
        serverId: string,
        dbName: string,
        schema: string,
        mode: string,
        source: string,
        table: string,
        sqlText: string,
        limit: number
    ): Promise<string> =>
        invoke<string>('postgres_export', {
            serverId,
            dbName,
            schema,
            mode,
            source,
            table,
            sqlText,
            limit,
        }),
    postgresExportToFile: (
        serverId: string,
        dbName: string,
        schema: string,
        mode: string,
        source: string,
        table: string,
        sqlText: string,
        limit: number
    ): Promise<string> =>
        invoke<string>('postgres_export_to_file', {
            serverId,
            dbName,
            schema,
            mode,
            source,
            table,
            sqlText,
            limit,
        }),
    postgresImport: (
        serverId: string,
        dbName: string,
        schema: string,
        mode: string,
        table: string,
        content: string
    ): Promise<string> =>
        invoke<string>('postgres_import', { serverId, dbName, schema, mode, table, content }),
    postgresImportFromFile: (
        serverId: string,
        dbName: string,
        schema: string,
        mode: string,
        table: string
    ): Promise<string> =>
        invoke<string>('postgres_import_from_file', { serverId, dbName, schema, mode, table }),

    // MQTT
    mqttConnect: (id: string): Promise<boolean> => invoke<boolean>('mqtt_connect', { id }),
    mqttClose: (id: string): Promise<void> => invoke<void>('mqtt_close', { id }),
    mqttPublish: (
        id: string,
        topic: string,
        payload: string,
        qos: number,
        retained: boolean
    ): Promise<void> => invoke<void>('mqtt_publish', { id, topic, payload, qos, retained }),
    mqttSubscribe: (id: string, topic: string, qos: number): Promise<void> =>
        invoke<void>('mqtt_subscribe', { id, topic, qos }),
    mqttUnsubscribe: (id: string, topic: string): Promise<void> =>
        invoke<void>('mqtt_unsubscribe', { id, topic }),
    mqttSubscriptions: (id: string): Promise<MqttSubscription[]> =>
        invoke<MqttSubscription[]>('mqtt_subscriptions', { id }).then((r) => r || []),
    mqttTestConnection: (cfg: ServerConfig): Promise<{ connected: boolean; pingMs: number }> =>
        invoke<{ connected: boolean; pingMs: number }>('mqtt_test_connection', { cfg }).then(
            (r) => r || { connected: true, pingMs: 0 }
        ),

    // API & WS
    apiRequest: (req: ApiRequest): Promise<ApiResponse> =>
        invoke<ApiResponse>('api_request', { req }),
    loadApiTree: (): Promise<string> => invoke<string>('load_api_tree'),
    saveApiTree: (content: string): Promise<void> => invoke<void>('save_api_tree', { content }),
    chooseImportApiFile: (): Promise<string> => invoke<string>('choose_import_api_file'),
    chooseExportApiFile: (content: string, defaultName?: string): Promise<string> =>
        invoke<string>('choose_export_api_file', {
            content,
            defaultName: defaultName || 'apis_backup.json',
        }),
    wsConnect: (
        urlOrReq: any,
        headers?: any[],
        insecureTLS?: boolean,
        auth?: any,
        protocols?: string[]
    ): Promise<any> => {
        if (typeof urlOrReq === 'string') {
            return invoke('ws_connect', {
                req: {
                    url: urlOrReq,
                    headers: (headers || []).map((h: any) => ({
                        name: h.name,
                        value: h.value,
                        enabled: !!h.enabled,
                    })),
                    insecureTLS: !!insecureTLS,
                    auth: auth || { type: 'none' },
                    protocols: protocols || [],
                },
            })
        }
        return invoke('ws_connect', { req: urlOrReq })
    },
    wsSend: (id: string, message: string): Promise<void> =>
        invoke<void>('ws_send', { id, message }),
    wsClose: (id: string): Promise<void> => invoke<void>('ws_close', { id }),

    // MongoDB
    mongoConnect: (id: string): Promise<boolean> => invoke<boolean>('mongo_connect', { id }),
    mongoClose: (id: string): Promise<void> => invoke<void>('mongo_close', { id }),
    mongoParseURI: (uri: string): Promise<MongoURIInfo> =>
        invoke<MongoURIInfo>('mongo_parse_uri', { uri }),
    mongoTestConnection: (cfg: ServerConfig): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('mongo_test_connection', { cfg }).then((r) => r || {}),
    mongoHealthCheck: (id: string): Promise<MongoHealthInfo | null> =>
        invoke<MongoHealthInfo | null>('mongo_health_check', { id }),
    mongoServerStatus: (id: string): Promise<MongoServerStatus | null> =>
        invoke<MongoServerStatus | null>('mongo_server_status', { id }),
    mongoClientStats: (id: string): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('mongo_client_stats', { id }).then((r) => r || {}),
    mongoCurrentOps: (id: string): Promise<string[]> =>
        invoke<string[]>('mongo_current_ops', { id }).then((r) => r || []),
    mongoDatabases: (id: string): Promise<MongoDatabaseInfo[]> =>
        invoke<MongoDatabaseInfo[]>('mongo_databases', { id }).then((r) => r || []),
    mongoCollections: (id: string, dbName: string): Promise<MongoCollectionInfo[]> =>
        invoke<MongoCollectionInfo[]>('mongo_collections', { id, dbName }).then((r) => r || []),
    mongoCreateDatabase: (id: string, dbName: string, firstCollection: string): Promise<void> =>
        invoke<void>('mongo_create_database', { id, dbName, firstCollection }),
    mongoDropDatabase: (id: string, dbName: string): Promise<void> =>
        invoke<void>('mongo_drop_database', { id, dbName }),
    mongoCreateCollection: (id: string, dbName: string, coll: string): Promise<void> =>
        invoke<void>('mongo_create_collection', { id, dbName, coll }),
    mongoDropCollection: (id: string, dbName: string, coll: string): Promise<void> =>
        invoke<void>('mongo_drop_collection', { id, dbName, coll }),
    mongoRenameCollection: (
        id: string,
        dbName: string,
        coll: string,
        newName: string
    ): Promise<void> => invoke<void>('mongo_rename_collection', { id, dbName, coll, newName }),
    mongoCollectionStats: (
        id: string,
        dbName: string,
        coll: string
    ): Promise<MongoCollectionStats | null> =>
        invoke<MongoCollectionStats | null>('mongo_collection_stats', { id, dbName, coll }),
    mongoInferSchema: (
        id: string,
        dbName: string,
        coll: string,
        sampleSize: number
    ): Promise<MongoFieldInfo[]> =>
        invoke<MongoFieldInfo[]>('mongo_infer_schema', { id, dbName, coll, sampleSize }).then(
            (r) => r || []
        ),
    mongoGetValidator: (id: string, dbName: string, coll: string): Promise<MongoValidatorInfo> =>
        invoke<MongoValidatorInfo>('mongo_get_validator', { id, dbName, coll }),
    mongoSetValidator: (
        id: string,
        dbName: string,
        coll: string,
        validatorJson: string,
        level: string,
        action: string
    ): Promise<void> =>
        invoke<void>('mongo_set_validator', { id, dbName, coll, validatorJson, level, action }),
    mongoValidateDocument: (
        id: string,
        dbName: string,
        coll: string,
        docJson: string
    ): Promise<MongoValidationResult | null> =>
        invoke<MongoValidationResult | null>('mongo_validate_document', {
            id,
            dbName,
            coll,
            docJson,
        }),
    mongoFind: (id: string, spec: MongoQuerySpec): Promise<MongoFindResult> =>
        invoke<MongoFindResult>('mongo_find', { id, spec }),
    mongoCountDocuments: (
        id: string,
        dbName: string,
        coll: string,
        filterJson: string
    ): Promise<number> => invoke<number>('mongo_count_documents', { id, dbName, coll, filterJson }),
    mongoDistinct: (
        id: string,
        dbName: string,
        coll: string,
        field: string,
        filterJson: string
    ): Promise<string[]> =>
        invoke<string[]>('mongo_distinct', { id, dbName, coll, field, filterJson }).then(
            (r) => r || []
        ),
    mongoExplain: (id: string, spec: MongoQuerySpec, verbosity: string): Promise<string> =>
        invoke<string>('mongo_explain', { id, spec, verbosity }),
    mongoInsertOne: (id: string, dbName: string, coll: string, docJson: string): Promise<string> =>
        invoke<string>('mongo_insert_one', { id, dbName, coll, docJson }),
    mongoInsertMany: (
        id: string,
        dbName: string,
        coll: string,
        docsJson: string,
        ordered: boolean
    ): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('mongo_insert_many', {
            id,
            dbName,
            coll,
            docsJson,
            ordered,
        }).then((r) => r || {}),
    mongoUpdateOne: (
        id: string,
        dbName: string,
        coll: string,
        filterJson: string,
        updateJson: string,
        upsert: boolean
    ): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('mongo_update_one', {
            id,
            dbName,
            coll,
            filterJson,
            updateJson,
            upsert,
        }).then((r) => r || {}),
    mongoUpdateMany: (
        id: string,
        dbName: string,
        coll: string,
        filterJson: string,
        updateJson: string,
        upsert: boolean
    ): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('mongo_update_many', {
            id,
            dbName,
            coll,
            filterJson,
            updateJson,
            upsert,
        }).then((r) => r || {}),
    mongoReplaceOne: (
        id: string,
        dbName: string,
        coll: string,
        filterJson: string,
        docJson: string,
        upsert: boolean
    ): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('mongo_replace_one', {
            id,
            dbName,
            coll,
            filterJson,
            docJson,
            upsert,
        }).then((r) => r || {}),
    mongoDeleteOne: (
        id: string,
        dbName: string,
        coll: string,
        filterJson: string
    ): Promise<number> => invoke<number>('mongo_delete_one', { id, dbName, coll, filterJson }),
    mongoDeleteMany: (
        id: string,
        dbName: string,
        coll: string,
        filterJson: string
    ): Promise<number> => invoke<number>('mongo_delete_many', { id, dbName, coll, filterJson }),
    mongoFindOneAndUpdate: (
        id: string,
        dbName: string,
        coll: string,
        filterJson: string,
        updateJson: string,
        returnNew: boolean
    ): Promise<string> =>
        invoke<string>('mongo_find_one_and_update', {
            id,
            dbName,
            coll,
            filterJson,
            updateJson,
            returnNew,
        }),
    mongoBulkWrite: (
        id: string,
        dbName: string,
        coll: string,
        ops: MongoBulkOp[],
        ordered: boolean
    ): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('mongo_bulk_write', { id, dbName, coll, ops, ordered }).then(
            (r) => r || {}
        ),
    mongoAggregate: (
        id: string,
        dbName: string,
        coll: string,
        pipelineJson: string,
        allowDiskUse: boolean,
        maxTimeMs: number
    ): Promise<MongoFindResult> =>
        invoke<MongoFindResult>('mongo_aggregate', {
            id,
            dbName,
            coll,
            pipelineJson,
            allowDiskUse,
            maxTimeMs,
        }),
    mongoAggregateExplain: (
        id: string,
        dbName: string,
        coll: string,
        pipelineJson: string
    ): Promise<string> =>
        invoke<string>('mongo_aggregate_explain', { id, dbName, coll, pipelineJson }),
    mongoRunCommand: (id: string, dbName: string, commandJson: string): Promise<string> =>
        invoke<string>('mongo_run_command', { id, dbName, commandJson }),
    mongoIndexes: (id: string, dbName: string, coll: string): Promise<MongoIndexInfo[]> =>
        invoke<MongoIndexInfo[]>('mongo_indexes', { id, dbName, coll }).then((r) => r || []),
    mongoCreateIndex: (
        id: string,
        dbName: string,
        coll: string,
        keysJson: string,
        name: string,
        unique: boolean,
        sparse: boolean,
        expireAfterSeconds: number
    ): Promise<string> =>
        invoke<string>('mongo_create_index', {
            id,
            dbName,
            coll,
            keysJson,
            name,
            unique,
            sparse,
            expireAfterSeconds,
        }),
    mongoDropIndex: (id: string, dbName: string, coll: string, name: string): Promise<void> =>
        invoke<void>('mongo_drop_index', { id, dbName, coll, name }),
    mongoIndexStats: (id: string, dbName: string, coll: string): Promise<string[]> =>
        invoke<string[]>('mongo_index_stats', { id, dbName, coll }).then((r) => r || []),
    mongoTransaction: (id: string, ops: MongoTxOp[]): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('mongo_transaction', { id, ops }).then((r) => r || {}),
    mongoWatch: (
        id: string,
        scope: string,
        dbName: string,
        coll: string,
        pipelineJson: string,
        fullDocument: string
    ): Promise<string> =>
        invoke<string>('mongo_watch', {
            id,
            scope,
            dbName,
            coll,
            pipelineJson,
            fullDocument,
        }),
    mongoUnwatch: (id: string, watchKey: string): Promise<void> =>
        invoke<void>('mongo_unwatch', { id, watchKey }),
    mongoWatchList: (id: string): Promise<string[]> =>
        invoke<string[]>('mongo_watch_list', { id }).then((r) => r || []),
    mongoUsers: (id: string, dbName: string): Promise<MongoUserInfo[]> =>
        invoke<MongoUserInfo[]>('mongo_users', { id, dbName }).then((r) => r || []),
    mongoCreateUser: (id: string, req: MongoCreateUserReq): Promise<void> =>
        invoke<void>('mongo_create_user', { id, req }),
    mongoUpdateUser: (id: string, req: MongoUpdateUserReq): Promise<void> =>
        invoke<void>('mongo_update_user', { id, req }),
    mongoDropUser: (id: string, dbName: string, username: string): Promise<void> =>
        invoke<void>('mongo_drop_user', { id, dbName, username }),
    mongoCreateCollectionAdvanced: (
        id: string,
        dbName: string,
        opt: MongoCreateCollOptions
    ): Promise<void> => invoke<void>('mongo_create_collection_advanced', { id, dbName, opt }),
    mongoCloneCollection: (id: string, req: MongoCloneCollReq): Promise<number> =>
        invoke<number>('mongo_clone_collection', { id, req }),
    mongoGetProfilingStatus: (id: string, dbName: string): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('mongo_get_profiling_status', { id, dbName }).then(
            (r) => r || {}
        ),
    mongoSetProfilingStatus: (
        id: string,
        dbName: string,
        level: number,
        slowms: number
    ): Promise<void> =>
        invoke<void>('mongo_set_profiling_status', { id, dbName, level, slowms }),
    mongoSlowQueries: (id: string, dbName: string, limit: number): Promise<string[]> =>
        invoke<string[]>('mongo_slow_queries', { id, dbName, limit }).then((r) => r || []),

    // SQLite
    sqliteOpenFile: (): Promise<string> => invoke<string>('sqlite_open_file'),
    sqliteConnect: (id: string, filePath: string): Promise<boolean> =>
        invoke<boolean>('sqlite_connect', { id, filePath }),
    sqliteClose: (id: string): Promise<void> => invoke<void>('sqlite_close', { id }),
    sqliteInfo: (id: string): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('sqlite_info', { id }).then((r) => r || {}),
    sqliteTables: (id: string): Promise<SqliteTableInfo[]> =>
        invoke<SqliteTableInfo[]>('sqlite_tables', { id }).then((r) => r || []),
    sqliteDescribe: (id: string, table: string): Promise<SqliteColumnInfo[]> =>
        invoke<SqliteColumnInfo[]>('sqlite_describe', { id, table }).then((r) => r || []),
    sqliteSelect: (
        id: string,
        table: string,
        limit: number,
        offset: number
    ): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('sqlite_select', { id, table, limit, offset }).then(
            (r) => r || {}
        ),
    sqliteCount: (id: string, table: string): Promise<number> =>
        invoke<number>('sqlite_count', { id, table }),
    sqliteIndexes: (id: string, table: string): Promise<SqliteIndexInfo[]> =>
        invoke<SqliteIndexInfo[]>('sqlite_indexes', { id, table }).then((r) => r || []),
    sqliteRun: (id: string, sqlText: string): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('sqlite_run', { id, sqlText }).then((r) => r || {}),
    sqliteSchema: (id: string): Promise<Record<string, any>> =>
        invoke<Record<string, any>>('sqlite_schema', { id }).then((r) => r || {}),

    // SSH 扩展运维
    sshDashboardStats: (sessionId: string): Promise<SSHDashboardInfo> =>
        invoke<SSHDashboardInfo>('ssh_dashboard_stats', { sessionId }),
    sshProcessList: (sessionId: string): Promise<SSHProcessInfo[]> =>
        invoke<SSHProcessInfo[]>('ssh_process_list', { sessionId }).then((r) => r || []),
    sshKillProcess: (sessionId: string, pid: number): Promise<void> =>
        invoke<void>('ssh_kill_process', { sessionId, pid }),
    sshServiceList: (sessionId: string): Promise<SSHServiceInfo[]> =>
        invoke<SSHServiceInfo[]>('ssh_service_list', { sessionId }).then((r) => r || []),
    sshControlService: (sessionId: string, serviceName: string, action: string): Promise<void> =>
        invoke<void>('ssh_control_service', { sessionId, serviceName, action }),
    sshServiceLogs: (sessionId: string, serviceName: string): Promise<string> =>
        invoke<string>('ssh_service_logs', { sessionId, serviceName }),
    sshCronList: (sessionId: string): Promise<SSHCronItem[]> =>
        invoke<SSHCronItem[]>('ssh_cron_list', { sessionId }).then((r) => r || []),
    sshSaveCronList: (sessionId: string, items: SSHCronItem[]): Promise<void> =>
        invoke<void>('ssh_save_cron_list', { sessionId, items }),
    sshRunCronCommand: (sessionId: string, command: string): Promise<string> =>
        invoke<string>('ssh_run_cron_command', { sessionId, command }),

    // Docker 独立客户端
    dockerConnect: (id: string): Promise<boolean> => invoke<boolean>('docker_connect', { id }),
    dockerClose: (id: string): Promise<void> => invoke<void>('docker_close', { id }),
    dockerTestConnection: (cfg: ServerConfig): Promise<string> =>
        invoke<string>('docker_test_connection', { cfg }),
    dockerPing: (id: string): Promise<string> => invoke<string>('docker_ping', { id }),
    dockerGetOverview: (id: string): Promise<DockerOverview> =>
        invoke<DockerOverview>('docker_get_overview', { id }),
    dockerListContainers: (id: string, all: boolean): Promise<DockerContainerInfo[]> =>
        invoke<DockerContainerInfo[]>('docker_list_containers', { id, all }).then((r) => r || []),
    dockerControlContainer: (id: string, containerId: string, action: string): Promise<void> =>
        invoke<void>('docker_control_container', { id, containerId, action }),
    dockerInspectContainer: (id: string, containerId: string): Promise<string> =>
        invoke<string>('docker_inspect_container', { id, containerId }),
    dockerGetContainerLogs: (
        id: string,
        containerId: string,
        tail: number,
        timestamps: boolean
    ): Promise<string> =>
        invoke<string>('docker_get_container_logs', { id, containerId, tail, timestamps }),
    dockerStartLogStream: (
        id: string,
        containerId: string,
        streamId: string,
        tail: number,
        timestamps: boolean,
        follow: boolean
    ): Promise<string> =>
        invoke<string>('docker_logs_stream_start', {
            id,
            containerId,
            streamId,
            tail,
            timestamps,
            follow,
        }),
    dockerStopLogStream: (streamId: string): Promise<void> =>
        invoke<void>('docker_logs_stream_stop', { streamId }),
    dockerCreateContainer: (id: string, req: any): Promise<string> =>
        invoke<string>('docker_create_container', { id, req }),
    dockerListImages: (id: string): Promise<DockerImageInfo[]> =>
        invoke<DockerImageInfo[]>('docker_list_images', { id }).then((r) => r || []),
    dockerInspectImage: (id: string, imageId: string): Promise<string> =>
        invoke<string>('docker_inspect_image', { id, imageId }),
    dockerPullImage: (id: string, imageName: string): Promise<string> =>
        invoke<string>('docker_pull_image', { id, imageName }),
    dockerSaveImage: (
        id: string,
        imageIdOrTag: string,
        defaultFilename: string
    ): Promise<string> =>
        invoke<string>('docker_save_image', { id, imageIdOrTag, defaultFilename }),
    dockerLoadImage: (id: string): Promise<string> => invoke<string>('docker_load_image', { id }),
    dockerRemoveImage: (id: string, imageId: string, force: boolean): Promise<void> =>
        invoke<void>('docker_remove_image', { id, imageId, force }),
    dockerListVolumes: (id: string): Promise<DockerVolumeInfo[]> =>
        invoke<DockerVolumeInfo[]>('docker_list_volumes', { id }).then((r) => r || []),
    dockerCreateVolume: (
        id: string,
        name: string,
        driver: string,
        labels: Record<string, string>
    ): Promise<DockerVolumeInfo> =>
        invoke<DockerVolumeInfo>('docker_create_volume', { id, name, driver, labels }),
    dockerRemoveVolume: (id: string, name: string, force: boolean): Promise<void> =>
        invoke<void>('docker_remove_volume', { id, name, force }),
    dockerListNetworks: (id: string): Promise<DockerNetworkInfo[]> =>
        invoke<DockerNetworkInfo[]>('docker_list_networks', { id }).then((r) => r || []),
    dockerCreateNetwork: (id: string, name: string, driver: string): Promise<string> =>
        invoke<string>('docker_create_network', { id, name, driver }),
    dockerRemoveNetwork: (id: string, networkId: string): Promise<void> =>
        invoke<void>('docker_remove_network', { id, networkId }),
    dockerSystemPrune: (
        id: string,
        pruneContainers: boolean,
        pruneImages: boolean,
        pruneVolumes: boolean,
        pruneNetworks: boolean
    ): Promise<DockerPruneReport> =>
        invoke<DockerPruneReport>('docker_system_prune', {
            id,
            pruneContainers,
            pruneImages,
            pruneVolumes,
            pruneNetworks,
        }),

    // Docker Compose
    dockerListComposeStacks: (id: string): Promise<DockerComposeStackInfo[]> =>
        invoke<DockerComposeStackInfo[]>('docker_list_compose_stacks', { id }).then(
            (r) => r || []
        ),
    dockerGetComposeStack: (
        id: string,
        projectName: string
    ): Promise<DockerComposeStackInfo | null> =>
        invoke<DockerComposeStackInfo | null>('docker_get_compose_stack', { id, projectName }),
    dockerDeployComposeStack: (id: string, req: any): Promise<void> =>
        invoke<void>('docker_deploy_compose_stack', { id, req }),
    dockerControlComposeStack: (
        id: string,
        projectName: string,
        action: string
    ): Promise<void> =>
        invoke<void>('docker_control_compose_stack', { id, projectName, action }),
    dockerGetComposeStackLogs: (
        id: string,
        projectName: string,
        tail: number
    ): Promise<string> =>
        invoke<string>('docker_get_compose_stack_logs', { id, projectName, tail }),
    dockerListComposeRecords: (serverId: string): Promise<DockerComposeRecord[]> =>
        invoke<DockerComposeRecord[]>('docker_list_compose_records', { serverId }).then(
            (r) => r || []
        ),
    dockerGetComposeRecord: (id: string): Promise<DockerComposeRecord | null> =>
        invoke<DockerComposeRecord | null>('docker_get_compose_record', { id }),
    dockerSaveComposeRecord: (record: DockerComposeRecord): Promise<DockerComposeRecord | null> =>
        invoke<DockerComposeRecord | null>('docker_save_compose_record', { record }),
    dockerDeleteComposeRecord: (serverId: string, id: string): Promise<void> =>
        invoke<void>('docker_delete_compose_record', { serverId, id }),
    dockerUpComposeStack: (
        serverId: string,
        record: DockerComposeRecord,
        forcePull = false,
        recreate = false
    ): Promise<DockerComposeRecord | null> =>
        invoke<DockerComposeRecord | null>('docker_up_compose_stack', {
            serverId,
            record,
            forcePull,
            recreate,
        }),
    dockerExecStart: (
        serverId: string,
        containerId: string,
        command: string,
        cols: number,
        rows: number
    ): Promise<string> =>
        invoke<string>('docker_exec_start', { serverId, containerId, command, cols, rows }),
    dockerExecWrite: (execId: string, data: string): Promise<void> =>
        invoke<void>('docker_exec_write', { execId, data }),
    dockerExecResize: (
        serverId: string,
        execId: string,
        cols: number,
        rows: number
    ): Promise<void> =>
        invoke<void>('docker_exec_resize', { serverId, execId, cols, rows }),
    dockerExecClose: (execId: string): Promise<void> =>
        invoke<void>('docker_exec_close', { execId }),

    // Kubernetes (K8s) 独立客户端
    k8sConnect: (id: string): Promise<boolean> => invoke<boolean>('k8s_connect', { id }),
    k8sClose: (id: string): Promise<void> => invoke<void>('k8s_close', { id }),
    k8sTestConnection: (cfg: ServerConfig): Promise<string> =>
        invoke<string>('k8s_test_connection', { cfg }),
    k8sParseKubeconfig: (data: string, path: string): Promise<KubeconfigContextInfo> =>
        invoke<KubeconfigContextInfo>('k8s_parse_kubeconfig', { data, path }),
    k8sPing: (id: string): Promise<string> => invoke<string>('k8s_ping', { id }),
    k8sGetOverview: (id: string): Promise<K8sOverview> =>
        invoke<K8sOverview>('k8s_get_overview', { id }),
    k8sListNamespaces: (id: string): Promise<K8sNamespaceInfo[]> =>
        invoke<K8sNamespaceInfo[]>('k8s_list_namespaces', { id }).then((r) => r || []),
    k8sListNodes: (id: string): Promise<K8sNodeInfo[]> =>
        invoke<K8sNodeInfo[]>('k8s_list_nodes', { id }).then((r) => r || []),
    k8sListPods: (id: string, namespace: string): Promise<K8sPodInfo[]> =>
        invoke<K8sPodInfo[]>('k8s_list_pods', { id, namespace }).then((r) => r || []),
    k8sGetPodLogs: (
        id: string,
        namespace: string,
        podName: string,
        containerName: string,
        tail: number,
        timestamps: boolean
    ): Promise<string> =>
        invoke<string>('k8s_get_pod_logs', {
            id,
            namespace,
            podName,
            containerName,
            tail,
            timestamps,
        }),
    k8sDeletePod: (id: string, namespace: string, podName: string): Promise<void> =>
        invoke<void>('k8s_delete_pod', { id, namespace, podName }),
    k8sListDeployments: (id: string, namespace: string): Promise<K8sDeploymentInfo[]> =>
        invoke<K8sDeploymentInfo[]>('k8s_list_deployments', { id, namespace }).then((r) => r || []),
    k8sScaleDeployment: (
        id: string,
        namespace: string,
        name: string,
        replicas: number
    ): Promise<void> =>
        invoke<void>('k8s_scale_deployment', { id, namespace, name, replicas }),
    k8sRestartDeployment: (id: string, namespace: string, name: string): Promise<void> =>
        invoke<void>('k8s_restart_deployment', { id, namespace, name }),
    k8sDeleteDeployment: (id: string, namespace: string, name: string): Promise<void> =>
        invoke<void>('k8s_delete_deployment', { id, namespace, name }),
    k8sListServices: (id: string, namespace: string): Promise<K8sServiceInfo[]> =>
        invoke<K8sServiceInfo[]>('k8s_list_services', { id, namespace }).then((r) => r || []),
    k8sDeleteService: (id: string, namespace: string, name: string): Promise<void> =>
        invoke<void>('k8s_delete_service', { id, namespace, name }),
    k8sListIngresses: (id: string, namespace: string): Promise<K8sIngressInfo[]> =>
        invoke<K8sIngressInfo[]>('k8s_list_ingresses', { id, namespace }).then((r) => r || []),
    k8sDeleteIngress: (id: string, namespace: string, name: string): Promise<void> =>
        invoke<void>('k8s_delete_ingress', { id, namespace, name }),
    k8sListConfigMaps: (id: string, namespace: string): Promise<K8sConfigMapInfo[]> =>
        invoke<K8sConfigMapInfo[]>('k8s_list_config_maps', { id, namespace }).then((r) => r || []),
    k8sDeleteConfigMap: (id: string, namespace: string, name: string): Promise<void> =>
        invoke<void>('k8s_delete_config_map', { id, namespace, name }),
    k8sListSecrets: (id: string, namespace: string): Promise<K8sSecretInfo[]> =>
        invoke<K8sSecretInfo[]>('k8s_list_secrets', { id, namespace }).then((r) => r || []),
    k8sDeleteSecret: (id: string, namespace: string, name: string): Promise<void> =>
        invoke<void>('k8s_delete_secret', { id, namespace, name }),
    k8sListPVCs: (id: string, namespace: string): Promise<K8sPVCInfo[]> =>
        invoke<K8sPVCInfo[]>('k8s_list_pvcs', { id, namespace }).then((r) => r || []),
    k8sDeletePVC: (id: string, namespace: string, name: string): Promise<void> =>
        invoke<void>('k8s_delete_pvc', { id, namespace, name }),
    k8sCreateNamespace: (id: string, name: string): Promise<void> =>
        invoke<void>('k8s_create_namespace', { id, name }),
    k8sDeleteNamespace: (id: string, name: string): Promise<void> =>
        invoke<void>('k8s_delete_namespace', { id, name }),
    k8sGetResourceYAML: (
        id: string,
        kind: string,
        namespace: string,
        name: string
    ): Promise<string> =>
        invoke<string>('k8s_get_resource_yaml', { id, kind, namespace, name }),
    k8sExecStart: (
        id: string,
        namespace: string,
        podName: string,
        container: string,
        command: string,
        cols: number,
        rows: number
    ): Promise<string> =>
        invoke<string>('k8s_exec_start', {
            id,
            namespace,
            podName,
            container,
            command,
            cols,
            rows,
        }),
    k8sExecWrite: (execId: string, data: string): Promise<void> =>
        invoke<void>('k8s_exec_write', { execId, data }),
    k8sExecResize: (execId: string, cols: number, rows: number): Promise<void> =>
        invoke<void>('k8s_exec_resize', { execId, cols, rows }),
    k8sExecClose: (execId: string): Promise<void> =>
        invoke<void>('k8s_exec_close', { execId }),
    k8sApplyYAML: (id: string, yamlContent: string): Promise<K8sApplyResult[]> =>
        invoke<K8sApplyResult[]>('k8s_apply_yaml', { id, yamlContent }).then((r) => r || []),
    k8sDeleteYAML: (id: string, yamlContent: string): Promise<K8sDeleteResult[]> =>
        invoke<K8sDeleteResult[]>('k8s_delete_yaml', { id, yamlContent }).then((r) => r || []),
    k8sListOrchestrationRecords: (serverId: string): Promise<K8sOrchestrationRecord[]> =>
        invoke<K8sOrchestrationRecord[]>('k8s_list_orchestration_records', { serverId }).then(
            (r) => r || []
        ),
    k8sGetOrchestrationRecord: (id: string): Promise<K8sOrchestrationRecord | null> =>
        invoke<K8sOrchestrationRecord | null>('k8s_get_orchestration_record', { id }),
    k8sApplyOrchestration: (
        serverId: string,
        record: K8sOrchestrationRecord
    ): Promise<K8sApplyResult[]> =>
        invoke<K8sApplyResult[]>('k8s_apply_orchestration', { serverId, record }).then(
            (r) => r || []
        ),
    k8sOfflineOrchestration: (
        serverId: string,
        recordId: string,
        deleteLocalFile: boolean
    ): Promise<K8sDeleteResult[]> =>
        invoke<K8sDeleteResult[]>('k8s_offline_orchestration', {
            serverId,
            recordId,
            deleteLocalFile,
        }).then((r) => r || []),
    k8sDeleteOrchestrationRecordOnly: (recordId: string): Promise<void> =>
        invoke<void>('k8s_delete_orchestration_record_only', { recordId }),

    // 11. AI Agent (Multi-Layer Orchestration)
    agentGetStatus: (): Promise<AgentStatusInfo> =>
        invoke<AgentStatusInfo>('agent_get_status'),
    agentChatSend: (req: ChatSendRequest): Promise<ChatSendResult> =>
        invoke<ChatSendResult>('agent_chat_send', { req }),
    agentStop: (conversationId: string): Promise<void> =>
        invoke<void>('agent_stop', { conversationId }),
    agentApprovalRespond: (
        approvalId: string,
        decision: ApprovalDecision
    ): Promise<void> =>
        invoke<void>('agent_approval_respond', { approvalId, decision }),
    agentAskUserRespond: (askId: string, answers: any): Promise<void> =>
        invoke<void>('agent_ask_user_respond', { askId, answers }),
    agentListSubagents: (): Promise<SubAgentInfo[]> =>
        invoke<SubAgentInfo[]>('agent_list_subagents'),
    agentSetSubagentEnabled: (
        agentId: string,
        enabled: boolean
    ): Promise<SubAgentInfo[]> =>
        invoke<SubAgentInfo[]>('agent_set_subagent_enabled', { agentId, enabled }),
    agentListConversations: (): Promise<AgentSessionRecord[]> =>
        invoke<AgentSessionRecord[]>('agent_list_conversations'),
    agentGetConversation: (conversationId: string): Promise<ConversationDetail> =>
        invoke<ConversationDetail>('agent_get_conversation', { conversationId }),
    agentRenameConversation: (
        conversationId: string,
        title: string
    ): Promise<void> =>
        invoke<void>('agent_rename_conversation', { conversationId, title }),
    agentDeleteConversation: (conversationId: string): Promise<void> =>
        invoke<void>('agent_delete_conversation', { conversationId }),
    agentUpdateConversationWorkspace: (
        conversationId: string,
        workspaceDir: string
    ): Promise<void> =>
        invoke<void>('agent_update_conversation_workspace', {
            conversationId,
            workspaceDir,
        }),

    // 12. LLM Wiki Knowledge Base
    wikiGetInfo: (): Promise<WikiInfo> => invoke<WikiInfo>('wiki_get_info'),
    wikiListTree: (): Promise<WikiTreeNode[]> =>
        invoke<WikiTreeNode[]>('wiki_list_tree').then((r) => r || []),
    wikiReadPage: (relPath: string): Promise<WikiPageDetail> =>
        invoke<WikiPageDetail>('wiki_read_page', { relPath }),
    wikiSavePage: (relPath: string, content: string): Promise<WikiPageDetail> =>
        invoke<WikiPageDetail>('wiki_save_page', { relPath, content }),
    wikiDeletePage: (relPath: string): Promise<void> =>
        invoke<void>('wiki_delete_page', { relPath }),
    wikiSearch: (
        query: string,
        scope?: 'wiki' | 'raw' | 'all',
        limit?: number
    ): Promise<WikiSearchHit[]> =>
        invoke<WikiSearchHit[]>('wiki_search', { query, scope, limit }).then((r) => r || []),
    wikiGetGraph: (): Promise<WikiGraphData> =>
        invoke<WikiGraphData>('wiki_get_graph'),
    wikiIngestFile: (localPath: string): Promise<WikiIngestResult> =>
        invoke<WikiIngestResult>('wiki_ingest_file', { localPath }),
    wikiIngestUrl: (url: string): Promise<WikiIngestResult> =>
        invoke<WikiIngestResult>('wiki_ingest_url', { url }),
    wikiIngestText: (
        title: string,
        content: string,
        sourceLabel?: string
    ): Promise<WikiIngestResult> =>
        invoke<WikiIngestResult>('wiki_ingest_text', {
            title,
            content,
            sourceLabel,
        }),
    wikiLint: (): Promise<WikiLintReport> => invoke<WikiLintReport>('wiki_lint'),
    wikiRebuildIndex: (): Promise<WikiInfo> =>
        invoke<WikiInfo>('wiki_rebuild_index'),
    wikiOpenFolder: (): Promise<void> => invoke<void>('wiki_open_folder'),
}

/* ------------------------------------------------------------------ */
/* 事件总线：基于 @tauri-apps/api/event */
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
        let active = true
        let unlistenFn: (() => void) | null = null
        listen(event, (ev: any) => {
            if (!active) return
            const data = ev?.payload !== undefined ? ev.payload : ev
            subscribers.get(event)?.forEach((fn) => fn(data))
        })
            .then((unlisten) => {
                if (active) {
                    unlistenFn = unlisten
                } else {
                    unlisten()
                }
            })
            .catch(() => {})

        boundUnsubscribers.set(event, () => {
            active = false
            if (unlistenFn) unlistenFn()
        })
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

export function emitEvent(event: string, ...args: any[]): void {
    subscribers.get(event)?.forEach((fn) => fn(...args))
    void emit(event, args.length === 1 ? args[0] : args).catch(() => {})
}

let dropUnsubscriber: (() => void) | null = null

/** 注册系统级文件拖放 */
export function registerNativeFileDrop(
    handler: (paths: string[], details?: any) => void
): boolean {
    if (dropUnsubscriber) {
        dropUnsubscriber()
        dropUnsubscriber = null
    }
    const unsubEvent = subscribe('files:dropped', (payload: any) => {
        const files: string[] = Array.isArray(payload) ? payload : payload?.files || []
        if (!files || files.length === 0) return
        handler(files, payload?.details)
    })

    let unsubWindowDrop: (() => void) | null = null
    let active = true
    try {
        getCurrentWindow()
            .onDragDropEvent((event) => {
                if (!active) return
                if (event.payload.type === 'drop') {
                    const paths = event.payload.paths
                    if (paths && paths.length > 0) {
                        handler(paths)
                    }
                }
            })
            .then((unlisten) => {
                if (active) {
                    unsubWindowDrop = unlisten
                } else {
                    unlisten()
                }
            })
            .catch(() => {})
    } catch {}

    dropUnsubscriber = () => {
        active = false
        unsubEvent()
        if (unsubWindowDrop) unsubWindowDrop()
    }
    // Tauri 原生 dragDropEnabled 已关闭以解禁 DOM HTML5 拖拽，返回 false 启用应用内及文件面板的 HTML5 拖拽处理
    return false
}

export function unregisterNativeFileDrop(): void {
    if (dropUnsubscriber) {
        dropUnsubscriber()
        dropUnsubscriber = null
    }
}
