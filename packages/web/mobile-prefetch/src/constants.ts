/**
 * SW 的默认伺服/产物路径。
 * 后端静态服务（src/backend/product/src/static_files.rs）硬编码同一路径，
 * 改动需两处同步（有单测锚定本常量防止单侧漂移）。
 */
export const DEFAULT_SERVED_PATH = "/mobile-prefetch-sw.js";
