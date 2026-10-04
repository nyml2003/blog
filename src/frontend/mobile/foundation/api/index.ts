// 薄转发：实现已抽入 @blog/mobile-api（api client + 类型 + 数据资源钩子）。
// 保留路径使既有消费者零改动；迁移完成后再逐步直连。
export * from "@blog/mobile-api";
