---
kind: guide
id: GUIDE-TYPESCRIPT-STYLE
status: current
owner: project-manager
last_reviewed: 2026-09-19
---

# TypeScript 可读性规范

## 目标和适用范围

本规范的目标是降低认知复杂度，让控制流、错误路径、边界条件和业务意图可以独立阅读。它适用于项目内所有人工维护的 TypeScript 和 TSX，包括 `src/frontend/common`、`src/frontend/solid`、Desktop、Mobile、Vite 配置、`apps/blog/src`、测试、脚本和工具代码。

本规范约束表达方式，不改变业务协议、运行时行为、页面架构或平台隔离边界。简单且无副作用的代码可以保持简洁；规则不是把某个语法一律列为禁用项。

规则使用以下等级：

- **必须**：提交前必须满足；例外必须有局部注释、理由和关联事项。
- **建议**：默认采用；偏离时在 Review 中说明取舍。
- **允许**：在条件满足时可以直接使用。
- **例外**：仅限明确列出的边界场景，不得扩大为全局豁免。

## 控制流和表达式

### 卫语句和早返回

**必须**让失败、无效输入和不适用分支尽早退出，避免把主路径埋在多层嵌套中。

```ts
function publish(article: Article): Result<void, PublishError> {
  if (article.status !== "draft") {
    return err({ kind: "already-published" });
  }

  if (article.title.trim() === "") {
    return err({ kind: "missing-title" });
  }

  return doPublish(article);
}
```

反例：先包住整段主逻辑，再在末尾处理多个失败条件。

```ts
if (article.status === "draft") {
  if (article.title.trim() !== "") {
    return doPublish(article);
  }
}
```

### 三元表达式

**允许**单一条件、无副作用、两侧短小且语义对称的三元表达式。

```ts
const label = isPublished ? "已发布" : "草稿";
```

**建议**在条件包含多个判断、任一分支需要阅读、或表达式继续嵌套时改用 `if`、卫语句或命名函数。**必须**避免嵌套三元表达式。

反例：

```ts
const message = isLoading
  ? "加载中"
  : hasError
    ? "加载失败"
    : "加载完成";
```

### `&&`、`||` 和 `??`

**允许**它们表达简单的纯值选择或默认值：

```ts
const terms = article.terms ?? [];
const title = input.title || "未命名文章";
```

**必须**把副作用写成显式控制流，不得用短路表达式隐藏调用、写入、状态变更或异常路径。

```ts
if (shouldSave) {
  await saveDraft();
}
```

反例：

```ts
shouldSave && saveDraft();
```

**建议**不要在一个表达式中叠加多个隐式分支。需要同时判断存在性、权限和状态时，使用命名布尔值或独立函数。

## 空值、类型和状态

### `undefined` 和 `null`

**必须**遵守领域协议：可选值使用 `undefined`，领域对象不使用 `null` 表示缺失。

外部 API、DOM 或第三方库返回的 `null` 只能在边界处归一化；归一化后不得继续向领域层传播两套缺失语义。

```ts
const summary = response.summary ?? undefined;
```

不得用真假值替代有业务含义的状态。空字符串、零和 `false` 只有在业务明确把它们定义为缺失时才可以作为缺失判断。

### Union、类型守卫和断言

**必须**优先使用可辨识 union、类型守卫和显式收窄表达状态边界。类型断言不能代替运行时验证。

```ts
type LoadState<T> =
  | { kind: "loading" }
  | { kind: "success"; value: T }
  | { kind: "error"; error: Error };

function renderState<T>(state: LoadState<T>): string {
  if (state.kind === "loading") {
    return "加载中";
  }
  if (state.kind === "error") {
    return state.error.message;
  }
  return String(state.value);
}
```

**建议**减少 `as` 和非空断言 `!`。只有在边界已经由可见的运行时条件保证时才允许使用，并在 Review 中说明保证来源。

### 对象类型的可选性

**必须**让一个 `type` 或 `interface` 的字段可选性，以及函数入参的可选性，具有明确的整体语义：默认要么全部必填（`Required` 语义），要么全部可选（`Partial` 语义）。不要在同一个对象类型、函数入参对象或函数参数列表中随意混合必填字段和可选参数，让调用方无法判断对象或调用是否完整。

```ts
type ArticlePatch = Partial<{
  title: string;
  summary: string;
  contentHtml: string;
}>;

interface ArticleRecord {
  id: number;
  title: string;
  summary: string;
  contentHtml: string;
}

function updateArticle(input: ArticlePatch): void {
  // input is an explicit Partial patch.
}

function createArticle(title: string, articleTypeId: number): void {
  // All parameters are required.
}

function listArticles(options?: Partial<ArticleFilter>): void {
  // Optionality is expressed by one explicit Partial options object.
}
```

**允许**在表达明确协议边界时混合可选性：例如固定 discriminant 加分支字段、外部响应的渐进归一化对象，或明确的 patch 输入及其函数入参。此时应优先使用可辨识 union，或通过命名和 Review 说明哪些字段由哪个边界保证。

反例：

```ts
interface UnclearArticle {
  id: number;
  title?: string;
  contentHtml?: string;
}
```

如果业务确实需要“部分字段必填、部分字段可选”，应拆成多个具有清晰职责的类型，或使用 union 表达不同状态，而不是把可选性混在一个无说明的对象类型里。

函数入参同样适用：优先让函数接收一个完整的 `Required` 对象，或一个语义明确的 `Partial` patch；普通参数列表默认全部必填，或通过一个统一的可选 options 对象表达全部可选。不要通过多个可选参数和必填参数的混合组合，制造调用顺序和默认值陷阱。

### `Result`、异常和错误边界

**必须**在同一个职责边界内统一错误模型：可预期的业务失败使用 `Result` 或明确的状态 union；真正异常或无法恢复的基础设施失败才抛出异常。

调用方**必须**显式处理错误分支，不得把错误对象、真假值和异常混成隐式协议。

```ts
const result = await task.start();
if (!result.ok) {
  showError(result.error);
  return;
}

useArticle(result.value);
```

`catch` 中不得假设捕获值一定是 `Error`；需要展示或转换时先做类型判断。不得抛出字符串、数字或裸对象。

## 异步控制流

**必须**让异步操作的开始、等待、取消、超时和错误路径可见。

- 需要顺序保证的操作逐步 `await`，不要用难以阅读的 Promise 链隐藏顺序。
- 可并行的独立操作使用 `Promise.all`，并明确整体失败语义。
- 启动异步操作时必须能看出谁负责等待、取消或处理拒绝。
- 重试、超时和取消属于协调层职责，不在渲染表达式中隐式触发。
- 不得通过未等待的 Promise 隐藏副作用或错误。

简单的纯异步映射可以保持简洁；当回调同时包含校验、转换和副作用时，拆成命名函数。

## 命名、函数职责和复杂条件

**必须**使用能表达业务意图的名称，避免 `data`、`value`、`item`、`x` 等无法说明角色的名称；短名称仅限循环索引、数学变量或局部范围内含义明确的值。

函数应有单一、可描述的职责。**建议**当函数同时负责输入校验、协议转换、状态变更和 UI 更新时拆分职责。

复杂条件**必须**拆成命名布尔值、谓词函数或显式分支：

```ts
const hasRequiredMetadata = title.trim() !== "" && articleTypeId > 0;
const canPublish = isDraft && hasRequiredMetadata;

if (!canPublish) {
  return;
}
```

认知复杂度、函数长度和分支数量是 Review 判断项，不以单一数字机械否决所有实现。重复出现的复杂度应在后续专项任务中按模块拆分，不在本规范中要求一次性重写。

## 文件形态约定

前端文件只分两种形态（宽松约定，非硬性限制）：

- **A 多导出文件**：导出多个**彼此独立**的方法/函数——工具库、hook 集、类型表、常量表。成员必须可独立理解与使用；共享内部状态的一组函数算"类文件"，允许但需在文件头说明（如 `common/client/site-routes.ts` 的 configure/read 缓存对）。
- **B 单导出文件**：只导出一个东西——一个 UI 组件、一个类、一个组合根（如 `shell/header.tsx`、`api-client.ts` 的 `createClient`）。

混合形态（组件+工具混放、彼此不独立的多导出）是治理对象，新文件不得再产生；出口桶（`index.ts` 纯 re-export）不算混合形态。文件名携带领域信息，避免 `app`、`ui` 这类无领域通用名。

## 测试、脚本和工具代码

测试、脚本和工具代码遵循同一套可读性原则。测试可以为构造 fixture、模拟错误和验证边界使用局部简写，但**必须**让场景、前置条件、动作和断言清楚可见。

脚本和工具可以直接处理进程、文件和环境边界；这些副作用必须集中在明确的适配层，领域判断仍使用显式分支和可辨识状态。

## 工具和人工 Review 的分工

工具只承载稳定、可机械判断且不会改变运行时语义的规则：格式、明显正确性错误、未使用符号、可验证的类型约束和明确的错误模式。Biome 负责格式，TypeScript 负责类型检查，Oxlint 负责机械 lint。

以下内容必须进入人工 Review：表达式是否掩盖业务分支、函数职责是否过多、命名是否表达意图、错误边界是否合理、异步取消/重试是否清晰、状态 union 是否完整，以及测试是否真正覆盖边界。

不得因为某个规则容易配置就禁止所有三元、`&&`、`||` 或 `??`。工具规则的具体启用和阈值由专项任务另行落地；本规范只定义判断原则和例外边界。
