import * as fs from 'fs';
import * as path from 'path';
import { JsonObject, ToolRisk } from '../types';

export interface MessageCapability {
  channel: string;
  message: string;
  params: string[];
  minArgs: number;
  maxArgs: number;
  result: string;
  risk: ToolRisk;
  source: 'typed' | 'package-specific';
}

export interface RuntimeCapability {
  path: string;
  kind: 'function' | 'class' | 'namespace' | 'property';
  risk: ToolRisk;
  description: string;
  owner?: string;
  params?: string[];
  result?: string;
  supported?: boolean;
}

const MESSAGE_CAPABILITIES: MessageCapability[] = [
  message('asset-db', 'query-ready', [], 'boolean'),
  message('asset-db', 'create-asset', ['url:string', 'content:string|Buffer|null', 'options?:AssetOperationOption'], 'AssetInfo|null'),
  message('asset-db', 'import-asset', ['source:string', 'target:string', 'options?:AssetOperationOption'], 'AssetInfo|null'),
  message('asset-db', 'copy-asset', ['source:string', 'target:string', 'options?:AssetOperationOption'], 'AssetInfo|null'),
  message('asset-db', 'move-asset', ['source:string', 'target:string', 'options?:AssetOperationOption'], 'AssetInfo|null'),
  message('asset-db', 'delete-asset', ['url:string'], 'AssetInfo|null'),
  message('asset-db', 'open-asset', ['url:string'], 'void'),
  message('asset-db', 'save-asset', ['url:string', 'content:string|Buffer'], 'AssetInfo|null'),
  message('asset-db', 'save-asset-meta', ['url:string', 'meta:string'], 'AssetInfo|null'),
  message('asset-db', 'reimport-asset', ['url:string'], 'void'),
  message('asset-db', 'refresh-asset', ['url:string'], 'void'),
  message('asset-db', 'query-asset-info', ['urlOrUUIDOrPath:string', 'dataKeys?:string[]'], 'AssetInfo|null'),
  message('asset-db', 'query-missing-asset-info', ['urlOrPath:string'], 'MissingAssetInfo|null'),
  message('asset-db', 'query-asset-meta', ['url:string'], 'IAssetMeta|null'),
  message('asset-db', 'query-asset-users', ['uuidOrURL:string', 'type?:asset|script|all'], 'string[]'),
  message('asset-db', 'query-asset-dependencies', ['uuidOrURL:string', 'type?:asset|script|all'], 'string[]'),
  message('asset-db', 'query-path', ['uuidOrURL:string'], 'string|null'),
  message('asset-db', 'query-url', ['uuidOrPath:string'], 'string|null'),
  message('asset-db', 'query-uuid', ['urlOrPath:string'], 'string|null'),
  message('asset-db', 'query-assets', ['options?:QueryAssetsOption', 'dataKeys?:string[]'], 'AssetInfo[]'),
  message('asset-db', 'generate-available-url', ['url:string'], 'string'),
  message('builder', 'open', ['panel:default|build-bundle', 'options?:object'], 'void'),
  message('builder', 'query-worker-ready', [], 'boolean'),
  message('engine', 'query-info', [], 'unknown'),
  message('engine', 'query-engine-info', [], 'unknown'),
  message('extension', 'create-extension-template', ['options:object'], 'unknown'),
  message('information', 'query-information', [], 'unknown'),
  message('information', 'open-information-dialog', ['options?:object'], 'unknown'),
  message('information', 'has-dialog', [], 'boolean'),
  message('information', 'close-dialog', [], 'void'),
  message('preferences', 'open-settings', ['category?:string'], 'void'),
  message('preferences', 'query-config', ['category:string'], 'unknown'),
  message('preferences', 'set-config', ['category:string', 'config:object'], 'void'),
  message('program', 'query-program-info', ['name:string'], 'IProgramInfo|null'),
  message('program', 'open-program', ['name:string', 'options?:object'], 'Promise<boolean>'),
  message('program', 'open-url', ['url:string', 'options?:object'], 'Promise<boolean>'),
  message('programming', 'query-shared-settings', [], 'unknown'),
  message('programming', 'query-sorted-plugins', [], 'unknown'),
  message('project', 'open-settings', ['category?:string'], 'void'),
  message('project', 'query-config', ['category:string'], 'unknown'),
  message('project', 'set-config', ['category:string', 'config:object'], 'void'),
  message('scene', 'open-scene', ['uuid:string'], 'void'),
  message('scene', 'save-scene', ['force?:boolean'], 'string|undefined'),
  message('scene', 'save-as-scene', [], 'string|undefined'),
  message('scene', 'close-scene', [], 'boolean'),
  message('scene', 'set-property', ['options:SetPropertyOptions'], 'boolean'),
  message('scene', 'reset-property', ['options:SetPropertyOptions'], 'boolean'),
  message('scene', 'move-array-element', ['options:MoveArrayOptions'], 'boolean'),
  message('scene', 'remove-array-element', ['options:RemoveArrayOptions'], 'boolean'),
  message('scene', 'copy-node', ['uuid:string|string[]'], 'string[]'),
  message('scene', 'duplicate-node', ['uuid:string|string[]'], 'string[]'),
  message('scene', 'paste-node', ['options:PasteNodeOptions'], 'string[]'),
  message('scene', 'cut-node', ['uuid:string|string[]'], 'void'),
  message('scene', 'set-parent', ['options:CutNodeOptions'], 'string[]'),
  message('scene', 'create-node', ['options:CreateNodeOptions'], 'string'),
  message('scene', 'remove-node', ['options:RemoveNodeOptions'], 'void'),
  message('scene', 'reset-node', ['options:ResetNodeOptions'], 'boolean'),
  message('scene', 'reset-component', ['options:ResetComponentOptions'], 'void'),
  message('scene', 'restore-prefab', ['options:ResetComponentOptions'], 'boolean'),
  message('scene', 'create-component', ['options:CreateComponentOptions'], 'void'),
  message('scene', 'remove-component', ['options:RemoveComponentOptions'], 'void'),
  message('scene', 'execute-component-method', ['options:ExecuteComponentMethodOptions'], 'any'),
  message('scene', 'execute-scene-script', ['options:ExecuteSceneScriptMethodOptions'], 'any'),
  message('scene', 'snapshot', [], 'void'),
  message('scene', 'snapshot-abort', [], 'void'),
  message('scene', 'soft-reload', [], 'void'),
  message('scene', 'change-gizmo-tool', ['name:string'], 'void'),
  message('scene', 'query-gizmo-tool-name', [], 'string'),
  message('scene', 'change-gizmo-pivot', ['name:string'], 'void'),
  message('scene', 'query-gizmo-pivot', [], 'string'),
  message('scene', 'change-gizmo-coordinate', ['type:string'], 'void'),
  message('scene', 'query-gizmo-coordinate', [], 'string'),
  message('scene', 'change-is2D', ['is2D:boolean'], 'void'),
  message('scene', 'query-is2D', [], 'boolean'),
  message('scene', 'set-grid-visible', ['visible:boolean'], 'void'),
  message('scene', 'query-is-grid-visible', [], 'boolean'),
  message('scene', 'set-icon-gizmo-3d', ['is3D:boolean'], 'void'),
  message('scene', 'query-is-icon-gizmo-3d', [], 'boolean'),
  message('scene', 'set-icon-gizmo-size', ['size:number'], 'void'),
  message('scene', 'query-icon-gizmo-size', [], 'number'),
  message('scene', 'focus-camera', ['uuids:string[]'], 'void'),
  message('scene', 'align-with-view', [], 'void'),
  message('scene', 'align-view-with-node', [], 'void'),
  message('scene', 'query-is-ready', [], 'boolean'),
  message('scene', 'query-node', ['uuid:string'], 'INode'),
  message('scene', 'query-component', ['uuid:string'], 'IComponent'),
  message('scene', 'query-node-tree', [], 'INode'),
  message('scene', 'query-nodes-by-asset-uuid', ['uuid:string'], 'INode[]'),
  message('scene', 'query-dirty', [], 'boolean'),
  message('scene', 'query-classes', ['options?:QueryClassesOptions'], 'unknown'),
  message('scene', 'query-components', ['category?:string'], 'unknown'),
  message('scene', 'query-component-has-script', ['uuid:string'], 'boolean'),
  message('scene', 'query-scene-bounds', [], 'unknown'),
  message('scene', 'is-native', ['options?:queryIsNative'], 'boolean'),
  message('device', 'query', [], 'IDeviceItem[]'),
  message('server', 'query-ip-list', [], 'string[]'),
  message('server', 'query-port', [], 'number'),
  message('builder', 'query-options', [], 'unknown', { source: 'package-specific' }),
  message('reference-image', 'add-image', ['config:object'], 'unknown', { source: 'package-specific' }),
  message('reference-image', 'remove-image', ['id:string'], 'unknown', { source: 'package-specific' }),
  message('reference-image', 'switch-image', ['id:string'], 'unknown', { source: 'package-specific' }),
  message('reference-image', 'set-image-data', ['data:object'], 'unknown', { source: 'package-specific' }),
  message('scene', 'begin-recording', [], 'unknown', { source: 'package-specific' }),
  message('scene', 'end-recording', [], 'unknown', { source: 'package-specific' }),
  message('scene', 'cancel-recording', [], 'unknown', { source: 'package-specific' }),
  message('scene', 'query-performance', [], 'unknown', { source: 'package-specific' }),
  message('server', 'query-sort-ip-list', [], 'string[]', { source: 'package-specific' }),
];

const RUNTIME_CAPABILITIES: RuntimeCapability[] = [
  runtime('director.getScene', 'function', 'safe', 'Get active scene.', { owner: 'director', result: 'Scene|null', supported: true }),
  runtime('Node.getPosition', 'function', 'safe', 'Get node position.', { owner: 'Node', result: 'Vec3', supported: true }),
  runtime('Node.setPosition', 'function', 'write', 'Set node position.', { owner: 'Node', params: ['x:number|Vec3', 'y?:number', 'z?:number'], result: 'void', supported: true }),
  runtime('Node.getRotation', 'function', 'safe', 'Get node rotation.', { owner: 'Node', result: 'Quat', supported: true }),
  runtime('Node.setRotation', 'function', 'write', 'Set node rotation.', { owner: 'Node', params: ['rotation:Quat'], result: 'void', supported: true }),
  runtime('Node.getScale', 'function', 'safe', 'Get node scale.', { owner: 'Node', result: 'Vec3', supported: true }),
  runtime('Node.setScale', 'function', 'write', 'Set node scale.', { owner: 'Node', params: ['x:number|Vec3', 'y?:number', 'z?:number'], result: 'void', supported: true }),
  runtime('Node.getComponent', 'function', 'safe', 'Get a component by type name.', { owner: 'Node', params: ['className:string'], result: 'Component|null', supported: true }),
  runtime('Component.getProperty', 'property', 'safe', 'Read component property by path.', { owner: 'Component', params: ['componentType:string', 'property:string'], result: 'unknown', supported: true }),
  runtime('Component.setProperty', 'property', 'write', 'Write component property by path.', { owner: 'Component', params: ['componentType:string', 'property:string', 'value:unknown'], result: 'unknown', supported: true }),
  runtime('UITransform.contentSize', 'property', 'write', 'Read or write UITransform content size through component property tools.', { owner: 'UITransform', result: 'Size', supported: true }),
  runtime('Sprite', 'class', 'write', 'Sprite component access.', { owner: 'cc', supported: true }),
  runtime('Label', 'class', 'write', 'Label component access.', { owner: 'cc', supported: true }),
  runtime('Camera', 'class', 'write', 'Camera component access.', { owner: 'cc', supported: true }),
  runtime('RigidBody', 'class', 'write', '3D rigid body component access.', { owner: 'cc', supported: true }),
  runtime('RigidBody2D', 'class', 'write', '2D rigid body component access.', { owner: 'cc', supported: true }),
];

let extractedRuntimeCapabilities: RuntimeCapability[] | undefined;

// EN: This count follows the local @cocos/creator-types editor declarations, not a README promise.
// ZH: 该数量以本地 @cocos/creator-types editor 声明为准，而不是文档承诺值。
export const TYPED_EDITOR_MESSAGE_COUNT = MESSAGE_CAPABILITIES.filter((item) => item.source === 'typed').length;

export function getMessageCapabilities(): MessageCapability[] {
  return MESSAGE_CAPABILITIES.map((item) => ({ ...item, params: [...item.params] }));
}

export function getRuntimeCapabilities(): RuntimeCapability[] {
  if (!extractedRuntimeCapabilities) {
    extractedRuntimeCapabilities = mergeRuntimeCapabilities(RUNTIME_CAPABILITIES, extractRuntimeCapabilitiesFromTypes());
  }
  return extractedRuntimeCapabilities.map((item) => ({
    ...item,
    ...(item.params ? { params: [...item.params] } : {}),
  }));
}

export function findMessageCapability(channel: string, messageName: string): MessageCapability | undefined {
  return MESSAGE_CAPABILITIES.find((item) => item.channel === channel && item.message === messageName);
}

export function validateMessageArguments(capability: MessageCapability, args: unknown[]): string | undefined {
  if (args.length < capability.minArgs || args.length > capability.maxArgs) {
    return `Message ${capability.channel}:${capability.message} expects ${capability.minArgs}-${capability.maxArgs} arguments, got ${args.length}`;
  }
  for (let index = 0; index < args.length; index += 1) {
    const expected = capability.params[index];
    if (!expected) {
      continue;
    }
    const error = validateBasicType(expected, args[index], index);
    if (error) {
      return error;
    }
  }
  return undefined;
}

export function validateRuntimeArguments(capability: RuntimeCapability, args: unknown[], value: unknown): string | undefined {
  switch (capability.path) {
    case 'director.getScene':
    case 'Node.getPosition':
    case 'Node.getRotation':
    case 'Node.getScale':
      return args.length === 0 ? undefined : `${capability.path} expects no arguments, got ${args.length}`;
    case 'Node.setPosition':
    case 'Node.setScale':
      if (args.length !== 3 || !args.every((item) => typeof item === 'number' && Number.isFinite(item))) {
        return `${capability.path} expects three finite number arguments: x, y, z`;
      }
      return undefined;
    case 'Node.setRotation':
      return isRecord(args[0]) ? undefined : 'Node.setRotation expects one rotation object argument';
    case 'Node.getComponent':
      return typeof args[0] === 'string' ? undefined : 'Node.getComponent expects component type string as first argument';
    case 'Component.getProperty':
      return typeof args[0] === 'string' && typeof args[1] === 'string'
        ? undefined
        : 'Component.getProperty expects component type and property path strings';
    case 'Component.setProperty':
      if (typeof args[0] !== 'string' || typeof args[1] !== 'string') {
        return 'Component.setProperty expects component type and property path strings';
      }
      return value === undefined ? 'Component.setProperty requires value' : undefined;
    case 'UITransform.contentSize':
      if (value === undefined) {
        return undefined;
      }
      return isRecord(value) && typeof value.width === 'number' && typeof value.height === 'number'
        ? undefined
        : 'UITransform.contentSize value must be an object with numeric width and height';
    default:
      return capability.supported ? undefined : `${capability.path} is discoverable from Cocos types but not callable by scene_call_runtime yet`;
  }
}

export function isDangerousMessage(capability: MessageCapability): boolean {
  return isDangerousRisk(capability.risk);
}

export function isDangerousRisk(risk: ToolRisk): boolean {
  return risk === 'destructive' || risk === 'exec' || risk === 'environment';
}

export function toJsonObject(value: MessageCapability | RuntimeCapability): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function message(channel: string, messageName: string, params: string[], result: string, options: Partial<Pick<MessageCapability, 'risk' | 'source'>> = {}): MessageCapability {
  const required = params.filter((item) => !item.includes('?:') && !item.endsWith('?')).length;
  return {
    channel,
    message: messageName,
    params,
    minArgs: required,
    maxArgs: params.length,
    result,
    risk: options.risk ?? inferMessageRisk(channel, messageName),
    source: options.source ?? 'typed',
  };
}

function runtime(pathName: string, kind: RuntimeCapability['kind'], risk: ToolRisk, description: string, extra: Partial<RuntimeCapability> = {}): RuntimeCapability {
  return { path: pathName, kind, risk, description, ...extra };
}

function inferMessageRisk(channel: string, messageName: string): ToolRisk {
  if (messageName.includes('execute')) {
    return 'exec';
  }
  if (
    messageName.includes('delete') ||
    messageName.includes('remove') ||
    messageName.includes('close') ||
    messageName.includes('reset') ||
    messageName.includes('restore') ||
    messageName.includes('revert') ||
    messageName.includes('abort')
  ) {
    return 'destructive';
  }
  if (messageName.includes('open') || messageName.includes('import') || channel === 'preferences' || channel === 'project' || channel === 'extension') {
    return 'environment';
  }
  if (
    messageName.includes('set') ||
    messageName.includes('create') ||
    messageName.includes('move') ||
    messageName.includes('copy') ||
    messageName.includes('save') ||
    messageName.includes('change') ||
    messageName.includes('focus') ||
    messageName.includes('align') ||
    messageName.includes('paste') ||
    messageName.includes('cut') ||
    messageName.includes('duplicate')
  ) {
    return 'write';
  }
  return 'safe';
}

function validateBasicType(expected: string, value: unknown, index: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const typeText = expected.toLowerCase();
  if (typeText.includes('string') && !typeText.includes('|') && typeof value !== 'string') {
    return `Argument ${index} must be a string for ${expected}`;
  }
  if (typeText.includes('number') && !typeText.includes('|') && typeof value !== 'number') {
    return `Argument ${index} must be a number for ${expected}`;
  }
  if (typeText.includes('boolean') && !typeText.includes('|') && typeof value !== 'boolean') {
    return `Argument ${index} must be a boolean for ${expected}`;
  }
  if (typeText.includes('string[]') && (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))) {
    return `Argument ${index} must be a string array for ${expected}`;
  }
  if ((typeText.includes('object') || typeText.includes('options') || typeText.includes('config')) && (typeof value !== 'object' || Array.isArray(value))) {
    return `Argument ${index} must be an object for ${expected}`;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeRuntimeCapabilities(seed: RuntimeCapability[], extracted: RuntimeCapability[]): RuntimeCapability[] {
  const merged = new Map<string, RuntimeCapability>();
  for (const item of extracted) {
    merged.set(item.path, item);
  }
  for (const item of seed) {
    merged.set(item.path, {
      ...merged.get(item.path),
      ...item,
      supported: item.supported ?? true,
    });
  }
  return [...merged.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function extractRuntimeCapabilitiesFromTypes(): RuntimeCapability[] {
  const file = resolveCocosEngineTypesFile();
  if (!file) {
    return [];
  }
  try {
    const text = fs.readFileSync(file, 'utf8');
    return parseEngineDeclarations(text);
  } catch {
    return [];
  }
}

function resolveCocosEngineTypesFile(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), 'node_modules/@cocos/creator-types/engine/cc.d.ts'),
    path.resolve(__dirname, '../../node_modules/@cocos/creator-types/engine/cc.d.ts'),
    path.resolve(__dirname, '../../../node_modules/@cocos/creator-types/engine/cc.d.ts'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function parseEngineDeclarations(text: string): RuntimeCapability[] {
  // EN: This lightweight parser builds a discovery catalog; supported runtime calls are still whitelisted above.
  // ZH: 这里的轻量解析器只生成发现目录；真正可调用的 runtime 能力仍由上方白名单控制。
  const capabilities: RuntimeCapability[] = [];
  const lines = text.split(/\r?\n/);
  let currentClass: string | undefined;
  let braceDepth = 0;

  for (const line of lines) {
    const classMatch = line.match(/^\s*export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/);
    if (classMatch) {
      currentClass = classMatch[1];
      braceDepth = countChar(line, '{') - countChar(line, '}');
      capabilities.push(runtime(currentClass, 'class', 'safe', `cc.${currentClass} class declaration.`, {
        owner: 'cc',
        supported: false,
      }));
      continue;
    }

    if (currentClass) {
      braceDepth += countChar(line, '{') - countChar(line, '}');
      const methodMatch = line.match(/^\s*(?:public\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*:\s*([^;{]+)/);
      if (methodMatch && methodMatch[1] !== 'constructor') {
        const name = methodMatch[1];
        capabilities.push(runtime(`${currentClass}.${name}`, 'function', inferRuntimeRisk(name), `${currentClass}.${name} runtime method.`, {
          owner: currentClass,
          params: splitParams(methodMatch[2]),
          result: methodMatch[3].trim(),
          supported: false,
        }));
      }

      const getterMatch = line.match(/^\s*get\s+([A-Za-z_$][\w$]*)\s*\(\)\s*:\s*([^;{]+)/);
      if (getterMatch) {
        capabilities.push(runtime(`${currentClass}.${getterMatch[1]}`, 'property', 'safe', `${currentClass}.${getterMatch[1]} runtime accessor.`, {
          owner: currentClass,
          result: getterMatch[2].trim(),
          supported: false,
        }));
      }

      const propertyMatch = line.match(/^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*:\s*([^;{]+)/);
      if (propertyMatch) {
        capabilities.push(runtime(`${currentClass}.${propertyMatch[1]}`, 'property', propertyMatch[0].includes('readonly') ? 'safe' : 'write', `${currentClass}.${propertyMatch[1]} runtime property.`, {
          owner: currentClass,
          result: propertyMatch[2].trim(),
          supported: false,
        }));
      }

      if (braceDepth <= 0) {
        currentClass = undefined;
      }
      continue;
    }

    const functionMatch = line.match(/^\s*export\s+function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*:\s*([^;{]+)/);
    if (functionMatch) {
      const name = functionMatch[1];
      capabilities.push(runtime(`cc.${name}`, 'function', inferRuntimeRisk(name), `cc.${name} runtime function.`, {
        owner: 'cc',
        params: splitParams(functionMatch[2]),
        result: functionMatch[3].trim(),
        supported: false,
      }));
    }
  }

  return capabilities;
}

function inferRuntimeRisk(name: string): ToolRisk {
  if (/^(destroy|remove|clear|reset|close|abort)/i.test(name)) {
    return 'destructive';
  }
  if (/^(set|add|create|insert|update|load|emit|dispatch|schedule|unschedule)/i.test(name)) {
    return 'write';
  }
  return 'safe';
}

function splitParams(params: string): string[] {
  const trimmed = params.trim();
  return trimmed ? trimmed.split(',').map((param) => param.trim()).filter(Boolean) : [];
}

function countChar(value: string, char: string): number {
  return value.split(char).length - 1;
}
