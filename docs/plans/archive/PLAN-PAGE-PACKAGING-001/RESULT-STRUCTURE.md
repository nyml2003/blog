# PLAN-PAGE-PACKAGING-001 · 包目录分类重组记录

2026-10-04 用户决策执行："packages 里按 纯ts通用/web/web+solid/cli 分类取名单独抽目录；前端 npm 包全在 packages，其他在 src"。划分标准经用户纠正后定为**按实际用途/消费者划分，不按代码纯度**（无 TUI 场景，不为理论场景设计）。

## 终态结构

```
packages/
  ts/     真通用（与平台无关的基础件）：core port query command mock net
  web/    web 域：web gesture-web mobile-prefetch nested-gesture
          text-highlight app-shell        ← 为 web 场景而生，按用途归 web
  solid/  web+solid UI：mobile-h5-solid-atoms persisted-state page-kit
  cli/    node 侧：cli-kit cli-core cli-plugins node
  build/  前端构建链（node+vite）：page-build-kit
  app/    @blog 应用私有包：route-input desktop-api desktop-shared
          app/pages/desktop-detail       ← 页面包再深一层
```

24 包全部迁入，packages/ 一级零散落；`src/frontend/packages/` 撤销（应用包归 packages/app）；src/ 只剩应用本体（frontend）与 Rust（core/backend）。

## 门禁重写：目录即策略

`package-guard.ts` 的三个手工登记表（HOST_ADAPTER_PACKAGES / PACKAGE_IMPORT_ALLOWLIST / BUILD_TOOL_PACKAGES）**全部删除**，改为读路径里的类别段：

| 类别 | 导入策略 | 平台全局 |
| --- | --- | --- |
| ts | 仅 scope 内 + 相对 | 禁 |
| web | 仅 scope 内 + 相对 | 允许 |
| solid | + solid-js | 允许 |
| cli | 跳过 | 跳过 |
| build | + vite/node: | 禁 |
| app | 跳过（应用依赖自由） | 跳过 |
| **未知类别** | **fail-closed：放错位置即红** | — |

守卫测试重写为按类别断言（7 项），并在真实树上全绿（`ops package check` 中立段 OK）。

## 验证

root typecheck 0（tsconfig include 扩为 `packages/*/*/src` 等嵌套 glob + 根级 `css-modules.d.ts`）；前端 typecheck/test 48/build 全绿；ops 套件 0 失败；`ops package check` 三段全绿；e2e 仅既有 mobile-home；lint/format 仅既有 2 条。

## 追加修订（2026-10-04，用户决策）

`mobile-h5-solid-atoms` 从 `solid/` 移入 `app/` 并改挂 `@blog` scope：它是博客 mobile 世界专属设计系统（desktop 不消费、非框架能力），不属"web+solid 通用"。scope 跟目录走：`@fluvient-loom/*` = 框架域（ts/web/solid/cli/build），`@blog/*` = 应用域（app/）。消费者 9 处（mobile foundation ui/styles、bottom-nav、测试冻结清单、宿主依赖）同步改名；typecheck/48 测试/build/package check 全绿。

## 实施注记

- 包名 `web` 与类别目录 `web` 撞名导致首轮 git mv 半途而废（web 包本体后单独迁入 `packages/web/web`）；未跟踪新包（page-kit/page-build-kit/@blog 系）须用 mv 而非 git mv；
- rolldown 的 tsconfig 逐层解析在缺包级 tsconfig 时要求 `packages/tsconfig.json` 存在——补类别层共享配置（extends 根）；
- page-desktop-detail 漏声明 lucide-solid 依赖（此前靠宿主 node_modules 兜底，迁出后暴露）——包自给性由目录迁移自然检验；
- pnpm 非交互 install 会把 `allowBuilds` 写成占位符，需修回。
