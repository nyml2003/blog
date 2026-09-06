# 2026-09-07 后端基础实施证据

本轮为部分实施，不作为计划整体验收或生产发布证据。测试使用临时目录、SQLite 和模拟远端，没有访问内容 GitHub 仓库。

## 已验证

- Product 与 Mock 的非法创建、草稿更新和已发布文章更新返回 422，保留整份旧记录；服务端不信任客户端的 HTML 校验声明。
- Product 内容库 18 项测试覆盖空 Git 文件树、HTML 原文往返、路径 ID 规范、引用错误、禁止覆盖已有目录、保存无远端写入、旧版本冲突、空提交、当前进程 ID 不复用、同 PR 更新、关闭失败保留批次、同步互斥与上次成功版本保留。
- Data prod 正常关闭不删除库文件，写入实际类型数据后重新打开仍可读取；不加载 seed；缺路径退出 10。

## 命令

以下均在项目根通过 `nix develop ./nix -c` 执行：

| 命令 | 结果 |
| --- | --- |
| `cargo test --manifest-path src/Cargo.toml -p product -p data -p mock --no-fail-fast` | 通过，含 HTTP/进程集成测试 |
| `cargo test --manifest-path src/Cargo.toml -p data prod_ -- --nocapture` | 最后补充的实际数据保留与退出码测试通过 |
| `cargo clippy --manifest-path src/Cargo.toml -p product -p data -p mock --all-targets -- -D warnings` | 通过 |
| `cargo fmt --manifest-path src/Cargo.toml --all -- --check` | 通过 |
| `pnpm -C src/frontend run typecheck` | 本轮早期执行通过，未修改前端；不代表最终前端整体门禁 |
| `git diff --check` | 通过 |

过程中旧 fixture 数量断言曾失败。工作区中有并行的其他计划变更，后来当前文件状态下三服务测试通过；没有回退其 fixture 或据此宣称本计划完成了公共端浏览器验收。

## 尚未交付

- 真实 GitHub transport、固定 main commit 下载、首次合入时间恢复、PR 部分成功与超时恢复、多分支异常识别。
- Data 单事务快照替换、持久同步版本、推荐引用跨替换保留、旧内容写操作退役。
- 工作区从已发布快照/远端分支恢复、跨重启历史 ID 管理、合并后新保存改动保留、已合并 PR 禁止放弃。
- 认证 HTTP、完整管理 DTO/SDK/Mock 工作台、编辑器切换、启动和手动同步入口、真实仓库及浏览器验收。

工作区、同步与远端边界目前为 Product 库组件，没有挂到 HTTP 或启动流程。同步测试使用 apply 回调，不能证明数据库事务原子性。Mock 远端没有真实网络调用，不能证明 GitHub 的提交次数或恢复行为。当前管理端的合法保存/发布仍走既有 Data 路径；新流程必须在依赖交付后一次性切换。

未创建定时重启、定时同步、webhook 或 ops 内容同步命令；代码搜索未发现已实现的内容同步定时任务。没有提交、推送、部署或发布。
