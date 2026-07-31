export namespace main {
	
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

}

