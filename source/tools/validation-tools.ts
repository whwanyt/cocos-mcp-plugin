import { ToolModule } from '../types';
import { anyProp, createToolModule, objectSchema, ok, stringProp } from './toolkit';

// EN: Validation tools are internal helpers for clients and are excluded from the default MCP exposure surface.
// ZH: validation 工具是面向客户端的内部辅助能力，默认不进入 MCP 暴露面。
export function createValidationTools(): ToolModule {
  return createToolModule('validation', [
    {
      name: 'validate_json_params',
      description: 'Validate and fix JSON parameters before sending to other tools',
      inputSchema: objectSchema({
        jsonString: stringProp('JSON string to validate and fix'),
        expectedSchema: anyProp('Expected parameter schema'),
      }, ['jsonString']),
      handler: async (args) => {
        try {
          const parsedJson = JSON.parse(String(args.jsonString));
          return ok({
            parsedJson,
            fixedJson: JSON.stringify(parsedJson, null, 2),
            isValid: true,
          });
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            data: {
              originalJson: args.jsonString,
              isValid: false,
            },
          };
        }
      },
    },
    {
      name: 'safe_string_value',
      description: 'Create a safe string value that will not cause JSON parsing issues',
      inputSchema: objectSchema({ value: stringProp('String value to make safe') }, ['value']),
      handler: async (args) => {
        const safeValue = String(args.value)
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
        return ok({
          originalValue: args.value,
          safeValue,
          jsonReady: JSON.stringify(String(args.value)),
        });
      },
    },
    {
      name: 'format_mcp_request',
      description: 'Format a complete MCP request with proper JSON escaping',
      inputSchema: objectSchema({
        toolName: stringProp('Tool name to call'),
        arguments: anyProp('Tool arguments'),
      }, ['toolName', 'arguments']),
      handler: async (args) => {
        const request = {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: args.toolName,
            arguments: args.arguments,
          },
        };
        return ok({
          request,
          formattedJson: JSON.stringify(request, null, 2),
          compactJson: JSON.stringify(request),
        });
      },
    },
  ]);
}
