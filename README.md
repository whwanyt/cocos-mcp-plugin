<div align="center">

# 🧩 cocos-mcp-plugin

**A Streamable HTTP MCP plugin for Cocos Creator**

[English](README.md) | [简体中文](README.zh-cn.md)

![Cocos Creator](https://img.shields.io/badge/Cocos%20Creator-Extension-55C2E1?style=for-the-badge)
![MCP](https://img.shields.io/badge/MCP-2025--06--18-7C3AED?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Transport](https://img.shields.io/badge/Transport-Streamable%20HTTP-16A34A?style=for-the-badge)
![Tools](https://img.shields.io/badge/Tools-166-F97316?style=for-the-badge)

</div>

`cocos-mcp-plugin` runs inside Cocos Creator and starts a local MCP service from the editor main process. External MCP clients can inspect and control scenes, nodes, components, assets, build settings, editor selection, and editor state through the standard MCP protocol.

The project is designed as a compact, testable plugin kernel: protocol, transport, registry, editor bridge, tool handlers, scene contribution, and panel UI are separated into clear layers.

## ✨ Highlights

| Area | What You Get |
| --- | --- |
| **Local-first server** | Binds to `127.0.0.1` by default and validates local origins. |
| **Streamable HTTP** | Implements MCP `2025-06-18` with `POST /mcp`, `GET /mcp`, `DELETE /mcp`, and `GET /health`. |
| **Tool profiles** | Default `core` profile exposes stable, high-frequency tools; `full` preserves the complete catalog. |
| **Risk control** | Dangerous tools are disabled by default and require an explicit panel toggle plus service restart. |
| **Typed architecture** | Strict TypeScript, official Cocos editor/engine types, and an `EditorBridge` boundary for testability. |
| **Bilingual docs** | Default English docs with matching Simplified Chinese `.zh-cn.md` versions. |

## 🧭 At A Glance

| Item | Value |
| --- | --- |
| Protocol version | `2025-06-18` |
| Default endpoint | `http://127.0.0.1:3000/mcp` |
| Default profile | `core` |
| Full catalog | `166` tools |
| Panel menu | `Extension / Cocos Mcp Plugin / Open Panel` |

## 🧰 Tool Areas

| Namespace | Capabilities |
| --- | --- |
| `scene` | Scene list, open/save, hierarchy |
| `node` | Query, create, move, duplicate, rename, active state, transform |
| `component` | Query, add/remove, property read/write |
| `project` | Project info, asset query/search, refresh, build settings |
| `sceneView` | View state, gizmo, grid, camera focus |
| `debug` | Editor info, logs, performance, scene validation |
| `server` | Local service status and network information |
| `editor` | Selection and capability summary |
| `tool` | Complete catalog inspection |

## 🚀 Quick Start

```bash
npm install
npm run build
npm test
```

`npm test` starts a local HTTP transport test on `127.0.0.1:39876`. Some environments require permission to bind that local port.

## 🎮 Use In Cocos Creator

1. Run `npm run build` and make sure `dist/` exists.
2. Load this directory as a Cocos Creator extension.
3. Open the panel from:

```text
Extension / Cocos Mcp Plugin / Open Panel
```

The panel provides:

| Control | Purpose |
| --- | --- |
| Start / Stop | Control the local MCP service. |
| Endpoint copy | Copy the active MCP endpoint. |
| Core / Full | Switch the active exposure profile. |
| Dangerous Tools | Explicitly enable high-risk tools. |
| Apply & Restart | Persist profile settings and restart the service. |
| Tool filters | Filter catalog rows by profile, risk, and status. |

## 🔌 MCP Client Connection

Health check:

```http
GET http://127.0.0.1:3000/health
```

MCP endpoint:

```text
http://127.0.0.1:3000/mcp
```

The first client request must call `initialize`. The server returns `Mcp-Session-Id`; following requests should include:

```text
Mcp-Session-Id: <session-id>
MCP-Protocol-Version: 2025-06-18
```

Useful tools:

| Tool | Purpose |
| --- | --- |
| `tool_get_catalog` | Inspect the full catalog, including disabled tools and reasons. |
| `editor_get_capabilities` | Inspect active profile, exposure count, dangerous count, and partial count. |

## 🛡️ Profiles And Risk Control

Tool registration and MCP exposure are separate:

- The registry always keeps the full catalog.
- `tools/list` only returns tools allowed by the active profile.
- Calls to profile-disabled tools return a structured `Tool disabled by active profile` error.

Profiles:

| Profile | Description |
| --- | --- |
| `core` | Default profile for stable, high-frequency tools. |
| `full` | Compatibility profile for the broader catalog. |

Dangerous tools stay disabled unless `Dangerous Tools` is enabled in the panel and the service is restarted. Typical dangerous tools include:

- Script execution: `debug_execute_script`, `sceneAdvanced_execute_scene_script`
- Delete and batch delete operations
- Preference reset or import operations
- Environment-changing operations
- Expensive asset operations such as texture compression

## 🏗️ Architecture

```text
source/main.ts
  -> core + tools + Cocos extension lifecycle

source/core/protocol
  -> JSON-RPC / MCP method routing

source/core/transport
  -> Streamable HTTP / SSE / session / CORS

source/core/registry
  -> tool catalog / profile filtering / tool execution

source/core/editor
  -> Cocos Editor API bridge

source/tools
  -> tool schema / metadata / handler

source/panels
  -> Cocos dockable panel UI

source/scene.ts
  -> scene contribution runtime
```

Key constraints:

- Tool modules must not access the global `Editor` directly.
- Only `source/core/editor/cocos-editor-bridge.ts` wraps Cocos Editor APIs.
- Transport must not call tool handlers directly.
- Protocol must not know HTTP request/response objects.
- The panel only calls main-process messages.

See [docs/architecture.md](docs/architecture.md) for the full architecture guide.

## 🧪 Add Or Extend Tools

1. Add the tool spec in the relevant `source/tools/*-tools.ts` file.
2. Use snake_case for the local tool name; the exposed MCP name is `namespace_toolName`.
3. Keep `inputSchema` as a JSON object schema.
4. Call Cocos only through `context.editor`.
5. Confirm `risk`, `profile`, and `destructive` metadata.
6. Update `EXPECTED_TOOL_COUNT` in `source/tools/index.ts`.
7. Add or update tests.
8. Run `npm run build` and `npm test`.

Incomplete tools must be marked as `partial` or `unavailable`; they must not return fake success.

## 📜 Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Build the Cocos extension output. |
| `npm run watch` | Rebuild while developing. |
| `npm test` | Run registry, protocol, transport, and bridge tests. |

## 🔗 Links

| Document | Description |
| --- | --- |
| [Architecture](docs/architecture.md) | Layering, contracts, and extension rules. |
| [Agent Guide](AGENTS.md) | Instructions for future coding agents. |
| [Chinese README](README.zh-cn.md) | Simplified Chinese documentation. |

## ✅ Development Rules

- Use strict TypeScript.
- Use `module: "Node16"` and `moduleResolution: "Node16"`.
- Do not use `any`; use `unknown` and narrow at boundaries.
- Do not register tools through runtime directory scanning.
- Do not use `ignoreDeprecations` to hide TypeScript deprecation warnings.
- Run tests after changing registry, protocol, transport, or tool counts.
