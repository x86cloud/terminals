export type AuthType = 'password' | 'key'

export interface ServerConfig {
    id: string
    name: string
    host: string
    port: number
    username: string
    authType: AuthType
    password: string
    privateKey: string
    passphrase: string
    remark: string
    updatedAt: number
}

export interface SessionInfo {
    id: string
    serverId: string
    title: string
    host: string
    port: number
    username: string
    connected: boolean
    homeDir: string
}

export interface FileItem {
    name: string
    path: string
    isDir: boolean
    isLink: boolean
    size: number
    mode: string
    modTime: number
}

export interface DirListing {
    path: string
    parent: string
    items: FileItem[]
}

export type TransferStatus = 'running' | 'done' | 'error' | 'canceled'

export interface Transfer {
    id: string
    sessionId: string
    kind: 'upload' | 'download'
    name: string
    localPath: string
    remotePath: string
    size: number
    transferred: number
    status: TransferStatus
    error: string
    startedAt: number
    updatedAt: number
}

export function emptyServer(): ServerConfig {
    return {
        id: '',
        name: '',
        host: '',
        port: 22,
        username: 'root',
        authType: 'password',
        password: '',
        privateKey: '',
        passphrase: '',
        remark: '',
        updatedAt: 0,
    }
}
