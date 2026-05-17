import { ToolRegistry } from '../registry/tool-registry';
import {
  JsonObject,
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
  Logger,
  ToolContext,
} from '../../types';
import { failure, isNotification, isRequest, isResponse, success } from './json-rpc';

export interface McpRouterResult {
  response?: JsonRpcResponse;
  notificationAccepted?: boolean;
}

// EN: MCP protocol date comes from the Streamable HTTP specification version this server implements.
// ZH: MCP 协议日期来自当前服务实现的 Streamable HTTP 规范版本。
export const MCP_PROTOCOL_VERSION = '2025-06-18';

// EN: Router owns JSON-RPC/MCP behavior only; HTTP details stay in transport adapters.
// ZH: Router 只负责 JSON-RPC/MCP 行为；HTTP 细节保留在 transport adapter 中。
export class McpRequestRouter {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly context: ToolContext,
    private readonly logger: Logger,
  ) {}

  async route(message: JsonRpcMessage): Promise<McpRouterResult> {
    if (isResponse(message)) {
      // EN: Client responses are accepted for protocol completeness, but the server does not await them yet.
      // ZH: 为保持协议完整性接受客户端 response，但当前服务端不会等待这些 response。
      this.logger.debug('Received JSON-RPC response from client', message);
      return { notificationAccepted: true };
    }

    if (isNotification(message)) {
      this.handleNotification(message.method);
      return { notificationAccepted: true };
    }

    if (!isRequest(message)) {
      return {
        response: failure(null, -32600, 'Invalid Request'),
      };
    }

    return {
      response: await this.handleRequest(message),
    };
  }

  private handleNotification(method: string): void {
    this.logger.debug(`Accepted notification: ${method}`);
  }

  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      switch (request.method) {
        case 'initialize':
          // EN: listChanged is false because profile changes currently require an explicit service restart.
          // ZH: listChanged 为 false，因为当前 profile 变更通过显式重启服务生效。
          return success(request.id, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
            serverInfo: {
              name: 'cocos-mcp-plugin',
              version: '0.1.0',
            },
          });

        case 'ping':
          return success(request.id, {});

        case 'tools/list':
          return success(request.id, {
            tools: this.registry.listForMcp(),
          });

        case 'tools/call':
          return success(request.id, await this.callTool(request.params));

        default:
          return failure(request.id, -32601, `Method not found: ${request.method}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failure(request.id, -32603, message);
    }
  }

  private async callTool(params?: JsonObject): Promise<JsonObject> {
    const name = params?.name;
    const rawArgs = params?.arguments;
    if (typeof name !== 'string') {
      throw new Error('tools/call params.name must be a string');
    }
    if (!this.registry.has(name)) {
      throw new Error(`Unknown tool: ${name}`);
    }
    if (rawArgs !== undefined && (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs))) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Tool arguments validation failed',
              data: {
                name,
                issues: [{
                  path: '<root>',
                  message: 'tools/call params.arguments must be a JSON object when provided',
                  code: 'invalid_type',
                }],
              },
            }, null, 2),
          },
        ],
        isError: true,
      };
    }

    // EN: MCP clients may omit arguments; handlers always receive a plain object.
    // ZH: MCP 客户端可以省略 arguments；handler 始终接收普通对象。
    const args = rawArgs ? rawArgs as JsonObject : {};
    const result = await this.registry.execute(name, args, {
      ...this.context,
      exposure: this.registry.getExposureRuntime(),
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: !result.success,
    };
  }
}
