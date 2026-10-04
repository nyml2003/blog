# PLAN-PAGE-PACKAGING-001 · P3d 交付记录与计划收尾

2026-10-04 执行。P3d 完成，本计划（P3a–P3d 全部）以 `completed` 收尾。

## P3d 交付：17/17 页面全量包化

| 平台 | 页面包 | 页数 |
| --- | --- | --- |
| desktop 公共 | `page-desktop-{home,articles,detail}` | 3 |
| desktop admin | `page-desktop-{login,admin-home,editor,editor-guide,taxonomy,admin-preview}` | 8（editor/taxonomy 各双定义） |
| mobile | `page-mobile-{home,articles,detail,settings,admin-preview}` | 6（articles 双定义） |

支撑包（按依赖面自然长出）：`@blog/mobile-api`、`@blog/mobile-shared`（shell/卡片/正文/ui/导航/搜索 + context 别名）、`@blog/desktop-shared`（+ context 别名）、`@blog/kernel`（desired-state）、`@blog/validation`（article-html/wasm/generated）。

**注册表形态终态**：17 行显式 import + 17 项数组，零内联字面量、零文本手术；`pageRegistry` 全量由页面包 `definePage` 产出，类型漂移编译期暴露（`satisfies` 锚定）。

## 收尾期间的后续演进（超出 P3d 范围，已落地并验证）

1. **Bootstrap 统一入口**（"Vite MPA 每页一个入口只是构建期传统"）：32 文件 399 行 → 3 文件 158 行——`bootstrap/{desktop,mobile}/main.tsx` + `mobile/settings.tsx`；模板插件注入 `data-page-id`，script src 由 `platformEntry()` 按平台统一派生；detail 组合逻辑（favorites/back/id）归位页面包 `entry.ts`。**新增页面不再有入口文件概念**。
2. **`entry` 字段退役**：构建不再读逐页 entry（统一入口派生），从 `PageRegistration`/`DefinePageInput`/14 个 definition/校验器 `entryExists` 依赖/测试夹具全链删除——校验器变纯函数 `validatePageRegistry(registrations)`。
3. **模板 hyperscript 化**：`page-template` 的 HTML 生成从模板字符串改为 `h()` 调用（hyperscript，JSX 编译产物同款）——`plugins/jsx-html.ts` 60 行运行时（void 元素/转义/raw 内容），结构声明式、零模板字符串。
4. **页面 BFF 桌面跳链 bug 修复**：`bff/t_shelf.rs::assemble` 硬编码 `ArticleCardSurface::Desktop` 导致 mobile.page 下发桌面 href；surface 提为显式参数（mobile/desktop 两调用点各传各的）+ 回归测试。
5. **shim 清理**：7 个 re-export 薄转发删除（mobile/desktop foundation api+resource、desktop widgets/features、validation/route-input），消费者直连包；空目录清零；配置里陈旧引用同步。

## 验证证据（终态）

| 项 | 结果 |
| --- | --- |
| `ops page check` | 17 页/22 alias，清单零 diff（聚合全程保序） |
| 前端 | typecheck 0 / test:frontend 47/47 / foundation 7/7 / mobile 18/18 / vite build ✓ |
| 根 | typecheck 0 / ops 套件 117 项 0 失败 |
| `ops package check` | 三段全绿（中立门禁/烟测/pnpm check 119 项） |
| `ops page check`（CI 同款命令） | `nix develop ./nix -c ops page check` 实跑通过；`--frozen-lockfile` 亦通过 |
| e2e（integration 实跑） | 桌面全旅程 + mobile shell 变体全过；唯一失败 `mobile-home: .mobile-header` 归属进行中计划（PLAN-MOBILE-PERSISTED-STATE-001） |
| 环境 | gitignore 全清后从零重装：pnpm install→wasm→typecheck→test→build→cargo 全链复现 ✓ |

## 计划收尾

- **交付**：P3a–P3d 全部（本目录 RESULT-P3A/P3B/P3C/STRUCTURE + 本文）；三层包形态成立——构建链半边（page-build-kit）、运行时半边（page-kit）、页面包（apps/pages/*）。
- **未交付/移交**：`ops quality check` 全量复跑（待 persisted-state 计划收尾后对账）；definePage 第二样本（D6.3；随下个真实新页面自然达成）；D11 同 URL 双端分流（停泊，触发时另立）。
- **归档去向**：本计划与关联的 DISCOVERY-001、ONBOARDING-001/002 移入 `archive/`（目录名不变，相对链接保持有效）。
