import { EditorComponentDump, EditorNodeDump, JsonObject } from '../types';
import { numberProp, objectSchema } from './toolkit';

export interface NormalizedVec3 extends JsonObject {
  x: number;
  y: number;
  z: number;
}

export interface NormalizedTransform {
  position?: NormalizedVec3;
  rotation?: NormalizedVec3;
  scale?: NormalizedVec3;
  nodeType: '2DNode' | '3DNode';
}

const TWO_D_COMPONENTS = new Set(['cc.UITransform', 'cc.Sprite', 'cc.Label', 'cc.Button', 'UITransform', 'Sprite', 'Label', 'Button']);

export function is2DNodeDump(node: EditorNodeDump | null | undefined): boolean {
  // EN: Editor dumps do not expose a single canonical 2D flag, so infer it from common 2D components.
  // ZH: Editor dump 没有稳定的 2D 标记，因此根据常见 2D 组件推断。
  const components = getNodeComponents(node);
  return components.some((component) => {
    const type = component.type ?? component.value?.type;
    return typeof type === 'string' && TWO_D_COMPONENTS.has(type);
  });
}

export function getNodeComponents(node: EditorNodeDump | null | undefined): EditorComponentDump[] {
  if (Array.isArray(node?.__comps__)) {
    return node.__comps__;
  }
  if (Array.isArray(node?.components)) {
    return node.components;
  }
  return [];
}

export function normalizeTransformArgs(args: JsonObject, node: EditorNodeDump | null | undefined): NormalizedTransform {
  // EN: Cocos stores Node.position as Vec3; MCP callers may use 2D `{ x, y }` for 2D nodes.
  // ZH: Cocos 内部 Node.position 是 Vec3；MCP 调用方对 2D 节点可以只传 `{ x, y }`。
  const is2D = is2DNodeDump(node);
  return {
    nodeType: is2D ? '2DNode' : '3DNode',
    ...(args.position === undefined ? {} : { position: normalizeVec3(args.position, 'position', { allow2D: is2D, defaultZ: 0 }) }),
    ...(args.rotation === undefined ? {} : { rotation: normalizeVec3(args.rotation, 'rotation', { allow2D: true, defaultZ: 0 }) }),
    ...(args.scale === undefined ? {} : { scale: normalizeVec3(args.scale, 'scale', { allow2D: true, defaultZ: 1 }) }),
  };
}

export function normalizeVec3(value: unknown, label: string, options: { allow2D: boolean; defaultZ: number }): NormalizedVec3 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object with numeric x and y${options.allow2D ? ', plus optional z' : ' and z'}`);
  }
  const record = value as Record<string, unknown>;
  const x = toFiniteNumber(record.x, `${label}.x`);
  const y = toFiniteNumber(record.y, `${label}.y`);
  const hasZ = record.z !== undefined;
  if (!hasZ && !options.allow2D) {
    throw new Error(`${label}.z is required for 3D nodes`);
  }
  const z = hasZ ? toFiniteNumber(record.z, `${label}.z`) : options.defaultZ;
  return { x, y, z };
}

export function transformSchema(): Record<string, JsonObject> {
  const vector = objectVectorSchema('Vector object. 2D nodes may omit z for position.');
  return {
    position: vector,
    rotation: objectVectorSchema('Euler rotation object. Missing z defaults to 0.'),
    scale: objectVectorSchema('Scale object. Missing z defaults to 1.'),
  };
}

export function applyTransformToOptions(options: Record<string, unknown>, transform: NormalizedTransform): void {
  if (transform.position) {
    options.position = transform.position;
  }
  if (transform.rotation) {
    options.rotation = transform.rotation;
  }
  if (transform.scale) {
    options.scale = transform.scale;
  }
}

function objectVectorSchema(description: string): JsonObject {
  return objectSchema({
    x: numberProp('X value'),
    y: numberProp('Y value'),
    z: numberProp('Z value'),
  }, ['x', 'y'], description);
}

function toFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}
