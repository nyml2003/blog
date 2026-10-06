import { Heading, Link, Text } from "@blog/desktop-atoms";
import type { DesktopPageContext } from "@blog/desktop-shared";
import { route } from "@blog/desktop-shared";
import "./page.css";

export function createDesktopEditorGuidePage(context: DesktopPageContext) {
  return function DesktopEditorGuidePage() {
    return (
      <div class="admin-page editor-guide-page">
        <header class="admin-page-head">
          <div>
            <Text tone="accent">EDITOR GUIDE</Text>
            <Heading level={1}>文章编辑器使用指南</Heading>
            <Text tone="muted">先完成正文与元数据，再保存到待提交批次。</Text>
          </div>
          <div class="actions">
            <Link
              href={route(context.routes, "desktop-admin-article-new")}
              variant="cta"
            >
              新建文章
            </Link>
            <Link
              href={route(context.routes, "desktop-admin-article-types")}
              variant="action"
            >
              发布工作台
            </Link>
          </div>
        </header>
        <section>
          <h2>保存流程</h2>
          <ol>
            <li>填写标题、摘要、分类和标签。</li>
            <li>正文使用受支持的 HTML 结构。</li>
            <li>保存后在发布工作台预览、复核并提交。</li>
          </ol>
        </section>
        <section>
          <h2>正文建议</h2>
          <p>保持结构清晰，链接使用完整地址，图片和样式由系统主题统一处理。</p>
        </section>
      </div>
    );
  };
}
