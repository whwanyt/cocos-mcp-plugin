# AGENTS.md

[English](AGENTS.md) | 简体中文

## 项目身份

`cocos-mcp-plugin` 是一个全新的 TypeScript Cocos Creator MCP 插件工程。它运行在 Cocos Creator 扩展主进程内，通过本地 `127.0.0.1` Streamable HTTP `/mcp` 端点向 MCP 客户端暴露工具能力。

本项目的实现原则是：保持清晰分层、可测试、可扩展，所有新增能力都应基于当前工程结构演进。

开始任何实现前，请先阅读：

- `docs/architecture.md`
- `source/types/index.ts`
- `source/tools/index.ts`
- `source/core/transport/http-streamable-transport.ts`
- `source/core/protocol/mcp-router.ts`
- `source/core/registry/tool-registry.ts`

## 必须遵守的架构边界

当前分层固定如下：

- `source/types`：跨层共享类型。
- `source/core/editor`：唯一允许直接封装 Cocos 全局 `Editor` 的位置。
- `source/core/registry`：工具注册、校验、执行。
- `source/core/protocol`：JSON-RPC 与 MCP method 路由。
- `source/core/transport`：HTTP / SSE / session / CORS 等传输层逻辑。
- `source/tools`：工具声明和工具业务 handler。
- `source/panels`：Cocos Creator 面板 UI，只负责显示和调用主进程 message。
- `source/scene.ts`：Cocos scene contribution，只放必须进入场景上下文的能力。
- `source/main.ts`：Cocos 插件主进程入口，只负责装配和生命周期。

禁止事项：

- 禁止工具模块直接访问全局 `Editor`。
- 禁止 transport 层直接调用工具实现。
- 禁止 protocol 层感知 HTTP req/res。
- 禁止 panel 层直接创建 transport、registry 或调用工具 handler。
- 禁止把 MCP、HTTP、Cocos scene runtime 逻辑混在同一个文件。
- 禁止新增工具后不更新 `EXPECTED_TOOL_COUNT`。
- 禁止 partial 工具返回假成功。
- 禁止用 `ignoreDeprecations` 掩盖 TypeScript `moduleResolution=node10` 弃用问题。

## 工具扩展规则

所有工具必须通过 `ToolModule` 显式注册，不做运行时目录扫描。

新增工具时：

1. 在对应 `source/tools/*-tools.ts` 中添加 tool spec。
2. 工具名使用 snake_case，最终暴露名由 `namespace_toolName` 组成。
3. schema 必须是 JSON object schema。
4. handler 只通过 `context.editor` 调用 Cocos 能力。
5. 更新 `source/tools/index.ts` 中的 `EXPECTED_TOOL_COUNT`。
6. 确认 `risk`、`profile`、`destructive` 元数据正确；没有显式配置时会由 `toolkit` 自动推断。
7. Cocos 类型包或能力目录变化时运行 `npm run generate:capabilities`。
8. 添加或更新测试。
9. 运行 `npm run build` 和 `npm test`。

工具状态规则：

- `implemented`：真实实现且可用。
- `partial`：已注册或部分实现，但当前版本还未完整覆盖目标能力。
- `unavailable`：当前版本不可用。

如果工具没有完整实现，必须标记 `partial` 或 `unavailable`，并返回清晰错误或能力说明。

工具暴露规则：

- `ToolRegistry` 必须保留完整 catalog。
- `tools/list` 只返回当前 profile 允许暴露的工具。
- 默认 profile 是 `core`，危险工具默认关闭。
- `validation` 类内部工具不进入默认 MCP 暴露面。
- 执行脚本、删除、批量删除、偏好重置、环境修改类工具必须标记为危险或 full profile。
- 调用被 profile 禁用的工具时返回结构化错误，不能伪装成未知工具。

Raw control 规则：

- `editor_call_message` 调用 `Editor.Message` 前必须校验 channel、message、参数数量、基础参数形态和危险能力策略。
- `scene_call_runtime` 只能暴露可发现的 runtime catalog 条目，并且受支持 raw call 必须先校验再进入 scene context。
- Cocos typed catalog 变化时，应同步 `scripts/extract-cocos-capabilities.js` 与 `generated/cocos-capabilities.json`。

## EditorBridge 规则

工具模块只能通过 `ToolContext.editor` 访问编辑器。

如果需要新增编辑器访问能力：

1. 修改 `source/types/index.ts` 的 `EditorBridge` 接口。
2. 修改 `source/core/editor/cocos-editor-bridge.ts`。
3. 修改 `source/test/run-tests.ts` 中的 fake bridge。
4. 再从工具层调用新方法。

简单的一次性 Cocos 消息可以直接使用：

```ts
context.editor.request('scene', 'query-node-tree')
```

复杂、复用度高、需要参数规范化的能力应封装成 EditorBridge 方法。

## MCP 与 Transport 扩展规则

新增 MCP method：

- 修改 `source/core/protocol/mcp-router.ts`。
- 不要在 router 中写 HTTP 逻辑。
- 增加协议测试。

新增 transport：

- 在 `source/core/transport` 下新建 adapter。
- 实现 `TransportAdapter`。
- 复用 `McpRequestRouter`。
- 不要在 transport 中 import 工具模块。

当前默认 transport 是 `HttpStreamableTransport`，必须保持：

- `POST /mcp`
- `GET /mcp`
- `DELETE /mcp`
- `GET /health`
- `Mcp-Session-Id`
- `MCP-Protocol-Version`
- SSE `event: message`
- 本地 Origin 校验

## TypeScript 与代码风格

- 使用 strict TypeScript。
- `tsconfig.json` 使用 `module: "Node16"` 与 `moduleResolution: "Node16"`。
- 文件名使用 kebab-case。
- 类名使用 PascalCase。
- 函数和变量使用 camelCase。
- MCP 工具名使用 snake_case。
- 不使用 `any`；未知输入使用 `unknown` 并在边界处完成类型收窄。
- 不要引入无关依赖。
- 不要重构无关模块。

## 测试与验证

常用命令：

```bash
npm run build
npm run generate:capabilities
npm test
```

注意：`npm test` 会启动本地 HTTP transport 测试，可能需要允许监听 `127.0.0.1:39876`。

最低验证要求：

- 修改类型、core、tools、transport 后必须跑 `npm run build`。
- 修改 registry、protocol、transport 或工具数量后必须跑 `npm test`。
- 新增工具必须保证 registry 总数与 `EXPECTED_TOOL_COUNT` 一致。
- 修改工具暴露规则时必须覆盖 core/full/dangerous 三种场景。
- 新增 HTTP 行为必须补充 `source/test/run-tests.ts`。

## 当前关键事实

- 当前 MCP protocol version：`2025-06-18`。
- 当前工具总数：`173`。
- 当前 typed editor message 数量：`97`。
- 默认服务地址：`http://127.0.0.1:3000/mcp`。
- Cocos 插件入口：`dist/main.js`。
- Cocos scene contribution：`dist/scene.js`。
- 运行源码入口：`source/main.ts`。
- 架构说明文档：`docs/architecture.md`。

## 工作方式

后续 agent 接手任务时：

1. 先定位任务属于哪一层。
2. 只改对应层和必要测试。
3. 保持跨层依赖方向不变。
4. 对未完整实现的能力如实标记状态。
5. 最后报告修改内容和验证结果。
