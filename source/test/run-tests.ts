import * as assert from 'assert';
import * as http from 'http';
import {
  ConsoleLogger,
  HttpStreamableTransport,
  McpRequestRouter,
  SessionManager,
  ToolRegistry,
} from '../core';
import { registerAllTools, EXPECTED_TOOL_COUNT } from '../tools';
import { EditorBridge, EditorSelection, JsonObject, JsonRpcResponse, JsonRpcSuccess, ToolContext } from '../types';

// EN: Tests run without Cocos Creator, so the fake bridge proves tools depend on EditorBridge only.
// ZH: 测试不依赖 Cocos Creator，因此 fake bridge 用于证明工具只依赖 EditorBridge。
class TestLogger extends ConsoleLogger {
  constructor() {
    super('test');
  }
}

class FakeEditorBridge implements EditorBridge {
  readonly calls: string[] = [];

  async request(channel: string, message: string, ...args: unknown[]): Promise<unknown> {
    this.calls.push(`${channel}:${message}`);
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

async function main(): Promise<void> {
  const logger = new TestLogger();
  const registry = new ToolRegistry(logger);
  registerAllTools(registry, logger);

  assert.strictEqual(registry.count(), EXPECTED_TOOL_COUNT, 'registry exposes expected tool count');
  assert.strictEqual(new Set(registry.list().map((tool) => tool.name)).size, EXPECTED_TOOL_COUNT, 'tool names are unique');
  assert.ok(registry.has('debug_execute_script'), 'dangerous exec tool is registered');
  assert.ok(registry.has('editor_get_selection'), 'new editor selection tool is registered');
  assert.ok(registry.has('tool_get_catalog'), 'new catalog tool is registered');
  for (const tool of registry.list()) {
    assert.doesNotThrow(() => JSON.stringify(tool.inputSchema), `${tool.name} schema is serializable`);
  }

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

  const notification = await router.route({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  assert.strictEqual(notification.notificationAccepted, true);

  await testHttpTransport(registry, context, logger);
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
