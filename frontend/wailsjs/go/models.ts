export namespace main {
	
	export class ConnectionConfig {
	    host: string;
	    port: number;
	    username: string;
	    password: string;
	    privateKey: string;
	    passphrase: string;
	
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

