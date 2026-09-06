---
kind: spec
id: SPEC-MOBILE-THEME-SETTINGS-001
status: draft
owner: frontend-mobile
plan_id: PLAN-MOBILE-THEME-SETTINGS-001
last_reviewed: 2026-09-06
---

# C Mobile 设置页与容器主题

## 目标

为 C Mobile 提供设置页，允许用户选择主题风格（纸张 / 暗色 / sepia）与正文字体族（无衬线 / 衬线 / 等宽，均为系统字体栈）。设置持久化在设备本地，于首绘前应用、不闪屏。主题与字体以 mobile-ui 的 PageContainer 为边界，覆盖设置页背景、新页头、主体和新底部导航；未迁移的旧页面保持现状。

本版本按用户已确认的 [迭代决策](../plans/active/PLAN-MOBILE-THEME-SETTINGS-001/DECISIONS.md) 修订首轮 atom 根方案。组件与接线边界见 [COMPONENT-CONTRACT.md](../plans/active/PLAN-MOBILE-THEME-SETTINGS-001/COMPONENT-CONTRACT.md)。Spec 仍为 draft，代码与测试当前暂停。

## 非目标

- 不做“跟随系统”（`prefers-color-scheme` 联动）自动主题；
- 不为 legacy 样式模块（shell / layout / pages / components / shelf / filter / detail / article-body）做任何主题适配或视觉验收；
- 不引入网络字体、字号、行距设置；
- 不新增 Radio / Switch 等原子或通用表单引擎；本轮增加 Field、PageHeader、BottomNav、PageContainer，修订已确认的 Select 接口及必要关联能力；
- 不新增后端设置接口，不迁移其他旧页面；
- 不做 Desktop 端主题；不修改 `tokens.css` 既有 palette 名字与 `:root` 默认值。

## 契约

- **值域冻结**：`data-theme ∈ { paper, dark, sepia }`，`data-font ∈ { sans, serif, mono }`；默认 `paper` + `sans`，保持既有纸张风格与系统无衬线栈。
- **载体**：设置写入 `<html>` 的 `data-theme` / `data-font` 属性；属性缺失按默认值解释。
- **存储**：`localStorage`，键名 `blog.mobile.theme` 与 `blog.mobile.font`；只写入合法枚举值。
- **作用域**：在 html 的主题 / 字体属性前缀下，仅对 PageContainer 根覆盖语义变量及 `--font-body`，由内部组件继承；页面背景与留白也是主题的一部分。不得在 html / body 上覆盖全局 token，不修改 `tokens.css` 的 `:root` 默认值或既有 palette 名字。
- **首绘**：设置页 HTML 在 head 中同步执行首绘入口（非 defer / async），先读取存储并设置属性。入口必须由同一套 Data / Client 读取和校验源码装配，不在 HTML 手写第二份存储规则；其他页面迁移不在本轮范围。
- **原生控件**：容器内 `color-scheme` 随主题（dark 为 dark，paper / sepia 为 light），保证 select 等原生控件外观一致。
- **数据分层**：common/data 负责通用存储与传输，common/client 提供主题 / 字体选项、当前设置与保存能力，Mobile 适配层连接页面状态与主题载体。页面和 mobile-ui 不直接访问存储或定义选项列表；当前固定选项属于 Client，未来可以替换数据来源。
- **组件组合**：Field 包住独立 Select，统一管理标签关联与间距；Select 接收 `{ value, label }` 列表、当前值和 `onChange(value)`，内部处理 DOM 事件与 option 渲染。页面不重复填写 label/control ID，不以 p 标签补表单间距。
- **页面壳**：设置页新用 mobile-ui/molecules 下的 PageHeader 和 BottomNav，由 PageContainer 组织并整体主题化。展示内容、导航项及当前选中项从外部传入，组件不内置博客路由或自行取数。

## 场景

### SPEC-MOBILE-THEME-SETTINGS-001-001

Given 设备没有存储任何设置值

When 用户打开设置页或任一未迁移的旧 Mobile 页面

Then 设置页使用纸张配色与无衬线系统栈，旧页面保留既有外观，新增容器不改变全局默认值

### SPEC-MOBILE-THEME-SETTINGS-001-002

Given 带底部导航的 Mobile 页面

Then 底部导航呈现第三项“设置”，指向 `/m/settings/index.html`，与既有两项同等可达（触控目标不小于 44px）

And 设置页使用新的 PageContainer、PageHeader、BottomNav 与 Field + Select；旧页面保留原导航实现，详情页继续不显示底栏

### SPEC-MOBILE-THEME-SETTINGS-001-003

Given 用户在设置页将主题从“纸张”切换为“暗色”

When 选择发生

Then `<html data-theme="dark">` 立即更新，PageContainer 的背景、页头、主体、底部导航及内部控件即时切换为暗色

And 未迁移的旧页面保持原有配色，不因设置页切换而获得主题适配

And `localStorage` 写入 `blog.mobile.theme = "dark"`

### SPEC-MOBILE-THEME-SETTINGS-001-004

Given 用户在设置页将字体从“无衬线”切换为“衬线”

When 选择发生

Then PageContainer 及其内部组件的 `font-family` 即时切换为衬线系统栈，未迁移旧页面不变

And `localStorage` 写入 `blog.mobile.font = "serif"`

### SPEC-MOBILE-THEME-SETTINGS-001-005

Given `blog.mobile.theme = "dark"` 已存储

When 用户刷新或重新进入设置页

Then 容器及内部内容首绘即为暗色，不出现“纸张 → 暗色”的可见闪变，下拉框显示的值与已应用设置一致

And 内联脚本执行失败或被禁用时，页面回落默认纸张外观，内容功能不受影响

### SPEC-MOBILE-THEME-SETTINGS-001-006

Given 存储中存在非法值（如 `theme = "neon"`）

When 首绘脚本或设置页读取该值

Then 按未设置处理，回落默认 `paper` / `sans`，不抛异常，不回写新值

### SPEC-MOBILE-THEME-SETTINGS-001-007

Given 任一非默认主题生效

When 检查 PageContainer、新页头、主体与新底部导航

Then 实际文字对比度不低于 4.5:1，focus ring 对其实际背景可见，原生控件 color-scheme 跟随，触控目标不小于 44px，窄屏无横向溢出且底栏不遮挡内容

### SPEC-MOBILE-THEME-SETTINGS-001-008

Given Client 提供主题和字体选项及当前设置

When 设置页渲染并接收用户选择

Then 页面只绑定数据与变更命令，Select 内部生成 option 并回调 value；页面和 mobile-ui 不包含设置存储访问或硬编码的选项列表

And 当前固定选项与未来外部数据均由 Client 归一化为同一列表结构，通用 Data 层不包含设置业务语义

### SPEC-MOBILE-THEME-SETTINGS-001-009

Given 两个 Field 分别包住主题和字体 Select

When 用户点击其中一个标签

Then 对应 Select 获得焦点且拥有正确可访问名称，两个字段 ID 不冲突，页面无需重复维护 ID 或包 p 标签设置间距

### SPEC-MOBILE-THEME-SETTINGS-001-010

Given 设置页与同步首绘入口读取同一设备设置

When 检查其源码和 dev / build 装配

Then 两者复用同一套 Data / Client 读取、校验和回落逻辑，HTML 不独立维护存储键名、枚举或异常处理

### SPEC-MOBILE-THEME-SETTINGS-001-011

Given 设备禁止本地存储写入

When 用户选择合法主题或字体

Then 当前页面状态、Select 显示与容器主题立即一致地更新，写入失败不撤销选择、不阻塞页面；重新打开时按可读取数据或默认值恢复

## 边界与失败

- **localStorage 不可用**（隐私模式 / 禁用）：读写以 try/catch 包裹；设置在当前页面会话内以内存状态生效，不报错、不阻塞页面。
- **能力缺口处理**：允许已确认的组合、容器、Select 和 Field 关联调整；超出这些决策的能力缺口仍须用户裁决，不得绕过组件契约。
- **主题边界**：完整设置页主题化，其他旧页面不迁移；不是给所有页面自动套主题。独立使用 atom 不再被视为自动获得整页主题能力。
- 主题切换不引入新动画；既有 `prefers-reduced-motion` 全局规则不因本机制改变。
- 新增主题 = 扩展枚举值 + 主题模块新增一个变量块，机制与已上线页面不改。
- 本 Spec 按用户决策将变量覆盖边界提升到 PageContainer，并允许新的组合组件和受控 Select 数据接口。归档 ATOM-CONTRACT 保留历史说明，实际交付后追加修订记录；全局 token 默认值和名字不变。

## 测试/验收证据

2026-09-06 当前状态：用户要求先讨论并在本计划内迭代，代码和测试暂停。新组件、容器主题与数据分层已明确，尚未实施；首轮 Select 修复也未由本线程复验。以下结果均为首轮历史记录，不覆盖本版 001-001 至 001-011 场景。Spec 保持 draft。

- 自动化测试：2026-09-06，`direnv exec /home/nyml/projects/blog pnpm --dir src/frontend exec tsx --test mobile/src/logic/settings.test.ts mobile-ui/atoms/types.test.ts` 退出 0，7 条设置测试与 2 条原子测试通过；覆盖枚举、九种合法组合、缺省 / 非法值不回写、存储 getter / read / write 失败、DOM 属性应用及 head 脚本 49 组输入与模块校验一致性。`typecheck`、`lint`、`format:check`、`build`、`test:core` 均退出 0。详细命令和证据边界见 [FRONTEND-RESULT.md](../plans/active/PLAN-MOBILE-THEME-SETTINGS-001/FRONTEND-RESULT.md)。`test:core` 仍使用原显式列表，设置测试由上述独立命令执行；
- 新版验收：全部待补充。恢复后覆盖 375x812 与 360px 下三主题 × 三字体整页外观、首绘、选中值恢复、Field 关联、数据层边界、存储失败、原生导航与旧页面不变。暂停前的浏览器脚本基于 atom 根断言，需要随新版场景调整后才可复用。
