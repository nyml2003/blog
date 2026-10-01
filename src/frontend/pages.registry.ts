import type { AppShellSpec } from "@fluvient-loom/app-shell";

export type PagePlatform = "desktop" | "mobile";

export interface PageRegistration {
  id: string;
  platform: PagePlatform;
  outputPath: string;
  entry: string;
  title: string;
  description: string | undefined;
  aliases: readonly string[];
  bootstrap: boolean;
  shell?: AppShellSpec;
}

export const pageRegistry = [
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
  {
    id: "desktop-public-detail",
    platform: "desktop",
    outputPath: "desktop/pages/public-detail/index.html",
    entry: "/bootstrap/desktop/detail.tsx",
    title: "文章详情 - 技术知识库",
    description: undefined,
    aliases: ["/articles/detail.html"],
    bootstrap: false,
  },
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
    aliases: ["/admin", "/admin/", "/admin/index.html"],
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
    aliases: ["/m", "/m/"],
    bootstrap: true,
    shell: {
      id: "mobile-home-shell",
      platform: "mobile",
      loadingLabel: "正在加载首页",
      regions: [
        {
          id: "header",
          role: "banner",
          blockSize: "68px",
          placeholders: [],
        },
        {
          id: "content",
          role: "main",
          blockSize: "480px",
          placeholders: [
            { kind: "line", blockSize: "34px", inlineSize: "42%" },
            { kind: "line", blockSize: "18px", inlineSize: "78%" },
            { kind: "media", blockSize: "150px", aspectRatio: 16 / 9 },
            { kind: "line", blockSize: "20px", inlineSize: "90%" },
            { kind: "line", blockSize: "20px", inlineSize: "68%" },
          ],
        },
        {
          id: "bottom-nav",
          role: "contentinfo",
          blockSize: "92px",
          placeholders: [],
        },
      ],
    },
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

export interface PageRoute {
  alias: string;
  outputPath: string;
}

export function pageRoutes(
  registrations: readonly PageRegistration[] = pageRegistry,
): PageRoute[] {
  return registrations.flatMap((page) =>
    page.aliases.map((alias) => ({ alias, outputPath: page.outputPath })),
  );
}
