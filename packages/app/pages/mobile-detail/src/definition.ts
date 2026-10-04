import { z } from "zod";
import type { MobilePageContext } from "@blog/mobile-shared";
import { definePage } from "@fluvient-loom/page-kit";

/**
 * URL 参数：id 必须是安全正整数（缺失/非法 → 页面按 invalid 态消费）；
 * q 是搜索高亮词，trim 后使用，缺失为空串。
 */
const params = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  q: z.string().trim().catch(""),
});

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
  title: "文章详情 - 技术知识库",
  aliases: ["/m/articles/detail.html"],
  bootstrap: true,
  shell: { id: "mobile-detail-shell", ...detailShell },
  params,
  load: () =>
    import("./entry.ts").then(
      (m) => (context: MobilePageContext) => m.createMobileDetailEntry(context),
    ),
});
