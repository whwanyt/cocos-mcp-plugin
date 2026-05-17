# cocos-mcp-plugin Architecture And Extension Guide

English | [简体中文](architecture.zh-cn.md)

## 1. Project Role

`cocos-mcp-plugin` is a TypeScript MCP server embedded in a Cocos Creator extension main process. It exposes a local `127.0.0.1` MCP `2025-06-18` Streamable HTTP endpoint, allowing external AI clients to control Cocos Creator through the standard MCP protocol.

The architecture favors clear layering, strong types, and transport extensibility.

Core goals:

- Provide `173` stable MCP tools plus typed raw bridges for full Cocos control.
- Separate MCP protocol, HTTP transport, tool registration, editor access, and tool business logic.
- Run inside Cocos Creator by default while keeping the core testable and portable.
- Expose incomplete capabilities honestly with `partial` or `unavailable` status.

## 2. Runtime Flow

```text
MCP Client
  -> http://127.0.0.1:3000/mcp
  -> HttpStreamableTransport
  -> McpRequestRouter
  -> ToolRegistry
  -> ToolModule handler
  -> EditorBridge
  -> Cocos Editor.Message / scene script
  -> Cocos Creator editor / scene / asset-db / builder
```

Cocos extension entries:

- `package.json -> main` points to `dist/main.js`.
- `source/main.ts` exports extension `methods`, `load`, and `unload`.
- `source/scene.ts` is the `contributions.scene.script` entry for scene-context behavior.

MCP endpoints:

- `GET /health`: health check.
- `POST /mcp`: JSON-RPC request / notification / response.
- `GET /mcp`: SSE stream.
- `DELETE /mcp`: terminate MCP session.
- `OPTIONS`: CORS preflight.

## 3. Directory Structure

```text
source/
  main.ts                       # Cocos extension main process entry
  scene.ts                      # Cocos scene contribution
  index.ts                      # public exports
  panels/
    default/
      index.ts                  # Cocos dockable panel entry
  types/
    index.ts                    # shared cross-layer types
  core/
    logger.ts
    index.ts
    editor/
      cocos-editor-bridge.ts
    protocol/
      json-rpc.ts
      mcp-router.ts
      session-manager.ts
    registry/
      tool-registry.ts
    transport/
      http-streamable-transport.ts
  tools/
    index.ts                    # explicit tool module registration
    toolkit.ts                  # tool declaration helpers
    capability-catalog.ts       # typed Editor.Message and engine runtime capability catalog
    transform-utils.ts          # 2D/3D transform normalization
    *-tools.ts                  # domain tool modules
  test/
    run-tests.ts
scripts/
  extract-cocos-capabilities.js # local @cocos/creator-types catalog extractor
generated/
  cocos-capabilities.json       # generated capability summary
static/
  template/default/index.html
  style/default/index.css
docs/
  architecture.md
  architecture.zh-cn.md
```

Generated directories:

- `dist/`: extension runtime output.
- `dist-test/`: test build output.
- `node_modules/`: dependencies only.

## 4. Layer Responsibilities

### 4.1 types

Location: `source/types/index.ts`

Responsibilities:

- Define shared protocol, tool, transport, and editor bridge types.
- Keep cross-layer contracts stable.
- Avoid duplicate public type definitions in tool modules.

Important types:

- `ToolDefinition`
- `ToolModule`
- `ToolExecutor`
- `ToolContext`
- `EditorBridge`
- `TransportAdapter`
- `StreamWriter`
- `JsonRpcRequest`
- `McpServerSettings`
- `ToolExposureConfig`

Rules:

- Add shared cross-layer objects here first.
- Use `JsonObject` / `JsonValue` only at protocol boundaries.
- Do not put functions, class instances, or cyclic objects into JSON values.

### 4.2 core/editor

Location: `source/core/editor/cocos-editor-bridge.ts`

Responsibilities:

- Wrap the global Cocos `Editor` API.
- Provide a stable editor access surface for tools.
- Make tools testable through a fake bridge.

Allowed editor access surface:

```ts
request(channel, message, ...args)
send(channel, message, ...args)
executeSceneScript(method, args, extensionName)
getSelection(type)
setSelection(type, uuids)
projectInfo()
paths()
```

Rules:

- Tool modules must not access global `Editor` directly.
- Add reusable editor capabilities to `EditorBridge` first.
- Only `cocos-editor-bridge.ts` should wrap Cocos Editor globals.

### 4.3 core/registry

Location: `source/core/registry/tool-registry.ts`

Responsibilities:

- Register explicit `ToolModule` instances.
- Keep the full tool catalog.
- Generate the MCP-visible tool list from the active exposure profile.
- Validate unique tool names, JSON-serializable schemas, hidden Zod validators, and complete handlers.
- Validate tool arguments before executing handlers.
- Execute tool handlers.

Rules:

- All tools must be registered through `registerAllTools`.
- Do not use runtime directory scanning or dynamic `require`.
- Full tool names are generated as `namespace_toolName`, for example `scene_get_current_scene`.
- Missing handlers must fail at startup.
- `tools/list` returns only tools allowed by `ToolExposureConfig`.
- Calls to profile-disabled or dangerous-disabled tools return a structured error, not "unknown tool".

### 4.4 core/protocol

Location: `source/core/protocol/*`

Responsibilities:

- Handle JSON-RPC 2.0 requests, notifications, and responses.
- Route MCP methods: `initialize`, `ping`, `tools/list`, `tools/call`.
- Own `MCP_PROTOCOL_VERSION = "2025-06-18"`.
- Convert protocol requests into registry calls.

Rules:

- `mcp-router.ts` must not know HTTP details.
- Add MCP methods in protocol, not transport.
- JSON-RPC errors are normalized here.
- Tool results are wrapped as MCP text content.

### 4.5 core/transport

Location: `source/core/transport/http-streamable-transport.ts`

Responsibilities:

- Implement Streamable HTTP.
- Handle HTTP headers, CORS, Origin validation, session headers, and SSE.
- Parse HTTP bodies into `JsonRpcMessage` and pass them to `McpRequestRouter`.

Current behavior:

- `POST /mcp`: JSON or `text/event-stream` response.
- `GET /mcp`: opens SSE.
- `DELETE /mcp`: deletes session.
- `GET /health`: health check.

Rules:

- Transport must not execute tools directly.
- Transport must not access Cocos `Editor`.
- Future transports should implement `TransportAdapter` and reuse `McpRequestRouter`.

Future examples:

- `StdioTransportAdapter`
- `SseTransportAdapter`
- `WebSocketTransportAdapter`

### 4.6 tools

Location: `source/tools/*`

Responsibilities:

- Declare MCP tools by domain.
- Provide schema, description, status, risk, profile, and handler.
- Call Cocos only through `ToolContext.editor`.

Tool module format:

```ts
export function createSceneTools(): ToolModule {
  return createToolModule('scene', [
    {
      name: 'get_current_scene',
      description: 'Get current scene information',
      inputSchema: objectSchema(),
      handler: async (_args, context) => {
        const tree = await context.editor.request('scene', 'query-node-tree');
        return ok(tree);
      },
    },
  ]);
}
```

Tool status:

- `implemented`: truly available.
- `partial`: registered or partially available, but not complete.
- `unavailable`: not available in the current version.

Rules:

- Incomplete tools must be marked `partial` or `unavailable`.
- Do not return fake success.
- Handlers return `ToolResponse`; use `ok(...)` for success.
- Tool schemas must be declared through toolkit helpers so MCP receives JSON Schema while the registry validates with Zod.
- Tool names use snake_case.
- Use `transform-utils.ts` for node and prefab transform normalization.
- 2D node positions may accept `{ x, y }`; tools must add `z: 0` before writing Cocos `cc.Node.position`.
- Use generic component property access for UITransform content size instead of adding a dedicated content-size tool.

Raw bridge tools:

- `editor_get_message_catalog`: reports typed and package-specific `Editor.Message` capabilities.
- `editor_call_message`: validates channel, message, argument count, basic argument shape, and dangerous-message policy before calling `Editor.Message`.
- `scene_get_runtime_catalog`: reports runtime capabilities extracted from `@cocos/creator-types/engine`.
- `scene_call_runtime`: calls supported runtime entries through `source/scene.ts` after validation.
- `scene_get_component_property` and `scene_set_component_property`: generic component property access through stable component dump paths.

### 4.7 scene contribution

Location: `source/scene.ts`

Responsibilities:

- Run inside the Cocos scene context.
- Provide methods that require access to the `cc` runtime.

Current methods:

- `getCurrentSceneInfo`
- `getSceneHierarchy`
- `executeScript`
- `callRuntime`

Rules:

- Only scene-context capabilities belong here.
- Do not put MCP, HTTP, or registry logic here.
- New scene methods must also be added to `package.json -> contributions.scene.methods`.

### 4.8 panels

Location: `source/panels/default/index.ts`

Responsibilities:

- Provide the Cocos Creator dockable panel.
- Show server status, endpoint, tool statistics, and tool catalog.
- Let users switch Core / Full profile and Dangerous Tools.
- Call main-process messages through `Editor.Message.request('cocos-mcp-plugin', ...)`.

Static files:

- `static/template/default/index.html`
- `static/style/default/index.css`

Rules:

- Panel only owns UI and main-process message calls.
- Panel must not create transports, registries, or tool handlers.
- Panel must not import tool implementation modules.
- New panel messages must be added to both `package.json -> contributions.messages` and `source/main.ts`.

## 5. Code Standards

### 5.1 TypeScript

- Use strict mode.
- Use `module: "Node16"` and `moduleResolution: "Node16"`.
- Keep Cocos runtime output compatible with the extension package model.
- Do not use `any`; use `unknown` and narrow through structured interfaces, type guards, or explicit parsers.

### 5.2 Naming

- Files: kebab-case, for example `http-streamable-transport.ts`.
- Classes: PascalCase, for example `ToolRegistry`.
- Functions: camelCase, for example `registerAllTools`.
- MCP tools: `namespace_snake_case`, for example `node_get_all_nodes`.
- Tool module namespaces keep the existing catalog style, such as `scene`, `node`, `assetAdvanced`.

### 5.3 Dependency Direction

Allowed:

```text
main -> core + tools + types
transport -> protocol + session + types
protocol -> registry + types
registry -> types
tools -> types + toolkit
editor bridge -> types + Cocos Editor API
panel -> Cocos Panel API + main-process messages
scene -> Cocos cc runtime only
```

Forbidden:

```text
transport -> tools
transport -> editor
protocol -> transport
tools -> core/transport
tools -> global Editor
panel -> tools
scene -> protocol/transport/registry
```

## 6. Tool Exposure Model

The registry and MCP exposure are intentionally separate.

- The registry keeps the complete catalog.
- `tools/list` returns only currently exposed tools.
- `tool_get_catalog` returns the full catalog with enablement state and disabled reasons.
- `editor_get_capabilities` returns the active profile and tool counts.

Profiles:

- `core`: default, stable, high-frequency tools.
- `full`: compatibility profile for the broader catalog.
- `internal`: never exposed through default MCP `tools/list`.

Risk levels:

- `safe`
- `write`
- `destructive`
- `exec`
- `environment`
- `internal`

Dangerous tools are disabled unless `allowDangerous` is true. Dangerous means `destructive`, `exec`, `environment`, or explicitly destructive metadata.

Raw bridges live in the `full` profile. Per-call risk still applies: dangerous `Editor.Message` methods or dangerous runtime entries require `allowDangerous=true`.

## 7. Configuration And Lifecycle

The main process owns runtime assembly:

- Loads tool exposure config from `Editor.Profile`.
- Registers the full tool catalog.
- Applies the exposure config to `ToolRegistry`.
- Creates `McpRequestRouter`.
- Starts `HttpStreamableTransport`.

Panel exposure changes are saved through main-process messages and apply by restarting the local MCP service.

## 8. Extending Tools

When adding a tool:

1. Add the spec to the relevant `source/tools/*-tools.ts`.
2. Use snake_case for the local tool name.
3. Declare the schema with toolkit helpers so it stays MCP-compatible JSON Schema and gets Zod runtime validation.
4. Call Cocos through `context.editor`.
5. Confirm `status`, `risk`, `profile`, and `destructive`.
6. Update `EXPECTED_TOOL_COUNT`.
7. Run `npm run generate:capabilities` when Cocos type packages or capability catalogs change.
8. Update tests.

If a tool needs new editor access:

1. Extend `EditorBridge` in `source/types/index.ts`.
2. Implement it in `source/core/editor/cocos-editor-bridge.ts`.
3. Update the fake bridge in `source/test/run-tests.ts`.
4. Call the new bridge method from tools.

## 9. Extending Protocol

When adding an MCP method:

1. Update `source/core/protocol/mcp-router.ts`.
2. Add a new case in request handling.
3. Keep HTTP details outside the router.
4. Add protocol tests.

Do not add `resources/*` or `prompts/*` until product requirements justify them.

## 10. Extending Transport

When adding a transport:

1. Add a file under `source/core/transport`.
2. Implement `TransportAdapter`.
3. Reuse `McpRequestRouter`.
4. Do not import tool modules.
5. Add transport tests.

Example shape:

```text
StdioTransportAdapter
  -> read line from stdin
  -> parse JsonRpcMessage
  -> router.route(message)
  -> write JsonRpcResponse to stdout
```

## 11. Testing

Commands:

```bash
npm run build
npm run generate:capabilities
npm test
```

Coverage expectations:

- Registry tool count equals `EXPECTED_TOOL_COUNT`.
- Tool names are unique.
- Schemas are JSON-serializable.
- `initialize` returns `2025-06-18`.
- `tools/list` returns profile-exposed tools.
- Disabled tools return structured errors.
- `tool_get_catalog` exposes the complete catalog.
- HTTP transport validates session, SSE, and DELETE behavior.
- 2D node transform adapts `{ x, y }` to `{ x, y, z: 0 }`.
- Raw bridge tools reject unknown methods and invalid argument shapes.

`npm test` starts a local HTTP server on `127.0.0.1:39876`; some environments require permission for local port binding.

## 12. Current Implementation Status

The full catalog registers `173` tools and validates that count at startup.

The local Cocos type catalog currently reports:

- `97` typed editor messages from `@cocos/creator-types/editor`.
- Runtime catalog entries are extracted from `@cocos/creator-types/engine` and merged with the supported scene runtime calls.

Implemented priority areas:

- Scene query/list/open/save/close/hierarchy.
- Node query/create/move/delete/duplicate/rename/active/transform.
- Component query/add/read/write/attach script requests.
- Project info, asset query/create/copy/move/delete/save/reimport/search.
- Server information and network interface queries.
- Scene view status and common controls.
- Editor selection, capability summary, typed message catalog, raw message bridge, runtime catalog, runtime bridge, and full tool catalog.
- 2D/3D transform normalization for node transforms, node creation, and prefab instantiation.

Areas that still need deeper implementation:

- Official prefab serialization for create/update flows.
- Asset dependency analysis, unused asset scanning, texture compression.
- Real Cocos broadcast listener integration.
- Complete preference import/reset strategy.
- Live debug console capture.

Partial tools remain in the complete catalog; MCP exposure depends on profile and dangerous-tool policy.

## 13. Release And Integration Notes

- Cocos runs `dist/main.js` and `dist/scene.js`.
- Run `npm run build` after source changes.
- Reload or restart the Cocos extension when `package.json` contributions change.
- Default panel opens through `Editor.Panel.open('cocos-mcp-plugin')`.
- MCP endpoint:

```text
http://127.0.0.1:3000/mcp
```

- The first client request must call `initialize`; later requests include `Mcp-Session-Id`.

## 14. Prohibited Changes

- Do not let tools access global `Editor`.
- Do not let transport call tool handlers directly.
- Do not add tools without updating `EXPECTED_TOOL_COUNT`.
- Do not let partial tools return fake success.
- Do not mix HTTP, MCP, and Cocos scene runtime logic in one file.
- Do not use `ignoreDeprecations` to silence TypeScript module-resolution deprecation warnings.
