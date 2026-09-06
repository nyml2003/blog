import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";

const previewStyles = `
:root { color: #182230; background: #fffcf7; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
body { margin: 0; padding: 28px 32px 56px; }
.article-body { max-width: 720px; margin: 0 auto; font-size: 17px; line-height: 1.82; overflow-wrap: anywhere; }
.article-body :where(h1, h2, h3) { line-height: 1.3; margin: 1.8em 0 0.65em; }
.article-body h2 { padding-top: .6em; border-top: 1px solid #d8d2c7; }
.article-body a { color: #3157d5; text-decoration: underline; text-underline-offset: 3px; }
.article-body pre { max-width: 100%; overflow-x: auto; padding: 18px; background: #111923; color: #e7edf2; border-radius: 4px; white-space: pre; }
.article-body code { font-family: ui-monospace, monospace; }
.article-body :not(pre) > code { padding: 2px 5px; background: #e9e5dd; color: #8f3d30; }
.article-body blockquote { margin: 1.6em 0; padding: 2px 0 2px 20px; border-left: 4px solid #e77856; color: #4f5965; }
.article-body table { display: block; max-width: 100%; overflow: auto; border-collapse: collapse; }
.article-body :where(th, td) { padding: 10px 12px; border: 1px solid #d8d2c7; text-align: left; }
.article-body img { max-width: 100%; height: auto; }
`;

function frameDocument(html: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${previewStyles}</style></head><body><article class="article-body">${html}</article></body></html>`;
}

export function EditorPreview(props: { html: Accessor<string> }) {
  const [srcdoc, setSrcdoc] = createSignal(frameDocument(props.html()));
  createEffect(() => {
    const source = props.html();
    const timer = window.setTimeout(
      () => setSrcdoc(frameDocument(source)),
      220,
    );
    onCleanup(() => window.clearTimeout(timer));
  });
  return (
    <section class="editor-preview" aria-label="正文预览">
      <div class="editor-preview-head">实时预览</div>
      <iframe
        title="正文实时预览"
        sandbox=""
        srcdoc={srcdoc()}
        class="editor-preview-frame"
      />
    </section>
  );
}
