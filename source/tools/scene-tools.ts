import { EditorAssetInfo, EditorNodeDump, ToolModule } from '../types';
import { anyProp, arrayProp, booleanProp, createToolModule, objectSchema, ok, stringProp } from './toolkit';
import { getRuntimeCapabilities, isDangerousRisk, toJsonObject, validateRuntimeArguments } from './capability-catalog';
import { readPath, resolveComponentPropertyTarget } from './component-property-utils';

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
    {
      name: 'get_runtime_catalog',
      description: 'Get supported scene runtime control catalog',
      inputSchema: objectSchema({
        risk: stringProp('Optional risk filter', { enum: ['safe', 'write', 'destructive', 'exec', 'environment', 'internal'] }),
      }),
      handler: async (args) => ok({
        total: getRuntimeCapabilities().length,
        supported: getRuntimeCapabilities().filter((item) => item.supported).length,
        catalog: getRuntimeCapabilities()
          .filter((item) => typeof args.risk !== 'string' || item.risk === args.risk)
          .map(toJsonObject),
      }),
    },
    {
      name: 'call_runtime',
      description: 'Call a validated scene runtime capability in Cocos scene context',
      inputSchema: objectSchema({
        path: stringProp('Runtime capability path'),
        targetUuid: stringProp('Optional target node UUID'),
        args: arrayProp('Runtime call arguments', {}),
        value: anyProp('Property value for set operations'),
      }, ['path']),
      risk: 'write',
      profile: 'full',
      handler: async (args, context) => {
        const path = String(args.path);
        const capability = getRuntimeCapabilities().find((item) => item.path === path);
        if (!capability) {
          return { success: false, error: `Unknown runtime capability: ${path}` };
        }
        if (isDangerousRisk(capability.risk) && context.exposure?.config.allowDangerous !== true) {
          return {
            success: false,
            error: 'Runtime capability requires Dangerous Tools opt-in',
            data: toJsonObject(capability),
          };
        }
        const runtimeArgs = Array.isArray(args.args) ? args.args : [];
        const validationError = validateRuntimeArguments(capability, runtimeArgs, args.value);
        if (validationError) {
          return { success: false, error: validationError, data: toJsonObject(capability) };
        }
        return ok(await context.editor.executeSceneScript('callRuntime', [{
          path,
          targetUuid: typeof args.targetUuid === 'string' ? args.targetUuid : undefined,
          args: runtimeArgs,
          value: args.value,
        }]));
      },
    },
    {
      name: 'get_component_property',
      description: 'Get a component property through scene node dump with stable component lookup',
      inputSchema: objectSchema({
        nodeUuid: stringProp('Target node UUID'),
        componentType: stringProp('Component type'),
        property: stringProp('Property path, for example contentSize.width'),
      }, ['nodeUuid', 'componentType', 'property']),
      handler: async (args, context) => {
        const node = await context.editor.request('scene', 'query-node', String(args.nodeUuid)) as EditorNodeDump | null;
        const target = resolveComponentPropertyTarget(node, String(args.componentType));
        if (!target) {
          return { success: false, error: `Component not found: ${args.componentType}` };
        }
        return ok({
          nodeUuid: args.nodeUuid,
          componentType: args.componentType,
          componentPath: target.componentPath,
          property: args.property,
          value: readPath(target.component.value ?? target.component, String(args.property)),
        });
      },
    },
    {
      name: 'set_component_property',
      description: 'Set a component property through scene set-property using stable component dump path',
      inputSchema: objectSchema({
        nodeUuid: stringProp('Target node UUID'),
        componentType: stringProp('Component type'),
        property: stringProp('Property path, for example contentSize.width'),
        propertyType: stringProp('Cocos dump property type'),
        value: anyProp('Property value'),
      }, ['nodeUuid', 'componentType', 'property', 'value']),
      handler: async (args, context) => {
        const node = await context.editor.request('scene', 'query-node', String(args.nodeUuid)) as EditorNodeDump | null;
        const target = resolveComponentPropertyTarget(node, String(args.componentType));
        if (!target) {
          return { success: false, error: `Component not found: ${args.componentType}` };
        }
        const propertyType = typeof args.propertyType === 'string' ? args.propertyType : undefined;
        await context.editor.request('scene', 'set-property', {
          uuid: args.nodeUuid,
          path: `${target.componentPath}.${args.property}`,
          dump: {
            ...(propertyType ? { type: propertyType } : {}),
            value: args.value,
          },
        });
        return ok({
          nodeUuid: args.nodeUuid,
          componentType: args.componentType,
          componentPath: target.componentPath,
          property: args.property,
        }, 'Scene component property update requested');
      },
    },
  ]);
}
