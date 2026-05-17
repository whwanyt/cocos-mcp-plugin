# cocos-mcp-plugin 架构设计与扩展规范

[English](architecture.md) | 简体中文

## 1. 项目定位

`cocos-mcp-plugin` 是一个运行在 Cocos Creator 扩展主进程内的 TypeScript MCP Server。它通过本地 `127.0.0.1` HTTP 服务暴露 MCP `2025-06-18` Streamable HTTP 端点，使外部 AI 客户端可以通过标准 MCP 协议控制 Cocos Creator 编辑器。

本项目采用清晰分层、强类型接口和可插拔 transport 的架构实现。

核心目标：

- 提供稳定命名的 173 个 MCP tools，并通过 typed raw bridge 覆盖完整 Cocos 控制能力。
- 将 MCP 协议、HTTP transport、工具注册、编辑器访问、工具业务拆开。
- 默认运行在 Cocos 插件内，但 core 保持可测试、可迁移、可扩展。
- 首期复杂工具允许 `partial`，但必须显式暴露状态，禁止假成功。

## 2. 运行链路

当前链路如下：

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

Cocos 扩展入口：

- `package.json` 的 `main` 指向 `dist/main.js`。
- `source/main.ts` 导出 Cocos extension `methods`、`load`、`unload`。
- `source/scene.ts` 是 `contributions.scene.script`，用于执行必须进入场景上下文的少量方法。

MCP 端点：

- `GET /health`：健康检查。
- `POST /mcp`：接收 JSON-RPC request / notification / response。
- `GET /mcp`：打开 SSE 流。
- `DELETE /mcp`：终止 MCP session。
- `OPTIONS`：CORS 预检。

## 3. 目录结构

```text
source/
  main.ts                       # Cocos 插件主进程入口，负责组装 core 并启动服务
  scene.ts                      # Cocos scene contribution，仅放场景上下文能力
  index.ts                      # 对外统一导出
  panels/
    default/
      index.ts                  # Cocos dockable panel 入口
  types/
    index.ts                    # 所有跨层共享类型
  core/
    logger.ts                   # Logger 实现
    index.ts                    # core 统一导出
    editor/
      cocos-editor-bridge.ts    # Cocos Editor API 访问适配器
    protocol/
      json-rpc.ts               # JSON-RPC 判断与响应工具
      mcp-router.ts             # MCP method 路由
      session-manager.ts        # MCP session 管理
    registry/
      tool-registry.ts          # 工具注册、校验、执行
    transport/
      http-streamable-transport.ts # Streamable HTTP transport
  tools/
    index.ts                    # 显式注册所有工具模块，并校验工具总数
    toolkit.ts                  # 工具声明辅助函数
    capability-catalog.ts       # typed Editor.Message 与 engine runtime 能力目录
    transform-utils.ts          # 2D/3D transform 参数规范化
    *-tools.ts                  # 按领域拆分的 ToolModule
  test/
    run-tests.ts                # 无 Cocos 依赖的 core/协议/HTTP 测试
scripts/
  extract-cocos-capabilities.js # 本地 @cocos/creator-types 能力目录提取脚本
generated/
  cocos-capabilities.json       # 生成的能力摘要
static/
  template/default/index.html   # 默认面板模板
  style/default/index.css       # 默认面板样式
```

生成目录：

- `dist/`：插件运行产物。
- `dist-test/`：测试编译产物。
- `node_modules/`：依赖目录，不写业务代码。

## 4. 分层职责

### 4.1 types 层

位置：`source/types/index.ts`

职责：

- 定义跨层协议类型、工具类型、transport 类型、EditorBridge 类型。
- 所有层之间只依赖这里的公共接口，避免互相导入实现类。

核心类型：

- `ToolDefinition`
- `ToolModule`
- `ToolExecutor`
- `ToolContext`
- `EditorBridge`
- `TransportAdapter`
- `StreamWriter`
- `JsonRpcRequest`
- `McpServerSettings`

规范：

- 新增跨层对象时，优先放在 `types/index.ts`。
- 不要在工具模块中定义重复的公共类型。
- `JsonObject` / `JsonValue` 用于 MCP 协议边界，不要传入函数、类实例、循环引用对象。

### 4.2 core/editor 层

位置：`source/core/editor/cocos-editor-bridge.ts`

职责：

- 封装 Cocos 全局 `Editor`。
- 为工具模块提供稳定访问面。
- 隔离 Cocos API，使工具可以用 fake bridge 测试。

唯一允许的编辑器访问接口：

```ts
request(channel, message, ...args)
send(channel, message, ...args)
executeSceneScript(method, args, extensionName)
getSelection(type)
setSelection(type, uuids)
projectInfo()
paths()
```

规范：

- 工具模块禁止直接访问全局 `Editor`。
- 如果需要新的编辑器能力，先扩展 `EditorBridge`，再在 `CocosEditorBridge` 实现。
- 只有 `cocos-editor-bridge.ts` 可以直接声明和使用 `Editor`。

### 4.3 core/registry 层

位置：`source/core/registry/tool-registry.ts`

职责：

- 接收显式注册的 `ToolModule`。
- 保存完整工具 catalog，并按当前 profile 生成 MCP 可暴露的 tools list。
- 校验工具名唯一、schema 可序列化、handler 完整。
- 根据 `tools/call` 执行 handler。

规范：

- 所有工具必须通过 `registerAllTools` 显式注册。
- 不做运行时目录扫描，不做动态 `require` 自动发现。
- 工具完整名称由 `namespace_toolName` 生成，例如 `scene_get_current_scene`。
- 缺 handler 直接启动失败，不能把问题留到运行时。
- `tools/list` 只返回当前 `ToolExposureConfig` 允许暴露的工具。
- 被 profile 或危险工具开关禁用的工具，`tools/call` 返回结构化错误，不返回未知工具。

### 4.4 core/protocol 层

位置：`source/core/protocol/*`

职责：

- 处理 JSON-RPC 2.0 请求、通知、响应。
- 处理 MCP methods：`initialize`、`ping`、`tools/list`、`tools/call`。
- 管理 MCP protocol version：`2025-06-18`。
- 将协议请求转换为 registry 调用。

规范：

- `mcp-router.ts` 不应知道 HTTP 细节。
- 新增 MCP method 时，只改 protocol 层，不改 transport。
- JSON-RPC 错误码在 protocol 层统一返回。
- `tools/call` 的工具结果统一封装为 MCP content text。

### 4.5 core/transport 层

位置：`source/core/transport/http-streamable-transport.ts`

职责：

- 实现 Streamable HTTP。
- 管理 HTTP headers、CORS、Origin 校验、session header、SSE 响应。
- 将 HTTP body 转换为 `JsonRpcMessage` 交给 `McpRequestRouter`。

当前实现：

- `POST /mcp`：普通 JSON 或 `text/event-stream` 响应。
- `GET /mcp`：打开 SSE。
- `DELETE /mcp`：删除 session。
- `GET /health`：健康检查。

规范：

- transport 不允许直接执行工具。
- transport 不允许直接访问 Cocos `Editor`。
- 新增 transport 时实现 `TransportAdapter`，复用 `McpRequestRouter` 和 `ToolRegistry`。

未来 transport 示例：

- `StdioTransportAdapter`
- `SseTransportAdapter`
- `WebSocketTransportAdapter`

### 4.6 tools 层

位置：`source/tools/*`

职责：

- 按领域声明 MCP tools。
- 提供 tool schema、description、status、risk、profile 和 handler。
- 只通过 `ToolContext.editor` 调用 Cocos 能力。

工具模块格式：

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

工具状态：

- `implemented`：真实可用，失败时返回真实错误。
- `partial`：已注册或部分可用，但当前版本还未完整覆盖目标能力。
- `unavailable`：当前版本不可用。

规范：

- 不完整工具必须标记 `partial` 或 `unavailable`。
- 不允许用空对象伪装成功。
- handler 返回 `ToolResponse`，成功用 `ok(...)`。
- schema 必须是 JSON object schema。
- 工具名保持 snake_case，namespace 使用既有目录名。
- 节点和 prefab transform 必须使用 `transform-utils.ts` 统一规范化。
- 2D 节点 position 允许 `{ x, y }`，写入 Cocos `cc.Node.position` 前必须自动补 `z: 0`。
- UITransform 尺寸通过通用组件属性工具处理，不新增独立 content size 工具。

Raw bridge 工具：

- `editor_get_message_catalog`：返回 typed 与 package-specific 的 `Editor.Message` 能力。
- `editor_call_message`：调用 `Editor.Message` 前校验 channel、message、参数数量、基础参数形态和危险能力策略。
- `scene_get_runtime_catalog`：返回从 `@cocos/creator-types/engine` 提取的 runtime 能力。
- `scene_call_runtime`：通过 `source/scene.ts` 调用已支持且通过校验的 runtime 条目。
- `scene_get_component_property` 和 `scene_set_component_property`：基于稳定 component dump path 的通用组件属性访问入口。

### 4.7 scene contribution 层

位置：`source/scene.ts`

职责：

- 运行在 Cocos scene 上下文。
- 提供必须访问 `cc` runtime 的方法。

当前方法：

- `getCurrentSceneInfo`
- `getSceneHierarchy`
- `executeScript`
- `callRuntime`

规范：

- 这里只放必须进入 scene 上下文的能力。
- 不要把 MCP、HTTP、registry 逻辑放进 `scene.ts`。
- 新增方法后，必须同步更新 `package.json -> contributions.scene.methods`。

### 4.8 panels 层

位置：`source/panels/default/index.ts`

职责：

- 提供 Cocos Creator 内部 dockable 面板。
- 展示 MCP 服务状态、endpoint、session 数、工具数和工具列表。
- 通过 `Editor.Message.request('cocos-mcp-plugin', ...)` 调用主进程 message。

静态资源：

- `static/template/default/index.html`
- `static/style/default/index.css`

规范：

- panel 只负责 UI 和主进程 message 调用。
- panel 不允许直接创建 transport、registry 或 tool handler。
- panel 不允许直接访问工具实现文件。
- 新增面板入口时，必须同步更新 `package.json -> panels`。
- 新增面板 message 时，必须同步更新 `package.json -> contributions.messages` 和 `source/main.ts`。

## 5. 代码规范

### 5.1 TypeScript

- 使用 strict mode。
- `module` 和 `moduleResolution` 使用 `Node16`，避免 TypeScript 7 弃用问题。
- Cocos 插件运行产物仍由 package 默认 CommonJS 行为承载。
- 禁止使用 `any`；未知输入使用 `unknown`，并通过结构化接口、类型守卫或显式解析函数收窄。

### 5.2 命名

- 文件名：kebab-case，例如 `http-streamable-transport.ts`。
- 类名：PascalCase，例如 `ToolRegistry`。
- 函数名：camelCase，例如 `registerAllTools`。
- MCP 工具名：`namespace_snake_case`，例如 `node_get_all_nodes`。
- 工具 module namespace：保持既有 catalog，例如 `scene`、`node`、`assetAdvanced`。

### 5.3 依赖方向

允许：

```text
main -> core + tools + types
transport -> protocol + session + types
protocol -> registry + types
registry -> types
tools -> types + toolkit
tools -> ToolContext.editor
editor bridge -> Cocos Editor
```

禁止：

```text
tools -> global Editor
transport -> tools
transport -> Cocos Editor
protocol -> HTTP req/res
scene.ts -> MCP router / HTTP server
```

### 5.4 错误处理

- 工具 handler 内能预期的失败返回 `{ success: false, error }`。
- 非预期异常可以抛出，由 `McpRequestRouter` 包装为 JSON-RPC error。
- 不要吞掉 Cocos API 错误后返回成功。
- 对外错误信息要说明失败对象，例如工具名、asset path、node uuid。

### 5.5 安全默认值

- HTTP 服务默认只绑定 `127.0.0.1`。
- Origin 默认只允许本地来源。
- 支持 `authToken` 配置，但默认不开启。
- `debug_execute_script` 和 `sceneAdvanced_execute_scene_script` 是高权限能力，应默认关闭。

## 6. 工具暴露模型

Registry 和 MCP 暴露面是分离的：

- registry 始终保留完整 catalog。
- `tools/list` 只返回当前已暴露工具。
- `tool_get_catalog` 返回完整 catalog、启用状态和禁用原因。
- `editor_get_capabilities` 返回当前 profile 和工具数量。

Profile：

- `core`：默认 profile，暴露稳定高频工具。
- `full`：用于更完整控制面的 profile。
- `internal`：不通过默认 MCP `tools/list` 暴露。

风险等级：

- `safe`
- `write`
- `destructive`
- `exec`
- `environment`
- `internal`

危险工具只有 `allowDangerous=true` 时才暴露。危险能力包括 `destructive`、`exec`、`environment`，以及显式标记 destructive 的工具。Raw bridge 位于 `full` profile，但每次调用仍按具体 capability 的风险判断：危险 `Editor.Message` 或危险 runtime 条目仍需要开启 Dangerous Tools。

## 7. 如何扩展工具层

### 7.1 在已有 namespace 下新增工具

以新增 `scene_query_dirty_reason` 为例：

1. 打开对应文件：`source/tools/scene-tools.ts`。
2. 在 `createToolModule('scene', [...])` 的数组中添加 spec。
3. 写清楚 `name`、`description`、`inputSchema`、`handler`。
4. handler 只通过 `context.editor` 调用 Cocos。
5. 更新 `EXPECTED_TOOL_COUNT`。
6. Cocos 类型包或能力目录变化时运行 `npm run generate:capabilities`。
7. 在 `source/test/run-tests.ts` 补充必要测试。
8. 运行：

```bash
npm run build
npm run generate:capabilities
npm test
```

示例：

```ts
{
  name: 'query_dirty_reason',
  description: 'Query why current scene is dirty',
  inputSchema: objectSchema(),
  status: 'partial',
  handler: async (_args, context) => {
    const dirty = await context.editor.request('scene', 'query-dirty');
    return ok({ dirty });
  },
}
```

### 7.2 新增 namespace

1. 新建 `source/tools/new-domain-tools.ts`。
2. 导出 `createNewDomainTools(): ToolModule`。
3. 在 `source/tools/index.ts` 中 import 并加入 `registerAllTools` 列表。
4. 更新 `EXPECTED_TOOL_COUNT`。
5. 为该 namespace 加 registry 数量和至少一个 handler 测试。

注意：

- namespace 会成为工具名前缀。
- 一旦对外发布，工具名不要随意改。

### 7.3 将 partial 工具补成 implemented

1. 找到工具 spec。
2. 补真实 handler。
3. 将 `status` 改为 `implemented`，或移除 status 让 `createToolModule` 自动推断。
4. 增加 fake bridge 测试，验证调用的 channel/message/args。
5. 如果涉及 Cocos 真实环境，再补手工验收步骤。

## 8. 如何扩展 EditorBridge

当工具需要新的编辑器访问能力时：

1. 修改 `source/types/index.ts` 的 `EditorBridge` 接口。
2. 修改 `source/core/editor/cocos-editor-bridge.ts` 实现。
3. 修改测试里的 `FakeEditorBridge`。
4. 工具层通过 `context.editor.newMethod(...)` 调用。

原则：

- 只把稳定、可复用的能力放进 EditorBridge。
- 单个工具专用的简单消息仍可直接用 `request(channel, message, ...args)`。
- 如果某个能力需要复杂参数规范化，可以封装为 bridge 方法。

## 9. 如何扩展 MCP 协议层

新增 MCP method 时：

1. 修改 `source/core/protocol/mcp-router.ts`。
2. 在 `handleRequest` 中增加 case。
3. 如果 method 需要 session 状态，不要在 router 直接读 HTTP header，应由 transport/session 层传入上下文。
4. 添加协议测试。

示例适用场景：

- `resources/list`
- `resources/read`
- `prompts/list`
- `prompts/get`

当前不建议提前实现这些能力，除非产品上明确需要。

## 10. 如何扩展 transport 层

新增 transport 时：

1. 新建 `source/core/transport/*-transport.ts`。
2. 实现 `TransportAdapter`：

```ts
interface TransportAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): TransportStatus;
}
```

3. 复用同一个 `McpRequestRouter`。
4. 不要在 transport 中引入工具模块。
5. 给 transport 写独立测试。

示例：新增 stdio transport 的结构：

```text
StdioTransportAdapter
  -> read line from stdin
  -> parse JsonRpcMessage
  -> router.route(message)
  -> write JsonRpcResponse to stdout
```

## 11. 测试规范

当前测试命令：

```bash
npm run build
npm run generate:capabilities
npm test
```

测试覆盖要求：

- registry 工具数量必须等于 `EXPECTED_TOOL_COUNT`。
- 工具名必须唯一。
- schema 必须可 JSON 序列化。
- `initialize` 返回 `2025-06-18`。
- `tools/list` 返回当前 profile 暴露的工具，完整目录通过 `tool_get_catalog` 查询。
- `tools/call` 能调用 fake bridge。
- notification 返回 accepted。
- HTTP transport 验证 session、SSE、DELETE。
- 2D 节点 transform 会将 `{ x, y }` 适配为 `{ x, y, z: 0 }`。
- raw bridge 工具会拒绝未知 method 和非法参数形态。

新增工具或暴露规则时至少补一种测试：

- 纯 registry 只读工具：验证 tools/list 中存在。
- 有 handler 的工具：fake bridge 验证调用路径。
- profile 相关工具：验证 core/full/dangerous 暴露差异。
- 新 transport：验证 start/stop 和请求路由。
- 新协议 method：验证 JSON-RPC response。

## 12. 当前工具实现状态

已完整注册 173 个工具，启动时强校验。

当前本地 Cocos 类型目录显示：

- `@cocos/creator-types/editor` 提供 `97` 个 typed editor messages。
- runtime catalog 从 `@cocos/creator-types/engine` 提取，并与当前 scene runtime 已支持调用合并。

工具暴露策略：

- 完整 catalog 始终保留。
- 默认 `core` profile 只暴露稳定高频工具。
- `full` profile 暴露完整兼容能力。
- `exec`、`destructive`、`environment` 风险工具默认禁用，需要面板打开 Dangerous Tools 并重启服务。
- `tool_get_catalog` 用于查看完整 catalog、启用状态和禁用原因。
- `editor_get_capabilities` 用于查看当前 profile、危险工具开关和工具数量。

优先 implemented 的能力：

- 场景查询、场景列表、打开/保存/关闭场景、层级查询。
- 节点查询、创建、移动、删除、复制、transform 设置。
- 组件增删查、脚本挂载请求、组件属性设置请求。
- 项目信息、资源查询/创建/复制/移动/删除/保存/重导入。
- 服务器信息、网络接口、连通性检查。
- editor selection、capabilities、typed message catalog、raw message bridge、runtime catalog、runtime bridge 和完整工具 catalog。
- 节点 transform、节点创建、prefab 实例化的 2D/3D transform 规范化。
- 多数 sceneAdvanced / sceneView / referenceImage 可直接映射的 Editor.Message 调用。

仍需后续深化的方向：

- prefab 创建/更新的官方序列化格式。
- asset 依赖分析、未使用资源扫描、纹理压缩。
- broadcast 真正接入 Cocos broadcast listener。
- preferences import/reset 的完整策略。
- debug console 实时捕获。

这些工具已经以 `partial` 状态进入完整 catalog，是否对 MCP 客户端暴露由 profile 和危险工具开关决定。

## 13. 发布与集成注意事项

- Cocos 插件运行使用 `dist/main.js` 和 `dist/scene.js`。
- 修改源码后必须执行 `npm run build`。
- 如果更新 `contributions.scene.methods`，需要重启或重新加载 Cocos 扩展。
- 默认面板通过 `Editor.Panel.open('cocos-mcp-plugin')` 打开；面板入口在 `package.json -> panels.default.main` 指向 `./dist/panels/default/index.js`。
- MCP 客户端连接地址：

```text
http://127.0.0.1:3000/mcp
```

- 首次请求必须调用 `initialize`，后续请求带 `Mcp-Session-Id`。

## 14. 禁止事项

- 禁止工具模块直接访问全局 `Editor`。
- 禁止 transport 直接调用工具 handler。
- 禁止新增工具后不更新 `EXPECTED_TOOL_COUNT`。
- 禁止 partial 工具返回假成功。
- 禁止把 HTTP、MCP、Cocos scene runtime 逻辑混在同一个文件。
- 禁止为了通过 TypeScript 6/7 弃用提示使用 `ignoreDeprecations` 掩盖配置问题。
