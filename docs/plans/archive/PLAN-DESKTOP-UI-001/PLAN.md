---
kind: plan
id: PLAN-DESKTOP-UI-001
status: completed
owner: frontend-desktop
created: 2026-09-09
last_reviewed: 2026-09-09
completed: 2026-09-09
---

# Desktop UI 组件库内部开发

## 目标

依据当前 Desktop 页面已经反复出现的稳定范式，建立只服务 Desktop 的
`src/frontend/desktop-ui` 组件库。第一轮只在组件库内部开发和测试，不修改现有页面、
shell 或样式入口，也不把任何组件接入产品页面。

Mobile UI 只提供分层、原生语义、受控状态和依赖边界的参考；Desktop 不复用 Mobile
的 JSX、CSS、DOM、组件工厂或组件内部状态。

## 当前重复证据

2026-09-09 对 `src/frontend/desktop/src/**/*.tsx` 的静态盘点显示：

| 范式 | 证据 | 本轮决定 |
| --- | --- | --- |
| 普通/主操作按钮及同外观链接 | `primary` 6 次，`button` class 6 次；Admin home、editor、guide、taxonomy、login 重复 | 准入 `Button` 与语义独立的 `ActionLink` |
| 标签 + 控件的字段结构 | `.field` 6 次；login、editor、taxonomy、ArticleSourceEditor 重复 | 准入只负责 label/control 关联的 `Field` |
| loading / empty / error / success 反馈 | `.state` 7 次，`.error` 7 次，另有已抽出的 `Status` 三态 | 准入无业务状态机的 `StateMessage` |
| eyebrow / muted 排版 | class 高频，但当前只是单一 class，抽组件不会增加语义或行为 | 缓建 `Text` / `Heading` / `Eyebrow` |
| input / textarea / checkbox | type、autocomplete、pattern、编辑器绑定和列表结构差异明显 | 缓建表单控件原子 |
| Shelf / Table / Header / ArticleBody / Tabs | 已有业务语义、领域类型或页面级交互 | 保留在 Desktop shell / 页面，不进入基础库 |
| Modal / Popover / IconButton | 当前没有两个稳定消费者 | 不预建 |

## 第一批契约

- `Button`：原生 `<button>`；只提供 `primary | secondary | danger`、
  `enabled | disabled | loading`、原生 type、content/block 宽度及已出现的基础属性。
- `ActionLink`：原生 `<a>`；仅表达具有按钮外观的站内导航，不与 Button 合并，不提供
  未出现的外链 target/rel 协议。
- `Field`：渲染一个显式 `label[for]` 和调用方提供的控件；不读取表单状态、不生成控件、
  不自动校验，也不预建 help/error API。
- `StateMessage`：展示 `loading | empty | error | success`；只映射稳定的 ARIA live/role
  与样式，不管理重试、请求或状态切换。

所有 Props 保持“必填主体 + `Partial` options”的整体语义。组件不导入 Client、Data、
query、路由、页面、Desktop shell 或 Mobile UI，不使用 CSS-in-JS、`data-*` 状态传输、
rest-prop API 或任意 class 注入。

## Workstream

| Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- |
| frontend-desktop | 当前 Desktop 盘点、Mobile UI 契约参考 | `src/frontend/desktop-ui/`、`src/frontend/{package.json,tsconfig.json}`、`ops/src/domain/architecture*.ts`、`docs/{architecture/frontend.md,CODEMAP.md,GLOSSARY.md}`、本计划目录 | completed |

与 `PLAN-CODE-LAYOUT-001` 的 `desktop/src/shell/`、queries/client 拆分及架构同步写集不重叠。

## 验收

1. 类型正负样例证明组件 API 不接受未声明变体、Button href、缺失 ActionLink href、
   缺失 Field 关联和未知消息状态。
2. SSR 结构测试证明原生元素、disabled/loading、ARIA、label 关联和 class 映射正确。
3. 依赖与样式所有权测试证明组件库不越过平台/数据边界，CSS selector 以 `.d-ui-` 为根。
4. Nix shell 下新增定向测试、typecheck、lint、format check、test:core 与 build 通过。
5. `rg` 证明 `desktop/src` 没有导入 `desktop-ui`；本轮不做页面截图或产品视觉验收，
   因为尚无消费者。接入必须另开迁移轮次并由用户验收。

## 明确非目标

- 不迁移、替换或删除任何现有 Desktop JSX/CSS；
- 不为了组件库统一视觉，不改变页面行为、DOM 或业务协议；
- 不复制完整 Mobile 组件清单，不引入第三方 UI/CSS/测试框架；
- 不把静态编译、SSR 或构建通过描述成真实页面视觉验收。
