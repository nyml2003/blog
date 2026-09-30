import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { type DeepReadonly } from "@fluvient-loom/common";
import {
  byteOffsetToSelection,
  type HtmlDiagnostic,
  type HtmlInspection,
} from "../../validation/article-html";
import {
  createCodeMirrorEditor,
  htmlDiagnosticsToCodeMirror,
} from "./editor-codemirror";

export function DesktopSourceEditor(props: {
  value: Accessor<string>;
  busy: Accessor<boolean>;
  inspection: Accessor<DeepReadonly<HtmlInspection> | undefined>;
  pending: Accessor<boolean>;
  error: Accessor<string>;
  onChange: (value: string) => void;
}) {
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
  onCleanup(() => controller()?.destroy());
  createEffect(() => {
    const editor = controller();
    if (!editor) return;
    const inspection = props.inspection();
    editor.setValue(props.value());
    editor.setReadOnly(props.busy());
    editor.setDiagnostics(
      htmlDiagnosticsToCodeMirror(props.value(), inspection),
    );
    editor.setInvalid(inspection?.valid === false);
  });
  return (
    <section class="editor-source">
      <div
        class="editor-codemirror"
        ref={(element) => {
          const editor = createCodeMirrorEditor(
            element,
            props.value(),
            props.onChange,
          );
          setController(editor);
        }}
      />
      <div class="html-diagnostics" aria-live="polite">
        {props.pending() && <p>正在校验正文...</p>}
        {props.error() && <p role="alert">{props.error()}</p>}
        {props.inspection() && (
          <>
            <p>
              {props.inspection()?.valid ? "正文校验通过" : "正文校验未通过"}
            </p>
            <ul>
              {props.inspection()?.diagnostics.map((diagnostic) => (
                <li>
                  <button type="button" onClick={() => locate(diagnostic)}>
                    第 {diagnostic.span.start.line} 行，第{" "}
                    {diagnostic.span.start.column} 列
                  </button>{" "}
                  {diagnostic.message} <code>{diagnostic.code}</code>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
