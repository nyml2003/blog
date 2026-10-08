# Blog 文档系统

这里是项目的正式文档入口。文档按职责分开，避免把稳定事实、当前实现快照、行为契约和临时工作记录混在一起。

## 阅读顺序

1. [FACTS.md](./FACTS.md)：项目稳定基线，内容受控；
2. [CODEMAP.md](./CODEMAP.md)：代码地图——"我想看某个东西，打开哪个文件"；
3. [GLOSSARY.md](./GLOSSARY.md)：术语表（人话版）；
4. [architecture/](./architecture/)：当前生效的系统架构；
5. [guides/](./guides/)：开发、测试、Spec、协作和运维方法；
6. [specs/](./specs/)：行为和公共契约；
7. [plans/](./plans/)：跨职能计划的目标、执行记录与归档；不是永久事实，也不是自动生效的待办清单。

## 生命周期

- 临时事实、讨论记录和探索日志默认不进入 `docs/`；
- `FACTS.md` 只记录稳定且受控的项目基线；
- `architecture/` 只描述当前真实生效的系统；
- `specs/` 描述可观察行为；已失效的契约移入 `specs/archive/`，作为历史依据保留；
- 当前实现快照必须能回到源码、配置或测试，不把旧讨论当成现状；
- 计划属于可选的工作记录。计划可以部分完成、暂停或被替代，归档不等于全部交付。

## 稳定文档与 Plan 的关系

- **方向单向**：Plan 可以引用 FACTS/architecture/specs/guides；稳定文档（FACTS、architecture、specs、guides、CODEMAP、GLOSSARY）不引用 Plan，不依赖 Plan 才能读懂；
- Plan 收尾时，把仍有效的行为契约与决策合并进对应的 Spec、architecture 或 FACTS，再迁入 `archive/`；归档后的 Plan 只作历史证据，不承担当前契约职责。

## 变更规则

产品负责人确认产品目标、永久事实和公共契约。文档变更应说明依据：源码/测试、稳定事实、有效 Spec
或明确决策；不要求每次文档改动都先创建 Plan。改变产品目标、公共协议或永久事实前，必须先取得明确决策。
