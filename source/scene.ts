import { join } from 'path';
import type { Component, Node, Scene } from 'cc';

// EN: Scene scripts run in a different Cocos context, so add the editor app node_modules path for runtime imports.
// ZH: scene 脚本运行在不同的 Cocos 上下文中，因此补充编辑器 app 的 node_modules 路径以支持运行时导入。
if (typeof Editor !== 'undefined' && Editor.App?.path) {
  module.paths.push(join(Editor.App.path, 'node_modules'));
}

interface SceneMethodResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface SceneNodeInfo {
  name: string;
  uuid: string;
  active: boolean;
  components?: Array<{
    type?: string;
    enabled?: boolean;
  }>;
  children: SceneNodeInfo[];
}

type SceneMethod = (...args: unknown[]) => SceneMethodResult;

// EN: Only methods that truly need the cc runtime belong in this scene contribution.
// ZH: 只有确实需要 cc runtime 的方法才应该放在这个 scene contribution 中。
export const methods: Record<string, SceneMethod> = {
  getCurrentSceneInfo() {
    try {
      const { director } = require('cc') as typeof import('cc');
      const scene = director.getScene() as Scene | null;
      if (!scene) {
        return { success: false, error: 'No active scene' };
      }
      return {
        success: true,
        data: {
          name: scene.name,
          uuid: scene.uuid,
          nodeCount: scene.children?.length ?? 0,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  getSceneHierarchy(includeComponentsInput: unknown = false) {
    try {
      const includeComponents = Boolean(includeComponentsInput);
      const { director } = require('cc') as typeof import('cc');
      const scene = director.getScene() as Scene | null;
      if (!scene) {
        return { success: false, error: 'No active scene' };
      }

      const visit = (node: Node): SceneNodeInfo => ({
        name: node.name,
        uuid: node.uuid,
        active: node.active,
        ...(includeComponents ? {
          components: ((node.components ?? []) as Component[]).map((component) => ({
            type: component.constructor?.name,
            enabled: component.enabled,
          })),
        } : {}),
        children: (node.children ?? []).map((child) => visit(child)),
      });

      return {
        success: true,
        data: (scene.children ?? []).map((child) => visit(child)),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  executeScript(scriptInput: unknown) {
    try {
      // EN: This is intentionally exposed as a dangerous tool and should remain disabled by default.
      // ZH: 该能力有意作为危险工具暴露，默认必须保持禁用。
      const script = String(scriptInput);
      const fn = new Function('require', script);
      return {
        success: true,
        data: fn(require),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};
