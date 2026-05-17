import * as fs from 'fs';
import * as path from 'path';
import { EditorAssetInfo, ToolModule } from '../types';
import { anyProp, booleanProp, createToolModule, numberProp, objectSchema, ok, stringProp } from './toolkit';

// EN: Project tools bridge asset-db, builder, preview server, and local filesystem reads under one namespace.
// ZH: project 工具在同一 namespace 下桥接 asset-db、builder、预览服务和本地文件读取。
export function createProjectTools(): ToolModule {
  return createToolModule('project', [
    {
      name: 'run_project',
      description: 'Run the project in preview mode',
      inputSchema: objectSchema({ platform: stringProp('Target platform', { enum: ['browser', 'simulator', 'preview'], default: 'browser' }) }),
    },
    {
      name: 'build_project',
      description: 'Build the project',
      inputSchema: objectSchema({
        platform: stringProp('Build platform', { enum: ['web-mobile', 'web-desktop', 'ios', 'android', 'windows', 'mac'] }),
        debug: booleanProp('Debug build', { default: true }),
      }, ['platform']),
    },
    {
      name: 'get_project_info',
      description: 'Get project information',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok(context.editor.projectInfo()),
    },
    {
      name: 'get_project_settings',
      description: 'Get project settings',
      inputSchema: objectSchema({ category: stringProp('Settings category', { enum: ['general', 'physics', 'render', 'assets'], default: 'general' }) }),
      handler: async (args, context) => ok(await context.editor.request('project', 'query-config', args.category ?? 'project')),
    },
    {
      name: 'refresh_assets',
      description: 'Refresh asset database',
      inputSchema: objectSchema({ folder: stringProp('Specific folder to refresh') }),
      handler: async (args, context) => {
        await context.editor.request('asset-db', 'refresh-asset', args.folder ?? 'db://assets');
        return ok({ folder: args.folder ?? 'db://assets' }, 'Asset database refresh requested');
      },
    },
    {
      name: 'import_asset',
      description: 'Import an asset file',
      inputSchema: objectSchema({
        sourcePath: stringProp('Source file path'),
        targetFolder: stringProp('Target folder in assets'),
      }, ['sourcePath', 'targetFolder']),
      handler: async (args, context) => ok(await context.editor.request('asset-db', 'import-asset', args.sourcePath, args.targetFolder)),
    },
    {
      name: 'get_asset_info',
      description: 'Get asset information',
      inputSchema: objectSchema({ assetPath: stringProp('Asset path') }, ['assetPath']),
      handler: async (args, context) => ok(await context.editor.request('asset-db', 'query-asset-info', args.assetPath)),
    },
    {
      name: 'get_assets',
      description: 'Get assets by type',
      inputSchema: objectSchema({
        type: stringProp('Asset type filter', { enum: ['all', 'scene', 'prefab', 'script', 'texture', 'material', 'mesh', 'audio', 'animation'], default: 'all' }),
        folder: stringProp('Folder to search in', { default: 'db://assets' }),
      }),
      handler: async (args, context) => {
        const folder = String(args.folder ?? 'db://assets');
        const type = String(args.type ?? 'all');
        const suffix: Record<string, string> = {
          scene: '*.scene',
          prefab: '*.prefab',
          script: '*.{ts,js}',
          texture: '*.{png,jpg,jpeg,webp}',
          material: '*.mtl',
          audio: '*.{mp3,wav,ogg}',
          animation: '*.anim',
        };
        const pattern = type === 'all' ? `${folder}/**/*` : `${folder}/**/${suffix[type] ?? '*'}`;
        return ok(await context.editor.request('asset-db', 'query-assets', { pattern }));
      },
    },
    {
      name: 'get_build_settings',
      description: 'Get build settings',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok(await context.editor.request('builder', 'query-options')),
    },
    {
      name: 'open_build_panel',
      description: 'Open the build panel in the editor',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        await context.editor.request('builder', 'open', 'default');
        return ok(undefined, 'Build panel opened');
      },
    },
    {
      name: 'check_builder_status',
      description: 'Check if builder worker is ready',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok({ ready: await context.editor.request('builder', 'query-worker-ready') }),
    },
    {
      name: 'start_preview_server',
      description: 'Start preview server',
      inputSchema: objectSchema({ port: numberProp('Preview server port', { default: 7456 }) }),
    },
    {
      name: 'stop_preview_server',
      description: 'Stop preview server',
      inputSchema: objectSchema(),
    },
    {
      name: 'create_asset',
      description: 'Create a new asset file or folder',
      inputSchema: objectSchema({
        url: stringProp('Asset URL'),
        content: stringProp('File content'),
        overwrite: booleanProp('Overwrite existing file', { default: false }),
      }, ['url']),
      handler: async (args, context) => ok(await context.editor.request('asset-db', 'create-asset', args.url, args.content ?? '', { overwrite: args.overwrite ?? false })),
    },
    {
      name: 'copy_asset',
      description: 'Copy an asset to another location',
      inputSchema: objectSchema({
        source: stringProp('Source asset URL'),
        target: stringProp('Target location URL'),
        overwrite: booleanProp('Overwrite existing file', { default: false }),
      }, ['source', 'target']),
      handler: async (args, context) => ok(await context.editor.request('asset-db', 'copy-asset', args.source, args.target, { overwrite: args.overwrite ?? false })),
    },
    {
      name: 'move_asset',
      description: 'Move an asset to another location',
      inputSchema: objectSchema({
        source: stringProp('Source asset URL'),
        target: stringProp('Target location URL'),
        overwrite: booleanProp('Overwrite existing file', { default: false }),
      }, ['source', 'target']),
      handler: async (args, context) => ok(await context.editor.request('asset-db', 'move-asset', args.source, args.target, { overwrite: args.overwrite ?? false })),
    },
    {
      name: 'delete_asset',
      description: 'Delete an asset',
      inputSchema: objectSchema({ url: stringProp('Asset URL to delete') }, ['url']),
      handler: async (args, context) => ok(await context.editor.request('asset-db', 'delete-asset', args.url)),
    },
    {
      name: 'save_asset',
      description: 'Save asset content',
      inputSchema: objectSchema({
        url: stringProp('Asset URL'),
        content: stringProp('File content'),
      }, ['url', 'content']),
      handler: async (args, context) => ok(await context.editor.request('asset-db', 'save-asset', args.url, args.content)),
    },
    {
      name: 'reimport_asset',
      description: 'Reimport an asset',
      inputSchema: objectSchema({ url: stringProp('Asset URL') }, ['url']),
      handler: async (args, context) => ok(await context.editor.request('asset-db', 'reimport-asset', args.url)),
    },
    {
      name: 'query_asset_path',
      description: 'Get asset disk path',
      inputSchema: objectSchema({ url: stringProp('Asset URL') }, ['url']),
      handler: async (args, context) => ok({ path: await context.editor.request('asset-db', 'query-path', args.url) }),
    },
    {
      name: 'query_asset_uuid',
      description: 'Get asset UUID from URL',
      inputSchema: objectSchema({ url: stringProp('Asset URL') }, ['url']),
      handler: async (args, context) => ok({ uuid: await context.editor.request('asset-db', 'query-uuid', args.url) }),
    },
    {
      name: 'query_asset_url',
      description: 'Get asset URL from UUID',
      inputSchema: objectSchema({ uuid: stringProp('Asset UUID') }, ['uuid']),
      handler: async (args, context) => ok({ url: await context.editor.request('asset-db', 'query-url', args.uuid) }),
    },
    {
      name: 'find_asset_by_name',
      description: 'Find assets by name',
      inputSchema: objectSchema({
        name: stringProp('Asset name'),
        folder: stringProp('Folder to search', { default: 'db://assets' }),
      }, ['name']),
      handler: async (args, context) => {
        const assets = await context.editor.request('asset-db', 'query-assets', { pattern: `${args.folder ?? 'db://assets'}/**/*` }) as EditorAssetInfo[];
        return ok((assets ?? []).filter((asset) => String(asset.name ?? '').includes(String(args.name))));
      },
    },
    {
      name: 'search_assets',
      description: 'Search assets by name, path, type, or UUID',
      inputSchema: objectSchema({
        query: stringProp('Search text'),
        type: stringProp('Optional asset type filter'),
        folder: stringProp('Folder to search', { default: 'db://assets' }),
        limit: numberProp('Maximum number of results', { default: 50, minimum: 1, maximum: 500 }),
      }, ['query']),
      handler: async (args, context) => {
        const folder = String(args.folder ?? 'db://assets');
        const query = String(args.query).toLowerCase();
        const type = typeof args.type === 'string' ? args.type : undefined;
        const limit = Number(args.limit ?? 50);
        const assets = await context.editor.request('asset-db', 'query-assets', { pattern: `${folder}/**/*` }) as EditorAssetInfo[];
        const matches = (assets ?? []).filter((asset) => {
          const typeOk = type ? asset.type === type : true;
          const haystack = [asset.name, asset.url, asset.uuid, asset.file, asset.type]
            .filter((value): value is string => typeof value === 'string')
            .join('\n')
            .toLowerCase();
          return typeOk && haystack.includes(query);
        });
        return ok({ count: matches.length, assets: matches.slice(0, limit) });
      },
    },
    {
      name: 'get_asset_details',
      description: 'Get detailed asset information including sub-assets',
      inputSchema: objectSchema({ assetPath: stringProp('Asset path') }, ['assetPath']),
      handler: async (args, context) => {
        const assetInfo = await context.editor.request('asset-db', 'query-asset-info', args.assetPath) as EditorAssetInfo | null;
        const diskPath = await context.editor.request('asset-db', 'query-path', args.assetPath).catch(() => undefined);
        return ok({
          ...assetInfo,
          diskPath,
          existsOnDisk: typeof diskPath === 'string' ? fs.existsSync(diskPath) : undefined,
          extension: typeof diskPath === 'string' ? path.extname(diskPath) : undefined,
        });
      },
    },
  ]);
}
