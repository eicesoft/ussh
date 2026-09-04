export namespace backend {
	
	export class ToolCall {
	    index?: number;
	    id?: string;
	    type?: string;
	    // Go type: struct { Name string "json:\"name,omitempty\""; Arguments string "json:\"arguments,omitempty\"" }
	    function?: any;
	
	    static createFrom(source: any = {}) {
	        return new ToolCall(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.id = source["id"];
	        this.type = source["type"];
	        this.function = this.convertValues(source["function"], Object);
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
	export class AIChatMessage {
	    role: string;
	    content: string;
	    tool_call_id?: string;
	    tool_calls?: ToolCall[];
	    name?: string;
	
	    static createFrom(source: any = {}) {
	        return new AIChatMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.role = source["role"];
	        this.content = source["content"];
	        this.tool_call_id = source["tool_call_id"];
	        this.tool_calls = this.convertValues(source["tool_calls"], ToolCall);
	        this.name = source["name"];
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
	export class AgentContext {
	    host: string;
	    username: string;
	    hostname: string;
	    os: string;
	    kernel: string;
	    architecture: string;
	    shell: string;
	    cwd: string;
	    uptime: string;
	
	    static createFrom(source: any = {}) {
	        return new AgentContext(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host = source["host"];
	        this.username = source["username"];
	        this.hostname = source["hostname"];
	        this.os = source["os"];
	        this.kernel = source["kernel"];
	        this.architecture = source["architecture"];
	        this.shell = source["shell"];
	        this.cwd = source["cwd"];
	        this.uptime = source["uptime"];
	    }
	}
	export class AgentOptions {
	    autoApproveReadonly: boolean;
	    useTools: boolean;
	    maxSteps: number;
	    commandTimeoutSec: number;
	
	    static createFrom(source: any = {}) {
	        return new AgentOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.autoApproveReadonly = source["autoApproveReadonly"];
	        this.useTools = source["useTools"];
	        this.maxSteps = source["maxSteps"];
	        this.commandTimeoutSec = source["commandTimeoutSec"];
	    }
	}
	export class AgentRequest {
	    requestId: string;
	    tabId: string;
	    baseURL: string;
	    apiKey: string;
	    model: string;
	    messages: AIChatMessage[];
	    context: AgentContext;
	    options: AgentOptions;
	
	    static createFrom(source: any = {}) {
	        return new AgentRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.requestId = source["requestId"];
	        this.tabId = source["tabId"];
	        this.baseURL = source["baseURL"];
	        this.apiKey = source["apiKey"];
	        this.model = source["model"];
	        this.messages = this.convertValues(source["messages"], AIChatMessage);
	        this.context = this.convertValues(source["context"], AgentContext);
	        this.options = this.convertValues(source["options"], AgentOptions);
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
	export class RemoteCommandResult {
	    output: string;
	    exitCode: number;
	    timedOut: boolean;
	    durationMs: number;
	
	    static createFrom(source: any = {}) {
	        return new RemoteCommandResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.output = source["output"];
	        this.exitCode = source["exitCode"];
	        this.timedOut = source["timedOut"];
	        this.durationMs = source["durationMs"];
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
	    sortOrder: number;
	
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
	        this.sortOrder = source["sortOrder"];
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
	export class SystemInfo {
	    host: string;
	    port: number;
	    username: string;
	    hostname: string;
	    os: string;
	    load: string;
	    memory: string;
	    kernel: string;
	    architecture: string;
	    shell: string;
	    cwd: string;
	    uptime: string;
	
	    static createFrom(source: any = {}) {
	        return new SystemInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.hostname = source["hostname"];
	        this.os = source["os"];
	        this.load = source["load"];
	        this.memory = source["memory"];
	        this.kernel = source["kernel"];
	        this.architecture = source["architecture"];
	        this.shell = source["shell"];
	        this.cwd = source["cwd"];
	        this.uptime = source["uptime"];
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

