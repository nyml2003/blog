// 薄转发：实现已抽入 @blog/route-input（两端共享纯函数）。
// 保留路径使既有消费者（8 处，两端）零改动；P3d 批量迁移时可逐步直连。
export {
  displayDate,
  positiveFilterIdFromSearch,
  positiveIdFromSearch,
} from "@blog/route-input";
