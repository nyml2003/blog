# Mobile 页面聚合契约

状态：已生效；实现已同步到 `src/core/protocol/`、前端 API client 和 `docs/api/routes.json`。

## 请求模型

每个公开 Mobile HTML 页面使用一个页面级 HTTP 接口请求页面数据。页面入口继续由
`src/frontend/pages.registry.ts` 注册；页面注册表不增加模块布局字段。

管理端 Mobile 预览继续使用管理接口和现有鉴权边界，不纳入公开页面级 BFF。

页面级接口根据现有 `sceneCode` 和页面上下文（例如文章 `id`、筛选条件）聚合多个业务模块。

## 响应模型

沿用现有 `{ code, message, data }` envelope。`data` 统一为模块数组：

```json
{
  "modules": [
    {
      "moduleKey": "mobile.navigation",
      "data": {
        "leftIcons": ["back"],
        "rightIcons": ["search", "favorite", "share", "more"],
        "shareUrl": "/m/articles/detail.html?id=1&share=article-1"
      }
    },
    {
      "moduleKey": "mobile.article-detail",
      "data": {
        "id": 1,
        "title": "...",
        "summary": "...",
        "contentHtml": "..."
      }
    }
  ]
}
```

约束：

- `moduleKey` 是前后端共同暴露的唯一模块键。
- 模块结果不带版本字段；不兼容的结构变更使用新的 `moduleKey`。
- 模块结果不带 `position`、DOM、CSS 或图标资源；页面布局由前端控制。
- 模块执行失败时从 `modules` 中省略，服务端记录结构化日志；其他模块继续返回。
- 前端只消费已注册且能校验通过的 `moduleKey`，未知模块跳过并记录协议问题。

## Mobile 导航模块

`mobile.navigation` 是页面级聚合中的一个模块，不单独发起 HTTP 请求。

- `leftIcons` 和 `rightIcons` 是语义图标 ID 列表。
- 前端将合法 ID 映射到现有 `lucide-solid` 图标和本地交互。
- 未返回的图标不展示；前端不补默认项。
- 请求或模块失败时按 fail fast 处理，不用默认导航兜底。
- “更多”菜单包含：回首页、收藏、分享、设置、主题切换。

## 收藏

- 收藏纯本地保存，不跨设备同步。
- 不新增收藏后端端点，不生成匿名读者身份。
- 文章收藏键为 `favorite:{articleId}`，值为字符串 `1`；读写通过前端 `PersistencePort` 完成。

## 分享归因

- 分享链接随页面级 BFF 的 `mobile.navigation` 数据返回。
- 文章分享链接使用 `/m/articles/detail.html?id={id}&share=article-{id}`，服务端按 `article-{id}` 校验归因 token。
- 归因明细保留 90 天，之后删除；聚合口径和清理任务需纳入后端验收。
