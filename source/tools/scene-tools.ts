import { EditorAssetInfo, EditorNodeDump, ToolModule } from '../types';
import { booleanProp, createToolModule, objectSchema, ok, stringProp } from './toolkit';

// EN: Scene tools combine editor scene messages with scene-script calls only when component/runtime data is required.
// ZH: 场景工具优先使用编辑器 scene message，仅在需要组件/runtime 数据时调用 scene-script。
export function createSceneTools(): ToolModule {
  return createToolModule('scene', [
    {
      name: 'get_current_scene',
      description: 'Get current scene information',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        const tree = await context.editor.request('scene', 'query-node-tree') as EditorNodeDump | null;
        if (!tree) {
          return { success: false, error: 'No active scene data returned by Cocos Editor' };
        }
        return ok({
          name: tree.name ?? 'Current Scene',
          uuid: tree.uuid,
          type: tree.type ?? 'cc.Scene',
          active: tree.active ?? true,
          nodeCount: Array.isArray(tree.children) ? tree.children.length : 0,
        });
      },
    },
    {
      name: 'get_scene_list',
      description: 'Get all scenes in the project',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        const assets = await context.editor.request('asset-db', 'query-assets', { pattern: 'db://assets/**/*.scene' }) as EditorAssetInfo[];
        return ok((assets ?? []).map((asset) => ({
          name: asset.name,
          path: asset.url,
          uuid: asset.uuid,
        })));
      },
    },
    {
      name: 'open_scene',
      description: 'Open a scene by path',
      inputSchema: objectSchema({ scenePath: stringProp('The scene file path') }, ['scenePath']),
      handler: async (args, context) => {
        const scenePath = String(args.scenePath);
        const uuid = await context.editor.request('asset-db', 'query-uuid', scenePath);
        if (!uuid) {
          return { success: false, error: `Scene not found: ${scenePath}` };
        }
        await context.editor.request('scene', 'open-scene', uuid);
        return ok({ scenePath, uuid }, `Scene opened: ${scenePath}`);
      },
    },
    {
      name: 'save_scene',
      description: 'Save current scene',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        await context.editor.request('scene', 'save-scene');
        return ok(undefined, 'Scene saved successfully');
      },
    },
    {
      name: 'create_scene',
      description: 'Create a new scene asset',
      inputSchema: objectSchema({
        sceneName: stringProp('Name of the new scene'),
        savePath: stringProp('Path to save the scene'),
      }, ['sceneName', 'savePath']),
    },
    {
      name: 'save_scene_as',
      description: 'Save scene as new file',
      inputSchema: objectSchema({ path: stringProp('Path to save the scene') }, ['path']),
      handler: async (args, context) => {
        await context.editor.request('scene', 'save-as-scene', String(args.path));
        return ok({ path: args.path }, 'Scene saved as requested path');
      },
    },
    {
      name: 'close_scene',
      description: 'Close current scene',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        await context.editor.request('scene', 'close-scene');
        return ok(undefined, 'Scene closed successfully');
      },
    },
    {
      name: 'get_scene_hierarchy',
      description: 'Get the complete hierarchy of current scene',
      inputSchema: objectSchema({ includeComponents: booleanProp('Include component information', { default: false }) }),
      handler: async (args, context) => {
        if (args.includeComponents) {
          const result = await context.editor.executeSceneScript('getSceneHierarchy', [true]);
          return ok(result);
        }
        const tree = await context.editor.request('scene', 'query-node-tree');
        return ok(tree);
      },
    },
  ]);
}
