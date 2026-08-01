export namespace main {
	
	export class ApiAuth {
	    type: string;
	    username: string;
	    password: string;
	    token: string;
	
	    static createFrom(source: any = {}) {
	        return new ApiAuth(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.token = source["token"];
	    }
	}
	export class ApiHeader {
	    name: string;
	    value: string;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ApiHeader(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.enabled = source["enabled"];
	    }
	}
	export class ApiRequest {
	    method: string;
	    url: string;
	    headers: ApiHeader[];
	    body: string;
	    timeoutMs: number;
	    insecureTLS: boolean;
	    followRedirects: boolean;
	    auth?: ApiAuth;
	
	    static createFrom(source: any = {}) {
	        return new ApiRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.method = source["method"];
	        this.url = source["url"];
	        this.headers = this.convertValues(source["headers"], ApiHeader);
	        this.body = source["body"];
	        this.timeoutMs = source["timeoutMs"];
	        this.insecureTLS = source["insecureTLS"];
	        this.followRedirects = source["followRedirects"];
	        this.auth = this.convertValues(source["auth"], ApiAuth);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ApiResponse {
	    status: string;
	    statusCode: number;
	    proto: string;
	    headers: Record<string, string>;
	    body: string;
	    durationMs: number;
	    size: number;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new ApiResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.statusCode = source["statusCode"];
	        this.proto = source["proto"];
	        this.headers = source["headers"];
	        this.body = source["body"];
	        this.durationMs = source["durationMs"];
	        this.size = source["size"];
	        this.error = source["error"];
	    }
	}
	export class FileItem {
	    name: string;
	    path: string;
	    isDir: boolean;
	    isLink: boolean;
	    size: number;
	    mode: string;
	    modTime: number;
	
	    static createFrom(source: any = {}) {
	        return new FileItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isDir = source["isDir"];
	        this.isLink = source["isLink"];
	        this.size = source["size"];
	        this.mode = source["mode"];
	        this.modTime = source["modTime"];
	    }
	}
	export class DirListing {
	    path: string;
	    parent: string;
	    items: FileItem[];
	
	    static createFrom(source: any = {}) {
	        return new DirListing(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.parent = source["parent"];
	        this.items = this.convertValues(source["items"], FileItem);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ServerConfig {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    username: string;
	    authType: string;
	    password: string;
	    privateKey: string;
	    passphrase: string;
	    remark: string;
	    type: string;
	    db?: number;
	    redisMode?: string;
	    redisSentinels?: string;
	    redisMasterName?: string;
	    redisClusterNodes?: string;
	    redisUsername?: string;
	    redisSerialization?: string;
	    redisPoolSize?: number;
	    redisMinIdleConns?: number;
	    redisMaxIdleConns?: number;
	    redisPoolTimeout?: number;
	    redisConnMaxIdleTime?: number;
	    redisConnMaxLifetime?: number;
	    redisDialTimeout?: number;
	    redisReadTimeout?: number;
	    redisWriteTimeout?: number;
	    redisMaxRetries?: number;
	    redisMinRetryBackoff?: number;
	    redisMaxRetryBackoff?: number;
	    redisBreakerThreshold?: number;
	    redisBreakerCooldown?: number;
	    database?: string;
	    mysqlMaxOpenConns?: number;
	    mysqlMaxIdleConns?: number;
	    mysqlConnMaxLifetime?: number;
	    mysqlTLS?: string;
	    mysqlSSLEnabled?: boolean;
	    mysqlSSHEnabled?: boolean;
	    mysqlSSHHost?: string;
	    mysqlSSHHostPort?: number;
	    mysqlSSHUser?: string;
	    mysqlSSHKeyPath?: string;
	    mysqlSSHKeyData?: string;
	    mysqlSSHPassphrase?: string;
	    mysqlSSHProxyLocalPort?: number;
	    clientId?: string;
	    useTLS?: boolean;
	    mqttProto?: string;
	    mqttKeepAlive?: number;
	    mqttConnectTimeout?: number;
	    mqttCleanSession?: boolean;
	    mqttAutoReconnect?: boolean;
	    mqttReconnectIntvl?: number;
	    mqttInsecure?: boolean;
	    mqttCaCert?: string;
	    mqttClientCert?: string;
	    mqttClientKey?: string;
	    mqttWillTopic?: string;
	    mqttWillPayload?: string;
	    mqttWillQos?: number;
	    mqttWillRetained?: boolean;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new ServerConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.authType = source["authType"];
	        this.password = source["password"];
	        this.privateKey = source["privateKey"];
	        this.passphrase = source["passphrase"];
	        this.remark = source["remark"];
	        this.type = source["type"];
	        this.db = source["db"];
	        this.redisMode = source["redisMode"];
	        this.redisSentinels = source["redisSentinels"];
	        this.redisMasterName = source["redisMasterName"];
	        this.redisClusterNodes = source["redisClusterNodes"];
	        this.redisUsername = source["redisUsername"];
	        this.redisSerialization = source["redisSerialization"];
	        this.redisPoolSize = source["redisPoolSize"];
	        this.redisMinIdleConns = source["redisMinIdleConns"];
	        this.redisMaxIdleConns = source["redisMaxIdleConns"];
	        this.redisPoolTimeout = source["redisPoolTimeout"];
	        this.redisConnMaxIdleTime = source["redisConnMaxIdleTime"];
	        this.redisConnMaxLifetime = source["redisConnMaxLifetime"];
	        this.redisDialTimeout = source["redisDialTimeout"];
	        this.redisReadTimeout = source["redisReadTimeout"];
	        this.redisWriteTimeout = source["redisWriteTimeout"];
	        this.redisMaxRetries = source["redisMaxRetries"];
	        this.redisMinRetryBackoff = source["redisMinRetryBackoff"];
	        this.redisMaxRetryBackoff = source["redisMaxRetryBackoff"];
	        this.redisBreakerThreshold = source["redisBreakerThreshold"];
	        this.redisBreakerCooldown = source["redisBreakerCooldown"];
	        this.database = source["database"];
	        this.mysqlMaxOpenConns = source["mysqlMaxOpenConns"];
	        this.mysqlMaxIdleConns = source["mysqlMaxIdleConns"];
	        this.mysqlConnMaxLifetime = source["mysqlConnMaxLifetime"];
	        this.mysqlTLS = source["mysqlTLS"];
	        this.mysqlSSLEnabled = source["mysqlSSLEnabled"];
	        this.mysqlSSHEnabled = source["mysqlSSHEnabled"];
	        this.mysqlSSHHost = source["mysqlSSHHost"];
	        this.mysqlSSHHostPort = source["mysqlSSHHostPort"];
	        this.mysqlSSHUser = source["mysqlSSHUser"];
	        this.mysqlSSHKeyPath = source["mysqlSSHKeyPath"];
	        this.mysqlSSHKeyData = source["mysqlSSHKeyData"];
	        this.mysqlSSHPassphrase = source["mysqlSSHPassphrase"];
	        this.mysqlSSHProxyLocalPort = source["mysqlSSHProxyLocalPort"];
	        this.clientId = source["clientId"];
	        this.useTLS = source["useTLS"];
	        this.mqttProto = source["mqttProto"];
	        this.mqttKeepAlive = source["mqttKeepAlive"];
	        this.mqttConnectTimeout = source["mqttConnectTimeout"];
	        this.mqttCleanSession = source["mqttCleanSession"];
	        this.mqttAutoReconnect = source["mqttAutoReconnect"];
	        this.mqttReconnectIntvl = source["mqttReconnectIntvl"];
	        this.mqttInsecure = source["mqttInsecure"];
	        this.mqttCaCert = source["mqttCaCert"];
	        this.mqttClientCert = source["mqttClientCert"];
	        this.mqttClientKey = source["mqttClientKey"];
	        this.mqttWillTopic = source["mqttWillTopic"];
	        this.mqttWillPayload = source["mqttWillPayload"];
	        this.mqttWillQos = source["mqttWillQos"];
	        this.mqttWillRetained = source["mqttWillRetained"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class SessionInfo {
	    id: string;
	    serverId: string;
	    title: string;
	    host: string;
	    port: number;
	    username: string;
	    connected: boolean;
	    homeDir: string;
	
	    static createFrom(source: any = {}) {
	        return new SessionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.serverId = source["serverId"];
	        this.title = source["title"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.connected = source["connected"];
	        this.homeDir = source["homeDir"];
	    }
	}
	export class Transfer {
	    id: string;
	    sessionId: string;
	    kind: string;
	    name: string;
	    localPath: string;
	    remotePath: string;
	    size: number;
	    transferred: number;
	    status: string;
	    error: string;
	    startedAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Transfer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.sessionId = source["sessionId"];
	        this.kind = source["kind"];
	        this.name = source["name"];
	        this.localPath = source["localPath"];
	        this.remotePath = source["remotePath"];
	        this.size = source["size"];
	        this.transferred = source["transferred"];
	        this.status = source["status"];
	        this.error = source["error"];
	        this.startedAt = source["startedAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class WsConnectRequest {
	    url: string;
	    headers: ApiHeader[];
	    insecureTLS: boolean;
	    auth?: ApiAuth;
	    protocols: string[];
	
	    static createFrom(source: any = {}) {
	        return new WsConnectRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.headers = this.convertValues(source["headers"], ApiHeader);
	        this.insecureTLS = source["insecureTLS"];
	        this.auth = this.convertValues(source["auth"], ApiAuth);
	        this.protocols = source["protocols"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WsConnectResult {
	    id: string;
	    url: string;
	    status: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new WsConnectResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.status = source["status"];
	        this.error = source["error"];
	    }
	}

}

