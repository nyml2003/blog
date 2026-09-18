---
kind: plan-r0-decisions
id: R0-PLAN-PAGE-RUNTIME-001
plan_id: PLAN-PAGE-RUNTIME-001
status: draft
owner: project-manager
last_reviewed: 2026-09-11
---

# R0 决策表：ViewAdapter 接口与生命周期映射（M2 前置报审）

状态说明：本表为 2026-09-11 设计草案。随 PLAN 范围裁定（D7/D8，2026-09-11），导航脊柱已后置出第一期——**本表审定排期随导航脊柱期定，审定前导航侧代码不动**。R0-1 ~ R0-5 为待拍板项，其余为已达成共识的记录。

## 一、两份契约（先拆概念）

ViewAdapter 不是一份接口，是两份互为镜像的契约之间的实现层：

```
内核 ──(ViewAdapter 端口：视图中性词汇)── SolidViewAdapter ──(页面模块契约)── Solid 页面
```

- **ViewAdapter 端口**：内核调用的面，只说视图中性词汇（创建 / 挂区域 / 显隐 / 停车 / 销毁 / 取快照 / 转场窗口）；
- **页面模块契约**：页面作者面对的面（静态导出 + 注入 ctx 上的运行时注册）。

SolidViewAdapter 的职责 = 翻译。Ionic 的教训不是适配层难，是两份契约都没定义清楚就开始写。

## 二、ViewAdapter 端口（内核 → 适配器，设计稿非实现）

```ts
interface ViewAdapter {
  create(module: PageModule, ctx: PageContext,
         init: { snapshot?: Snapshot }): ViewHandle;
}

interface ViewHandle {
  attach(region: Region): void;      // createRoot + 挂载（Solid：手工 root + insert）
  show(): void;                      // 可见（池命中返回路径）
  conceal(): void;                   // 遮蔽 = 停车：DOM 移出 region 入 detached 容器，实例保活
  dispose(): void;                   // WillUnload → root.dispose()（跑 onCleanup 链）
  snapshot(): Snapshot | undefined;  // 收割页面注册的打包器（必须先于 dispose，闭包一死即不可取）
}
```

- 转场窗口由适配器统一包 `withTransition(from, to, swap): Promise<void>`（骑 View Transitions，降级立即执行），内核只拿 Promise；
- "停车"（keep-alive 的 DOM 机制）整体封装在适配器内，内核无感。

## 三、页面模块契约（页面作者面，设计稿非实现）

静态导出（registry 注册时校验）：

```ts
export default definePage({
  form: "page" | "sheet" | "modal",     // 组合指令（进当前槽 / 开新槽）
  title: string | ((params) => string), // 可为参数函数（detail 异步标题）
  params: schema,                        // 寻址参数 schema
  component: Component<PageProps>,
});
```

运行时注册（setup 期间调用，Solid 注册制习惯，同 `onCleanup`）：

```ts
ctx.navigation                        // handle：push / pop / replace（NavigationPort 长大）
ctx.scheduler / resource / mutation   // 页作用域 port：运行时统一挂起 / 恢复
ctx.onSnapshot(packer)                // 打包器，可多次注册（浅合并）；restore 经创建参数注入
ctx.onEnter / onLeave                 // 可选自定义钩子（基础设施已覆盖大多数场景）
```

三分法落位：**字段**（静态声明，registry 校验）/ **handle**（注入的命令能力）/ **钩子**（运行时注册）。

## 四、生命周期映射表（共识记录）

| Ionic 词汇 | 事务阶段 | Solid 机制 | 实现者 |
| --- | --- | --- | --- |
| WillEnter | commit（同步、转场前） | attach / show 之前 | 内核发，适配器转发 |
| DidEnter | settle（**异步**、转场结束） | VT finished / 降级立即 | 适配器（afterVisible） |
| WillLeave | begin 末（同步、仍可交互） | conceal 之前 | 内核发 |
| DidLeave | 遮蔽完成（含转场后） | conceal 完成 | 适配器 |
| WillUnload | dispose 前 | `root.dispose()` 之前 | 内核发 |

- **Did 系天然异步**：转场不结束就不算 Entered/Left（适配器统一 afterVisible，无 VT 立即）——Solid 没有这层语义，是适配器要"合成"的核心部分；
- **Solid 没有"隐藏"概念**：DOM 停车不停效应，挂起靠内核在 WillLeave 暂停页作用域 port，纯 computed 不停（无害）；
- 焦点契约：WillEnter → 焦点移主区；pop 的 settle → 焦点还原 origin（元素已销毁则降级到最近容器）。

## 五、待审定决策

| # | 决策 | 推荐 | 备选与代价 |
| --- | --- | --- | --- |
| R0-1 | restore 时机 | **创建参数**：首渲染即旧态，滚动位置立刻正确 | 挂载后调用：实现简单，首帧闪一下 |
| R0-2 | 打包时机 | **遮蔽完成时**（DidLeave/conceal）+ pagehide 全池刷新 | WillLeave 时：转场中的变更会丢 |
| R0-3 | Did 钩子语义 | **转场 settle 后异步**（afterVisible 统一抽象），无 VT 立即 | 一律同步：丢转场语义，否决 |
| R0-4 | 挂起机制 | **内核在 WillLeave 暂停页作用域 port**；页面无感 | 页面自觉暂停：Ionic 散装税，否决 |
| R0-5 | 停车实现 | **createRoot + DOM 移入 detached 容器**，封装在适配器内 | 整树销毁重建 = 放弃池 |

R0-1、R0-2 直接决定快照能否兑现"pop 回来像素级原样"，为五条中最重。

## 六、审定后动作

1. 将本表升级为 `SPEC-PAGE-RUNTIME-VIEW-001`（Build 强度起步，Acceptance 随导航脊柱期验收补齐）；
2. 导航脊柱期 workstream 按 Section 二/三 的接口面拆任务；
3. 若 R0-1/R0-2 采纳推荐，"articles → detail 返回原样"项（接入期验收）以像素级为标准。
