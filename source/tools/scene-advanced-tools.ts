import { ToolModule } from '../types';
import { anyProp, arrayProp, createToolModule, numberProp, objectSchema, ok, stringProp } from './toolkit';

// EN: Advanced scene tools include undo, prefab recovery, array mutation, and script execution; most are full or dangerous.
// ZH: 高级场景工具包含 undo、prefab 恢复、数组修改和脚本执行，多数属于 full 或危险能力。
export function createSceneAdvancedTools(): ToolModule {
  return createToolModule('sceneAdvanced', [
    {
      name: 'reset_node_property',
      description: 'Reset node property to default value',
      inputSchema: objectSchema({ uuid: stringProp('Node UUID'), path: stringProp('Property path') }, ['uuid', 'path']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'reset-property', { uuid: args.uuid, path: args.path })),
    },
    {
      name: 'move_array_element',
      description: 'Move array element position',
      inputSchema: objectSchema({
        uuid: stringProp('Node UUID'),
        path: stringProp('Array property path'),
        target: numberProp('Target item original index'),
        offset: numberProp('Offset amount'),
      }, ['uuid', 'path', 'target', 'offset']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'move-array-element', args)),
    },
    {
      name: 'remove_array_element',
      description: 'Remove array element at specific index',
      inputSchema: objectSchema({
        uuid: stringProp('Node UUID'),
        path: stringProp('Array property path'),
        index: numberProp('Target item index to remove'),
      }, ['uuid', 'path', 'index']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'remove-array-element', args)),
    },
    {
      name: 'copy_node',
      description: 'Copy node for later paste operation',
      inputSchema: objectSchema({ uuids: anyProp('Node UUID or array of UUIDs to copy') }, ['uuids']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'copy-node', args.uuids)),
    },
    {
      name: 'paste_node',
      description: 'Paste previously copied nodes',
      inputSchema: objectSchema({
        target: stringProp('Target parent node UUID'),
        uuids: anyProp('Node UUIDs to paste'),
        keepWorldTransform: anyProp('Keep world transform coordinates'),
      }, ['target', 'uuids']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'paste-node', args)),
    },
    {
      name: 'cut_node',
      description: 'Cut node',
      inputSchema: objectSchema({ uuids: anyProp('Node UUID or array of UUIDs to cut') }, ['uuids']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'cut-node', args.uuids)),
    },
    {
      name: 'reset_node_transform',
      description: 'Reset node position, rotation and scale',
      inputSchema: objectSchema({ uuid: stringProp('Node UUID') }, ['uuid']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'reset-node', { uuid: args.uuid })),
    },
    {
      name: 'reset_component',
      description: 'Reset component to default values',
      inputSchema: objectSchema({ uuid: stringProp('Component UUID') }, ['uuid']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'reset-component', { uuid: args.uuid })),
    },
    {
      name: 'restore_prefab',
      description: 'Restore prefab instance from asset',
      inputSchema: objectSchema({ nodeUuid: stringProp('Node UUID'), assetUuid: stringProp('Prefab asset UUID') }, ['nodeUuid', 'assetUuid']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'restore-prefab', { uuid: args.nodeUuid, assetUuid: args.assetUuid })),
    },
    {
      name: 'execute_component_method',
      description: 'Execute method on component',
      inputSchema: objectSchema({
        uuid: stringProp('Component UUID'),
        name: stringProp('Method name'),
        args: arrayProp('Method arguments', {}),
      }, ['uuid', 'name']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'execute-component-method', args)),
    },
    {
      name: 'execute_scene_script',
      description: 'Execute scene script method',
      inputSchema: objectSchema({
        name: stringProp('Plugin name'),
        method: stringProp('Method name'),
        args: arrayProp('Method arguments', {}),
      }, ['name', 'method']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'execute-scene-script', {
        name: args.name,
        method: args.method,
        args: args.args ?? [],
      })),
    },
    {
      name: 'scene_snapshot',
      description: 'Create scene state snapshot',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok(await context.editor.request('scene', 'snapshot')),
    },
    {
      name: 'scene_snapshot_abort',
      description: 'Abort scene snapshot creation',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok(await context.editor.request('scene', 'snapshot-abort')),
    },
    {
      name: 'begin_undo_recording',
      description: 'Begin recording undo data',
      inputSchema: objectSchema({ nodeUuid: stringProp('Node UUID to record') }, ['nodeUuid']),
      handler: async (args, context) => ok({ undoId: await context.editor.request('scene', 'begin-recording', args.nodeUuid) }),
    },
    {
      name: 'end_undo_recording',
      description: 'End recording undo data',
      inputSchema: objectSchema({ undoId: stringProp('Undo recording id') }, ['undoId']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'end-recording', args.undoId)),
    },
    {
      name: 'cancel_undo_recording',
      description: 'Cancel undo recording',
      inputSchema: objectSchema({ undoId: stringProp('Undo recording id') }, ['undoId']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'cancel-recording', args.undoId)),
    },
    {
      name: 'soft_reload_scene',
      description: 'Soft reload current scene',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok(await context.editor.request('scene', 'soft-reload')),
    },
    {
      name: 'query_scene_ready',
      description: 'Check if scene is ready',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok({ ready: await context.editor.request('scene', 'query-is-ready') }),
    },
    {
      name: 'query_scene_dirty',
      description: 'Check if scene has unsaved changes',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok({ dirty: await context.editor.request('scene', 'query-dirty') }),
    },
    {
      name: 'query_scene_classes',
      description: 'Query all registered classes',
      inputSchema: objectSchema({ options: anyProp('Query options') }),
      handler: async (args, context) => ok(await context.editor.request('scene', 'query-classes', args.options ?? {})),
    },
    {
      name: 'query_scene_components',
      description: 'Query available scene components',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok(await context.editor.request('scene', 'query-components')),
    },
    {
      name: 'query_component_has_script',
      description: 'Check if component has script',
      inputSchema: objectSchema({ className: stringProp('Component class name') }, ['className']),
      handler: async (args, context) => ok({ hasScript: await context.editor.request('scene', 'query-component-has-script', args.className) }),
    },
    {
      name: 'query_nodes_by_asset_uuid',
      description: 'Find nodes that use specific asset UUID',
      inputSchema: objectSchema({ assetUuid: stringProp('Asset UUID') }, ['assetUuid']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'query-nodes-by-asset-uuid', args.assetUuid)),
    },
  ]);
}
