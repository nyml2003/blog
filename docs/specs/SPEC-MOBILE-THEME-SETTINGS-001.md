---
kind: spec
id: SPEC-MOBILE-THEME-SETTINGS-001
status: accepted
owner: frontend-mobile
last_reviewed: 2026-09-19
---

# C Mobile 设置与主题

## 目标

为 C Mobile 提供设备本地的主题与正文字体设置。设置在所有启用 Mobile bootstrap 的页面首绘前应用，避免默认主题先闪现；设置页即时预览，持久化失败时恢复上一次稳定状态。

## 非目标

- 不自动跟随 `prefers-color-scheme`；
- 不引入网络字体、字号或行距设置；
- 不新增后端设置接口或跨设备同步；
- 不改变 Desktop 主题，也不修改全局 token 的名字和默认值；
- 不要求为了本功能一次性删除仍被管理预览使用的旧 Mobile UI。

## 契约

- **值域**：主题为 `paper | dark | sepia`，字体为 `sans | serif | mono`；默认 `paper` + `sans`。
- **载体**：当前值写入 `<html data-theme>` 与 `<html data-font>`。属性缺失或值非法时按默认值解释。
- **持久化**：规范键为 `blog.mobile.settings.v1`，值是同时包含 `theme` 和 `font` 的 JSON 快照。`blog.mobile.theme`、`blog.mobile.font` 只作为旧数据兼容读取；设置页成功读取后可迁移到规范快照，新写入不得继续拆成两个 key。
- **作用域**：主题变量覆盖当前 `.mobile-shell`，并兼容旧 `.m-page-container`；不得在 `html`/`body` 上重写整套全局 palette。
- **首绘**：页面注册表中 `bootstrap: true` 的 Mobile HTML 入口在 head 内同步执行同一首绘模块。HTML 模板不另写一份 key、枚举或回落规则。
- **分层**：kernel 定义 persistence ports 和可逆状态能力，宿主适配器由 `@fluvient-loom` workspace 包提供、经 bootstrap 装配，habitat 持有设置语义与页面组合，bootstrap 负责首绘装配。页面与 UI 组件不直接访问 `localStorage`。
- **保存**：选择先反映到期望状态并写入完整快照；写入或后续校验失败时恢复上一次稳定设置，保留错误提示和重试动作。快速连续选择以最后一次期望状态为准。
- **组件**：设置页使用 `Field` + 受控 `Select`；带底栏的公开 Mobile 页面提供推荐、文章、设置三项导航，详情页不显示底栏。

## 场景

### SPEC-MOBILE-THEME-SETTINGS-001-001

Given 设备没有可用设置

When 打开任一启用 bootstrap 的 Mobile 页面

Then 首绘使用 `paper` + `sans`，页面可正常操作

### SPEC-MOBILE-THEME-SETTINGS-001-002

Given 一个带底栏的公开 Mobile 页面

When 页面渲染导航

Then 推荐、文章、设置三项均可达且触控目标不小于 44px；详情页不显示底栏

### SPEC-MOBILE-THEME-SETTINGS-001-003

Given 用户把主题切换为 `dark`

When 保存成功

Then `<html data-theme="dark">` 立即生效，规范快照保存 `{ "theme": "dark", "font": <当前字体> }`

### SPEC-MOBILE-THEME-SETTINGS-001-004

Given 用户把字体切换为 `serif`

When 保存成功

Then `<html data-font="serif">` 立即生效，规范快照同时保留当前主题

### SPEC-MOBILE-THEME-SETTINGS-001-005

Given 规范快照已保存非默认设置

When 刷新或进入另一个启用 bootstrap 的 Mobile 页面

Then head 首绘模块在页面展示前应用同一设置，不出现默认值到已保存值的可见闪变

### SPEC-MOBILE-THEME-SETTINGS-001-006

Given 规范快照缺失、损坏或包含非法值

When 读取设置

Then 损坏或非法值安全回落到默认值；仅在规范快照缺失时读取旧 theme/font key，并由设置页迁移合法结果

### SPEC-MOBILE-THEME-SETTINGS-001-007

Given 任一非默认主题生效

When 检查 `.mobile-shell` 或兼容 `.m-page-container`

Then 文字与焦点可辨认、原生控件 `color-scheme` 匹配、窄屏无横向溢出且底栏不遮挡内容

### SPEC-MOBILE-THEME-SETTINGS-001-008

Given 设置页渲染并接收选择

When 审查依赖和数据流

Then 页面只绑定设置数据与命令，选项和值域位于 habitat 逻辑，UI 不导入 storage 或 infrastructure

### SPEC-MOBILE-THEME-SETTINGS-001-009

Given 两个 Field 分别包住主题和字体 Select

When 用户点击标签或用键盘导航

Then 正确的 Select 获得焦点并有可访问名称，两个字段互不冲突

### SPEC-MOBILE-THEME-SETTINGS-001-010

Given 设置页与同步首绘模块读取同一设备设置

When 检查 dev/build 产物

Then 两者复用同一套读取、校验和默认值逻辑，HTML 中没有平行实现

### SPEC-MOBILE-THEME-SETTINGS-001-011

Given 设备拒绝持久化写入

When 用户选择合法主题或字体

Then 页面恢复上一次稳定设置，显示保存失败与重试入口；刷新后不会把未持久化选择误认为已保存

## 边界与失败

- 同步首绘访问 storage 抛错时使用默认设置，不阻塞页面；
- 异步读取失败时页面保留当前安全状态并显示低干扰反馈；
- 写入失败的补偿也可能失败，界面仍以最后已知稳定状态为准并允许重试，不宣称持久化成功；
- 新增主题或字体需要同时扩展值域、变量和测试，不能只增加下拉选项；
- 主题切换不引入必要性不足的动画，现有 reduced-motion 规则继续生效。

## 测试/验收证据

- 当前实现落点：`app/habitat/mobile/logic/settings.ts`、`app/habitat/mobile/pages/settings.tsx`、`app/bootstrap/mobile/settings.tsx` 与 `vite-plugins/page-bootstrap.ts`；
- 自动化应覆盖默认值、规范快照、旧 key 迁移、非法值、写入失败补偿、最后一次选择、首绘注入和架构依赖；
- 历史交付曾通过前端门禁和浏览器走查，但已删除的计划证据不作为当前复核结果。当前改动仍应运行现有 typecheck、lint、format、核心测试和 build，并在代表性 Mobile 视口检查三主题与三字体。
