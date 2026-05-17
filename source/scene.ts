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

interface RuntimeCallInput {
  path?: string;
  targetUuid?: string;
  args?: unknown[];
  value?: unknown;
}

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

  callRuntime(inputValue: unknown) {
    try {
      const input = normalizeRuntimeInput(inputValue);
      const { director } = require('cc') as typeof import('cc');
      const scene = director.getScene() as Scene | null;
      if (!scene) {
        return { success: false, error: 'No active scene' };
      }
      const args = Array.isArray(input.args) ? input.args : [];
      const target = input.targetUuid ? findNode(scene, input.targetUuid) : undefined;
      switch (input.path) {
        case 'director.getScene':
          return { success: true, data: { name: scene.name, uuid: scene.uuid } };
        case 'Node.getPosition':
          return target ? { success: true, data: target.getPosition() } : { success: false, error: 'targetUuid is required' };
        case 'Node.setPosition':
          if (!target) {
            return { success: false, error: 'targetUuid is required' };
          }
          target.setPosition(Number(args[0] ?? 0), Number(args[1] ?? 0), Number(args[2] ?? 0));
          return { success: true, data: target.getPosition() };
        case 'Node.getRotation':
          return target ? { success: true, data: target.getRotation() } : { success: false, error: 'targetUuid is required' };
        case 'Node.setRotation':
          if (!target) {
            return { success: false, error: 'targetUuid is required' };
          }
          target.setRotation(args[0] as never);
          return { success: true, data: target.getRotation() };
        case 'Node.getScale':
          return target ? { success: true, data: target.getScale() } : { success: false, error: 'targetUuid is required' };
        case 'Node.setScale':
          if (!target) {
            return { success: false, error: 'targetUuid is required' };
          }
          target.setScale(Number(args[0] ?? 1), Number(args[1] ?? 1), Number(args[2] ?? 1));
          return { success: true, data: target.getScale() };
        case 'Node.getComponent':
          if (!target) {
            return { success: false, error: 'targetUuid is required' };
          }
          return { success: true, data: summarizeComponent(target.getComponent(String(args[0]))) };
        case 'Component.getProperty': {
          if (!target) {
            return { success: false, error: 'targetUuid is required' };
          }
          const component = target.getComponent(String(args[0]));
          return component ? { success: true, data: readPath(component, String(args[1] ?? '')) } : { success: false, error: `Component not found: ${String(args[0])}` };
        }
        case 'Component.setProperty': {
          if (!target) {
            return { success: false, error: 'targetUuid is required' };
          }
          const component = target.getComponent(String(args[0]));
          if (!component) {
            return { success: false, error: `Component not found: ${String(args[0])}` };
          }
          setPath(component, String(args[1] ?? ''), input.value);
          return { success: true, data: { component: summarizeComponent(component), property: String(args[1] ?? ''), value: input.value } };
        }
        case 'UITransform.contentSize': {
          if (!target) {
            return { success: false, error: 'targetUuid is required' };
          }
          const component = target.getComponent('cc.UITransform') ?? target.getComponent('UITransform');
          if (!component) {
            return { success: false, error: 'Component not found: cc.UITransform' };
          }
          if (input.value !== undefined) {
            (component as { contentSize?: unknown }).contentSize = input.value;
          }
          return { success: true, data: (component as { contentSize?: unknown }).contentSize };
        }
        default:
          return { success: false, error: `Unsupported runtime capability: ${input.path}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

function normalizeRuntimeInput(value: unknown): RuntimeCallInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as RuntimeCallInput;
}

function summarizeComponent(component: Component | null): unknown {
  if (!component) {
    return null;
  }
  return {
    type: component.constructor?.name,
    enabled: component.enabled,
    uuid: component.uuid,
  };
}

function readPath(source: unknown, propertyPath: string): unknown {
  if (!propertyPath) {
    return source;
  }
  return propertyPath.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    return (value as Record<string, unknown>)[segment];
  }, source);
}

function setPath(target: unknown, propertyPath: string, value: unknown): void {
  if (!propertyPath || !target || typeof target !== 'object') {
    throw new Error('property path is required');
  }
  const segments = propertyPath.split('.');
  const last = segments.pop();
  if (!last) {
    throw new Error('property path is required');
  }
  const owner = segments.reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') {
      throw new Error(`Cannot resolve property path: ${propertyPath}`);
    }
    return (current as Record<string, unknown>)[segment];
  }, target);
  if (!owner || typeof owner !== 'object') {
    throw new Error(`Cannot resolve property path: ${propertyPath}`);
  }
  (owner as Record<string, unknown>)[last] = value;
}

function findNode(root: Node, uuid: string): Node | undefined {
  if (root.uuid === uuid) {
    return root;
  }
  for (const child of root.children ?? []) {
    const found = findNode(child, uuid);
    if (found) {
      return found;
    }
  }
  return undefined;
}
