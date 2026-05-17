# AGENTS.md

English | [简体中文](AGENTS.zh-cn.md)

## Project Role

`cocos-mcp-plugin` is a new TypeScript Cocos Creator MCP plugin. It runs inside the Cocos Creator extension main process and exposes editor capabilities to MCP clients through a local `127.0.0.1` Streamable HTTP `/mcp` endpoint.

The implementation principles are clear layering, testability, extensibility, and honest capability reporting. New behavior should evolve from the current architecture instead of bypassing it.

Before implementing changes, read these files first:

- `docs/architecture.md`
- `source/types/index.ts`
- `source/tools/index.ts`
- `source/core/transport/http-streamable-transport.ts`
- `source/core/protocol/mcp-router.ts`
- `source/core/registry/tool-registry.ts`

## Architecture Boundaries

The current layers are fixed as follows:

- `source/types`: shared cross-layer types.
- `source/core/editor`: the only layer allowed to wrap the Cocos global `Editor`.
- `source/core/registry`: tool registration, validation, and execution.
- `source/core/protocol`: JSON-RPC and MCP method routing.
- `source/core/transport`: HTTP, SSE, sessions, CORS, and transport concerns.
- `source/tools`: tool declarations and tool business handlers.
- `source/panels`: Cocos Creator panel UI; it only displays state and calls main-process messages.
- `source/scene.ts`: Cocos scene contribution; only scene-context capabilities belong here.
- `source/main.ts`: Cocos extension main-process entry; it only handles composition and lifecycle.

Forbidden:

- Do not let tool modules access the global `Editor` directly.
- Do not let the transport layer call tool implementations directly.
- Do not let the protocol layer know about HTTP request/response objects.
- Do not let panel code create transports, registries, or tool handlers.
- Do not mix MCP, HTTP, and Cocos scene runtime logic in one file.
- Do not add tools without updating `EXPECTED_TOOL_COUNT`.
- Do not let partial tools return fake success.
- Do not use `ignoreDeprecations` to hide the TypeScript `moduleResolution=node10` deprecation.

## Tool Extension Rules

All tools must be registered explicitly through `ToolModule`. Runtime directory scanning is not allowed.

When adding a tool:

1. Add the tool spec in the corresponding `source/tools/*-tools.ts` file.
2. Use snake_case for the local tool name; the exposed name is `namespace_toolName`.
3. Declare the schema with toolkit helpers so it stays MCP-compatible JSON Schema and gets hidden Zod validation.
4. Call Cocos capabilities only through `context.editor`.
5. Update `EXPECTED_TOOL_COUNT` in `source/tools/index.ts`.
6. Confirm that `risk`, `profile`, and `destructive` metadata are correct. If omitted, `toolkit` will infer defaults.
7. Run `npm run generate:capabilities` when Cocos type packages or capability catalogs change.
8. Add or update tests.
9. Run `npm run build` and `npm test`.

Tool status rules:

- `implemented`: the tool is genuinely implemented and available.
- `partial`: the tool is registered or partially implemented, but does not fully cover the target behavior yet.
- `unavailable`: the tool is not available in the current version.

If a tool is not fully implemented, mark it as `partial` or `unavailable` and return a clear error or capability note.

Tool exposure rules:

- `ToolRegistry` must keep the complete catalog.
- `tools/list` must return only tools exposed by the active profile.
- The default profile is `core`; dangerous tools are disabled by default.
- Internal `validation` tools should not appear in the default MCP exposure surface.
- Script execution, delete operations, batch delete operations, preference reset, and environment-changing tools must be marked dangerous or full-profile.
- Calls to profile-disabled tools must return a structured error instead of pretending the tool is unknown.

Raw control rules:

- `editor_call_message` must validate channel, message, argument count, basic argument shape, and dangerous-message policy before calling `Editor.Message`.
- `scene_call_runtime` must expose only discoverable runtime catalog entries and must validate supported raw calls before entering scene context.
- Cocos typed catalog changes should be reflected by `scripts/extract-cocos-capabilities.js` and `generated/cocos-capabilities.json`.

## EditorBridge Rules

Tool modules may access the editor only through `ToolContext.editor`.

When adding a new editor capability:

1. Update the `EditorBridge` interface in `source/types/index.ts`.
2. Update `source/core/editor/cocos-editor-bridge.ts`.
3. Update the fake bridge in `source/test/run-tests.ts`.
4. Call the new method from the tool layer.

Simple one-off Cocos messages can use:

```ts
context.editor.request('scene', 'query-node-tree')
```

Complex, reusable, or parameter-normalizing capabilities should be wrapped as `EditorBridge` methods.

## MCP And Transport Rules

When adding an MCP method:

- Update `source/core/protocol/mcp-router.ts`.
- Do not write HTTP logic in the router.
- Add protocol tests.

When adding a transport:

- Create a new adapter under `source/core/transport`.
- Implement `TransportAdapter`.
- Reuse `McpRequestRouter`.
- Do not import tool modules from the transport.

The default transport is `HttpStreamableTransport`; it must keep:

- `POST /mcp`
- `GET /mcp`
- `DELETE /mcp`
- `GET /health`
- `Mcp-Session-Id`
- `MCP-Protocol-Version`
- SSE `event: message`
- Local Origin validation

## TypeScript And Style

- Use strict TypeScript.
- `tsconfig.json` uses `module: "Node16"` and `moduleResolution: "Node16"`.
- Use kebab-case for file names.
- Use PascalCase for class names.
- Use camelCase for functions and variables.
- Use snake_case for MCP tool names.
- Do not use `any`; use `unknown` and narrow at boundaries.
- Do not introduce unrelated dependencies.
- Do not refactor unrelated modules.

## Tests And Verification

Common commands:

```bash
npm run build
npm run generate:capabilities
npm test
```

Note: `npm test` starts local HTTP transport tests and may need permission to bind `127.0.0.1:39876`.

Minimum verification requirements:

- Run `npm run build` after changing types, core, tools, or transport.
- Run `npm test` after changing registry, protocol, transport, or tool counts.
- New tools must keep the registry total aligned with `EXPECTED_TOOL_COUNT`.
- Changes to tool exposure rules must cover core, full, and dangerous-tool scenarios.
- New HTTP behavior must be covered in `source/test/run-tests.ts`.

## Current Facts

- Current MCP protocol version: `2025-06-18`.
- Current tool total: `173`.
- Current typed editor message count: `97`.
- Default service URL: `http://127.0.0.1:3000/mcp`.
- Cocos extension entry: `dist/main.js`.
- Cocos scene contribution: `dist/scene.js`.
- Source entry: `source/main.ts`.
- Architecture guide: `docs/architecture.md`.

## Working Method

When taking over future tasks:

1. Identify the layer the task belongs to.
2. Change only that layer and the necessary tests.
3. Preserve the dependency direction across layers.
4. Mark incomplete capabilities honestly.
5. Report changed files and verification results at the end.
