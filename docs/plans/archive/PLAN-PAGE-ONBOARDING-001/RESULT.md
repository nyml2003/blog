# PLAN-PAGE-ONBOARDING-001 交付结果

2026-10-03 执行。全部工作流交付，集成验收受进行中计划的前置失败限制（见"环境受限项"），其归属已逐一核实。

## 实际交付

### 1. 校验器（`src/frontend/page-registry/`）

- `normalize.ts`：D11 归一化形态 `PageImplementation { pageId, variant, platform, outputPath, entry }`——variant 为开放 key（当前单实现取平台名约定值），platform 由 outputPath 首段派生；
- `validate.ts`：14 条规则——id 格式（对齐后端 `[a-z0-9-]` 约束）/id 唯一/title 必填/alias 必填与格式/alias 唯一/**alias×outputPath 交叉冲突（全链路首次存在）**/outputPath 格式与唯一/**平台世界一致性（声明 platform === outputPath 首段 === entry 前缀，D4 落地）**/entry 格式与存在（依赖注入）/bootstrap 与 shell 仅 mobile（固定 mobile settings 入口与 app shell 移除逻辑的耦合守护）；
- `generate.ts`：site-routes.json 生成器，canonical = `aliases[0]`；`syncSiteRoutesManifest` 支持检查/写出双模式；
- `check.ts` CLI + `index.ts` 公共出口。

### 2. 三入口接线

- **vite 配置加载期 fail fast**（`vite.config.ts`）：校验先于任何构建副作用，自动同步清单（内容不变不写盘）；
- **`ops page check`**（`apps/blog/src/page/page-check.ts` + registry `page` 命令域 order 26）：包装 `pnpm page:check`，与 `quality lint` 同构；
- **测试守卫**：`page-template.test.ts` 清单同步从"集合一致"升级为"重新生成逐字节比对"。

### 3. canonical 重排与零行为变化

- registry 两处 alias 重排：`mobile-home` → `["/m/", "/m"]`、`desktop-admin-home` → `["/admin/index.html", "/admin", "/admin/"]`；
- **生成器输出与已提交 site-routes.json 逐字节一致（零 diff）**——`page:check` 首次运行即报告"清单与注册表投影一致"。

### 4. Desktop 首绘内嵌（D8）

- `bootstrap/desktop/environment.tsx` 重写：内嵌清单 + desktop `siteRoutesSchema` 校验，context 创建从 async 改同步（顺带消灭原 `void …then` 无 catch 的 unhandled rejection 路径）；11 个 desktop 页面首绘不再请求 `/api/public/site-routes`；
- `desktop/foundation/api/index.ts` 补 `siteRoutesSchema` 导出（对齐 mobile index 先例）；API client 的 siteRoutes 方法与后端端点保留；
- 守卫扩展：内嵌清单须同时通过两端 schema 且覆盖全部 17 个页面 id（原只点名 6 个 mobile id）。

### 5. CI 与文档

- `build-release.yml` 新增 `ops page check` 步骤（依赖安装后、打包前）；
- `SPEC-SITE-ROUTES-001` 修订：registry 为事实源、清单为生成物、两端内嵌为默认、端点保留、canonical 约定、场景 003/004 重写，附修订记录。

## 验证证据

| 项 | 结果 |
| --- | --- |
| 单元测试（新增） | page-registry 13/13（validate 10 + generate 3） |
| 前端套件 `test:frontend` | 60/60（基线 47 + 新增 13） |
| typecheck | 通过 |
| lint / format:check / source-layout | **本计划改动零新增违例**；各存在 1–2 条既有失败，全部归属进行中计划（见下） |
| vite build | 通过（1.74s，desktop 内嵌清单进入产物 `site-routes-*.js` chunk） |
| 变红演练（validator） | 单测逐规则注入坏条目断言拦截 |
| 变红演练（vite fail fast） | 注入重复 alias → `vite build` 配置加载期失败：`[alias-unique] mobile-home: alias "/m/" 与 desktop-public-home 重复`，build 终止于任何副作用之前（输出留档） |
| `ops page check` 真实调用 | exit 0，输出"注册表校验通过：17 页 / 22 个 alias / 清单一致" |
| ops 套件（apps/blog） | 123 项 0 失败（新增 page-check 3 项；help 反射自动覆盖新命令） |
| **e2e 断言红绿对（integration 实跑）** | **红**（desktop env 回退 HEAD 运行时拉取版重建后）：`desktop pages must embed site routes at build time, requested: …/api/public/site-routes?sceneCode=public.site_routes`（两个桌面页各一次，全部捕获，先于其他旅程抛出）；**绿**（内嵌版重建后）：断言静默，桌面旅程通过（desktop-articles/desktop-detail 截图产物齐全），套件仅余 `mobile-home: .mobile-header is missing`——归属进行中计划（见下） |

### 既有失败归属（全部为 PLAN-MOBILE-PERSISTED-STATE-001 第二阶段未提交改动，非本计划引入，未修改）

- lint：`mobile/widgets/shell/navigator-icons.tsx:16` 未用 `Show` 导入（git diff 确认属未提交改动）；
- format：`mobile/widgets/shell/navigator.tsx`；
- source-layout：`mobile/pages/admin-preview/page.tsx` 直接触 `MobilePageContext`（3 处，均在未提交 diff 内）；`mobile/features/detail/model.ts` 跨 slice import `favorites`；
- e2e `mobile-home: .mobile-header is missing`：进行中改动将 `MobileShell` 的 `Navigator` 替换为 `StandardNavigator`（`navigator-icons.tsx`，未提交），旧 `Navigator` 渲染 `.mobile-header` 而 `StandardNavigator` 尚未提供——本计划未触碰任何 mobile 文件。
- 实施注记：e2e 断言初版用 `failures.push` 且置于 mobile 旅程之后，会被后续抛错吞掉；已改为桌面旅程结束处立即 `throw`（对齐 `assertPage` 风格），红跑证明其先于其他失败触发。首次红演练因 stash 路径笔误实际未回退源码（构建产物始终为绿版），第二次以 `git checkout HEAD -- <file>` + `/tmp` 备份恢复完成真红跑。

## 环境受限项

- **`ops quality check` 全量未执行通过**：被上表既有失败阻塞（进行中计划的 lint/format/架构违例）；本计划自身检查（typecheck、test:frontend、build、ops 套件、page check）全部通过。进行中计划收尾后需复跑一次全量。
- Rust 侧未改动且清单逐字节不变（protocol `include_str!` 编译期内嵌同一文件），cargo 测试按未变更处理；全量 cargo 回归并入上述 quality check 复跑。
- CI workflow 步骤已落地，实际跑通需推送 build tag（本机无法验证，留待下次发布）。

## 后续

- P2（`ops page new` 脚手架）、P3（page-kit 运行时包）按 DECISIONS D10 另立计划；
- D11（一页多实现 schema）停泊，归一化接缝已就位；
- 进行中计划收尾后复跑 `ops quality check` 并在两计划间对账。
