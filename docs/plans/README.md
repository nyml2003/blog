# 计划

Plan 面向一个跨职能、可验收的产品结果，不面向单个文件或单个技术动作。

## 目录

- `active/`：当前执行中的业务计划；
- `archive/`：已完成计划的结果和证据；
- `_template/`：新计划模板。

当前 active business plan：

- `PLAN-MOBILE-CSS-ARCHITECTURE-001`：C Mobile CSS 正交化；
- `PLAN-OPS-RUNTIME-DEV-001`：Ops Runtime 开发模式；

最近归档：

- `PLAN-ARTICLE-HTML-VALIDATION-001`：手写 Rust HTML Profile、native/WASM 共享校验、后端权威门禁与 B Desktop 诊断；
- `PLAN-CLIENT-SDK-001`：客户端 SDK 与 Solid Resource 适配；
- `PLAN-MOBILE-DENSITY-001`：C Mobile 信息密度优化；
- `PLAN-MOBILE-DENSITY-002`：C Mobile 信息密度优化第二轮；

第一条业务计划已按用户指定创建，后续计划沿用同一模板并由项目经理负责协调。

## 状态

```text
准备 -> 进行中 -> 阻塞 -> 验收 -> 完成 -> 归档
```

每个计划有一名项目经理，并可以包含产品、视觉、前端、BFF、后端、基建和运维等 workstream。任务声明 `write_set`，重叠写集不得并行执行。
