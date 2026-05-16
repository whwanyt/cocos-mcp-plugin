import {
  CocosEditorBridge,
  ConsoleLogger,
  HttpStreamableTransport,
  McpRequestRouter,
  SessionManager,
  ToolRegistry,
  defaultToolExposureConfig,
  normalizeToolExposureConfig,
} from './core';
import { registerAllTools } from './tools';
import { McpServerSettings, ToolContext, ToolExposureConfig } from './types';

let transport: HttpStreamableTransport | null = null;
let registry: ToolRegistry | null = null;

// EN: Keep package name and profile key centralized because Cocos messages and project profiles both depend on them.
// ZH: 集中维护包名和 profile key，因为 Cocos message 与项目级 Profile 都依赖它们。
const packageName = 'cocos-mcp-plugin';
const exposureConfigKey = 'toolExposure';
const logger = new ConsoleLogger(packageName);

// EN: Safe default: bind only to loopback and accept local browser/editor origins.
// ZH: 安全默认值：只监听本机回环地址，并只接受本地浏览器/编辑器来源。
const defaultSettings: McpServerSettings = {
  host: '127.0.0.1',
  port: 3000,
  allowedOrigins: [
    'http://127.0.0.1',
    'http://localhost',
  ],
};

export const methods: Record<string, (...args: unknown[]) => unknown> = {
  async openPanel() {
    const opened = await Editor.Panel.open(packageName);
    if (!opened) {
      logger.warn('Panel open request returned false');
    }
    return opened;
  },

  async startServer(settings?: unknown) {
    const overrides = settings && typeof settings === 'object' ? settings as Partial<McpServerSettings> : undefined;
    await startServer(overrides);
    return getServerStatus();
  },

  async stopServer() {
    await stopServer();
    return getServerStatus();
  },

  getServerStatus,

  getToolsList() {
    return registry?.catalog() ?? [];
  },

  getToolExposureConfig,

  getToolExposureSummary() {
    return registry?.getExposureSummary() ?? emptyExposureSummary();
  },

  async updateToolExposureConfig(config?: unknown) {
    // EN: Profile changes restart the service so tools/list stays deterministic for connected clients.
    // ZH: profile 变更通过重启服务生效，让已连接客户端看到确定的 tools/list。
    const nextConfig = normalizeToolExposureConfig(isRecord(config) ? config : undefined);
    await saveToolExposureConfig(nextConfig);
    await restartServer();
    return getServerStatus();
  },
};

export function load(): void {
  // EN: Cocos calls load when the extension is enabled; startup errors are logged without blocking the editor.
  // ZH: Cocos 在扩展开启时调用 load；启动失败只记录日志，不阻塞编辑器。
  logger.info('Extension loaded');
  startServer().catch((error) => logger.error('Auto start failed', error));
}

export function unload(): void {
  stopServer().catch((error) => logger.error('Stop failed during unload', error));
}

async function startServer(settings?: Partial<McpServerSettings>): Promise<void> {
  if (transport?.getStatus().running) {
    return;
  }

  const mergedSettings: McpServerSettings = {
    ...defaultSettings,
    ...settings,
  };
  const editor = new CocosEditorBridge();
  const context: ToolContext = {
    editor,
    logger,
  };
  const sessions = new SessionManager();
  registry = new ToolRegistry(logger);
  // EN: Register the full catalog first, then apply the persisted exposure profile.
  // ZH: 先注册完整工具目录，再应用持久化的暴露 profile。
  registerAllTools(registry, logger);
  registry.setExposureConfig(await getToolExposureConfig());

  const router = new McpRequestRouter(registry, context, logger);
  transport = new HttpStreamableTransport(mergedSettings, router, sessions, logger);
  await transport.start();
}

async function stopServer(): Promise<void> {
  if (!transport) {
    return;
  }

  await transport.stop();
  transport = null;
}

function getServerStatus() {
  const exposure = registry?.getExposureSummary() ?? emptyExposureSummary();
  return {
    ...(transport?.getStatus() ?? {
      running: false,
      host: defaultSettings.host,
      port: defaultSettings.port,
      sessions: 0,
    }),
    tools: exposure.exposed,
    catalogTools: exposure.total,
    dangerousTools: exposure.dangerous,
    partialTools: exposure.partial,
    exposure: exposure.config,
  };
}

async function restartServer(): Promise<void> {
  await stopServer();
  await startServer();
}

async function getToolExposureConfig(): Promise<ToolExposureConfig> {
  // EN: Project profile keeps exposure choices with the Cocos project instead of global editor settings.
  // ZH: 项目级 Profile 让工具暴露配置跟随 Cocos 项目，而不是写入全局编辑器设置。
  const config = await Editor.Profile.getProject(packageName, exposureConfigKey, 'project').catch(() => undefined);
  return normalizeToolExposureConfig(isRecord(config) ? config : undefined);
}

async function saveToolExposureConfig(config: ToolExposureConfig): Promise<void> {
  await Editor.Profile.setProject(packageName, exposureConfigKey, {
    profile: config.profile,
    allowDangerous: config.allowDangerous,
  }, 'project');
}

function emptyExposureSummary() {
  return {
    config: defaultToolExposureConfig(),
    total: 0,
    exposed: 0,
    dangerous: 0,
    partial: 0,
  };
}

function isRecord(value: unknown): value is Partial<ToolExposureConfig> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
