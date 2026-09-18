---
kind: plan
id: PLAN-LOOM-LIFECYCLE-001
status: ready
owner: project-manager
created: 2026-09-11
last_reviewed: 2026-09-11
---

# 生命周期闭环：适配器无关性证明（第四期）

## 定位

会话状态生命周期的收尾期（2026-09-11 用户拍板"可以做生命周期了，这个包应该是适配器无关的"）。内核工厂（`PLAN-LOOM-DATA-001` W3）与双宿主适配（`PLAN-LOOM-NODE-001` / `PLAN-LOOM-WEB-001`）均已交付——本期把三者组装闭环，让**适配器无关**从设计意图变成可执行证明：

```
createPersistentDesiredState（command，只吃 port 契约）
  ├── 组装 node 适配器 ── 同一剧本 ──┐
  └── 组装 web 适配器（注入 fake）── 同一剧本 ──┴── 投影序列必须一致
```

## 工作流

| 步 | 内容 | 验证 |
| --- | --- | --- |
| L1 适配器无关 contract 测试 | command 包新增 `adapter-independence.test.ts`（devDep 加 node/web 两宿主包；src 零宿主依赖由护栏守住）：同一工厂同一剧本双组装，断言投影序列 deepEqual | 双宿主序列一致 |
| L2 web 语义闭环 | web 组装的 `project` 经 `createWebDocument`（注入 fake root）写 `data-theme`，断言最终根属性 = 生命周期终态 | 主题投影浏览器语义跑通（零 solid） |
| L3 冒烟升级 | `scripts/package-smoke.ts` 手写 fake 换成真 node 适配器组装（memory persistence + node scheduler/opid） | 冒烟即"工厂 + 真适配器"端到端 |
| L4 门禁与入档 | `ops package check` 全绿、blog 回归、git add | 验收 |

## 验收

1. contract 测试绿：双宿主投影序列一致（含 restore / reconcile / 乐观 / 成功 settle）；
2. web 闭环绿：fake root 的 `data-theme` 反映生命周期终态；
3. 冒烟走真适配器，手写 fake 全部退场；
4. `ops package check` 全绿、五包测试不回退、blog `test:core` 零回归。

## 非目标

- 不做 solid signal 粘合与 blog 接入（另立项）；
- 不新增生命周期 API——工厂内核一期已定，本期只组装与证明。
