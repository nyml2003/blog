import type { DesktopPageContext } from "../context";
import { route } from "../context";

export function createDesktopEditorGuidePage(context: DesktopPageContext) {
  return function DesktopEditorGuidePage() {
    return (
      <main id="main" class="admin-page editor-guide-page">
        <header class="admin-page-head">
          <div>
            <p class="eyebrow">EDITOR GUIDE</p>
            <h1>文章编辑器使用指南</h1>
            <p>先完成正文与元数据，再保存到待提交批次。</p>
          </div>
          <div class="actions">
            <a
              class="button secondary"
              href={route(context.routes, "desktop-admin-article-new")}
            >
              新建文章
            </a>
            <a
              class="button secondary"
              href={route(context.routes, "desktop-admin-article-types")}
            >
              发布工作台
            </a>
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
      </main>
    );
  };
}
