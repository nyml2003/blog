# 当前架构

本目录描述当前生效的系统，不保存未采用的方案和临时讨论。

## 分域文档

- [UI/UX](./ui-ux.md)：视觉系统、页面边界和交互原则；
- [Frontend](./frontend.md)：Solid/Vite、多应用壳和前端依赖边界；
- [Backend](./backend.md)：Rust 服务、领域层和业务状态；
- [Infrastructure](./infrastructure.md)：Nix、SQLite、构建和运行环境；
- [Data and API](./data-and-api.md)：数据模型、API 契约和可见性；
- [Codec/Persistence](./codec-persistence.md)：序列化、持久化分层与错误契约。

每份文档只描述最近复核时点的当前状态，并通过 `FACT-*` 或 `SPEC-*` 引用稳定依据。历史方案不作为当前架构来源；必要的历史背景保留在归档 Spec、Git 历史或单独的证据记录中。
