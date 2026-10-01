---
kind: spec
id: SPEC-OPS-PARAMETERS-001
status: accepted
owner: infrastructure
last_reviewed: 2026-09-29
---

# Ops 字段参数模型

## 范围

保留既有命令路由、项目绑定、帮助别名、服务组合及退出码。字段声明驱动参数解析与帮助，不为命令编写独立的值解析器。

模型为 `int32 | enum | path | switch`，不实现通用 `string`、自定义解析或 `quality test`。测试编排另行接入。

## 模型与声明

原始 argv 为字符串数组。有值字段必须显式给值且只能出现一次；声明 `optional` 的字段允许整体缺省。无默认值，无环境变量或配置文件补值。

| 模型 | 字段声明 | 解析契约 |
| --- | --- | --- |
| `int32` | `kind`、`min`、`max` 全部必填 | 十进制 `[+-]?[0-9]+`，可有前导零；返回 number。范围必须位于 -2147483648 至 2147483647 内，字段可声明更窄范围 |
| `enum` | `kind`、完整 `values` | 非空且无重复的非空字符串集合；精确、区分大小写匹配，返回合法枚举字符串 |
| `path` | 只有 `kind` | 非空字符串；拒绝空串与换行符（CR/LF）；不 trim、不展开 `~`、不做路径规范化，原样返回 |
| `switch` | 只有 `kind` | 出现为 true，缺省为 false；重复出现仍为 true，不计数、不消费后续 token |

`switch` 与声明 `optional` 的有值选项是仅有的两种缺省许可，不提供可配置默认值。`optional` 只允许有值选项使用；位置参数与 `switch` 不得声明。`--name=true`、`--name=false` 非法；不自动生成 `--no-name`。

有值选项支持 `--name value` 和 `--name=value`，包括负整数。空串、空白、小数、指数、十六进制及溢出不是合法 int32，不截断或回绕。enum 不修剪或模糊匹配。

`--` 结束选项识别，之后只按位置参数处理；位置参数只允许有值模型且必须显式提供，不得声明 `optional`。全局开关不能越过 `--`，也不能修复有值选项与其值之间的缺口。

字段元数据只允许名称、说明、model、`optional`。禁止 `default`、`env`、`validate`、`parse` 等旧字段及任意自定义钩子。跨字段组合约束不进入字段元数据，由命令领域在执行前校验，失败按用法错误（10）退出且不产生副作用。注册检查拒绝未知模型、非法范围、重复/保留字段名、非法枚举与非法 `optional` 使用；声明不可在注册后修改。

## 当前命令

| 命令 | 字段 |
| --- | --- |
| `runtime dev` | 必填 `--scenario` enum: default, empty, slow, server-error, malformed-response；必填 `--web-port`、`--mock-port` int32 |
| `runtime backend` | 必填 `--data` enum: mock, test, prod；可选 `--database-path` path（仅 `--data prod` 时必填且只允许出现）；必填 `--content-source` enum: fixture, github；必填 `--product-port`、`--data-port` int32 |
| `runtime integration` | `--watch` switch；必填 `--content-source` enum: fixture, github；必填 `--product-port`、`--data-port` int32 |
| `e2e` | 必填 `--mode` enum: integration, dev；可选 `--scenario` enum: empty, slow, server-error, malformed-response（仅 dev）；必填 `--playwright-module`、`--chromium-path` path |
| `quality format` | `--check` switch；缺省写入格式化结果，出现时只检查 |
| 全局 | `--help`、`--dry-run`、`--json` switch，保留原有职责 |

全部端口范围明确声明为 1024–65535。`default` 是场景名称，不是缺省值。integration 固定 test 数据，backend/integration 的内容来源必须显式选择；dev 固定使用内置 fixture。回环监听和端口有界重试属于运行契约，不是参数补值。`--database-path` 是首个可选有值参数：未出现时键缺失；prod 缺路径、或非 prod 提供路径，都由组合校验以 10 退出。

帮助不要求补齐业务参数；dry-run 必须通过完整参数校验（含组合校验）。未知、缺失（必填）、重复有值参数、非法取值、switch 赋值或组合约束失败均以 10 退出，stderr 解释，stdout 最近帮助，不启动命令副作用。帮助完整展示类型、必填/可选性、范围及所有枚举值。

## 验收映射

- 模型输入、范围、完整枚举、path 取值、非法声明：`packages/cli-kit/test/value-parser.test.ts`。
- 缺参、重复、负数、全局 switch、分隔符与 optional 缺省：`packages/cli-kit/test/parser.test.ts`。
- 路由与帮助等价、非法输入零副作用、组合校验（prod 缺路径/非 prod 带路径）、format/watch dry-run：`apps/blog/test/entrypoints/cli.test.ts`。
- 帮助由声明生成、必填/可选性与全部取值：`apps/blog/test/entrypoints/help.test.ts`。
- 类型化执行边界、optional 声明边界、声明不可变：`packages/cli-kit/test/commands.test.ts`。
- 显式运行配置及服务启动参数（含 prod 的 `--data-database-path`）：`apps/blog/test/commands/port-allocation.test.ts`、`apps/blog/test/commands/runtime.test.ts`、`apps/blog/test/commands/runtime.stack.test.ts`。

## 决策

2026-09-06 用户确认：整体优化 ops 参数机制，路由保留；仅实现当前实际需要的模型；暂不支持自定义解析；switch 以存在性取值，check 也采用 switch。旧的端口、场景和数据模式默认值不保留兼容写法。

2026-09-26 用户确认：新增 `path` 值模型与 `optional` 有值参数，为 `runtime backend` 放行 `--data prod` 与 `--database-path`；路径显式传入、无默认值；组合校验失败以 10 退出。
