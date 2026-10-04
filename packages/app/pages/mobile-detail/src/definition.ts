import { definePage } from "@fluvient-loom/page-kit";

const detailShell = {
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

export const mobileArticleDetailPage = definePage({
  id: "mobile-article-detail",
  platform: "mobile",
  outputPath: "mobile/pages/article-detail/index.html",
  entry: "/bootstrap/mobile/detail.tsx",
  title: "文章详情 - 技术知识库",
  aliases: ["/m/articles/detail.html"],
  bootstrap: true,
  shell: { id: "mobile-detail-shell", ...detailShell },
});
