---
kind: evidence
id: PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001-BASELINE-PERF
status: current
owner: frontend
created: 2026-09-30
last_reviewed: 2026-09-30
---

# Mobile 加载性能基线（2026-09-30）

## 度量方式

- 命令：`ops perf mobile --mode integration --runs 3`（自建隔离 integration 栈，Product 挂载 `src/frontend/dist`，fixture 内容）。
- 旅程：`cold-load` 直接打开 `/m/articles/index.html`；`nav-switch` 在 `/m/` 首页就绪后点击底栏"文章"链接（第二次导航，理论上可吃缓存）。
- 网络档位：`unthrottled`、`slow4g`（1.6Mbps / RTT 150ms，Lighthouse 移动默认）、`slow3g`（400kbps / RTT 400ms）。
- 指标：`shell` = 导航开始到底栏可见；`content` = 导航开始到分类/文章卡片可见；传输字节含 HTML；缓存命中 = transferSize 为 0 且有解码体积的资源数。
- 完整 JSON 报告在运行产物 `target/e2e/1790764766343-18046/perf-report.json`（target/ 不入库，以下表为留存证据）。

## 基线数据（3 次采样取中位）

| 档位 | 旅程 | shell | content | FCP | 传输 | 缓存命中 |
| --- | --- | --- | --- | --- | --- | --- |
| unthrottled | cold-load | 50ms | 55ms | 44ms | 183.6KB | 0/9 |
| unthrottled | nav-switch | 77ms | 78ms | 52ms | 183.6KB | 0/9 |
| slow4g | cold-load | 1349ms | 1627ms | 1348ms | 183.6KB | 0/9 |
| slow4g | nav-switch | 1373ms | 1651ms | 1332ms | 183.6KB | 0/9 |
| slow3g | cold-load | 5085ms | 5867ms | 4752ms | 183.6KB | 0/9 |
| slow3g | nav-switch | 5101ms | 5879ms | 4724ms | 183.6KB | 0/9 |

## 关键读数

1. 所有档位、包括第二次导航，静态资源缓存命中都是 0：`static_files.rs` 未设置 Cache-Control/ETag/Last-Modified，nginx 也未配置，浏览器每次切换页面都全量重下约 183.6KB（其中 JS 约 150KB，zod schemas chunk 约 111KB 是大头）。
2. 弱网下"切换页面"与"冷加载"耗时几乎相同（slow3g 5.9s vs 5.9s）：缓存缺失把每次底栏点击都变成了完整冷加载。这是"切换后加载慢"与"底栏抖动（白屏窗口被拉长）"的主要放大器。
3. 本地不限速时切换约 78ms，说明还有 site-routes 阻塞首绘等串行问题，但绝对值被本地环境掩盖；弱网档位才是接近真实部署的参照。

## 后续对比口径

- 任何静态缓存/压缩/首绘优化后，用同一命令、同参数重跑，对比 `nav-switch` 的传输字节（目标 ≈ 0KB）与 content 中位数。
- 线上验收：`ops perf mobile --origin https://<部署域名> ...` 跑真实链路（含 nginx、TLS、真实 RTT），数字与本地 integration 档分开记录。

## 优化后对比（2026-09-30，同命令同参数，3 次采样取中位）

P0-1（`static_files.rs` 静态资源 `Cache-Control`：assets immutable 1 年、HTML no-cache；nginx 模板开 gzip）与 P0-2（Mobile bootstrap 构建期内嵌 site-routes，`app/bootstrap/mobile/environment.tsx`）之后：

| 档位 | 旅程 | 指标 | 基线 | P0-1 后 | P0-1+P0-2 后 |
| --- | --- | --- | --- | --- | --- |
| slow3g | nav-switch | content | 5879ms | 1971ms | **1697ms**（-71%） |
| slow3g | nav-switch | shell（底栏可见/白屏窗口） | 5101ms | 1694ms | **918ms**（-82%） |
| slow3g | nav-switch | 传输 | 183.6KB | 16.7KB | **15.6KB** |
| slow4g | nav-switch | content | 1651ms | 820ms | **667ms** |
| slow4g | nav-switch | shell | 1373ms | 545ms | **388ms** |
| unthrottled | nav-switch | 传输/缓存命中 | 183.6KB，0/9 | 16.7KB，6/9 | 15.6KB，6/8 |
| slow3g | cold-load | content | 5867ms | 5830ms | 5134ms |

读数：

1. 切换页面的静态资源传输从全量 183.6KB 降到 15.6KB，剩余为 HTML（no-cache，约 1.7KB）+ category-shelf API（约 11KB）+ 导航打断重传噪音；缓存命中稳定 6/8。
2. site-routes 请求从导航链路中消失（请求数 9→8），cold-load 与 nav-switch 同时受益。
3. 冷加载仍要下载全部 JS（约 150KB），weak 网络下约 5.1s；这属于冷启动一次性成本，后续可由 schemas 瘦身与线上 gzip 进一步压缩（gzip 只在 nginx 生效，本地 integration 栈不体现）。
4. 运行产物：P0-1 后 `target/e2e/1790765559873-25502/`，P0-2 后 `target/e2e/1790765858672-28954/`；E2E 旅程（`ops e2e --mode integration`）在两项改动后均通过。
