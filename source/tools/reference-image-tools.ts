import { ToolContext, ToolModule } from '../types';
import { anyProp, arrayProp, createToolModule, numberProp, objectSchema, ok, stringProp } from './toolkit';
import type { ToolSpec } from './toolkit';

// EN: Reference image tools proxy the editor reference-image contribution without storing image data in core.
// ZH: reference image 工具代理编辑器 reference-image contribution，core 不持久化图片数据。
export function createReferenceImageTools(): ToolModule {
  return createToolModule('referenceImage', [
    {
      name: 'add_reference_image',
      description: 'Add reference image(s) to scene',
      inputSchema: objectSchema({ paths: arrayProp('Array of reference image absolute paths') }, ['paths']),
      handler: async (args, context) => ok(await context.editor.request('reference-image', 'add-image', args.paths)),
    },
    {
      name: 'remove_reference_image',
      description: 'Remove reference image(s)',
      inputSchema: objectSchema({ paths: arrayProp('Array of reference image paths to remove') }),
      handler: async (args, context) => ok(await context.editor.request('reference-image', 'remove-image', args.paths)),
    },
    {
      name: 'switch_reference_image',
      description: 'Switch to specific reference image',
      inputSchema: objectSchema({ path: stringProp('Reference image absolute path'), sceneUUID: stringProp('Specific scene UUID') }, ['path']),
      handler: async (args, context) => ok(await context.editor.request('reference-image', 'switch-image', args.path, args.sceneUUID)),
    },
    {
      name: 'set_reference_image_data',
      description: 'Set reference image transform and display properties',
      inputSchema: objectSchema({ key: stringProp('Property key', { enum: ['path', 'x', 'y', 'sx', 'sy', 'opacity'] }), value: anyProp('Property value') }, ['key', 'value']),
      handler: async (args, context) => ok(await context.editor.request('reference-image', 'set-image-data', args.key, args.value)),
    },
    query('query_reference_image_config', 'Query reference image configuration', 'query-config'),
    query('query_current_reference_image', 'Query current reference image data', 'query-current'),
    query('refresh_reference_image', 'Refresh reference image display', 'refresh'),
    {
      name: 'set_reference_image_position',
      description: 'Set reference image position',
      inputSchema: objectSchema({ x: numberProp('X offset'), y: numberProp('Y offset') }, ['x', 'y']),
      handler: async (args, context) => {
        await context.editor.request('reference-image', 'set-image-data', 'x', args.x);
        await context.editor.request('reference-image', 'set-image-data', 'y', args.y);
        return ok({ x: args.x, y: args.y });
      },
    },
    {
      name: 'set_reference_image_scale',
      description: 'Set reference image scale',
      inputSchema: objectSchema({ sx: numberProp('X scale', { minimum: 0.1, maximum: 10 }), sy: numberProp('Y scale', { minimum: 0.1, maximum: 10 }) }, ['sx', 'sy']),
      handler: async (args, context) => {
        await context.editor.request('reference-image', 'set-image-data', 'sx', args.sx);
        await context.editor.request('reference-image', 'set-image-data', 'sy', args.sy);
        return ok({ sx: args.sx, sy: args.sy });
      },
    },
    {
      name: 'set_reference_image_opacity',
      description: 'Set reference image opacity',
      inputSchema: objectSchema({ opacity: numberProp('Opacity', { minimum: 0, maximum: 1 }) }, ['opacity']),
      handler: async (args, context) => ok(await context.editor.request('reference-image', 'set-image-data', 'opacity', args.opacity)),
    },
    query('list_reference_images', 'List all available reference images', 'query-config'),
    {
      name: 'clear_all_reference_images',
      description: 'Clear all reference images',
      inputSchema: objectSchema(),
      handler: async (_args, context) => ok(await context.editor.request('reference-image', 'remove-image')),
    },
  ]);
}

function query(name: string, description: string, message: string): ToolSpec {
  return {
    name,
    description,
    inputSchema: objectSchema(),
    handler: async (_args, context: ToolContext) => ok(await context.editor.request('reference-image', message)),
  };
}
