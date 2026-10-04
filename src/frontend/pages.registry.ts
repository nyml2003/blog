import { desktopDetailPage } from "@blog/page-desktop-detail";
import {
  type PagePlatform,
  type PageRegistration,
  type PageRoute,
  pageRoutes as flattenPageRoutes,
} from "@fluvient-loom/page-build-kit";
import type { PageMetadata } from "@fluvient-loom/page-kit";

export type { PagePlatform, PageRegistration, PageRoute };

// 聚合产物：页面包声明"页面是什么"（域元数据），注册表补充构建域（outputPath/entry）。
// PageMetadata 与 PageRegistration 的对齐由下方 satisfies 编译锚定。
function aggregatePage(
  metadata: PageMetadata,
  build: {
    readonly outputPath: string;
    readonly entry: string;
    readonly description?: string;
    readonly bootstrap?: boolean;
  },
): PageRegistration {
  return {
    id: metadata.id,
    platform: metadata.platform,
    outputPath: build.outputPath,
    entry: build.entry,
    title: metadata.title,
    description: build.description,
    aliases: metadata.aliases,
    bootstrap: build.bootstrap ?? false,
  } satisfies PageRegistration;
}

const mobileDetailShell = {
  platform: "mobile",
  loadingLabel: "正在加载文章",
  shimmer: false,
  regions: [
    { id: "header", role: "banner", blockSize: "68px", placeholders: [] },
    {
      id: "content",
      role: "main",
      blockSize: "720px",
      placeholders: [
        { kind: "line", blockSize: "14px", inlineSize: "24%" },
        { kind: "line", blockSize: "30px", inlineSize: "94%" },
        { kind: "line", blockSize: "30px", inlineSize: "78%" },
        { kind: "line", blockSize: "12px", inlineSize: "44%" },
        { kind: "line", blockSize: "14px", inlineSize: "92%" },
        { kind: "line", blockSize: "14px", inlineSize: "84%" },
        { kind: "line", blockSize: "14px", inlineSize: "68%" },
        { kind: "media", blockSize: "180px", aspectRatio: 16 / 9 },
        { kind: "line", blockSize: "14px", inlineSize: "90%" },
        { kind: "line", blockSize: "14px", inlineSize: "82%" },
        { kind: "line", blockSize: "14px", inlineSize: "74%" },
      ],
    },
  ],
} as const;

export const pageRegistry: readonly PageRegistration[] = [
  {
    id: "desktop-public-home",
    platform: "desktop",
    outputPath: "desktop/pages/public-home/index.html",
    entry: "/bootstrap/desktop/home.tsx",
    title: "首页 - 技术知识库",
    description: undefined,
    aliases: ["/"],
    bootstrap: false,
  },
  {
    id: "desktop-public-articles",
    platform: "desktop",
    outputPath: "desktop/pages/public-articles/index.html",
    entry: "/bootstrap/desktop/articles.tsx",
    title: "文章档案 - 技术知识库",
    description: undefined,
    aliases: ["/articles/index.html"],
    bootstrap: false,
  },
  aggregatePage(desktopDetailPage, {
    outputPath: "desktop/pages/public-detail/index.html",
    entry: "/bootstrap/desktop/detail.tsx",
  }),
  {
    id: "desktop-admin-login",
    platform: "desktop",
    outputPath: "desktop/pages/admin-login/index.html",
    entry: "/bootstrap/desktop/login.tsx",
    title: "登录 - 管理台",
    description: undefined,
    aliases: ["/admin/login.html"],
    bootstrap: false,
  },
  {
    id: "desktop-admin-home",
    platform: "desktop",
    outputPath: "desktop/pages/admin-home/index.html",
    entry: "/bootstrap/desktop/admin-home.tsx",
    title: "文章管理 - 管理台",
    description: undefined,
    aliases: ["/admin/index.html", "/admin", "/admin/"],
    bootstrap: false,
  },
  {
    id: "desktop-admin-article-new",
    platform: "desktop",
    outputPath: "desktop/pages/admin-article-new/index.html",
    entry: "/bootstrap/desktop/editor-new.tsx",
    title: "新建文章 - 管理台",
    description: undefined,
    aliases: ["/admin/articles/new.html"],
    bootstrap: false,
  },
  {
    id: "desktop-admin-article-edit",
    platform: "desktop",
    outputPath: "desktop/pages/admin-article-edit/index.html",
    entry: "/bootstrap/desktop/editor-edit.tsx",
    title: "编辑文章 - 管理台",
    description: undefined,
    aliases: ["/admin/articles/edit.html"],
    bootstrap: false,
  },
  {
    id: "desktop-admin-editor-guide",
    platform: "desktop",
    outputPath: "desktop/pages/admin-editor-guide/index.html",
    entry: "/bootstrap/desktop/editor-guide.tsx",
    title: "编辑器使用指南 - 管理台",
    description: undefined,
    aliases: ["/admin/editor-guide/index.html"],
    bootstrap: false,
  },
  {
    id: "desktop-admin-article-types",
    platform: "desktop",
    outputPath: "desktop/pages/admin-article-types/index.html",
    entry: "/bootstrap/desktop/taxonomy.tsx",
    title: "分类与发布工作台 - 管理台",
    description: undefined,
    aliases: [
      "/admin/content/workspace.html",
      "/admin/article-types/index.html",
    ],
    bootstrap: false,
  },
  {
    id: "desktop-admin-terms",
    platform: "desktop",
    outputPath: "desktop/pages/admin-terms/index.html",
    entry: "/bootstrap/desktop/taxonomy.tsx",
    title: "分类与发布工作台 - 管理台",
    description: undefined,
    aliases: ["/admin/terms/index.html"],
    bootstrap: false,
  },
  {
    id: "desktop-admin-article-preview",
    platform: "desktop",
    outputPath: "desktop/pages/admin-article-preview-desktop/index.html",
    entry: "/bootstrap/desktop/admin-preview.tsx",
    title: "桌面预览 - 管理台",
    description: undefined,
    aliases: ["/admin/articles/preview/desktop.html"],
    bootstrap: false,
  },
  {
    id: "mobile-home",
    platform: "mobile",
    outputPath: "mobile/pages/home/index.html",
    entry: "/bootstrap/mobile/home.tsx",
    title: "首页 - 技术知识库",
    description: undefined,
    aliases: ["/m/", "/m"],
    bootstrap: true,
  },
  {
    id: "mobile-articles",
    platform: "mobile",
    outputPath: "mobile/pages/articles/index.html",
    entry: "/bootstrap/mobile/articles.tsx",
    title: "文章库 - 技术知识库",
    description: undefined,
    aliases: ["/m/articles/index.html"],
    bootstrap: true,
  },
  {
    id: "mobile-article-list",
    platform: "mobile",
    outputPath: "mobile/pages/article-list/index.html",
    entry: "/bootstrap/mobile/article-list.tsx",
    title: "文章检索 - 技术知识库",
    description: undefined,
    aliases: ["/m/articles/list.html"],
    bootstrap: true,
  },
  {
    id: "mobile-article-detail",
    platform: "mobile",
    outputPath: "mobile/pages/article-detail/index.html",
    entry: "/bootstrap/mobile/detail.tsx",
    title: "文章详情 - 技术知识库",
    description: undefined,
    aliases: ["/m/articles/detail.html"],
    bootstrap: true,
    shell: { id: "mobile-detail-shell", ...mobileDetailShell },
  },
  {
    id: "mobile-settings",
    platform: "mobile",
    outputPath: "mobile/pages/settings/index.html",
    entry: "/bootstrap/mobile/settings-page.tsx",
    title: "设置 - 技术知识库",
    description: undefined,
    aliases: ["/m/settings/index.html"],
    bootstrap: true,
  },
  {
    id: "mobile-admin-article-preview",
    platform: "mobile",
    outputPath: "mobile/pages/admin-article-preview-content/index.html",
    entry: "/bootstrap/mobile/admin-preview-content.tsx",
    title: "手机预览 - 管理台",
    description: undefined,
    aliases: [
      "/admin/articles/preview/mobile.html",
      "/admin/articles/preview/mobile/content.html",
    ],
    bootstrap: true,
  },
] as const satisfies readonly PageRegistration[];

/** 宿主便捷包装：默认作用于本注册表（包内 pageRoutes 为显式纯函数）。 */
export function pageRoutes(
  registrations: readonly PageRegistration[] = pageRegistry,
): readonly PageRoute[] {
  return flattenPageRoutes(registrations);
}
