import { JsonObject, ToolCatalogEntry, ToolModule } from '../types';
import { arrayProp, createToolModule, objectSchema, ok, stringProp } from './toolkit';

// EN: Editor tools expose cross-cutting editor state that does not belong to a scene/node/project domain.
// ZH: editor 工具暴露不属于 scene/node/project 单一领域的编辑器横向状态。
export function createEditorTools(): ToolModule {
  return createToolModule('editor', [
    {
      name: 'get_selection',
      description: 'Get current editor selection',
      inputSchema: objectSchema({ type: stringProp('Selection type', { default: 'node' }) }),
      handler: async (args, context) => ok(context.editor.getSelection(typeof args.type === 'string' ? args.type : undefined)),
    },
    {
      name: 'set_selection',
      description: 'Set current editor selection',
      inputSchema: objectSchema({
        type: stringProp('Selection type', { default: 'node' }),
        uuids: arrayProp('Selected UUIDs'),
      }, ['type', 'uuids']),
      handler: async (args, context) => {
        const uuids = Array.isArray(args.uuids) ? args.uuids.filter((uuid): uuid is string => typeof uuid === 'string') : [];
        context.editor.setSelection(String(args.type), uuids);
        return ok({ type: args.type, uuids }, 'Editor selection updated');
      },
    },
    {
      name: 'get_capabilities',
      description: 'Get MCP tool exposure capabilities and active profile',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        if (!context.exposure) {
          return ok({
            config: { profile: 'core', allowDangerous: false },
            total: 0,
            exposed: 0,
            dangerous: 0,
            partial: 0,
          });
        }
        const { catalog: _catalog, ...summary } = context.exposure;
        return ok(summary);
      },
    },
  ]);
}

export function createToolCatalogTool(): ToolModule {
  // EN: Catalog is always visible so clients can inspect disabled tools and understand active policy.
  // ZH: catalog 始终可见，让客户端能查看禁用工具并理解当前策略。
  return createToolModule('tool', [
    {
      name: 'get_catalog',
      description: 'Get complete MCP tool catalog with exposure status',
      inputSchema: objectSchema({
        category: stringProp('Optional category filter'),
        status: stringProp('Optional status filter', { enum: ['implemented', 'partial', 'unavailable'] }),
        risk: stringProp('Optional risk filter', { enum: ['safe', 'write', 'destructive', 'exec', 'environment', 'internal'] }),
      }),
      handler: async (args, context) => {
        const exposure = context.exposure;
        const catalog = exposure?.catalog ?? [];
        return ok({
          ...(exposure ?? {}),
          catalog: catalog.filter((tool) => matchesFilter(tool, args)),
        });
      },
    },
  ]);
}

function matchesFilter(tool: ToolCatalogEntry, args: JsonObject): boolean {
  if (typeof args.category === 'string' && tool.category !== args.category) {
    return false;
  }
  if (typeof args.status === 'string' && tool.status !== args.status) {
    return false;
  }
  if (typeof args.risk === 'string' && tool.risk !== args.risk) {
    return false;
  }
  return true;
}
