import {
  JsonObject,
  Logger,
  McpToolDefinition,
  ToolCatalogEntry,
  ToolContext,
  ToolDefinition,
  ToolExposureConfig,
  ToolExposureRuntime,
  ToolExposureSummary,
  ToolExecutor,
  ToolModule,
  ToolResponse,
} from '../../types';
import { validateToolInput } from './tool-schema-validator';

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolExecutor;
}

// EN: Registry keeps all tools, then derives the MCP-visible surface from exposure config.
// ZH: Registry 保留完整工具，再根据暴露配置推导 MCP 可见工具面。
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();
  private exposureConfig: ToolExposureConfig = defaultToolExposureConfig();

  constructor(private readonly logger: Logger) {}

  registerModule(module: ToolModule): void {
    if (!module.namespace) {
      throw new Error('Tool module namespace is required');
    }

    for (const tool of module.tools) {
      const fullName = this.fullName(module.namespace, tool.name);
      if (this.tools.has(fullName)) {
        throw new Error(`Duplicate tool name: ${fullName}`);
      }

      const handler = module.handlers[tool.name];
      if (!handler) {
        // EN: Missing handlers fail during startup so MCP never advertises an uncallable tool.
        // ZH: 缺失 handler 在启动阶段直接失败，避免 MCP 暴露不可调用工具。
        throw new Error(`Missing handler for tool: ${fullName}`);
      }

      this.assertSchema(tool.inputSchema, fullName);
      this.tools.set(fullName, {
        definition: {
          ...tool,
          name: fullName,
        },
        handler,
      });
    }

    this.logger.info(`Registered ${module.tools.length} tools from ${module.namespace}`);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].map((item) => item.definition);
  }

  listForMcp(): McpToolDefinition[] {
    // EN: Only exposed tools are returned to tools/list; catalog inspection uses tool_get_catalog.
    // ZH: tools/list 只返回已暴露工具；完整目录通过 tool_get_catalog 查询。
    return this.listExposed().map((tool) => ({
      name: tool.name,
      description: `${tool.description} [status: ${tool.status}; risk: ${tool.risk}; profile: ${tool.profile}]`,
      inputSchema: tool.inputSchema,
    }));
  }

  listExposed(): ToolDefinition[] {
    return this.catalog()
      .filter((tool) => tool.enabled)
      .map(({ enabled: _enabled, disabledReason: _disabledReason, ...definition }) => definition);
  }

  catalog(): ToolCatalogEntry[] {
    return this.list().map((tool) => {
      const disabledReason = this.disabledReason(tool);
      return {
        ...tool,
        enabled: !disabledReason,
        ...(disabledReason ? { disabledReason } : {}),
      };
    });
  }

  setExposureConfig(config: Partial<ToolExposureConfig>): void {
    this.exposureConfig = normalizeToolExposureConfig({
      ...this.exposureConfig,
      ...config,
    });
  }

  getExposureConfig(): ToolExposureConfig {
    return { ...this.exposureConfig };
  }

  getExposureSummary(): ToolExposureSummary {
    const catalog = this.catalog();
    return {
      config: this.getExposureConfig(),
      total: catalog.length,
      exposed: catalog.filter((tool) => tool.enabled).length,
      dangerous: catalog.filter((tool) => isDangerous(tool)).length,
      partial: catalog.filter((tool) => tool.status === 'partial').length,
    };
  }

  getExposureRuntime(): ToolExposureRuntime {
    return {
      ...this.getExposureSummary(),
      catalog: this.catalog(),
    };
  }

  count(): number {
    return this.tools.size;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, args: JsonObject, context: ToolContext): Promise<ToolResponse> {
    const item = this.tools.get(name);
    if (!item) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const disabledReason = this.disabledReason(item.definition);
    if (disabledReason) {
      // EN: Disabled tools are reported explicitly instead of being hidden as "unknown".
      // ZH: 被禁用工具返回明确原因，而不是伪装成 unknown。
      return {
        success: false,
        status: item.definition.status,
        error: 'Tool disabled by active profile',
        data: {
          name,
          reason: disabledReason,
          config: this.getExposureConfig(),
          risk: item.definition.risk,
          profile: item.definition.profile,
        },
      };
    }

    const validation = validateToolInput(item.definition.inputSchema, args);
    if (!validation.success) {
      // EN: Argument errors are returned as tool failures so MCP clients get field-level diagnostics.
      // ZH: 参数错误作为工具失败返回，让 MCP 客户端获得字段级诊断信息。
      return {
        success: false,
        status: item.definition.status,
        error: 'Tool arguments validation failed',
        data: {
          name,
          issues: validation.issues,
        },
      };
    }

    return item.handler(validation.data, context);
  }

  private fullName(namespace: string, toolName: string): string {
    return `${namespace}_${toolName}`;
  }

  private assertSchema(schema: JsonObject, toolName: string): void {
    if (!schema || schema.type !== 'object') {
      throw new Error(`Tool ${toolName} inputSchema must be an object schema`);
    }

    // EN: Force serialization here to catch unsupported schema values before serving clients.
    // ZH: 在这里强制序列化，提前发现无法提供给客户端的 schema 值。
    JSON.stringify(schema);
  }

  private disabledReason(tool: ToolDefinition): string | undefined {
    if (tool.profile === 'internal') {
      return 'Tool is internal and not exposed through MCP tools/list';
    }
    if (this.exposureConfig.profile === 'core' && tool.profile !== 'core') {
      return 'Tool requires full profile';
    }
    if (!this.exposureConfig.allowDangerous && isDangerous(tool)) {
      return 'Dangerous tools are disabled';
    }
    return tool.disabledReason;
  }
}

export function defaultToolExposureConfig(): ToolExposureConfig {
  return {
    profile: 'core',
    allowDangerous: false,
  };
}

export function normalizeToolExposureConfig(config: Partial<ToolExposureConfig> | undefined): ToolExposureConfig {
  return {
    profile: config?.profile === 'full' ? 'full' : 'core',
    allowDangerous: config?.allowDangerous === true,
  };
}

function isDangerous(tool: ToolDefinition): boolean {
  return tool.destructive || tool.risk === 'destructive' || tool.risk === 'exec' || tool.risk === 'environment';
}
