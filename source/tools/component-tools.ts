import { EditorAssetInfo, EditorComponentDump, EditorNodeDump, ToolModule } from '../types';
import { anyProp, createToolModule, objectSchema, ok, stringProp } from './toolkit';
import { findComponent, readPath, resolveComponentPropertyTarget } from './component-property-utils';

// EN: Component tools operate on editor node dumps and avoid importing Cocos runtime component classes.
// ZH: 组件工具基于编辑器节点 dump 操作，避免导入 Cocos runtime 组件类。
export function createComponentTools(): ToolModule {
  return createToolModule('component', [
    {
      name: 'add_component',
      description: 'Add a component to a specific node',
      inputSchema: objectSchema({
        nodeUuid: stringProp('Target node UUID'),
        componentType: stringProp('Component type'),
      }, ['nodeUuid', 'componentType']),
      handler: async (args, context) => {
        await context.editor.request('scene', 'create-component', {
          uuid: args.nodeUuid,
          component: args.componentType,
        });
        return ok({ nodeUuid: args.nodeUuid, componentType: args.componentType }, 'Component added');
      },
    },
    {
      name: 'remove_component',
      description: 'Remove a component from a node',
      inputSchema: objectSchema({
        nodeUuid: stringProp('Node UUID'),
        componentType: stringProp('Component cid/type field'),
      }, ['nodeUuid', 'componentType']),
      handler: async (args, context) => {
        await context.editor.request('scene', 'remove-component', {
          uuid: args.nodeUuid,
          component: args.componentType,
        });
        return ok({ nodeUuid: args.nodeUuid, componentType: args.componentType }, 'Component removed');
      },
    },
    {
      name: 'get_components',
      description: 'Get all components of a node',
      inputSchema: objectSchema({ nodeUuid: stringProp('Node UUID') }, ['nodeUuid']),
      handler: async (args, context) => {
        const node = await context.editor.request('scene', 'query-node', String(args.nodeUuid)) as EditorNodeDump | null;
        return ok({ nodeUuid: args.nodeUuid, components: node?.__comps__ ?? node?.components ?? [] });
      },
    },
    {
      name: 'get_component_info',
      description: 'Get specific component information',
      inputSchema: objectSchema({
        nodeUuid: stringProp('Node UUID'),
        componentType: stringProp('Component type to get info for'),
      }, ['nodeUuid', 'componentType']),
      handler: async (args, context) => {
        const node = await context.editor.request('scene', 'query-node', String(args.nodeUuid)) as EditorNodeDump | null;
        const components = node?.__comps__ ?? node?.components ?? [];
        const component = components.find((item: EditorComponentDump) => item.type === args.componentType || item.value?.type === args.componentType);
        return component ? ok(component) : { success: false, error: `Component not found: ${args.componentType}` };
      },
    },
    {
      name: 'get_properties',
      description: 'Get component properties from node dump',
      inputSchema: objectSchema({
        nodeUuid: stringProp('Node UUID'),
        componentType: stringProp('Component type'),
      }, ['nodeUuid', 'componentType']),
      handler: async (args, context) => {
        const node = await context.editor.request('scene', 'query-node', String(args.nodeUuid)) as EditorNodeDump | null;
        const components = node?.__comps__ ?? node?.components ?? [];
        const component = components.find((item: EditorComponentDump) => item.type === args.componentType || item.value?.type === args.componentType);
        if (!component) {
          return { success: false, error: `Component not found: ${args.componentType}` };
        }
        return ok({
          nodeUuid: args.nodeUuid,
          componentType: args.componentType,
          properties: component.value ?? component,
        });
      },
    },
    {
      name: 'set_component_property',
      description: 'Set component property values for UI components or custom script components',
      inputSchema: objectSchema({
        nodeUuid: stringProp('Target node UUID'),
        componentType: stringProp('Component type'),
        property: stringProp('Property name'),
        propertyType: stringProp('Property type'),
        value: anyProp('Property value'),
      }, ['nodeUuid', 'componentType', 'property', 'propertyType', 'value']),
      handler: async (args, context) => {
        const node = await context.editor.request('scene', 'query-node', String(args.nodeUuid)) as EditorNodeDump | null;
        const target = resolveComponentPropertyTarget(node, String(args.componentType));
        if (!target) {
          return { success: false, error: `Component not found: ${args.componentType}` };
        }
        await context.editor.request('scene', 'set-property', {
          uuid: args.nodeUuid,
          path: `${target.componentPath}.${args.property}`,
          dump: { type: args.propertyType, value: args.value },
        });
        return ok({ nodeUuid: args.nodeUuid, componentType: args.componentType, componentPath: target.componentPath, property: args.property }, 'Component property update requested');
      },
    },
    {
      name: 'get_component_property',
      description: 'Get a component property value from node dump',
      inputSchema: objectSchema({
        nodeUuid: stringProp('Target node UUID'),
        componentType: stringProp('Component type'),
        property: stringProp('Property name'),
      }, ['nodeUuid', 'componentType', 'property']),
      handler: async (args, context) => {
        const node = await context.editor.request('scene', 'query-node', String(args.nodeUuid)) as EditorNodeDump | null;
        const component = findComponent(node, String(args.componentType));
        if (!component) {
          return { success: false, error: `Component not found: ${args.componentType}` };
        }
        const value = readPath(component.value ?? component, String(args.property));
        return ok({ nodeUuid: args.nodeUuid, componentType: args.componentType, property: args.property, value });
      },
    },
    {
      name: 'attach_script',
      description: 'Attach a script component to a node',
      inputSchema: objectSchema({
        nodeUuid: stringProp('Node UUID'),
        scriptPath: stringProp('Script asset path'),
      }, ['nodeUuid', 'scriptPath']),
      handler: async (args, context) => {
        const assetInfo = await context.editor.request('asset-db', 'query-asset-info', args.scriptPath) as EditorAssetInfo | null;
        await context.editor.request('scene', 'create-component', {
          uuid: args.nodeUuid,
          component: assetInfo?.uuid ?? args.scriptPath,
        });
        return ok({ nodeUuid: args.nodeUuid, scriptPath: args.scriptPath, assetInfo }, 'Script attach requested');
      },
    },
    {
      name: 'get_available_components',
      description: 'Get list of available component types',
      inputSchema: objectSchema({
        category: stringProp('Component category filter', { enum: ['all', 'renderer', 'ui', 'physics', 'animation', 'audio'], default: 'all' }),
      }),
      handler: async (args, context) => ok(await context.editor.request('scene', 'query-components', args.category ?? 'all')),
    },
  ]);
}
