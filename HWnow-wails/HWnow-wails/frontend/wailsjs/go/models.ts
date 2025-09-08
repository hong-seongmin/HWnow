export namespace main {
	
	export class GPUProcessControlResult {
	    pid: number;
	    success: boolean;
	    message: string;
	    operation: string;
	    priority?: string;
	
	    static createFrom(source: any = {}) {
	        return new GPUProcessControlResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pid = source["pid"];
	        this.success = source["success"];
	        this.message = source["message"];
	        this.operation = source["operation"];
	        this.priority = source["priority"];
	    }
	}
	export class GPUProcessValidationResult {
	    pid: number;
	    is_valid: boolean;
	    message: string;
	    process_name?: string;
	
	    static createFrom(source: any = {}) {
	        return new GPUProcessValidationResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pid = source["pid"];
	        this.is_valid = source["is_valid"];
	        this.message = source["message"];
	        this.process_name = source["process_name"];
	    }
	}
	export class PageResult {
	    user_id: string;
	    page_id?: string;
	    page_name?: string;
	    pages: any[];
	    success: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new PageResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.user_id = source["user_id"];
	        this.page_id = source["page_id"];
	        this.page_name = source["page_name"];
	        this.pages = source["pages"];
	        this.success = source["success"];
	        this.message = source["message"];
	    }
	}
	export class RealTimeMetrics {
	    cpu_usage: number;
	    memory_usage: number;
	    disk_usage?: monitoring.DiskUsageInfo;
	    disk_read_speed: number;
	    disk_write_speed: number;
	    network_io: monitoring.NetworkInterface[];
	    net_sent_speed: number;
	    net_recv_speed: number;
	    system_uptime: number;
	    // Go type: time
	    boot_time: any;
	    gpu_info?: monitoring.GPUInfo;
	    gpu_processes: monitoring.GPUProcess[];
	    top_processes: monitoring.ProcessInfo[];
	    memory_details?: monitoring.MemoryDetails;
	    battery_info?: monitoring.BatteryInfo;
	    network_status: string;
	    // Go type: time
	    timestamp: any;
	
	    static createFrom(source: any = {}) {
	        return new RealTimeMetrics(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cpu_usage = source["cpu_usage"];
	        this.memory_usage = source["memory_usage"];
	        this.disk_usage = this.convertValues(source["disk_usage"], monitoring.DiskUsageInfo);
	        this.disk_read_speed = source["disk_read_speed"];
	        this.disk_write_speed = source["disk_write_speed"];
	        this.network_io = this.convertValues(source["network_io"], monitoring.NetworkInterface);
	        this.net_sent_speed = source["net_sent_speed"];
	        this.net_recv_speed = source["net_recv_speed"];
	        this.system_uptime = source["system_uptime"];
	        this.boot_time = this.convertValues(source["boot_time"], null);
	        this.gpu_info = this.convertValues(source["gpu_info"], monitoring.GPUInfo);
	        this.gpu_processes = this.convertValues(source["gpu_processes"], monitoring.GPUProcess);
	        this.top_processes = this.convertValues(source["top_processes"], monitoring.ProcessInfo);
	        this.memory_details = this.convertValues(source["memory_details"], monitoring.MemoryDetails);
	        this.battery_info = this.convertValues(source["battery_info"], monitoring.BatteryInfo);
	        this.network_status = source["network_status"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
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
	export class SystemInfo {
	    platform: string;
	    cpu_cores: number;
	    total_memory: number;
	    // Go type: time
	    boot_time: any;
	
	    static createFrom(source: any = {}) {
	        return new SystemInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.platform = source["platform"];
	        this.cpu_cores = source["cpu_cores"];
	        this.total_memory = source["total_memory"];
	        this.boot_time = this.convertValues(source["boot_time"], null);
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
	export class WidgetResult {
	    user_id: string;
	    page_id: string;
	    widgets: any[];
	    success: boolean;
	    message: string;
	    count?: number;
	    widget_id?: string;
	
	    static createFrom(source: any = {}) {
	        return new WidgetResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.user_id = source["user_id"];
	        this.page_id = source["page_id"];
	        this.widgets = source["widgets"];
	        this.success = source["success"];
	        this.message = source["message"];
	        this.count = source["count"];
	        this.widget_id = source["widget_id"];
	    }
	}

}

export namespace monitoring {
	
	export class BatteryInfo {
	    Percent: number;
	    Plugged: number;
	
	    static createFrom(source: any = {}) {
	        return new BatteryInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Percent = source["Percent"];
	        this.Plugged = source["Plugged"];
	    }
	}
	export class DiskUsageInfo {
	    Total: number;
	    Used: number;
	    Free: number;
	    UsedPercent: number;
	
	    static createFrom(source: any = {}) {
	        return new DiskUsageInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Total = source["Total"];
	        this.Used = source["Used"];
	        this.Free = source["Free"];
	        this.UsedPercent = source["UsedPercent"];
	    }
	}
	export class GPUInfo {
	    Name: string;
	    Usage: number;
	    MemoryUsed: number;
	    MemoryTotal: number;
	    Temperature: number;
	    Power: number;
	
	    static createFrom(source: any = {}) {
	        return new GPUInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Usage = source["Usage"];
	        this.MemoryUsed = source["MemoryUsed"];
	        this.MemoryTotal = source["MemoryTotal"];
	        this.Temperature = source["Temperature"];
	        this.Power = source["Power"];
	    }
	}
	export class GPUProcess {
	    pid: number;
	    name: string;
	    gpu_usage: number;
	    gpu_memory: number;
	    type: string;
	    command: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new GPUProcess(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pid = source["pid"];
	        this.name = source["name"];
	        this.gpu_usage = source["gpu_usage"];
	        this.gpu_memory = source["gpu_memory"];
	        this.type = source["type"];
	        this.command = source["command"];
	        this.status = source["status"];
	    }
	}
	export class GPUProcessDelta {
	    added: GPUProcess[];
	    updated: GPUProcess[];
	    removed: number[];
	    update_id: string;
	
	    static createFrom(source: any = {}) {
	        return new GPUProcessDelta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.added = this.convertValues(source["added"], GPUProcess);
	        this.updated = this.convertValues(source["updated"], GPUProcess);
	        this.removed = source["removed"];
	        this.update_id = source["update_id"];
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
	export class GPUProcessDeltaResponse {
	    delta?: GPUProcessDelta;
	    full_refresh: boolean;
	    total_count: number;
	    query_time_ms: number;
	
	    static createFrom(source: any = {}) {
	        return new GPUProcessDeltaResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.delta = this.convertValues(source["delta"], GPUProcessDelta);
	        this.full_refresh = source["full_refresh"];
	        this.total_count = source["total_count"];
	        this.query_time_ms = source["query_time_ms"];
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
	export class GPUProcessFilter {
	    usage_threshold: number;
	    memory_threshold: number;
	    filter_type: string;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GPUProcessFilter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.usage_threshold = source["usage_threshold"];
	        this.memory_threshold = source["memory_threshold"];
	        this.filter_type = source["filter_type"];
	        this.enabled = source["enabled"];
	    }
	}
	export class GPUProcessSort {
	    field: string;
	    order: string;
	
	    static createFrom(source: any = {}) {
	        return new GPUProcessSort(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.field = source["field"];
	        this.order = source["order"];
	    }
	}
	export class GPUProcessQuery {
	    filter: GPUProcessFilter;
	    sort: GPUProcessSort;
	    max_items: number;
	    offset: number;
	
	    static createFrom(source: any = {}) {
	        return new GPUProcessQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filter = this.convertValues(source["filter"], GPUProcessFilter);
	        this.sort = this.convertValues(source["sort"], GPUProcessSort);
	        this.max_items = source["max_items"];
	        this.offset = source["offset"];
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
	export class GPUProcessResponse {
	    processes: GPUProcess[];
	    total_count: number;
	    filtered_count: number;
	    has_more: boolean;
	    query_time_ms: number;
	
	    static createFrom(source: any = {}) {
	        return new GPUProcessResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.processes = this.convertValues(source["processes"], GPUProcess);
	        this.total_count = source["total_count"];
	        this.filtered_count = source["filtered_count"];
	        this.has_more = source["has_more"];
	        this.query_time_ms = source["query_time_ms"];
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
	
	export class MemoryDetails {
	    Physical: number;
	    Virtual: number;
	    Swap: number;
	
	    static createFrom(source: any = {}) {
	        return new MemoryDetails(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Physical = source["Physical"];
	        this.Virtual = source["Virtual"];
	        this.Swap = source["Swap"];
	    }
	}
	export class NetworkInterface {
	    Name: string;
	    Status: number;
	    IpAddress: string;
	
	    static createFrom(source: any = {}) {
	        return new NetworkInterface(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Status = source["Status"];
	        this.IpAddress = source["IpAddress"];
	    }
	}
	export class ProcessInfo {
	    Name: string;
	    PID: number;
	    CPUPercent: number;
	    MemoryPercent: number;
	
	    static createFrom(source: any = {}) {
	        return new ProcessInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.PID = source["PID"];
	        this.CPUPercent = source["CPUPercent"];
	        this.MemoryPercent = source["MemoryPercent"];
	    }
	}

}

export namespace native {
	
	export class WindowState {
	    isVisible: boolean;
	    isMinimized: boolean;
	    width: number;
	    height: number;
	    x: number;
	    y: number;
	    title: string;
	
	    static createFrom(source: any = {}) {
	        return new WindowState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.isVisible = source["isVisible"];
	        this.isMinimized = source["isMinimized"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.x = source["x"];
	        this.y = source["y"];
	        this.title = source["title"];
	    }
	}

}

