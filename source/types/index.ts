// EN: Shared contracts used across protocol, transport, registry, editor bridge, and tools.
// ZH: 协议、传输、注册表、编辑器桥接与工具层共享的跨层契约。
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

// EN: Cocos editor dumps are intentionally open-ended because Editor.Message payloads vary by Creator version.
// ZH: Cocos 编辑器 dump 保持开放结构，因为 Editor.Message 返回内容会随 Creator 版本变化。
export interface EditorAssetInfo {
  name?: string;
  url?: string;
  uuid?: string;
  type?: string;
  isDirectory?: boolean;
  file?: string;
  [key: string]: unknown;
}

export interface EditorComponentDump {
  type?: string;
  value?: {
    type?: string;
    [key: string]: unknown;
  };
  enabled?: boolean;
  [key: string]: unknown;
}

export interface EditorNodeDump {
  name?: string;
  uuid?: string;
  type?: string;
  active?: boolean;
  parent?: string;
  children?: EditorNodeDump[];
  components?: EditorComponentDump[];
  __comps__?: EditorComponentDump[];
  [key: string]: unknown;
}

export type ToolStatus = 'implemented' | 'partial' | 'unavailable';
export type ToolRisk = 'safe' | 'write' | 'destructive' | 'exec' | 'environment' | 'internal';
export type ToolProfile = 'core' | 'full' | 'internal';
export type ToolExposureProfile = 'core' | 'full';

// EN: Exposure config decides what the MCP client can see; registration still keeps the full catalog.
// ZH: 暴露配置只决定 MCP 客户端可见范围；注册表仍保留完整工具目录。
export interface ToolExposureConfig {
  profile: ToolExposureProfile;
  allowDangerous: boolean;
}

export interface ToolDefinition {
  name: string;
  category: string;
  description: string;
  inputSchema: JsonObject;
  status: ToolStatus;
  risk: ToolRisk;
  profile: ToolProfile;
  destructive: boolean;
  disabledReason?: string;
}

export interface McpToolDefinition extends JsonObject {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

export interface ToolCatalogEntry extends ToolDefinition {
  enabled: boolean;
  disabledReason?: string;
}

export interface ToolExposureSummary {
  config: ToolExposureConfig;
  total: number;
  exposed: number;
  dangerous: number;
  partial: number;
}

export interface ToolExposureRuntime extends ToolExposureSummary {
  catalog: ToolCatalogEntry[];
}

export interface ToolResponse {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: string;
  status?: ToolStatus;
}

export interface ToolContext {
  editor: EditorBridge;
  logger: Logger;
  // EN: Present only during MCP execution so catalog tools can report active profile state.
  // ZH: 仅在 MCP 执行期间注入，用于目录类工具报告当前 profile 状态。
  exposure?: ToolExposureRuntime;
}

export type ToolExecutor = (args: JsonObject, context: ToolContext) => Promise<ToolResponse>;

export interface ToolModule {
  namespace: string;
  tools: ToolDefinition[];
  handlers: Record<string, ToolExecutor>;
}

export interface EditorProjectInfo {
  name: string;
  path: string;
  uuid?: string;
  cocosVersion?: string;
}

export interface EditorPaths {
  project: string;
  extension?: string;
  app?: string;
}

// EN: EditorBridge is the only API surface tools may use to reach Cocos Editor.
// ZH: EditorBridge 是工具层访问 Cocos Editor 的唯一接口面。
export interface EditorBridge {
  request(channel: string, message: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, message: string, ...args: unknown[]): void;
  executeSceneScript(method: string, args?: unknown[], extensionName?: string): Promise<unknown>;
  getSelection(type?: string): EditorSelection;
  setSelection(type: string, uuids: string[]): void;
  projectInfo(): EditorProjectInfo;
  paths(): EditorPaths;
}

export interface EditorSelection {
  type: string;
  uuids: string[];
  lastSelectedType: string;
  lastSelected?: string;
}

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export interface StreamWriter {
  write(payload: JsonRpcMessage): void;
  close(): void;
}

export interface TransportAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): TransportStatus;
}

export interface TransportStatus {
  running: boolean;
  host: string;
  port: number;
  sessions: number;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: JsonObject;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: JsonObject;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number;
  result: JsonValue;
}

export interface JsonRpcFailure {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: JsonValue;
  };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export interface McpServerSettings {
  host: string;
  port: number;
  allowedOrigins: string[];
  authToken?: string;
}
