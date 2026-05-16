import * as fs from 'fs';
import { ToolModule } from '../types';
import { anyProp, arrayProp, createToolModule, objectSchema, ok, stringProp } from './toolkit';

// EN: Preferences tools are intentionally full-profile because they modify editor-wide behavior.
// ZH: preferences 工具有意放入 full profile，因为它们会修改编辑器级行为。
export function createPreferencesTools(): ToolModule {
  return createToolModule('preferences', [
    {
      name: 'open_preferences_settings',
      description: 'Open preferences settings panel',
      inputSchema: objectSchema({
        tab: stringProp('Preferences tab to open', { enum: ['general', 'external-tools', 'data-editor', 'laboratory', 'extensions'] }),
        args: arrayProp('Additional arguments to pass to the tab', {}),
      }),
      handler: async (args, context) => {
        const requestArgs = [args.tab, ...((args.args as unknown[]) ?? [])].filter((value) => value !== undefined);
        await context.editor.request('preferences', 'open-settings', ...requestArgs);
        return ok({ tab: args.tab }, 'Preferences settings opened');
      },
    },
    {
      name: 'query_preferences_config',
      description: 'Query preferences configuration',
      inputSchema: objectSchema({
        name: stringProp('Plugin or category name', { default: 'general' }),
        path: stringProp('Configuration path'),
        type: stringProp('Configuration type', { enum: ['default', 'global', 'local'], default: 'global' }),
      }, ['name']),
      handler: async (args, context) => ok(await context.editor.request('preferences', 'query-config', args.name, args.path, args.type ?? 'global')),
    },
    {
      name: 'set_preferences_config',
      description: 'Set preferences configuration',
      inputSchema: objectSchema({
        name: stringProp('Plugin name'),
        path: stringProp('Configuration path'),
        value: anyProp('Configuration value'),
        type: stringProp('Configuration type', { enum: ['default', 'global', 'local'], default: 'global' }),
      }, ['name', 'path', 'value']),
      handler: async (args, context) => ok(await context.editor.request('preferences', 'set-config', args.name, args.path, args.value, args.type ?? 'global')),
    },
    {
      name: 'get_all_preferences',
      description: 'Get all available preferences categories',
      inputSchema: objectSchema(),
      status: 'partial',
      handler: async (_args, context) => ok({
        commonCategories: ['general', 'external-tools', 'data-editor', 'laboratory', 'extensions'],
        general: await context.editor.request('preferences', 'query-config', 'general', undefined, 'global').catch((error) => ({ error: String(error) })),
      }),
    },
    {
      name: 'reset_preferences',
      description: 'Reset preferences to default values',
      inputSchema: objectSchema({
        name: stringProp('Specific preference category to reset'),
        type: stringProp('Configuration type to reset', { enum: ['global', 'local'], default: 'global' }),
      }),
    },
    {
      name: 'export_preferences',
      description: 'Export current preferences configuration',
      inputSchema: objectSchema({ exportPath: stringProp('Path to export preferences file') }),
      status: 'partial',
      handler: async (args, context) => {
        const data = {
          exportedAt: new Date().toISOString(),
          general: await context.editor.request('preferences', 'query-config', 'general', undefined, 'global').catch((error) => ({ error: String(error) })),
        };
        if (args.exportPath) {
          fs.writeFileSync(String(args.exportPath), JSON.stringify(data, null, 2));
        }
        return ok(data);
      },
    },
    {
      name: 'import_preferences',
      description: 'Import preferences configuration from file',
      inputSchema: objectSchema({ importPath: stringProp('Path to import preferences file from') }, ['importPath']),
    },
  ]);
}
