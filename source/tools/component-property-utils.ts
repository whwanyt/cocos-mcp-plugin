import { EditorComponentDump, EditorNodeDump } from '../types';

export interface ComponentPropertyTarget {
  component: EditorComponentDump;
  componentPath: string;
}

export function findComponent(node: EditorNodeDump | null | undefined, componentType: string): EditorComponentDump | undefined {
  const components = node?.__comps__ ?? node?.components ?? [];
  return components.find((item: EditorComponentDump) => item.type === componentType || item.value?.type === componentType);
}

export function resolveComponentPropertyTarget(node: EditorNodeDump | null | undefined, componentType: string): ComponentPropertyTarget | undefined {
  // EN: Component property tools share this resolver so component writes use the same stable path logic.
  // ZH: 组件属性工具共用该解析器，确保组件写入使用同一套稳定 path 逻辑。
  const component = findComponent(node, componentType);
  if (!component) {
    return undefined;
  }
  return {
    component,
    componentPath: componentPathFor(component, componentType),
  };
}

export function componentPathFor(component: EditorComponentDump, componentType: string): string {
  // EN: Prefer cid from the editor dump because component order and type names can drift.
  // ZH: 优先使用 editor dump 中的 cid，因为组件顺序和类型名都可能漂移。
  const cid = typeof component.cid === 'string' ? component.cid : undefined;
  return cid ? `__comps__.${cid}` : `__comps__.${componentType}`;
}

export function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    return (value as Record<string, unknown>)[segment];
  }, source);
}
