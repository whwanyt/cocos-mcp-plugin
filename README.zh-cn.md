<div align="center">

# 🧩 cocos-mcp-plugin

**面向 Cocos Creator 的 Streamable HTTP MCP 插件**

[English](README.md) | [简体中文](README.zh-cn.md)

![Cocos Creator](https://img.shields.io/badge/Cocos%20Creator-Extension-55C2E1?style=for-the-badge)
![MCP](https://img.shields.io/badge/MCP-2025--06--18-7C3AED?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Transport](https://img.shields.io/badge/Transport-Streamable%20HTTP-16A34A?style=for-the-badge)
![Tools](https://img.shields.io/badge/Tools-173-F97316?style=for-the-badge)

</div>

`cocos-mcp-plugin` 运行在 Cocos Creator 内部，并在编辑器主进程中启动本地 MCP 服务。外部 MCP 客户端可以通过标准 MCP 协议读取和控制场景、节点、组件、资源、构建配置、编辑器选择集与编辑器状态。

项目目标不是堆叠编辑器脚本，而是提供一个紧凑、可测试、可扩展的插件内核：协议、传输、注册表、编辑器桥接、工具业务、场景贡献和面板 UI 都有清晰边界。

## ✨ 亮点

| 领域 | 能力 |
| --- | --- |
| **本地优先服务** | 默认绑定 `127.0.0.1`，并校验本地 Origin。 |
| **Streamable HTTP** | 实现 MCP `2025-06-18`，支持 `POST /mcp`、`GET /mcp`、`DELETE /mcp`、`GET /health`。 |
| **工具 Profile** | 默认 `core` profile 暴露稳定高频工具，`full` profile 保留完整兼容目录。 |
| **风险控制** | 危险工具默认关闭，必须在面板中显式开启并重启服务。 |
| **强类型架构** | strict TypeScript、Cocos 官方编辑器/引擎类型、可测试的 `EditorBridge` 边界。 |
| **双语文档** | 默认英文文档，并提供对应的简体中文 `.zh-cn.md` 版本。 |

## 🧭 一览

| 项目 | 值 |
| --- | --- |
| 协议版本 | `2025-06-18` |
| 默认端点 | `http://127.0.0.1:3000/mcp` |
| 默认 profile | `core` |
| 完整工具目录 | `173` 个工具 |
| Typed editor messages | 本地 `@cocos/creator-types/editor` 提供 `97` 个 |
| 面板菜单 | `Extension / Cocos Mcp Plugin / Open Panel` |

## 🧰 工具领域

| Namespace | 能力 |
| --- | --- |
| `scene` | 场景列表、打开、保存、层级读取 |
| `node` | 查询、创建、移动、复制、重命名、激活状态、transform |
| `component` | 查询、添加/删除、属性读取和写入 |
| `project` | 项目信息、资源查询/搜索、刷新、构建设置 |
| `sceneView` | 视图状态、gizmo、网格、相机聚焦 |
| `debug` | 编辑器信息、日志、性能、场景校验 |
| `server` | 本地服务状态和网络信息 |
| `editor` | 编辑器选择集、能力摘要、typed `Editor.Message` raw bridge |
| `scene` raw bridge | 基于类型目录的 scene runtime 调用与通用组件 get/set |
| `tool` | 完整工具目录查询 |

## 🚀 快速开始

```bash
npm install
npm run build
npm test
```

`npm test` 会启动本地 HTTP transport 测试，并监听 `127.0.0.1:39876`。部分环境需要授予本地端口监听权限。

## 🎮 在 Cocos Creator 中使用

1. 执行 `npm run build`，确认生成 `dist/`。
2. 将本目录作为 Cocos Creator 扩展加载。
3. 从菜单打开面板：

```text
Extension / Cocos Mcp Plugin / Open Panel
```

面板提供：

| 控制项 | 用途 |
| --- | --- |
| Start / Stop | 控制本地 MCP 服务。 |
| Endpoint copy | 复制当前 MCP 端点。 |
| Core / Full | 切换当前工具暴露 profile。 |
| Dangerous Tools | 显式启用高风险工具。 |
| Apply & Restart | 保存 profile 设置并重启服务。 |
| Tool filters | 按 profile、risk、status 过滤工具目录。 |

## 🔌 MCP 客户端连接

健康检查：

```http
GET http://127.0.0.1:3000/health
```

MCP 端点：

```text
http://127.0.0.1:3000/mcp
```

客户端首次请求需要调用 `initialize`。服务会返回 `Mcp-Session-Id`，后续请求需要携带：

```text
Mcp-Session-Id: <session-id>
MCP-Protocol-Version: 2025-06-18
```

常用工具：

| 工具 | 用途 |
| --- | --- |
| `tool_get_catalog` | 查看完整工具目录，包括被禁用工具和禁用原因。 |
| `editor_get_capabilities` | 查看当前 profile、暴露数量、危险工具数量和 partial 数量。 |
| `editor_get_message_catalog` | 查看 typed 与 package-specific 的 `Editor.Message` 能力。 |
| `editor_call_message` | 在 `full` profile 中调用通过校验的 typed `Editor.Message`。 |
| `scene_get_runtime_catalog` | 查看从 Cocos engine 类型提取的 runtime 能力。 |
| `scene_call_runtime` | 通过 scene contribution 调用受支持的 scene runtime 能力。 |

## 🛡️ Profile 与风险控制

工具注册和 MCP 暴露是分开的：

- registry 永远保留完整 catalog。
- `tools/list` 只返回当前 profile 允许暴露的工具。
- 调用被 profile 禁用的工具时，会返回结构化错误：`Tool disabled by active profile`。

Profile：

| Profile | 说明 |
| --- | --- |
| `core` | 默认 profile，只暴露稳定高频工具。 |
| `full` | 完整兼容 profile，暴露更广的工具目录。 |

危险工具默认关闭。只有在面板中开启 `Dangerous Tools` 并重启服务后才会暴露。典型危险工具包括：

- 执行脚本：`debug_execute_script`、`sceneAdvanced_execute_scene_script`
- 删除和批量删除
- 偏好重置或导入
- 环境修改类操作
- 纹理压缩等成本较高的资源操作

## 🏗️ 架构分层

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

关键约束：

- 工具模块不能直接访问全局 `Editor`。
- 只有 `source/core/editor/cocos-editor-bridge.ts` 负责封装 Cocos Editor API。
- transport 层不能直接调用工具 handler。
- protocol 层不感知 HTTP 请求和响应对象。
- panel 层只调用主进程 message。

完整架构说明见 [docs/architecture.zh-cn.md](docs/architecture.zh-cn.md)。

## 🧪 扩展工具

1. 在对应 `source/tools/*-tools.ts` 中添加 tool spec。
2. 工具名使用 snake_case，最终 MCP 暴露名为 `namespace_toolName`。
3. 使用 toolkit helper 声明 `inputSchema`；它们会保留 MCP 对外 JSON Schema，并附加隐藏的 Zod 校验。
4. handler 只通过 `context.editor` 调用 Cocos 能力。
5. 确认 `risk`、`profile`、`destructive` 元数据正确。
6. 更新 `source/tools/index.ts` 中的 `EXPECTED_TOOL_COUNT`。
7. 如果 Cocos 类型目录发生变化，运行 `npm run generate:capabilities`。
8. 添加或更新测试。
9. 运行 `npm run build` 和 `npm test`。

如果工具能力还不完整，必须标记为 `partial` 或 `unavailable`，不能返回假成功。

## 📜 项目脚本

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 构建 Cocos 扩展产物。 |
| `npm run generate:capabilities` | 从本地 Cocos 类型包重新生成 `generated/cocos-capabilities.json`。 |
| `npm run watch` | 开发时持续构建。 |
| `npm test` | 运行 registry、protocol、transport 和 bridge 测试。 |

## 🔗 链接

| 文档 | 说明 |
| --- | --- |
| [架构文档](docs/architecture.zh-cn.md) | 分层、契约与扩展规则。 |
| [Agent 指南](AGENTS.zh-cn.md) | 后续编码 agent 的工作规范。 |
| [英文 README](README.md) | 英文文档入口。 |

## ✅ 开发约定

- 使用 strict TypeScript。
- 使用 `module: "Node16"` 和 `moduleResolution: "Node16"`。
- 不使用 `any`；未知输入使用 `unknown` 并在边界处收窄。
- 不使用运行时目录扫描注册工具。
- 不用 `ignoreDeprecations` 掩盖 TypeScript 弃用配置。
- 修改 registry、protocol、transport、工具数量后必须运行测试。
