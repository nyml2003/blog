// 根级类型声明：packages/* 域内（build/app 等不经 vite 环境的程序）
// 对样式副作用导入的类型支持。前端自身的 vite-env.d.ts 保持不变。
declare module "*.css";
