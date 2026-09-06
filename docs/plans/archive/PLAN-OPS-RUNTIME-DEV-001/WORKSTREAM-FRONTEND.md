---
kind: workstream
id: WORKSTREAM-OPS-RUNTIME-FRONTEND
status: completed
plan_id: PLAN-OPS-RUNTIME-DEV-001
role: frontend-core
owner: frontend-core
depends_on: [WORKSTREAM-OPS-RUNTIME-PRODUCT, WORKSTREAM-OPS-RUNTIME-MOCK]
write_set: [web/common/, 必要 composition root]
last_reviewed: 2026-09-06
---

# 前端 Client/Data 注入与 interceptor

## 目标

让 `common/data` 支持创建时注入指定 Client；Client/Transport 支持请求拦截器，配合 ops 注入运行配置。

## 输出

- 基于现有接缝扩展：`web/common/client/client.ts` 的 `createClient(transport)`、`web/common/data/transport.ts` 的 `createJsonTransport(fetcher)`（当前 `browser.ts` 是模块级单例，无注入点）；
- 调试 Client 通过拦截器附加 Mock session header（如 `X-Blog-Mock-Session`）；
- composition root 按运行配置选择 Client，Vite 代理目标沿用 `BLOG_API_ORIGIN` 接缝（`web/vite.config.ts`）。

## 约束

- 页面和领域模型不泄漏 Mock 专用类型；
- 不引入第三方路由/状态/UI 框架（遵循 ARCH-FRONTEND）。

## 验收

- `dev` 模式前端只连接 Mock server；
- 同一显式 session 跨页面、刷新保持状态。

## 交付记录

### 2026-09-06 frontend-core：Transport/Client 拦截器与 Mock session 注入

修改范围（write set：`web/common/` + composition root；未触碰 `crates/`、`ops/src/`）：

- `web/common/data/transport.ts`
  - `TransportRequest` 新增 `headers?: Readonly<Record<string, string>>`：缺省沿用既有 transport 默认（带 JSON body 时补 `Content-Type: application/json`）；
  - 新增 `TransportRequestInterceptor = (request: TransportRequest) => TransportRequest`（纯变换，JSDoc 约束不得抛异常、不得隐藏副作用）与 `JsonTransportOptions = { fetcher, interceptors }`（整体 Required 语义）；
  - `createJsonTransport(input?: typeof fetch | JsonTransportOptions)`：既有两种调用形态 `createJsonTransport()` / `createJsonTransport(fetcher)` 行为不变，新增 options 形态；拦截器按注入顺序在发送前应用，`Content-Type` 在合并时最后写入。
- `web/common/client/mock-session.ts`（新增）：`readMockSessionFromLocation(search)` 读取 `mock-session` 查询参数（缺参/空值返回 `undefined`）；`createMockSessionInterceptor({ readSessionId })` 在显式 session 存在时附加 `X-Blog-Mock-Session`，否则原样返回同一请求对象。该模块**未**加入 `client/index.ts` 再导出。
- `web/common/client/browser.ts`（composition root）：`browserClient` 的 transport 由 `createJsonTransport()` 改为注入 session 拦截器的 options 形态；导出名与 `Client` 类型不变，`desktop/src`、`mobile/src` 共 11 处页面 import 零改动。
- `web/common/client/mock-session.test.ts`（新增）、`web/common/data/core.test.ts`（追加 2 个 transport 拦截器测试）、`web/package.json`（`test:core` 追加新测试文件）。

Session 策略与"是否 dev"的判断理由：

- 参数名为 URL 查询参数 `mock-session`（显式、可分享、刷新保持）；缺参或空值时不附加任何 header，正常用户零感知。
- composition root **无条件**装配拦截器，不做运行模式判断：无参数时拦截器是恒等变换，非 dev 场景（`integration` 构建产物、正常访问）请求与改造前完全一致，因此不需要新增运行模式 flag、构建期 define 或新的注入变量（对齐 SPEC-OPS-RUNTIME-001-ENV-003 注入面收敛）。session id 在每次请求时读取，页面跳转、刷新与改参数立即生效。
- `web/vite.config.ts` 的 `BLOG_API_ORIGIN` 接缝未改动：页面仍只发起相对 `/api` 请求，代理目标由 ops 注入 Vite 进程（SPEC-OPS-RUNTIME-001-ENV-001 / PORT-005）。

类型不泄漏手段：

- Mock 词汇只存在于注入层两个文件：`mock-session.ts`（header 名与查询参数名常量）与 `browser.ts`（装配处注释）；`mock-session.ts` 不经 `client/index.ts` 再导出，页面无法 import；
- 拦截器抽象 `TransportRequestInterceptor` 定义在 `data/transport.ts`，不携带 Mock 语义；页面与领域模型（`client/client.ts`、`client/domain.ts`、`contracts/domain.ts`）零改动；
- 自动化护栏：`mock-session.test.ts` 遍历 `desktop/`、`mobile/`、`common/`、`solid/` 的 `.ts`/`.tsx` 源码（排除 `*.test.ts` 与注入层两文件），断言大小写不敏感的 `mock` 词汇零出现（SPEC-OPS-RUNTIME-001-ENV-003）。

测试（red-green-refactor：先写测试确认失败，再实现）：

```text
pnpm --filter blog-web run test:core    # 22 pass / 0 fail（原 12 + 新增 10）
pnpm --filter blog-web run typecheck    # 通过
pnpm --filter blog-web run lint         # 通过（oxlint --deny-warnings）
pnpm --filter blog-web run format:check # 通过（biome）
pnpm --filter blog-web run build        # 通过
```

新增覆盖：session 读取有/无参数两分支、拦截器附加/恒等/保留既有 header/逐请求重读 session、transport 按序应用拦截器、POST body 与 `Content-Type` 合并、真实 HTTP 服务（`node:http`，`127.0.0.1` 随机端口）验证 `X-Blog-Mock-Session` 实际上线、无参时该 header 不发送、源码词汇边界断言。

人工验证（不依赖 Mock binary）：临时脚本 stub `globalThis.location` 与 `fetch`（前缀 origin 代替 Vite 代理）并起 `node:http` 最小服务，走真实 `browserClient` 调用 `articleCatalog.listPublishedArticles` / `adminArticles.list` / `taxonomy.listTypes`，观察到 `x-blog-mock-session` 逐请求附加、跨"页面"保持同一 session、无参数时不发送；脚本已删除，不进入仓库。

未决项：

- 拦截器"不得抛异常"仅由 JSDoc 约束，`Transport.request` 未做防御性捕获（当前唯一实现是纯函数且被测试覆盖）；若后续注入不可信拦截器，需在 transport 层把异常映射为 `Result` 错误。
- `TransportRequest` 的可选字段（`body?`/`timeoutMs?`/`headers?`）延续既有"缺省即默认"的协议边界，未重构为可辨识 union，以避免扩大本期改动面（GUIDE-TYPESCRIPT-STYLE 整体 Required/Partial 规则的局部例外）。
- `ops runtime dev` 真实进程下的端到端验收（Mock 场景切换、跨刷新状态、会话失效边界）归 TESTING 工作流；本工作流只交付拦截器与注入点。
- `docs/architecture/frontend.md` / `docs/architecture/data-and-api.md` 是否补记 interceptor 与注入点描述归 PM（本工作流 write set 不含 `docs/architecture/`）。
