import * as assert from 'assert';
import * as http from 'http';
import {
  ConsoleLogger,
  HttpStreamableTransport,
  McpRequestRouter,
  SessionManager,
  TOOL_INPUT_VALIDATOR,
  ToolRegistry,
} from '../core';
import { registerAllTools, EXPECTED_TOOL_COUNT } from '../tools';
import { EditorBridge, EditorSelection, JsonObject, JsonRpcResponse, JsonRpcSuccess, ToolContext } from '../types';
import { TYPED_EDITOR_MESSAGE_COUNT } from '../tools/capability-catalog';

interface BridgeRequest {
  channel: string;
  message: string;
  args: unknown[];
}

// EN: Tests run without Cocos Creator, so the fake bridge proves tools depend on EditorBridge only.
// ZH: 测试不依赖 Cocos Creator，因此 fake bridge 用于证明工具只依赖 EditorBridge。
class TestLogger extends ConsoleLogger {
  constructor() {
    super('test');
  }
}

class FakeEditorBridge implements EditorBridge {
  readonly calls: string[] = [];
  readonly requests: BridgeRequest[] = [];

  async request(channel: string, message: string, ...args: unknown[]): Promise<unknown> {
    this.calls.push(`${channel}:${message}`);
    this.requests.push({ channel, message, args });
    if (channel === 'scene' && message === 'query-node-tree') {
      return {
        name: 'Scene',
        uuid: 'scene-uuid',
        type: 'cc.Scene',
        active: true,
        children: [
          { name: 'Canvas', uuid: 'canvas-uuid', type: 'cc.Node', active: true, children: [] },
        ],
      };
    }
    if (channel === 'scene' && message === 'query-node') {
      return nodeDump(String(args[0]));
    }
    if (channel === 'scene' && message === 'create-node') {
      const options = args[0] as { assetUuid?: unknown } | undefined;
      return options?.assetUuid ? 'prefab-node-uuid' : 'created-node-uuid';
    }
    if (channel === 'asset-db' && message === 'query-asset-info') {
      return {
        name: 'HeroBlock',
        url: String(args[0]),
        uuid: 'prefab-asset-uuid',
        type: 'cc.Prefab',
      };
    }
    if (channel === 'server' && message === 'query-port') {
      return 7456;
    }
    if (channel === 'server' && message === 'query-ip-list') {
      return ['127.0.0.1'];
    }
    return { channel, message, args };
  }

  send(channel: string, message: string, ..._args: unknown[]): void {
    this.calls.push(`${channel}:${message}`);
  }

  executeSceneScript(method: string, args: unknown[] = [], extensionName?: string): Promise<unknown> {
    this.calls.push(`scene-script:${method}`);
    return Promise.resolve({ method, args, extensionName });
  }

  getSelection(type = 'node'): EditorSelection {
    return {
      type,
      uuids: ['canvas-uuid'],
      lastSelectedType: type,
      lastSelected: 'canvas-uuid',
    };
  }

  setSelection(type: string, uuids: string[]): void {
    this.calls.push(`selection:${type}:${uuids.join(',')}`);
  }

  projectInfo() {
    return {
      name: 'TestProject',
      path: '/tmp/test-project',
      uuid: 'project-uuid',
      cocosVersion: '3.8.6',
    };
  }

  paths() {
    return {
      project: '/tmp/test-project',
    };
  }
}

function nodeDump(uuid: string): JsonObject {
  if (uuid === 'node-3d-uuid') {
    return {
      name: 'Cube',
      uuid,
      type: 'cc.Node',
      active: true,
      __comps__: [
        { type: 'cc.MeshRenderer', cid: 'mesh-renderer', value: { type: 'cc.MeshRenderer' } },
      ],
    };
  }
  return {
    name: uuid === 'created-node-uuid' ? 'Created' : 'Canvas',
    uuid,
    type: 'cc.Node',
    active: true,
    __comps__: [
      {
        type: 'cc.UITransform',
        cid: 'ui-transform',
        value: {
          type: 'cc.UITransform',
          contentSize: { width: 100, height: 80 },
        },
      },
      {
        type: 'cc.Sprite',
        cid: 'sprite',
        value: {
          type: 'cc.Sprite',
          color: { r: 255, g: 255, b: 255, a: 255 },
        },
      },
    ],
  };
}

async function main(): Promise<void> {
  const logger = new TestLogger();
  const registry = new ToolRegistry(logger);
  registerAllTools(registry, logger);

  assert.strictEqual(registry.count(), EXPECTED_TOOL_COUNT, 'registry exposes expected tool count');
  assert.strictEqual(new Set(registry.list().map((tool) => tool.name)).size, EXPECTED_TOOL_COUNT, 'tool names are unique');
  assert.ok(registry.has('debug_execute_script'), 'dangerous exec tool is registered');
  assert.ok(registry.has('editor_get_selection'), 'new editor selection tool is registered');
  assert.ok(registry.has('tool_get_catalog'), 'new catalog tool is registered');
  assert.ok(registry.has('editor_call_message'), 'raw Editor.Message bridge tool is registered');
  assert.ok(registry.has('scene_call_runtime'), 'scene runtime bridge tool is registered');
  assert.ok(registry.has('scene_get_component_property'), 'scene component property getter is registered');
  assert.ok(registry.has('scene_set_component_property'), 'scene component property setter is registered');
  for (const tool of registry.list()) {
    assert.doesNotThrow(() => JSON.stringify(tool.inputSchema), `${tool.name} schema is serializable`);
  }
  assert.ok(
    registry.list().some((tool) => Object.getOwnPropertySymbols(tool.inputSchema).includes(TOOL_INPUT_VALIDATOR)),
    'tool schemas carry hidden Zod validators',
  );
  assert.ok(!JSON.stringify(registry.listForMcp()).includes('toolInputValidator'), 'hidden validators are not exposed to MCP clients');

  const defaultExposed = registry.listForMcp();
  assert.ok(defaultExposed.length < EXPECTED_TOOL_COUNT, 'default core profile exposes subset');
  assert.ok(!defaultExposed.some((tool) => tool.name === 'debug_execute_script'), 'dangerous exec tool is hidden by default');

  registry.setExposureConfig({ profile: 'full', allowDangerous: false });
  assert.ok(!registry.listForMcp().some((tool) => tool.name === 'debug_execute_script'), 'full profile still hides dangerous tools without opt-in');

  registry.setExposureConfig({ profile: 'full', allowDangerous: true });
  assert.ok(registry.listForMcp().some((tool) => tool.name === 'debug_execute_script'), 'dangerous tools can be exposed by opt-in');
  registry.setExposureConfig({ profile: 'core', allowDangerous: false });

  const bridge = new FakeEditorBridge();
  const context: ToolContext = { editor: bridge, logger };
  const router = new McpRequestRouter(registry, context, logger);

  const init = await router.route({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.strictEqual(init.response?.jsonrpc, '2.0');
  const initResponse = asSuccess(init.response);
  assert.deepStrictEqual((initResponse.result as JsonObject).protocolVersion, '2025-06-18');

  const listed = await router.route({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const listResult = asSuccess(listed.response).result as JsonObject;
  const listedTools = listResult.tools as JsonObject[];
  assert.ok(listedTools.length < EXPECTED_TOOL_COUNT);
  assert.ok(!listedTools.some((tool) => tool.name === 'debug_execute_script'));

  const called = await router.route({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'scene_get_current_scene',
      arguments: {},
    } as JsonObject,
  });
  const callResult = asSuccess(called.response).result as JsonObject;
  assert.strictEqual(callResult.isError, false);
  assert.ok(bridge.calls.includes('scene:query-node-tree'));

  const disabledCall = await router.route({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'debug_execute_script',
      arguments: { script: '1 + 1' },
    } as JsonObject,
  });
  const disabledResult = asSuccess(disabledCall.response).result as JsonObject;
  assert.strictEqual(disabledResult.isError, true);
  assert.ok(JSON.stringify(disabledResult).includes('Tool disabled by active profile'));

  const catalogCall = await router.route({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'tool_get_catalog',
      arguments: {},
    } as JsonObject,
  });
  const catalogResult = asSuccess(catalogCall.response).result as JsonObject;
  assert.strictEqual(catalogResult.isError, false);
  assert.ok(JSON.stringify(catalogResult).includes('debug_execute_script'));

  const transform2D = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'node_set_node_transform',
      arguments: {
        uuid: 'canvas-uuid',
        position: { x: 12, y: 34 },
        rotation: { x: 0, y: 0 },
        scale: { x: 2, y: 3 },
      },
    } as JsonObject,
  }));
  assert.strictEqual(transform2D.result.isError, false);
  const positionWrite = lastSetProperty(bridge, 'canvas-uuid', 'position');
  assert.deepStrictEqual(positionWrite?.dump?.value, { x: 12, y: 34, z: 0 });

  const transform3DError = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'node_set_node_transform',
      arguments: {
        uuid: 'node-3d-uuid',
        position: { x: 1, y: 2 },
      },
    } as JsonObject,
  }));
  assert.strictEqual(transform3DError.result.isError, true);
  assert.ok(JSON.stringify(transform3DError.body).includes('position.z is required for 3D nodes'));

  const createNode = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'node_create_node',
      arguments: {
        name: 'Panel',
        initialTransform: { position: { x: 5, y: 6 } },
      },
    } as JsonObject,
  }));
  assert.strictEqual(createNode.result.isError, false);
  const createdPosition = lastSetProperty(bridge, 'created-node-uuid', 'position');
  assert.deepStrictEqual(createdPosition?.dump?.value, { x: 5, y: 6, z: 0 });

  const componentValue = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'scene_get_component_property',
      arguments: {
        nodeUuid: 'canvas-uuid',
        componentType: 'cc.UITransform',
        property: 'contentSize.width',
      },
    } as JsonObject,
  }));
  assert.strictEqual(componentValue.result.isError, false);
  assert.strictEqual(((componentValue.body.data as JsonObject).value), 100);

  const componentSet = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'scene_set_component_property',
      arguments: {
        nodeUuid: 'canvas-uuid',
        componentType: 'cc.UITransform',
        property: 'contentSize',
        value: { width: 320, height: 180 },
      },
    } as JsonObject,
  }));
  assert.strictEqual(componentSet.result.isError, false);
  const sizeWrite = lastSetProperty(bridge, 'canvas-uuid', '__comps__.ui-transform.contentSize');
  assert.deepStrictEqual(sizeWrite?.dump?.value, { width: 320, height: 180 });

  const aligned = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'sceneView_align_view_with_node',
      arguments: {},
    } as JsonObject,
  }));
  assert.strictEqual(aligned.result.isError, false);
  assert.ok(bridge.requests.some((request) => request.channel === 'scene' && request.message === 'align-view-with-node'));

  const validationError = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 21,
    method: 'tools/call',
    params: {
      name: 'sceneView_set_icon_gizmo_size',
      arguments: { size: 'large' },
    } as JsonObject,
  }));
  assert.strictEqual(validationError.result.isError, true);
  assert.ok(JSON.stringify(validationError.body).includes('Tool arguments validation failed'));
  assert.ok(JSON.stringify(validationError.body).includes('size'));

  registry.setExposureConfig({ profile: 'full', allowDangerous: false });

  const prefab = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'prefab_instantiate_prefab',
      arguments: {
        prefabPath: 'db://assets/HeroBlock.prefab',
        parentUuid: 'canvas-uuid',
        position: { x: 44, y: 55 },
      },
    } as JsonObject,
  }));
  assert.strictEqual(prefab.result.isError, false);
  const prefabPosition = lastSetProperty(bridge, 'prefab-node-uuid', 'position');
  assert.deepStrictEqual(prefabPosition?.dump?.value, { x: 44, y: 55, z: 0 });

  const messageCatalog = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 13,
    method: 'tools/call',
    params: {
      name: 'editor_get_message_catalog',
      arguments: {},
    } as JsonObject,
  }));
  assert.strictEqual(messageCatalog.result.isError, false);
  assert.strictEqual((messageCatalog.body.data as JsonObject).total, TYPED_EDITOR_MESSAGE_COUNT);
  assert.ok(JSON.stringify(messageCatalog.body).includes('align-view-with-node'));

  const rawMessage = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 14,
    method: 'tools/call',
    params: {
      name: 'editor_call_message',
      arguments: {
        channel: 'asset-db',
        message: 'query-assets',
        args: [{ pattern: 'db://assets/**/*' }],
      },
    } as JsonObject,
  }));
  assert.strictEqual(rawMessage.result.isError, false);
  assert.ok(bridge.requests.some((request) => request.channel === 'asset-db' && request.message === 'query-assets'));

  const rawUnknown = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 15,
    method: 'tools/call',
    params: {
      name: 'editor_call_message',
      arguments: {
        channel: 'scene',
        message: 'missing-message',
      },
    } as JsonObject,
  }));
  assert.strictEqual(rawUnknown.result.isError, true);
  assert.ok(JSON.stringify(rawUnknown.body).includes('Unknown Editor.Message capability'));

  const rawDangerous = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 16,
    method: 'tools/call',
    params: {
      name: 'editor_call_message',
      arguments: {
        channel: 'scene',
        message: 'execute-scene-script',
        args: [{ name: 'cocos-mcp-plugin', method: 'executeScript', args: ['return 1;'] }],
      },
    } as JsonObject,
  }));
  assert.strictEqual(rawDangerous.result.isError, true);
  assert.ok(JSON.stringify(rawDangerous.body).includes('Dangerous Tools opt-in'));

  const rawTypeError = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 17,
    method: 'tools/call',
    params: {
      name: 'editor_call_message',
      arguments: {
        channel: 'scene',
        message: 'focus-camera',
        args: ['not-an-array'],
      },
    } as JsonObject,
  }));
  assert.strictEqual(rawTypeError.result.isError, true);
  assert.ok(JSON.stringify(rawTypeError.body).includes('string array'));

  const runtimeCatalog = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 18,
    method: 'tools/call',
    params: {
      name: 'scene_get_runtime_catalog',
      arguments: { risk: 'write' },
    } as JsonObject,
  }));
  assert.strictEqual(runtimeCatalog.result.isError, false);
  assert.ok(JSON.stringify(runtimeCatalog.body).includes('Node.setPosition'));

  const runtimeCall = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 19,
    method: 'tools/call',
    params: {
      name: 'scene_call_runtime',
      arguments: {
        path: 'Node.setPosition',
        targetUuid: 'canvas-uuid',
        args: [1, 2, 0],
      },
    } as JsonObject,
  }));
  assert.strictEqual(runtimeCall.result.isError, false);
  assert.ok(bridge.requests.some((request) => request.channel === 'scene' && request.message === 'execute-scene-script')
    || bridge.calls.includes('scene-script:callRuntime'));

  const runtimeArgError = parseToolCall(await router.route({
    jsonrpc: '2.0',
    id: 20,
    method: 'tools/call',
    params: {
      name: 'scene_call_runtime',
      arguments: {
        path: 'Node.setPosition',
        targetUuid: 'canvas-uuid',
        args: [1, 2],
      },
    } as JsonObject,
  }));
  assert.strictEqual(runtimeArgError.result.isError, true);
  assert.ok(JSON.stringify(runtimeArgError.body).includes('three finite number arguments'));

  const notification = await router.route({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  assert.strictEqual(notification.notificationAccepted, true);

  await testHttpTransport(registry, context, logger);
}

function parseToolCall(result: Awaited<ReturnType<McpRequestRouter['route']>>): { result: JsonObject; body: JsonObject } {
  const rpc = asSuccess(result.response).result as JsonObject;
  const content = rpc.content as JsonObject[];
  const text = String(content[0]?.text ?? '{}');
  return {
    result: rpc,
    body: JSON.parse(text) as JsonObject,
  };
}

function lastSetProperty(bridge: FakeEditorBridge, uuid: string, path: string): { uuid?: unknown; path?: unknown; dump?: { value?: unknown } } | undefined {
  const request = [...bridge.requests].reverse().find((item) => {
    if (item.channel !== 'scene' || item.message !== 'set-property') {
      return false;
    }
    const payload = item.args[0] as { uuid?: unknown; path?: unknown };
    return payload.uuid === uuid && payload.path === path;
  });
  return request?.args[0] as { uuid?: unknown; path?: unknown; dump?: { value?: unknown } } | undefined;
}

function asSuccess(response: JsonRpcResponse | undefined): JsonRpcSuccess {
  assert.ok(response, 'expected JSON-RPC response');
  assert.ok('result' in response, 'expected JSON-RPC success response');
  return response;
}

async function testHttpTransport(registry: ToolRegistry, context: ToolContext, logger: TestLogger): Promise<void> {
  const sessions = new SessionManager();
  const router = new McpRequestRouter(registry, context, logger);
  const transport = new HttpStreamableTransport({
    host: '127.0.0.1',
    port: 39876,
    allowedOrigins: ['http://127.0.0.1'],
  }, router, sessions, logger);

  await transport.start();
  try {
    const init = await request({
      method: 'POST',
      path: '/mcp',
      body: JSON.stringify({ jsonrpc: '2.0', id: 'init', method: 'initialize', params: {} }),
    });
    assert.strictEqual(init.status, 200);
    assert.ok(init.headers['mcp-session-id']);

    const sessionId = String(init.headers['mcp-session-id']);
    const list = await request({
      method: 'POST',
      path: '/mcp',
      sessionId,
      body: JSON.stringify({ jsonrpc: '2.0', id: 'list', method: 'tools/list', params: {} }),
    });
    assert.strictEqual(list.status, 200);
    assert.ok(JSON.parse(list.body).result.tools.length < EXPECTED_TOOL_COUNT);

    const sse = await request({
      method: 'POST',
      path: '/mcp',
      sessionId,
      accept: 'application/json, text/event-stream',
      body: JSON.stringify({ jsonrpc: '2.0', id: 'ping', method: 'ping', params: {} }),
    });
    assert.strictEqual(sse.status, 200);
    assert.ok(sse.body.includes('event: message'));

    const deleted = await request({ method: 'DELETE', path: '/mcp', sessionId });
    assert.strictEqual(deleted.status, 204);
  } finally {
    await transport.stop();
  }
}

function request(options: { method: string; path: string; body?: string; sessionId?: string; accept?: string }): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: 39876,
      method: options.method,
      path: options.path,
      headers: {
        'Content-Type': 'application/json',
        Accept: options.accept ?? 'application/json',
        Origin: 'http://127.0.0.1',
        ...(options.sessionId ? { 'Mcp-Session-Id': options.sessionId, 'MCP-Protocol-Version': '2025-06-18' } : {}),
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk.toString('utf8');
      });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
