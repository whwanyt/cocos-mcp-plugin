import { JsonObject, ToolContext, ToolModule } from '../types';
import { anyProp, booleanProp, createToolModule, numberProp, objectSchema, ok, stringProp } from './toolkit';
import type { ToolSpec } from './toolkit';

// EN: Scene view tools control editor viewport state and intentionally avoid scene data mutation.
// ZH: scene view 工具控制编辑器视图状态，并刻意避免修改场景数据。
export function createSceneViewTools(): ToolModule {
  return createToolModule('sceneView', [
    tool('change_gizmo_tool', 'Change Gizmo tool', { name: stringProp('Tool name', { enum: ['position', 'rotation', 'scale', 'rect'] }) }, ['name'], 'change-gizmo-tool', (args) => [args.name]),
    tool('query_gizmo_tool_name', 'Get current Gizmo tool name', {}, [], 'query-gizmo-tool-name'),
    tool('change_gizmo_pivot', 'Change transform pivot point', { name: stringProp('Pivot point', { enum: ['pivot', 'center'] }) }, ['name'], 'change-gizmo-pivot', (args) => [args.name]),
    tool('query_gizmo_pivot', 'Get current Gizmo pivot point', {}, [], 'query-gizmo-pivot'),
    tool('query_gizmo_view_mode', 'Query view mode', {}, [], 'query-gizmo-view-mode'),
    tool('change_gizmo_coordinate', 'Change coordinate system', { type: stringProp('Coordinate system', { enum: ['local', 'global'] }) }, ['type'], 'change-gizmo-coordinate', (args) => [args.type]),
    tool('query_gizmo_coordinate', 'Get current coordinate system', {}, [], 'query-gizmo-coordinate'),
    tool('change_view_mode_2d_3d', 'Change 2D/3D view mode', { is2D: booleanProp('true for 2D') }, ['is2D'], 'change-is2D', (args) => [args.is2D]),
    tool('query_view_mode_2d_3d', 'Get current view mode', {}, [], 'query-is2D'),
    tool('set_grid_visible', 'Show/hide grid', { visible: booleanProp('Grid visibility') }, ['visible'], 'set-grid-visible', (args) => [args.visible]),
    tool('query_grid_visible', 'Query grid visibility status', {}, [], 'query-is-grid-visible'),
    tool('set_icon_gizmo_3d', 'Set IconGizmo to 3D or 2D mode', { is3D: booleanProp('true for 3D') }, ['is3D'], 'set-icon-gizmo-3d', (args) => [args.is3D]),
    tool('query_icon_gizmo_3d', 'Query IconGizmo mode', {}, [], 'query-is-icon-gizmo-3d'),
    tool('set_icon_gizmo_size', 'Set IconGizmo size', { size: numberProp('IconGizmo size', { minimum: 10, maximum: 100 }) }, ['size'], 'set-icon-gizmo-size', (args) => [args.size]),
    tool('query_icon_gizmo_size', 'Query IconGizmo size', {}, [], 'query-icon-gizmo-size'),
    tool('focus_camera_on_nodes', 'Focus scene camera on nodes', { uuids: anyProp('Node UUIDs to focus on') }, ['uuids'], 'focus-camera', (args) => [args.uuids ?? []]),
    tool('align_camera_with_view', 'Apply scene camera position and angle to selected node', {}, [], 'align-with-view'),
    tool('align_view_with_node', 'Apply selected node position and angle to current view', {}, [], 'align-with-view-node'),
    {
      name: 'get_scene_view_status',
      description: 'Get comprehensive scene view status',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        const entries = await Promise.allSettled([
          context.editor.request('scene', 'query-gizmo-tool-name'),
          context.editor.request('scene', 'query-gizmo-pivot'),
          context.editor.request('scene', 'query-gizmo-coordinate'),
          context.editor.request('scene', 'query-is2D'),
          context.editor.request('scene', 'query-is-grid-visible'),
          context.editor.request('scene', 'query-icon-gizmo-size'),
        ]);
        return ok({
          gizmoTool: settled(entries[0]),
          pivot: settled(entries[1]),
          coordinate: settled(entries[2]),
          is2D: settled(entries[3]),
          gridVisible: settled(entries[4]),
          iconGizmoSize: settled(entries[5]),
        });
      },
    },
    {
      name: 'reset_scene_view',
      description: 'Reset scene view to default settings',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        await Promise.allSettled([
          context.editor.request('scene', 'change-gizmo-tool', 'position'),
          context.editor.request('scene', 'change-gizmo-pivot', 'pivot'),
          context.editor.request('scene', 'change-gizmo-coordinate', 'local'),
          context.editor.request('scene', 'set-grid-visible', true),
        ]);
        return ok(undefined, 'Scene view reset requested');
      },
    },
  ]);
}

function tool(
  name: string,
  description: string,
  props: Record<string, JsonObject>,
  required: string[],
  message: string,
  mapArgs: (args: JsonObject) => unknown[] = () => [],
): ToolSpec {
  return {
    name,
    description,
    inputSchema: objectSchema(props, required),
    handler: async (args: JsonObject, context: ToolContext) => ok(await context.editor.request('scene', message, ...mapArgs(args))),
  };
}

function settled(result: PromiseSettledResult<unknown>): unknown {
  return result.status === 'fulfilled' ? result.value : { error: String(result.reason) };
}
