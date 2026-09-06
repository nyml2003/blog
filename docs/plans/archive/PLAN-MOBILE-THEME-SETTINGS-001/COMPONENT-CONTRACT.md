---
kind: component-contract
plan_id: PLAN-MOBILE-THEME-SETTINGS-001
status: draft
owner: frontend-mobile
last_reviewed: 2026-09-06
---

# 设置页组件与接线契约

计划已于 2026-09-06 按代码交付归档，见 [RESULT.md](./RESULT.md)。本契约已用于源码实施，验证仍待补充，因此保留 draft 状态。

本文整合用户已确认的行为和边界，是本计划实施的输入，不表示组件已通过验收。决策来源见 [DECISIONS.md](./DECISIONS.md)。精确 TypeScript 类型和内部接入机制由前端在这些边界内确定；2026-09-06 编码已恢复，测试与验收继续暂停。

## 目录与依赖

```text
mobile-ui/
  atoms/          Label / Select 等独立控件
  molecules/      Field / PageHeader / BottomNav
  containers/     PageContainer
  styles/         tokens 消费、主题和各层自己的样式
```

- 页面组合容器和局部组件；molecules 可消费 atoms，atoms 不反向导入 molecules 或 containers。
- Field 与控件需要共享内部关联能力时，使用双方都可依赖的底层内部契约；不得通过向上导入 Field 实现关联，也不得引入页面 DOM 查询或父节点猜测。
- PageContainer 通过内容区域接收页头、主体和底部导航，不内置博客品牌、路由或当前页面判断。
- mobile-ui 不依赖 Data / Client / Mobile 适配层，不读取存储、URL 或业务状态，不导入 legacy 页面组件。它只消费已经归一化的显示输入。

## Select

- 输入为只读的 `{ value, label }` 选项列表、受控当前值和 `onChange(value)`。旧的 content + 原生 option 接口由该数据接口替代。
- value 是稳定标识，label 是显示文本；选项列表、当前值和回调保持一致类型。设置场景保留现有 theme / font 字符串枚举，不通过 DOM 类型断言伪造合法枚举。
- 组件内部生成原生 select / option 并读取 change 事件；页面不写 option，不处理 DOM 事件，不从显示文字推导值。
- 原生字符串值需与输入列表中的合法值对应后再回调；不能以类型断言替代此边界转换。
- 组件仍受控，外部当前值变化必须同步到 DOM，包括初次渲染时 option 插入与 value 应用的顺序。
- 本设置页始终存在有效默认值和完整三项列表，不新增清空、搜索、多选或未选择状态；通用空列表能力不在本轮扩展。
- Field 内自动获得标签关联；独立使用仍支持明确的可访问名称。保留原生键盘操作、disabled、焦点及既有可用状态能力。

## Field

- 每个 Field 组织一个标签与一个主要表单控件，统一负责关联和标签到控件的间距。
- 页面提供标签和独立控件，不重复维护 label.controlId 与 select.id，不用 p 等无关语义标签补间距。
- Field 内部可消费 Label；控件保持独立，不由 Field 获取其数据、保存值或改写用户事件。
- 多个 Field 的关联标识必须稳定且不冲突，点击标签聚焦对应控件。
- 内部共享上下文或显式绑定的选择由前端确定，必须满足无反向层级依赖、无页面 DOM 回写。
- 设置页不增加帮助文案、错误展示或校验规则。未来支持说明与错误时由 Field 统一组织；本轮不为预留能力建立通用表单引擎。

## PageHeader 与 BottomNav

- 分别位于 `molecules/page-header.tsx` 和 `molecules/bottom-nav.tsx`，以新的 UI 实现服务设置页。
- PageHeader 的标题、品牌文字及相关链接由外部提供；不内置 FIELD NOTES、技术知识库或首页地址。
- BottomNav 的导航项、可访问名称、链接和当前选中项由外部提供；不在内部使用 home/articles/settings 联合类型固定博客业务，也不读取 location 自行决定 active。
- 导航使用原生链接语义，保留浏览器历史、键盘激活和 aria-current；当前项不能仅靠颜色识别。
- 导航显示数据属于外部组合输入，与主题选项一样，不在 mobile-ui 内硬编码博客菜单。
- 两个组件消费容器提供的语义变量，不复制 legacy 页头/底栏的固定纸色背景。

## PageContainer

- 位于 `containers/page-container.tsx`，组织页头、主体、底部导航三个区域，并提供唯一主内容入口。
- 容器负责页面背景、视口覆盖、内容宽度、留白、安全区和导航内容避让；局部组件只负责自身内部布局。
- 内容较短时主题背景仍覆盖整页，内容较长时可正常滚动，底栏不遮住最后一个控件；沿用 Mobile 窄屏与触控约束。
- 主内容、页头和底栏全部位于容器主题边界内；不通过给每个 atom 涂背景模拟整页主题。
- 主题属性继续以 html 的 data-theme / data-font 为载体，变量覆盖落在 PageContainer 根，传递给内部组件。html / body 的全局 token 默认值不改。
- 原子通过语义变量继承主题，不依赖 `.settings-page .m-atom-*` 等页面覆盖规则；容器不得覆写控件内部样式。
- 旧页面不接入新容器，不引入新主题样式；首轮旧导航新增的设置入口保留。

## Data 与 Client

- `common/data` 提供可注入的通用本地存储适配，统一处理 getter、读取、写入异常和边界 null；不出现主题键名或枚举。
- `common/client` 拥有设置枚举、默认值、选项列表、存储键名与业务读写能力。当前固定选项只定义一份，后端数据来源替换不影响组件接口。
- 浏览器存储对象由 Client 组合根注入，页面与 mobile-ui 不接触 window.localStorage。设置能力放在独立模块，避免改动并行文章列表计划的 client.ts / domain.ts。
- 通用错误用 Result 或明确状态表达。Client 负责默认回落语义，Mobile 适配层保持用户本页选择；持久化失败不能撤销已生效选择。
- 保留现有异步 DataTask 契约，不将同步首绘强行包装为页面首屏等待任务。同步读取与页面读写必须共享同一套存储适配和领域归一化函数。

## Mobile 适配与首绘

- Mobile 适配层持有页面显示状态、调用 Client、向主题载体应用合法设置；页面只绑定状态与选择命令。
- HTML 首绘入口仍为 head 内同步执行。它由同一套 TypeScript 数据和 Client 源码装配，不能手工复制存储键、枚举、默认值或 catch 分支。
- dev 与构建产物都须提供等价同步首绘路径。具体打包或注入方式由前端使用现有 Vite 工具确定，不引入新依赖或全局配置。
- 首绘读取无值、非法值或失败时使用默认；非法值不回写。内联首绘被阻止时保持默认，页面不在挂载后重新读出暗色造成迟到切换；用户主动选择仍可正常应用。
- 切换立即更新本页状态与主题，再由 Client 尝试保存，不等待网络，不新增后端设置接口。

## 类型与实现审查

- Props、函数入参和测试遵守项目整体必填/可选语义；保留既有 defaults 能力，不为了新组件形式统一而引入无内容的配置包。
- 保留 Solid getter 和受控响应性，不通过对象 spread、提前解构或断言掩盖值变化；首轮 defineAtom 修复的 TS2345 外部报告须在恢复实现后处理。
- 现有 Props 测试应按已批准的新接口调整，保留无关原子约束。测试当前暂停，不能把契约文档当作验证证据。
- 精确 Props 名称、文件内 helper 和同步打包方式属于实现细节；超出已确认功能的新选项、新原子或其他页面迁移仍需用户决定。
