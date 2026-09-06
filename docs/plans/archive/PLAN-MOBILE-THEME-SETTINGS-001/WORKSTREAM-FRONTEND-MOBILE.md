---
kind: workstream
id: WORKSTREAM-FRONTEND-MOBILE
status: complete
plan_id: PLAN-MOBILE-THEME-SETTINGS-001
role: frontend-mobile
owner: frontend-mobile
depends_on:
  - SPEC-MOBILE-THEME-SETTINGS-001
  - COMPONENT-CONTRACT.md
write_set:
  - src/frontend/common/data/storage.ts
  - src/frontend/common/data/storage.test.ts
  - src/frontend/common/data/index.ts
  - src/frontend/common/client/mobile-settings.ts
  - src/frontend/common/client/mobile-settings.test.ts
  - src/frontend/common/client/mobile-settings-browser.ts
  - src/frontend/common/client/index.ts
  - src/frontend/mobile-ui/styles/themes.css
  - src/frontend/mobile-ui/styles/atoms.css
  - src/frontend/mobile-ui/styles/molecules.css
  - src/frontend/mobile-ui/styles/containers.css
  - src/frontend/mobile-ui/atoms/define.ts
  - src/frontend/mobile-ui/atoms/select.tsx
  - src/frontend/mobile-ui/atoms/link.tsx
  - src/frontend/mobile-ui/atoms/field-context.ts
  - src/frontend/mobile-ui/atoms/index.ts
  - src/frontend/mobile-ui/atoms/types.test.ts
  - src/frontend/mobile-ui/molecules/field.tsx
  - src/frontend/mobile-ui/molecules/page-header.tsx
  - src/frontend/mobile-ui/molecules/bottom-nav.tsx
  - src/frontend/mobile-ui/molecules/index.ts
  - src/frontend/mobile-ui/containers/page-container.tsx
  - src/frontend/mobile-ui/containers/index.ts
  - src/frontend/mobile/styles/tokens.css
  - src/frontend/mobile/pages/settings/index.html
  - src/frontend/mobile/src/pages/settings.tsx
  - src/frontend/mobile/src/logic/settings.ts
  - src/frontend/mobile/src/logic/settings.test.ts
  - src/frontend/mobile/src/logic/settings-bootstrap.ts
  - src/frontend/build/mobile-settings-bootstrap.ts
  - src/frontend/vite.config.ts
  - docs/plans/archive/PLAN-MOBILE-CSS-ARCHITECTURE-001/ATOM-CONTRACT.md
  - docs/specs/SPEC-MOBILE-THEME-SETTINGS-001.md
  - docs/architecture/frontend.md
  - docs/plans/archive/PLAN-MOBILE-THEME-SETTINGS-001/
last_reviewed: 2026-09-06
---

# 前端：数据分层、mobile-ui 与完整设置页

归档状态：2026-09-06 用户要求按源码交付收尾，本工作流随计划归档。complete 不表示新版测试通过；未完成验证与集成项见 [RESULT.md](./RESULT.md)。下方执行约束和任务保留为历史与后续参考。

## 当前执行约束

本工作流已按九项用户决策更新。2026-09-06 用户要求开始实施，编码已恢复并派发；测试与验收继续暂停，不运行质量门禁、构建或浏览器。允许随已批准接口调整现有类型样例和调用点，避免保留已知失效签名；专项测试新增与运行留待恢复测试时处理。

owner 为 frontend-mobile，负责 Data / Client 到 mobile-ui 和页面的完整前端链路。PM 持有计划管理文档；专业前端交付实现记录和 Spec 实现证据，双方串行更新 Spec，不并发修改。

## 目标

实现 [SPEC-MOBILE-THEME-SETTINGS-001](../../../specs/SPEC-MOBILE-THEME-SETTINGS-001.md) 和 [COMPONENT-CONTRACT.md](./COMPONENT-CONTRACT.md)：Data / Client 提供设置数据，Field + 独立 Select 组织表单，PageContainer、新页头和新底部导航提供整页主题。

## 输入

- Spec：`SPEC-MOBILE-THEME-SETTINGS-001`；
- 当前方案：[DECISIONS.md](./DECISIONS.md)、[COMPONENT-CONTRACT.md](./COMPONENT-CONTRACT.md)；
- 归档契约：`PLAN-MOBILE-CSS-ARCHITECTURE-001/ATOM-CONTRACT.md`（九原子 Props API、`defineAtom` defaults 机制、CSS 所有权规则）；
- 现状：`src/frontend/mobile/styles/tokens.css`（palette 冻结名）、`src/frontend/mobile-ui/styles/atoms.css`、`src/frontend/mobile/src/components/ui.tsx` 的 `BottomNav`、`src/frontend/vite.config.ts` 的 MPA 注册方式。

## 输出

- `common/data/storage.ts`：可注入的通用本地存储适配与异常边界；不出现设置业务定义。
- `common/client/mobile-settings.ts`：选项、值域、默认值、键名和业务读写能力；`mobile-settings-browser.ts` 为独立组合根，注入浏览器存储，不触碰并行文章 Client 的实现。
- Select 消费选项列表并回调 value；Field 自动关联标签，PageHeader / BottomNav 由外部传入显示与导航数据；PageContainer 提供整页结构和主题边界。
- `themes.css` 的覆盖边界迁移到 PageContainer；atoms 继承语义变量；移除首轮为主题统一附加的原子背景，保留控件必要表面和可见焦点。
- Mobile settings 适配持有显示状态和选择命令；首绘入口复用 Data / Client 源码，构建接线在 `build/mobile-settings-bootstrap.ts` 和 Vite 完成，不在 HTML 独立维护存储规则。
- 设置页只负责 UI 组合与绑定，不再消费 legacy MobileNav / BottomNav / shell 布局；旧页面及其既有设置入口保留。
- 实际交付后登记原子契约修订与 Spec 实现证据；新验收记录追加到 FRONTEND-RESULT，不覆盖首轮历史。

## 实施任务

1. 恢复编码后先处理首轮 defineAtom 的类型问题，保留受控 getter，不能用断言压制错误。按组件契约整理精确 Props。
2. 通用存储与设置 Client：先固定数据返回形状、默认和失败语义，再实现 Mobile 接线。
3. Select 与 Field：列表输入、value 回调、标签关联、受控初始化；不扩大到无关原子治理。
4. PageContainer、PageHeader、BottomNav 与主题：整页背景、语义变量、安全区、原生导航。
5. Mobile 适配与设置页组合；首绘共享源码构建接线。仅在共享配置的并发写入已协调后修改 Vite。
6. 用户恢复测试后调整旧测试到新契约，补齐必要的边界和浏览器证据；没有恢复则只报告源码状态，不宣称验收完成。

依赖为 1 -> 2/3 -> 4 -> 5 -> 6；若后续拆分 agent，必须另划不重叠写集。Field 的内部桥接文件暂定 atoms/field-context.ts，仅作底层内部能力，不作为新增公开原子。

## 测试/验收

- 当前暂停，不执行。本节是恢复后的检查要求。
- 存储 getter / read / write 失败、选项和默认归一化、非法值不回写、同页即时状态与持久化失败独立、首绘与页面使用同源逻辑。
- 更新 Select 类型与受控测试、Field 多实例关联、导航 active 和链接语义；旧 option-content 接口不能被误保留为正式调用方式。
- 前端 typecheck / lint / format:check / build / test:core 及专项测试；使用项目 direnv 入口，记录准确命令和结果。
- 浏览器按 Spec 001-001 至 001-011 核验。旧 BROWSER-CHECK 的 atom 数量和背景断言必须先更新，不能直接复用绿灯。

## 阻塞

- 编码已恢复；测试与验收暂停，不重启或停止用户服务。
- 并发写集：`PLAN-DESKTOP-EDITOR-001` 正修改 `vite.config.ts` 与 package manifest。Vite 接线需串行协调；本计划不新增依赖、不修改 package.json 或 lockfile，专项测试继续使用显式命令。
- 并发 Client：`PLAN-CLIENT-ARTICLE-LIST-001` 修改 client.ts / domain.ts / 公共文章契约；设置能力使用独立 Client 模块，不改这些文件。
- 外部报告：Desktop 工作流记录 `mobile-ui/atoms/define.ts:48` 的 TS2345；本线程未复跑检查。列为恢复实施后的首项，不写成已验证修复。
- Product `/m/settings/index.html` 精确静态映射缺失，尚待原范围确认；Rust 文件不在当前写集，不能宣称 integration 页面可用。

写集说明：首轮 `mobile/styles/shell.css` 与 `mobile/src/components/ui.tsx` 已有入口改动保留，本轮不继续改动或回退。新模块文件名可由 owner 做局部调整，但新增实际写入路径前先更新本文件，不能跨入其他计划的独占写集。

## 交付记录

- 2026-09-06：PM 派发 frontend-mobile，先只读核查九原子能力与写集。Heading / Label / Select 足够支持既定控件；页面结构容器不得覆盖原子外观。
- 2026-09-06：PM 补齐导航必要写集 `shell.css`，仅授权 `.bottom-nav` 的 `grid-template-columns` 从两列改为三列，避免第三入口换行。其余 legacy 样式保持原范围。
- 文档写入协调：PM 独占 PLAN.md、PM-PROMPT.md、PM-STATUS.md、WORKSTREAM-FRONTEND-MOBILE.md 与最终 RESULT.md，并在源码交付后最小更新 frontend 架构中的已落地边界；frontend-mobile 写实现和 FRONTEND-RESULT.md、ATOM-CONTRACT 修订及 Spec 实现证据，最终状态由 PM 验收后更新。
- 2026-09-06 恢复实施协调：`PLAN-MOBILE-BROWSE-IA-001` 为 ready，其原子与 Vite 写集存在交集。本轮只改既定 define / Select / Field 桥接，接线前重读 Vite 并保留其他入口；不接管浏览页、旧 ui.tsx 或文章 Client。共享文件若出现进行中的重叠编辑，先报告 PM 串行处理。
- 2026-09-06 源码审查补充：新 BottomNav 的 activeId 必须驱动 Link 的 aria-current；现有 Link 解构 render 参数会冻结 options。将 link.tsx 的 getter 保留修复纳入写集，只修复响应性，不扩展公共 Props 或外观。
- 新版源码和审查修复已交付，见 FRONTEND-RESULT.md。PM 已回填 Spec 的未验证状态和 frontend 架构边界；测试与验收继续暂停，workstream 保持 in_progress。
- 2026-09-06 用户调整执行优先级：暂停测试与验收，优先完成代码。已有检查仅保留为历史证据，后续修复不复跑测试。PM 将 `select.tsx` 纳入最小实现修复写集，仅恢复既有受控 value 契约，不添加原子、variant、选项或页面绕过。
