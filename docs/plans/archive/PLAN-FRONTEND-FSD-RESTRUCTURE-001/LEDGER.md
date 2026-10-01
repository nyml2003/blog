# 迁移台账

## 2026-10-01 新层序门禁落地

- 重写 `src/frontend/tests/app/architecture/source-layout.test.ts`（原 40 行 6 断言 → 层序门禁）。
- 新结构规则（对 `bootstrap/`、`mobile/`、`desktop/`、`kernel/`、`domain/`、`protocol/`、`validation/` 目录存在即生效）：
  1. 依赖只向下：bootstrap(5) → pages(4) → widgets(3) → features(2) → foundation(1) → 底层(kernel/domain/protocol/validation = 0)；反向 import 即违规。
  2. 同层 slice 互不 import（pages/widgets/features 按 `<slice>/` 划分；foundation 不分片；底层互引暂不限制，kernel 纯度另测）。
  3. 跨端互斥：mobile 与 desktop 平台世界（含各自 bootstrap）互不 import。
  4. 新结构不得 import 旧壳 `app/`（机械强制"被依赖方先迁"的顺序）。
  5. 目录形态：世界内一级目录限四个 segment；foundation 下一级限 `api|styles|ui`（闸门 7）；bootstrap 下一级限 `desktop|mobile`。
  6. kernel 纯度（`kernel/` 与 `app/kernel/` 并测）：禁 fetch/AbortController/window/localStorage/sessionStorage/process。
- 旧路径规则保留至旧壳删除：app 模块禁旧运行时 import 正则、app/kernel 纯度、infrastructure 禁 zod/solid、mobile pages 禁 `MobilePageContext` 与 `context.(api|navigation|persistence)`。
- "变红"演练：种植 7 个违规（向上 import、跨 slice、跨端、新→旧壳、非法 segment、非法 foundation 子目录、kernel 副作用）→ 3 个测试精确报出全部 7 条 → 清理后 5 测试全绿。演练文件已删除。
- 验证：`pnpm test:foundation`（含双 tsconfig noEmit）、`pnpm test:frontend`（45 项）、oxlint、biome format 全部通过。
- 已知待办：`apps/blog/src/quality/architecture.ts` 的 `containsPath("mobile/"|"desktop/")` 墓碑与新世界路径冲突，首片迁移时收窄（见 PLAN.md 约束）。

## 2026-10-01 块 1：底层 + mobile foundation 迁移

- 移动：`app/kernel` → `kernel/`；`app/habitat/validation`（含 generated WASM）与 `route-input.ts` → `validation/`；`habitat/api/mobile` → `mobile/foundation/api`；`habitat/mobile/{ui,styles}` → `mobile/foundation/{ui,styles}`（11 个 CSS 原链保序）；`context.ts`/`resource.ts` → foundation 根；`logic/navigation` → `mobile/features/navigation/model`；`ui/molecules/bottom-nav` → `mobile/widgets/shell/bottom-nav`（它 import 导航 logic，属壳层非通用 molecule）。
- 旧路径消费方（pages/logic/components/bootstrap/tests/构建脚本）import 全量改指新位置；api 总桶 `habitat/api/index.ts` 无消费方，删除。
- `quality/architecture.ts` 过渡调整：墓碑收窄为 `mobile/src/`、`desktop/src/`；kernel 与 api-habitat 规则补新路径。
- tsconfig/lint 脚本纳入新目录。CSS 因 app.css 单链级联敏感，11 个文件原样集中在 `foundation/styles/`，按 slice 拆分暂缓（记录，不扩大范围）。
- 验证：tsc、test:foundation 12、test:mobile 17、test:frontend 45、oxlint、biome、`pnpm build` 全绿。
- 环境事故与恢复：`pnpm exec` 触发 workspace 级安装把本地 node_modules 搞残、根 lockfile 落后 package.json 三个 devDeps；按 workspace 模式重装恢复，根 `pnpm-lock.yaml` 补 2 行 importer 同步（无版本变更）。

## 2026-10-01 块 2：mobile features + widgets 迁移

- features：home/articles/detail/settings/admin-preview/navigation 六个 slice；articles+category 合并同 slice（articles logic 引 category，避免同层跨 slice）；settings 四件（model/page-model/settings-model/persistence）同 slice；`settings-storage` 按命名决策改 `persistence.ts`。
- widgets：article-card、article-body、shell（ui.tsx←pages/shared.tsx 的 MobileShell + mobile-nav + bottom-nav 同 slice，壳层内聚）。
- 组件桶 `components/index.ts` 与 `ui/molecules` 的 BottomNav 导出删除，消费方改直连 slice。
- 验证：tsc、门禁 5、三套测试、lint、format 全绿。

## 2026-10-01 块 3：mobile pages + bootstrap + registry

- 5 个页面 → `mobile/pages/<slice>/page.tsx`；9 个 bootstrap 文件 → `bootstrap/mobile/`；世界桶 `habitat/mobile/index.ts` 解散，bootstrap 改直连页面。
- registry 6 个 mobile entry 改 `/bootstrap/mobile/`（outputPath 与 URL 空间零变化）；`vite-plugins/page-bootstrap.ts` settings 入口路径同步。
- 门禁规则补一条判例：同平台 bootstrap 内部互引（各入口共用 environment 挂载器）放行，跨平台仍禁。
- 验证：三套测试 + build 全绿（.generated 页面模板由新 registry 重新生成）。

## 2026-10-01 块 4：desktop 迁移

- `habitat/api/desktop` → `desktop/foundation/api`；`styles/home.css`（实为全入口共用的全局样式）→ `desktop/foundation/styles/`；context/resource → foundation 根。
- features 八个 slice（home/articles/detail/login/admin-home/admin-preview/taxonomy{model,state,input}/editor{state,session-draft,persistence}）；widgets：article-body、source-editor{ui,codemirror}。
- 9 个页面 → `desktop/pages/<slice>/page.tsx`；12 个 bootstrap → `bootstrap/desktop/`；世界桶解散；registry 11 个 desktop entry 更新。
- 验证：tsc、门禁、三套测试、build 全绿；`app/` 目录删除。

## 2026-10-01 块 5：旧壳删除、门禁收敛与全量证据

- 前端门禁去掉 app/ 旧路径规则；"mobile 页面不碰宿主能力"不变量按新路径保留；tsconfig/lint 清掉 app。
- `SPEC-ARCH-BOUNDARY-001` 修订生效（前端分层、禁令表、场景 -002/-007、证据节全部改为新结构与双门禁）；CODEMAP、architecture/frontend.md、infrastructure.md、GLOSSARY、guides/testing.md 同步。
- 全量证据：`ops quality check` 通过（含 architecture boundaries 与 test:core）；`ops e2e --mode integration` 通过（产物 target/e2e/1790847556950-9935）；`ops perf mobile --runs 3` 对照 NAV-ACTIONS 基线：unthrottled 冷加载 shell 97.3→56.4ms、content 100.5→58.3ms、LCP 72→44ms（变快），nav-switch 持平（59.1→59.6ms），唯一上浮 nav-switch LCP 28→48ms 属 3 次采样中位数噪声（产物 target/e2e/1790847581717-10648）；入口 HTML 清单一致（registry 仅 entry 字段变化，outputPath/别名/site-routes 测试同步通过）。
- 门禁最终"变红"演练：sibling slice、向上依赖、跨端、新→旧壳、非法 segment 全部拦截（2 测试红），清理后 4 测试全绿。
