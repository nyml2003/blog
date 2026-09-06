---
kind: result
plan_id: PLAN-ARTICLE-HTML-VALIDATION-001
status: completed
executed_at: 2026-09-06
profile_version: article-html/v1
---

# 交付结果

已完成正式 Rust workspace 上的手写 HTML Fragment Parser、Profile、native/WASM 共享诊断、服务端发布门禁和 B Desktop 诊断/安全预览。按用户确认禁止图片、作者 class/style/事件属性；链接必须显式写出 `target="_blank"` 与完整 `rel`，不自动补写。规则见 `docs/specs/SPEC-ARTICLE-HTML-VALIDATION-001.md`。

## 实现与边界

- `crates/article-html-core/`：逐字符 tokenizer、显式元素栈、平坦 arena AST 和 Profile；无第三方 HTML parser/sanitizer，无错误恢复或原文重写。输入 256 KiB、深度 64、节点 20000、属性数 8、属性值 4096 字节、文本节点 65536 字节均有限制。诊断包含版本和精确 UTF-8 半开 span。
- `crates/article-html-wasm/`：只序列化 core inspection，不复制允许集合、不暴露 AST。生成产物在 `web/common/validation/generated/`；`web/package.json` 的 dev/build/typecheck/test:core 自动运行构建脚本。
- Product/Mock：无效草稿照常保存并返回诊断；无效正文不可发布或覆盖已发布文章。管理详情/文章 mutation 为原 Article 追加 `htmlInspection`；违规返回 422 / `INVALID_ARTICLE_HTML` / `data.htmlInspection`。
- Data：不理解 HTML。`ArticleUpdateDraft` 在原子写入中守卫草稿状态，`ArticlePublishChecked` 比较检查过的完整原文及草稿状态。竞态返回 409 / `ARTICLE_CHANGED`，不能把旧 inspection 用于新正文。发布固定两次 Data 调用，共用原有请求 deadline。
- 公开路径：详情对无效历史正文返回 404，返回正文的推荐结果过滤无效正文；管理详情保留原文用于修正。
- Client/B Desktop：`draftEditor.inspectHtml` 按需加载 WASM、缓存初始化、10 秒加载超时、失败可重试；结果绑定当前 source。诊断紧邻正文，可定位中文、补充字符和 CRLF；网络/发布错误保留所有输入，创建成功后即保存 ID，避免发布重试重复建稿。
- 预览：不信任 sessionStorage；先校验缓存 schema 和文章 ID，再重新运行 WASM。加载失败、无效或过期结果都不注入正文。WASM 失败仍允许保存草稿。

## 验证命令

以下在项目 Flake 环境执行，不使用其他项目的同名 ops：

```sh
nix develop -c ops quality check
nix develop -c pnpm --dir web test:core
cargo test -p article-html-core
cargo test -p data --test write_ops
cargo test -p mock --test http_contract
cargo test -p product --test contract
cargo run --release -p article-html-core --example benchmark
node scripts/audit-article-html.mjs
git diff --check
```

- 实施前 `ops quality check` 与前端基线检查通过。
- 实施后 `ops quality check` 全部通过：Rust fmt/clippy/tests、ops 契约测试、TS、Oxlint、Biome、前端构建和跨端依赖边界。
- Core：9 个测试函数，覆盖共享 fixture、实体/URL/嵌套/能力拒绝、资源上限的边界、精确 Unicode span，以及 6144 组固定 seed 畸形 Unicode 输入，无 panic。
- `test:core`：28 项前端测试通过；同时运行 287 组 native/WASM 完整结果比对，包含诊断消息、版本和 source span。
- Data：SQLite/内存两个实现均通过过期发布、已发布非法更新守卫及 16 轮竞争写测试。
- Product/Mock：真实 HTTP 验证跳过前端、伪造 inspection、伪造发布正文、非法草稿保存、非法发布、无效已发布更新和历史公开读取隔离。

## 浏览器验收

真实链路为 `ops runtime integration`：构建后的前端 + Rust Product + Rust Data(test 临时 SQLite)，不是拦截所有请求的纯前端 mock。

`scripts/test-article-html-browser.mjs` 使用已有 Playwright Core 和 Chromium headless shell；显式设置 `BLOG_PLAYWRIGHT_MODULE`、`BLOG_CHROMIUM_PATH`，将本地 integration URL 作为参数。浏览器仅用于验收，不是应用运行依赖。

```sh
BLOG_PLAYWRIGHT_MODULE=/home/nyml/.npm/_npx/520e866687cefe78/node_modules/playwright-core/index.mjs \
BLOG_CHROMIUM_PATH=/home/nyml/projects/blog/target/html-validation/chromium/chrome-headless-shell \
node scripts/test-article-html-browser.mjs http://127.0.0.1:8082
```

本机浏览器库缺失/旧 glibc 问题通过 `nix build --impure --no-link --print-out-paths -f scripts/browser-libs.nix` 提供测试库解决；只复制缓存 Chromium 到 `target/html-validation/chromium/`，对该副本设置 Nix glibc interpreter 和测试库 rpath。没有修改原浏览器缓存、系统库或全局配置。

通过的真实浏览器行为：

1. 非法草稿保存后标题、摘要、类型、标签、HTML 原样保留；UTF-8 诊断点击准确选中错误实体。
2. 预览/发布按钮阻断非法正文；直接伪造发布请求仍得到 422。
3. 合法源码可预览、保存并发布；h2/h3、列表、代码、引用、表格和安全链接正常渲染。
4. C Desktop 1440x1000、C Mobile 375x812、横屏 812x375 均无页面横向溢出，无作者 class/style、脚本或图片节点。
5. 篡改缓存正文与伪造 valid 标记无法进入预览，事件处理器不执行。
6. WASM 请求失败时禁止预览/发布但允许保存草稿；恢复请求后可重新校验。
7. 有效源码改成无效源码后立即阻断旧结果；网络保存错误不丢失编辑内容。

截图经人工查看：`target/html-validation/editor-invalid.png`、`preview-valid.png`、`preview-blocked.png`、`desktop-valid.png`、`mobile-valid.png`、`mobile-landscape-valid.png`。现有 Desktop/Mobile 主题未重做。UI/UX 技能只用于字段级错误、focus 和 live region，不引入跨端 UI。

## 历史测试数据

正式 core 审计旧 `blog.db`：102 篇（100 published、2 draft），全部通过 v1；最大长度 201 UTF-8 字节。原审计误把 SQLite 字符数记作字节数，已保留更正记录。

按用户“测试正文删除重建”的授权执行 `node scripts/reset-article-html-test-data.mjs --reset-local-test-articles`：

- SQLite `.backup`：`target/html-validation/backups/blog-before-html-v1-1788679719908.db`。
- 备份 SHA-256：`1b2bb6c142019c15dae8cd3028fc4718e244da22d8e9b0cedd4ccae213036752`。
- 删除旧文章和文章标签/推荐关联，保留分类、标签定义；在事务中重建 3 篇合法 fixture，ID 为 103/104/105，并重建推荐关联。
- 重建后 3 篇全部通过 core，`PRAGMA foreign_key_check` 无违规。
- 可恢复：停止会访问 `blog.db` 的进程后，使用 SQLite `.restore` 从上述完整备份恢复。不要覆盖运行中的 WAL 数据库。

`blog.db` 是旧测试库，当前 runtime 的 Data(test) 使用每次新建的临时库，互不替代；浏览器验收文章写入独立 runtime 测试库，不是旧库迁移。Mock/Data 的稳定 seed 正文本身均为合法段落。

## CPU 与限制

校验是 CPU 工作，源码扫描、AST 构造和 Profile 总体为 O(n)，内存受固定输入/节点上限约束，不做 I/O。初次本机 release 基准（各 300 次）约为：950 字节 0.019 ms、38 KB 0.873 ms、260028 字节 2.541 ms、20000 节点 2.935 ms；总输入超限在扫描前拒绝。这些是本机均值，不是目标 2 核服务器的吞吐量或 P99。

人工 Review 检查了实体只解码一次、危险 URL authority、浏览器修复型嵌套、失败 AST 不泄漏、Data 竞态、错误输入保留和异步过期结果。修正了大错误对象复制、链接 fixture 根层嵌套、错误消息、CRLF 定位和发布失败后的新文章 ID 保留。

当前证据为 native/WASM 单元与协议测试、固定 seed 输入测试及 Chromium 验收；不是持续 coverage-guided fuzzing、Firefox/WebKit 全覆盖、生产压力测试或安全认证。认证、CSP、图片能力和通用 HTML/自动修复不属于本计划。没有修改 `docs/FACTS.md` 或全局工具配置，也未创建提交/推送。
