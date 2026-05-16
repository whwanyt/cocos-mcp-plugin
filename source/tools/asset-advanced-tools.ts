import { ToolModule } from '../types';
import { arrayProp, booleanProp, createToolModule, numberProp, objectSchema, ok, stringProp } from './toolkit';

// EN: Advanced asset tools group lower-frequency operations that can affect many files or asset metadata.
// ZH: 高级资源工具聚合低频能力，这些能力可能影响大量文件或资源元数据。
export function createAssetAdvancedTools(): ToolModule {
  return createToolModule('assetAdvanced', [
    {
      name: 'save_asset_meta',
      description: 'Save asset meta information',
      inputSchema: objectSchema({
        urlOrUUID: stringProp('Asset URL or UUID'),
        content: stringProp('Asset meta serialized content string'),
      }, ['urlOrUUID', 'content']),
      handler: async (args, context) => ok(await context.editor.request('asset-db', 'save-asset-meta', args.urlOrUUID, args.content)),
    },
    {
      name: 'generate_available_url',
      description: 'Generate an available URL based on input URL',
      inputSchema: objectSchema({ url: stringProp('Asset URL to generate available URL for') }, ['url']),
      handler: async (args, context) => ok({ availableUrl: await context.editor.request('asset-db', 'generate-available-url', args.url) }),
    },
    {
      name: 'query_asset_db_ready',
      description: 'Check if asset database is ready',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok({ ready: await context.editor.request('asset-db', 'query-ready') }),
    },
    {
      name: 'open_asset_external',
      description: 'Open asset with external program',
      inputSchema: objectSchema({ urlOrUUID: stringProp('Asset URL or UUID to open') }, ['urlOrUUID']),
      handler: async (args, context) => {
        await context.editor.request('asset-db', 'open-asset', args.urlOrUUID);
        return ok({ urlOrUUID: args.urlOrUUID }, 'Asset open requested');
      },
    },
    {
      name: 'batch_import_assets',
      description: 'Import multiple assets in batch',
      inputSchema: objectSchema({
        sourceDirectory: stringProp('Source directory path'),
        targetDirectory: stringProp('Target directory URL'),
        fileFilter: arrayProp('File extensions to include'),
        recursive: booleanProp('Include subdirectories', { default: false }),
        overwrite: booleanProp('Overwrite existing files', { default: false }),
      }, ['sourceDirectory', 'targetDirectory']),
    },
    {
      name: 'batch_delete_assets',
      description: 'Delete multiple assets in batch',
      inputSchema: objectSchema({ urls: arrayProp('Array of asset URLs to delete') }, ['urls']),
      handler: async (args, context) => {
        const results = [];
        for (const url of args.urls as string[]) {
          results.push(await context.editor.request('asset-db', 'delete-asset', url));
        }
        return ok({ count: results.length, results });
      },
    },
    {
      name: 'validate_asset_references',
      description: 'Validate asset references and find broken links',
      inputSchema: objectSchema({ directory: stringProp('Directory to validate', { default: 'db://assets' }) }),
    },
    {
      name: 'get_asset_dependencies',
      description: 'Get asset dependency tree',
      inputSchema: objectSchema({
        urlOrUUID: stringProp('Asset URL or UUID'),
        direction: stringProp('Dependency direction', { enum: ['dependents', 'dependencies', 'both'], default: 'dependencies' }),
      }, ['urlOrUUID']),
    },
    {
      name: 'get_unused_assets',
      description: 'Find unused assets in project',
      inputSchema: objectSchema({
        directory: stringProp('Directory to scan', { default: 'db://assets' }),
        excludeDirectories: arrayProp('Directories to exclude from scan'),
      }),
    },
    {
      name: 'compress_textures',
      description: 'Batch compress texture assets',
      inputSchema: objectSchema({
        directory: stringProp('Directory containing textures', { default: 'db://assets' }),
        format: stringProp('Compression format', { enum: ['auto', 'jpg', 'png', 'webp'], default: 'auto' }),
        quality: numberProp('Compression quality', { minimum: 0.1, maximum: 1.0, default: 0.8 }),
      }),
    },
    {
      name: 'export_asset_manifest',
      description: 'Export asset manifest/inventory',
      inputSchema: objectSchema({
        directory: stringProp('Directory to export manifest for', { default: 'db://assets' }),
        format: stringProp('Export format', { enum: ['json', 'csv', 'xml'], default: 'json' }),
        includeMetadata: booleanProp('Include asset metadata', { default: true }),
      }),
      handler: async (args, context) => {
        const directory = String(args.directory ?? 'db://assets');
        const assets = await context.editor.request('asset-db', 'query-assets', { pattern: `${directory}/**/*` });
        return ok({ directory, format: args.format ?? 'json', assets });
      },
    },
  ]);
}
