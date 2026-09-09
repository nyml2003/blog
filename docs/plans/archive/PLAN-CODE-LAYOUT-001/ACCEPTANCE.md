---
kind: plan-acceptance
id: ACCEPTANCE-PLAN-CODE-LAYOUT-001
plan_id: PLAN-CODE-LAYOUT-001
status: pending
last_reviewed: 2026-09-09
---

# 验收清单（用户逐项勾选）

## R0 清单审定

- [ ] 命名清单（WORKSTREAM-NAMING 候选表）逐项确认：同意 / 划掉 / 补充
- [ ] 拆分清单（WORKSTREAM-DOMAIN-SPLIT 拆分表）确认领域划分符合直觉
- [ ] 文件形态分类表确认：每个产物是 A（多导出、成员独立）还是 B（单导出），灰区逐个定夺

## 交付抽查

- [ ] 随机挑一个领域（如"货架"），只开 1-2 个文件就能说清它的取数逻辑
- [ ] 随机开几个前端文件，形态一眼可判：要么单导出组件，要么独立方法集——没有混合形态
- [ ] `grep -r "app.tsx\|ui.tsx"` 等旧名零残留；新名一眼可懂
- [ ] 页面文件在 R2 提交中 diff 为空（`git diff R1..R2 -- '*/pages/*'`）
- [ ] 浏览器抽查：公开页与管理页链接仍由 site-routes 下发且正常跳转
- [ ] `ops quality check` 全绿截图/输出

## 收尾

- [ ] CODEMAP"已知布局痛点"节改写为"已治理"或删除
- [ ] 确认后：计划归档，RESULT 补写
