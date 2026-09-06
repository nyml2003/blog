import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import type { DeepReadonly } from "../../../../common/data/readonly";
import type {
  HtmlDiagnostic,
  HtmlInspection,
} from "../../../../common/validation/article-html";
import { byteOffsetToSelection } from "../../../../common/validation/article-html";
import {
  createCodeMirrorEditor,
  htmlDiagnosticsToCodeMirror,
} from "./editor-codemirror";
import { EditorPreview } from "./editor-preview";
import { HtmlDiagnostics } from "./html-inspection";

export function ArticleSourceEditor(props: {
  value: Accessor<string>;
  busy: Accessor<boolean>;
  inspection: Accessor<DeepReadonly<HtmlInspection> | undefined>;
  pending: Accessor<boolean>;
  error: Accessor<string>;
  sourceId?: string;
  diagnosticsId?: string;
  onChange: (value: string) => void;
  onReady?: (
    controller: ReturnType<typeof createCodeMirrorEditor> | undefined,
  ) => void;
  retry: () => void;
}) {
  const sourceId = props.sourceId ?? "html";
  const diagnosticsId = props.diagnosticsId ?? "html-diagnostics";
  const [controller, setController] = createSignal<
    ReturnType<typeof createCodeMirrorEditor> | undefined
  >();
  const locate = (diagnostic: DeepReadonly<HtmlDiagnostic>) => {
    const editor = controller();
    if (!editor) return;
    editor.focusAndSelect(
      byteOffsetToSelection(props.value(), diagnostic.span.start.byte),
      byteOffsetToSelection(props.value(), diagnostic.span.end.byte),
    );
  };
  onCleanup(() => {
    props.onReady?.(undefined);
    controller()?.destroy();
    setController(undefined);
  });
  createEffect(() => {
    const editor = controller();
    if (!editor) return;
    editor.setValue(props.value());
    editor.setReadOnly(props.busy());
    const inspection = props.inspection();
    editor.setDiagnostics(
      htmlDiagnosticsToCodeMirror(props.value(), inspection),
    );
    editor.setInvalid(inspection?.valid === false);
  });
  return (
    <section class="editor-source">
      <div class="editor-split">
        <div class="field">
          <label for={sourceId}>HTML 正文</label>
          <div
            ref={(element) => {
              const editor = createCodeMirrorEditor(
                element,
                props.value(),
                props.onChange,
                { contentId: sourceId, diagnosticsId },
              );
              setController(editor);
              props.onReady?.(editor);
            }}
            class="editor-codemirror"
          />
        </div>
        <EditorPreview html={props.value} />
      </div>
      <HtmlDiagnostics
        id={diagnosticsId}
        inspection={props.inspection()}
        pending={props.pending()}
        error={props.error()}
        retry={props.retry}
        locate={locate}
      />
    </section>
  );
}
