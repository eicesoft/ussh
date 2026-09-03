export namespace main {
	
	export class AIChatMessage {
	    role: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new AIChatMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.role = source["role"];
	        this.content = source["content"];
	    }
	}
	export class ConnectionConfig {
	    host: string;
	    port: number;
	    username: string;
	    password: string;
	    privateKey: string;
	    passphrase: string;
	    keyFile: string;
	    authType: string;
	    savedNodeId: number;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.privateKey = source["privateKey"];
	        this.passphrase = source["passphrase"];
	        this.keyFile = source["keyFile"];
	        this.authType = source["authType"];
	        this.savedNodeId = source["savedNodeId"];
	    }
	}
	export class CredentialView {
	    hasPassword: boolean;
	    hasPrivateKey: boolean;
	    hasPassphrase: boolean;
	    hasKeyFile: boolean;
	
	    static createFrom(source: any = {}) {
	        return new CredentialView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasPassword = source["hasPassword"];
	        this.hasPrivateKey = source["hasPrivateKey"];
	        this.hasPassphrase = source["hasPassphrase"];
	        this.hasKeyFile = source["hasKeyFile"];
	    }
	}
	export class SavedCredential {
	    password?: string;
	    privateKey?: string;
	    passphrase?: string;
	    keyFile?: string;
	
	    static createFrom(source: any = {}) {
	        return new SavedCredential(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.password = source["password"];
	        this.privateKey = source["privateKey"];
	        this.passphrase = source["passphrase"];
	        this.keyFile = source["keyFile"];
	    }
	}
	export class SavedNode {
	    id: number;
	    parentId: number;
	    type: string;
	    name: string;
	    host: string;
	    port: number;
	    username: string;
	    authType: string;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new SavedNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.parentId = source["parentId"];
	        this.type = source["type"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.authType = source["authType"];
	        this.color = source["color"];
	    }
	}
	export class SftpEntry {
	    name: string;
	    path: string;
	    isDir: boolean;
	    size: number;
	    // Go type: time
	    modTime: any;
	    mode: string;
	
	    static createFrom(source: any = {}) {
	        return new SftpEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isDir = source["isDir"];
	        this.size = source["size"];
	        this.modTime = this.convertValues(source["modTime"], null);
	        this.mode = source["mode"];
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
	export class SftpFileInfo {
	    content: number[];
	    size: number;
	    filename: string;
	
	    static createFrom(source: any = {}) {
	        return new SftpFileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.content = source["content"];
	        this.size = source["size"];
	        this.filename = source["filename"];
	    }
	}
	export class TerminalSize {
	    columns: number;
	    rows: number;
	
	    static createFrom(source: any = {}) {
	        return new TerminalSize(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = source["columns"];
	        this.rows = source["rows"];
	    }
	}

}

