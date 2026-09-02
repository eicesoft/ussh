export namespace main {
	
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

