import {
  JsonRpcFailure,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccess,
  JsonValue,
} from '../../types';

export const JSON_RPC_VERSION = '2.0' as const;

// EN: These guards protect the protocol boundary before MCP method routing begins.
// ZH: 这些类型守卫在进入 MCP method 路由前保护协议边界。
export function isRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return hasJsonRpc(message) && 'id' in message && typeof (message as JsonRpcRequest).method === 'string';
}

export function isNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return hasJsonRpc(message) && !('id' in message) && typeof (message as JsonRpcNotification).method === 'string';
}

export function success(id: string | number, result: JsonValue): JsonRpcSuccess {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    result,
  };
}

export function failure(id: string | number | null, code: number, message: string, data?: JsonValue): JsonRpcFailure {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

export function isResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return hasJsonRpc(message) && 'id' in message && ('result' in message || 'error' in message);
}

function hasJsonRpc(message: unknown): message is { jsonrpc: '2.0' } {
  return !!message && typeof message === 'object' && (message as { jsonrpc?: unknown }).jsonrpc === JSON_RPC_VERSION;
}
