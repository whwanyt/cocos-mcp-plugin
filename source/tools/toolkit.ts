import {
  JsonObject,
  ToolDefinition,
  ToolExecutor,
  ToolModule,
  ToolProfile,
  ToolResponse,
  ToolRisk,
  ToolStatus,
} from '../types';
import { attachInputValidator, zodFromJsonSchema } from '../core/registry/tool-schema-validator';

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema?: JsonObject;
  status?: ToolStatus;
  risk?: ToolRisk;
  profile?: ToolProfile;
  destructive?: boolean;
  disabledReason?: string;
  handler?: ToolExecutor;
}

// EN: Tool specs stay concise while this helper fills metadata needed by registry/profile filtering.
// ZH: 工具 spec 保持简洁，由该 helper 补齐 registry/profile 过滤所需元数据。
export function createToolModule(namespace: string, specs: ToolSpec[]): ToolModule {
  const tools: ToolDefinition[] = specs.map((spec) => ({
    name: spec.name,
    category: namespace,
    description: spec.description,
    inputSchema: spec.inputSchema ?? objectSchema(),
    status: spec.status ?? (spec.handler ? 'implemented' : 'partial'),
    risk: spec.risk ?? inferToolRisk(namespace, spec.name),
    profile: spec.profile ?? inferToolProfile(namespace, spec.name),
    destructive: spec.destructive ?? isDestructiveTool(namespace, spec.name),
    ...(spec.disabledReason ? { disabledReason: spec.disabledReason } : {}),
  }));

  const handlers: Record<string, ToolExecutor> = {};
  for (const spec of specs) {
    handlers[spec.name] = spec.handler ?? unavailableHandler(namespace, spec);
  }

  return {
    namespace,
    tools,
    handlers,
  };
}

export function objectSchema(
  properties: Record<string, JsonObject> = {},
  required: string[] = [],
  description?: string,
): JsonObject {
  const schema: JsonObject = {
    type: 'object',
    ...(description ? { description } : {}),
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
  return attachInputValidator(schema, zodFromJsonSchema(schema));
}

export function stringProp(description: string, extra: JsonObject = {}): JsonObject {
  const schema: JsonObject = {
    type: 'string',
    description,
    ...extra,
  };
  return attachInputValidator(schema, zodFromJsonSchema(schema));
}

export function numberProp(description: string, extra: JsonObject = {}): JsonObject {
  const schema: JsonObject = {
    type: 'number',
    description,
    ...extra,
  };
  return attachInputValidator(schema, zodFromJsonSchema(schema));
}

export function booleanProp(description: string, extra: JsonObject = {}): JsonObject {
  const schema: JsonObject = {
    type: 'boolean',
    description,
    ...extra,
  };
  return attachInputValidator(schema, zodFromJsonSchema(schema));
}

export function arrayProp(description: string, items: JsonObject = { type: 'string' }): JsonObject {
  const schema: JsonObject = {
    type: 'array',
    items,
    description,
  };
  return attachInputValidator(schema, zodFromJsonSchema(schema));
}

export function anyProp(description: string): JsonObject {
  const schema: JsonObject = {
    description,
  };
  return attachInputValidator(schema, zodFromJsonSchema(schema));
}

export function unsupported(message: string, data?: unknown): ToolResponse {
  return {
    success: false,
    status: 'unavailable',
    error: message,
    data,
  };
}

export function partial(message: string, data?: unknown): ToolResponse {
  return {
    success: false,
    status: 'partial',
    error: message,
    data,
  };
}

export function ok(data?: unknown, message?: string): ToolResponse {
  return {
    success: true,
    ...(data === undefined ? {} : { data }),
    ...(message ? { message } : {}),
  };
}

function unavailableHandler(namespace: string, spec: ToolSpec): ToolExecutor {
  // EN: Partial tools fail honestly so clients can plan around missing capabilities.
  // ZH: partial 工具如实失败，便于客户端围绕缺失能力做规划。
  return async () => partial(
    `Tool ${namespace}_${spec.name} is registered but not fully implemented in this first core-focused build.`,
    {
      status: spec.status ?? 'partial',
      description: spec.description,
    },
  );
}

function inferToolRisk(namespace: string, toolName: string): ToolRisk {
  const fullName = `${namespace}_${toolName}`;
  // EN: Risk inference is the default only; high-impact tools should still set explicit metadata when needed.
  // ZH: 风险推断只是默认值；高影响工具必要时仍应显式声明元数据。
  if (namespace === 'validation') {
    return 'internal';
  }
  if (fullName.includes('execute_script') || fullName.includes('execute_scene_script')) {
    return 'exec';
  }
  if (
    toolName.includes('delete') ||
    toolName.includes('remove') ||
    toolName.includes('clear') ||
    toolName.includes('reset') ||
    toolName.includes('revert') ||
    toolName.includes('restore') ||
    toolName.includes('close_scene')
  ) {
    return 'destructive';
  }
  if (
    namespace === 'preferences' ||
    toolName.includes('import') ||
    toolName.includes('compress') ||
    toolName.includes('build') ||
    toolName.includes('run_project') ||
    toolName.includes('start_preview') ||
    toolName.includes('stop_preview') ||
    toolName.includes('open_')
  ) {
    return 'environment';
  }
  if (
    toolName.startsWith('set_') ||
    toolName.startsWith('add_') ||
    toolName.startsWith('create_') ||
    toolName.startsWith('move_') ||
    toolName.startsWith('copy_') ||
    toolName.startsWith('save_') ||
    toolName.startsWith('attach_') ||
    toolName.startsWith('change_') ||
    toolName.startsWith('focus_') ||
    toolName.startsWith('align_') ||
    toolName.startsWith('duplicate_') ||
    toolName.startsWith('instantiate_') ||
    toolName.startsWith('update_') ||
    toolName.startsWith('paste_') ||
    toolName.startsWith('cut_') ||
    toolName.startsWith('switch_') ||
    toolName.startsWith('listen_') ||
    toolName.startsWith('stop_') ||
    toolName.startsWith('refresh_') ||
    toolName.startsWith('reimport_')
  ) {
    return 'write';
  }
  return 'safe';
}

function inferToolProfile(namespace: string, toolName: string): ToolProfile {
  const risk = inferToolRisk(namespace, toolName);
  // EN: Core profile is intentionally conservative; broad, advanced, or dangerous domains move to full.
  // ZH: core profile 刻意保守；宽泛、高级或危险领域默认进入 full。
  if (namespace === 'validation') {
    return 'internal';
  }
  if (namespace === 'broadcast' || namespace === 'assetAdvanced' || namespace === 'preferences' || namespace === 'referenceImage') {
    return 'full';
  }
  if (risk === 'exec' || risk === 'destructive' || risk === 'environment') {
    return 'full';
  }
  if (namespace === 'prefab' || namespace === 'sceneAdvanced') {
    return 'full';
  }
  return 'core';
}

function isDestructiveTool(namespace: string, toolName: string): boolean {
  return inferToolRisk(namespace, toolName) === 'destructive';
}
