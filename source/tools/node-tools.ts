import { EditorComponentDump, EditorNodeDump, JsonObject, ToolModule } from '../types';
import { anyProp, arrayProp, booleanProp, createToolModule, numberProp, objectSchema, ok, stringProp } from './toolkit';
import { applyTransformToOptions, is2DNodeDump, normalizeTransformArgs, transformSchema } from './transform-utils';

// EN: Node tools keep scene graph operations behind EditorBridge so handlers remain testable without Cocos.
// ZH: 节点工具把场景树操作封装在 EditorBridge 后面，使 handler 在无 Cocos 环境中也可测试。
export function createNodeTools(): ToolModule {
  return createToolModule('node', [
    {
      name: 'create_node',
      description: 'Create a new node in the scene',
      inputSchema: objectSchema({
        name: stringProp('Node name'),
        parentUuid: stringProp('Parent node UUID'),
        nodeType: stringProp('Node type', { enum: ['Node', '2DNode', '3DNode'], default: 'Node' }),
        siblingIndex: numberProp('Sibling index', { default: -1 }),
        assetUuid: stringProp('Asset UUID to instantiate from'),
        assetPath: stringProp('Asset path to instantiate from'),
        components: arrayProp('Component type names'),
        unlinkPrefab: booleanProp('Unlink prefab after creation', { default: false }),
        keepWorldTransform: booleanProp('Keep world transform', { default: false }),
        initialTransform: objectSchema(transformSchema(), [], 'Initial transform object'),
      }, ['name']),
      handler: async (args, context) => {
        const options: Record<string, unknown> = {
          name: args.name,
          parent: args.parentUuid,
          assetUuid: args.assetUuid,
          nodeType: args.nodeType ?? 'Node',
          siblingIndex: args.siblingIndex ?? -1,
          keepWorldTransform: args.keepWorldTransform ?? false,
        };
        const nodeUuid = await context.editor.request('scene', 'create-node', options);
        if (args.initialTransform && nodeUuid) {
          const node = await context.editor.request('scene', 'query-node', String(nodeUuid)) as EditorNodeDump | null;
          const transform = normalizeTransformOrError(args.initialTransform as JsonObject, node);
          if (typeof transform === 'string') {
            return { success: false, error: transform };
          }
          await applyNodeTransform(String(nodeUuid), transform, context);
          return ok({ uuid: nodeUuid, options, initialTransform: transform }, 'Node created successfully');
        }
        return ok({ uuid: nodeUuid, options }, 'Node created successfully');
      },
    },
    {
      name: 'get_node_info',
      description: 'Get node information by UUID',
      inputSchema: objectSchema({ uuid: stringProp('Node UUID') }, ['uuid']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'query-node', String(args.uuid))),
    },
    {
      name: 'find_nodes',
      description: 'Find nodes by name pattern',
      inputSchema: objectSchema({
        pattern: stringProp('Name pattern to search'),
        exactMatch: booleanProp('Exact match or partial match', { default: false }),
      }, ['pattern']),
      handler: async (args, context) => {
        const tree = await context.editor.request('scene', 'query-node-tree') as JsonObject;
        const results: JsonObject[] = [];
        walkTree(tree, (node) => {
          const name = String(node.name ?? '');
          const pattern = String(args.pattern);
          const matched = args.exactMatch ? name === pattern : name.includes(pattern);
          if (matched) {
            results.push(node);
          }
        });
        return ok({ count: results.length, nodes: results });
      },
    },
    {
      name: 'find_node_by_name',
      description: 'Find first node by exact name',
      inputSchema: objectSchema({ name: stringProp('Node name to find') }, ['name']),
      handler: async (args, context) => {
        const tree = await context.editor.request('scene', 'query-node-tree') as JsonObject;
        let result: JsonObject | undefined;
        walkTree(tree, (node) => {
          if (!result && node.name === args.name) {
            result = node;
          }
        });
        return result ? ok(result) : { success: false, error: `Node not found: ${args.name}` };
      },
    },
    {
      name: 'get_all_nodes',
      description: 'Get all nodes in the scene with their UUIDs',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        const tree = await context.editor.request('scene', 'query-node-tree') as JsonObject;
        const nodes: JsonObject[] = [];
        walkTree(tree, (node) => {
          nodes.push({
            uuid: node.uuid,
            name: node.name,
            type: node.type,
            active: node.active,
            parent: node.parent,
          });
        });
        return ok({ count: nodes.length, nodes });
      },
    },
    {
      name: 'get_selected_nodes',
      description: 'Get selected scene nodes',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        const selection = context.editor.getSelection('node');
        const nodes: JsonObject[] = [];
        for (const uuid of selection.uuids) {
          const node = await context.editor.request('scene', 'query-node', uuid) as JsonObject | null;
          if (node) {
            nodes.push(node);
          }
        }
        return ok({ selection, count: nodes.length, nodes });
      },
    },
    {
      name: 'rename',
      description: 'Rename a scene node',
      inputSchema: objectSchema({
        uuid: stringProp('Node UUID'),
        name: stringProp('New node name'),
      }, ['uuid', 'name']),
      handler: async (args, context) => {
        await context.editor.request('scene', 'set-property', {
          uuid: args.uuid,
          path: 'name',
          dump: { value: args.name },
        });
        return ok({ uuid: args.uuid, name: args.name }, 'Node renamed');
      },
    },
    {
      name: 'set_active',
      description: 'Set node active state',
      inputSchema: objectSchema({
        uuid: stringProp('Node UUID'),
        active: booleanProp('Active state'),
      }, ['uuid', 'active']),
      handler: async (args, context) => {
        await context.editor.request('scene', 'set-property', {
          uuid: args.uuid,
          path: 'active',
          dump: { value: args.active },
        });
        return ok({ uuid: args.uuid, active: args.active }, 'Node active state updated');
      },
    },
    {
      name: 'set_node_property',
      description: 'Set node property value',
      inputSchema: objectSchema({
        uuid: stringProp('Node UUID'),
        property: stringProp('Property name'),
        value: anyProp('Property value'),
      }, ['uuid', 'property', 'value']),
      handler: async (args, context) => {
        await context.editor.request('scene', 'set-property', {
          uuid: args.uuid,
          path: args.property,
          dump: { value: args.value },
        });
        return ok({ uuid: args.uuid, property: args.property }, 'Node property updated');
      },
    },
    {
      name: 'set_node_transform',
      description: 'Set node transform properties',
      inputSchema: objectSchema({
        uuid: stringProp('Node UUID'),
        ...transformSchema(),
      }, ['uuid']),
      handler: async (args, context) => {
        const node = await context.editor.request('scene', 'query-node', String(args.uuid)) as EditorNodeDump | null;
        const transform = normalizeTransformOrError(args, node);
        if (typeof transform === 'string') {
          return { success: false, error: transform, data: { uuid: args.uuid } };
        }
        await applyNodeTransform(String(args.uuid), transform, context);
        return ok({ uuid: args.uuid, transform }, 'Node transform updated');
      },
    },
    {
      name: 'delete_node',
      description: 'Delete a node from scene',
      inputSchema: objectSchema({ uuid: stringProp('Node UUID to delete') }, ['uuid']),
      handler: async (args, context) => {
        await context.editor.request('scene', 'remove-node', { uuid: args.uuid });
        return ok({ uuid: args.uuid }, 'Node deleted');
      },
    },
    {
      name: 'move_node',
      description: 'Move node to new parent',
      inputSchema: objectSchema({
        nodeUuid: stringProp('Node UUID to move'),
        newParentUuid: stringProp('New parent node UUID'),
        siblingIndex: numberProp('Sibling index in new parent', { default: -1 }),
      }, ['nodeUuid', 'newParentUuid']),
      handler: async (args, context) => {
        await context.editor.request('scene', 'set-parent', {
          uuid: args.nodeUuid,
          parent: args.newParentUuid,
          siblingIndex: args.siblingIndex ?? -1,
        });
        return ok({ nodeUuid: args.nodeUuid, newParentUuid: args.newParentUuid }, 'Node moved');
      },
    },
    {
      name: 'duplicate_node',
      description: 'Duplicate a node',
      inputSchema: objectSchema({
        uuid: stringProp('Node UUID to duplicate'),
        includeChildren: booleanProp('Include children nodes', { default: true }),
      }, ['uuid']),
      handler: async (args, context) => ok(await context.editor.request('scene', 'duplicate-node', args.uuid)),
    },
    {
      name: 'detect_node_type',
      description: 'Detect if a node is 2D or 3D based on its components and properties',
      inputSchema: objectSchema({ uuid: stringProp('Node UUID to analyze') }, ['uuid']),
      handler: async (args, context) => {
        const node = await context.editor.request('scene', 'query-node', String(args.uuid)) as EditorNodeDump | null;
        const components = Array.isArray(node?.__comps__) ? node.__comps__ : [];
        const componentTypes = components
          .map((component: EditorComponentDump) => component.type ?? component.value?.type)
          .filter((type): type is string => typeof type === 'string');
        const is2D = is2DNodeDump(node);
        return ok({ uuid: args.uuid, nodeType: is2D ? '2DNode' : '3DNode', componentTypes });
      },
    },
  ]);
}

function normalizeTransformOrError(args: JsonObject, node: EditorNodeDump | null | undefined): ReturnType<typeof normalizeTransformArgs> | string {
  try {
    return normalizeTransformArgs(args, node);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function applyNodeTransform(uuid: string, transform: ReturnType<typeof normalizeTransformArgs>, context: { editor: { request(channel: string, message: string, ...args: unknown[]): Promise<unknown> } }): Promise<void> {
  const options: Record<string, unknown> = {};
  applyTransformToOptions(options, transform);
  for (const key of ['position', 'rotation', 'scale']) {
    if (options[key] !== undefined) {
      await context.editor.request('scene', 'set-property', {
        uuid,
        path: key,
        dump: { value: options[key] },
      });
    }
  }
}

function walkTree(node: JsonObject | undefined, visitor: (node: JsonObject) => void): void {
  // EN: Editor node trees are plain dumps, so traversal avoids depending on Cocos runtime classes.
  // ZH: 编辑器节点树是普通 dump，因此遍历不依赖 Cocos runtime 类。
  if (!node || typeof node !== 'object') {
    return;
  }
  visitor(node);
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        walkTree(child as JsonObject, visitor);
      }
    }
  }
}
