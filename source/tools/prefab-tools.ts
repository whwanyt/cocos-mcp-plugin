import { EditorAssetInfo, EditorNodeDump, JsonObject, ToolModule } from '../types';
import { createToolModule, objectSchema, ok, stringProp } from './toolkit';
import { normalizeTransformArgs, transformSchema } from './transform-utils';

// EN: Prefab tools are full-profile because prefab mutation can affect many scene instances.
// ZH: prefab 工具默认属于 full profile，因为 prefab 修改可能影响多个场景实例。
export function createPrefabTools(): ToolModule {
  return createToolModule('prefab', [
    {
      name: 'get_prefab_list',
      description: 'Get all prefabs in the project',
      inputSchema: objectSchema({ folder: stringProp('Folder path to search', { default: 'db://assets' }) }),
      handler: async (args, context) => {
        const folder = String(args.folder ?? 'db://assets');
        const assets = await context.editor.request('asset-db', 'query-assets', { pattern: `${folder}/**/*.prefab` }) as EditorAssetInfo[];
        return ok((assets ?? []).map((asset) => ({
          name: asset.name,
          path: asset.url,
          uuid: asset.uuid,
          folder: String(asset.url ?? '').slice(0, String(asset.url ?? '').lastIndexOf('/')),
        })));
      },
    },
    {
      name: 'load_prefab',
      description: 'Load a prefab by path',
      inputSchema: objectSchema({ prefabPath: stringProp('Prefab asset path') }, ['prefabPath']),
      handler: async (args, context) => ok(await context.editor.request('asset-db', 'query-asset-info', args.prefabPath)),
    },
    {
      name: 'instantiate_prefab',
      description: 'Instantiate a prefab in the scene',
      inputSchema: objectSchema({
        prefabPath: stringProp('Prefab asset path'),
        parentUuid: stringProp('Parent node UUID'),
        position: transformSchema().position as JsonObject,
      }, ['prefabPath']),
      handler: async (args, context) => {
        const assetInfo = await context.editor.request('asset-db', 'query-asset-info', args.prefabPath) as EditorAssetInfo | null;
        if (!assetInfo?.uuid) {
          return { success: false, error: `Prefab not found: ${args.prefabPath}` };
        }
        const uuid = await context.editor.request('scene', 'create-node', {
          assetUuid: assetInfo.uuid,
          parent: args.parentUuid,
          name: assetInfo.name,
        });
        let normalizedPosition: unknown;
        if (args.position && uuid) {
          const node = await context.editor.request('scene', 'query-node', String(uuid)) as EditorNodeDump | null;
          let transform: ReturnType<typeof normalizeTransformArgs>;
          try {
            transform = normalizeTransformArgs({ position: args.position }, node);
          } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error), data: { uuid } };
          }
          normalizedPosition = transform.position;
          await context.editor.request('scene', 'set-property', {
            uuid,
            path: 'position',
            dump: { value: transform.position },
          });
        }
        return ok({ uuid, prefab: assetInfo, position: normalizedPosition }, 'Prefab instantiate requested');
      },
    },
    {
      name: 'create_prefab',
      description: 'Create a prefab from a node with all children and components',
      inputSchema: objectSchema({
        nodeUuid: stringProp('Source node UUID'),
        savePath: stringProp('Path to save the prefab'),
        prefabName: stringProp('Prefab name'),
      }, ['nodeUuid', 'savePath', 'prefabName']),
    },
    {
      name: 'update_prefab',
      description: 'Update an existing prefab',
      inputSchema: objectSchema({
        prefabPath: stringProp('Prefab asset path'),
        nodeUuid: stringProp('Node UUID with changes'),
      }, ['prefabPath', 'nodeUuid']),
    },
    {
      name: 'revert_prefab',
      description: 'Revert prefab instance to original',
      inputSchema: objectSchema({ nodeUuid: stringProp('Prefab instance node UUID') }, ['nodeUuid']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'restore-prefab', { uuid: args.nodeUuid })),
    },
    {
      name: 'get_prefab_info',
      description: 'Get detailed prefab information',
      inputSchema: objectSchema({ prefabPath: stringProp('Prefab asset path') }, ['prefabPath']),
      handler: async (args, context) => ok(await context.editor.request('asset-db', 'query-asset-info', args.prefabPath)),
    },
    {
      name: 'validate_prefab',
      description: 'Validate a prefab file format',
      inputSchema: objectSchema({ prefabPath: stringProp('Prefab asset path') }, ['prefabPath']),
      handler: async (args, context) => {
        const info = await context.editor.request('asset-db', 'query-asset-info', args.prefabPath);
        return ok({ valid: !!info, assetInfo: info });
      },
    },
    {
      name: 'duplicate_prefab',
      description: 'Duplicate an existing prefab',
      inputSchema: objectSchema({
        sourcePrefabPath: stringProp('Source prefab path'),
        targetPrefabPath: stringProp('Target prefab path'),
        newPrefabName: stringProp('New prefab name'),
      }, ['sourcePrefabPath', 'targetPrefabPath']),
      handler: async (args, context) => ok(await context.editor.request('asset-db', 'copy-asset', args.sourcePrefabPath, args.targetPrefabPath, { overwrite: false })),
    },
    {
      name: 'restore_prefab_node',
      description: 'Restore prefab node using prefab asset',
      inputSchema: objectSchema({
        nodeUuid: stringProp('Prefab instance node UUID'),
        assetUuid: stringProp('Prefab asset UUID'),
      }, ['nodeUuid', 'assetUuid']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'restore-prefab', args.nodeUuid, args.assetUuid)),
    },
  ]);
}
