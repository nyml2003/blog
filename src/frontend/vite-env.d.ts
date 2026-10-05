/// <reference types="vite/client" />

/** 构建期注入（vite.config.ts 的 define）：本地部署构建为 true 时公开页面显示工作台入口。 */
declare const __BLOG_ADMIN_ENTRY__: boolean;
