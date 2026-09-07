import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import {
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { type Diagnostic, lintGutter, setDiagnostics } from "@codemirror/lint";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import type { QueryReadonly as DeepReadonly } from "../../../../solid/queries";
import {
  byteOffsetToSelection,
  type HtmlDiagnostic,
  type HtmlInspection,
} from "../../../../common/validation/article-html";

export type CodeMirrorDiagnostic = Diagnostic & {
  diagnostic: DeepReadonly<HtmlDiagnostic>;
};

/** Converts Rust's UTF-8 byte spans to CodeMirror's UTF-16 offsets. */
export function htmlDiagnosticsToCodeMirror(
  source: string,
  inspection: DeepReadonly<HtmlInspection> | undefined,
): CodeMirrorDiagnostic[] {
  if (!inspection) return [];
  return inspection.diagnostics.map((diagnostic) => ({
    from: byteOffsetToSelection(source, diagnostic.span.start.byte),
    to: byteOffsetToSelection(source, diagnostic.span.end.byte),
    severity: diagnostic.severity,
    message: diagnostic.message,
    source: diagnostic.code,
    diagnostic,
  }));
}

export interface CodeMirrorController {
  readonly view: EditorView;
  setValue(value: string): void;
  setReadOnly(readOnly: boolean): void;
  setDiagnostics(diagnostics: CodeMirrorDiagnostic[]): void;
  setInvalid(invalid: boolean): void;
  focusAndSelect(from: number, to: number): void;
  destroy(): void;
}

export function createCodeMirrorEditor(
  parent: HTMLElement,
  initialValue: string,
  onChange: (value: string) => void,
  options: { contentId?: string; diagnosticsId?: string } = {},
): CodeMirrorController {
  let syncing = false;
  const readOnlyCompartment = new Compartment();
  const updateListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged || syncing) return;
    onChange(update.state.doc.toString());
  });
  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    lintGutter(),
    html(),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    updateListener,
    EditorView.contentAttributes.of({
      id: options.contentId ?? "html",
      "aria-label": "HTML 正文",
      "aria-describedby": options.diagnosticsId ?? "html-diagnostics",
      spellcheck: "false",
    }),
    readOnlyCompartment.of([
      EditorState.readOnly.of(false),
      EditorView.editable.of(true),
    ]),
    EditorView.theme({
      "&": { height: "600px", fontSize: "14px" },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "ui-monospace, monospace",
      },
    }),
  ];
  const view = new EditorView({
    state: EditorState.create({ doc: initialValue, extensions }),
    parent,
  });
  return {
    view,
    setValue(value) {
      if (view.state.doc.toString() === value) return;
      syncing = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
      syncing = false;
    },
    setReadOnly(readOnly) {
      view.dispatch({
        effects: readOnlyCompartment.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
      });
    },
    setDiagnostics(diagnostics) {
      const withActions = diagnostics.map((diagnostic) => ({
        ...diagnostic,
        actions: [
          {
            name: "定位",
            apply(target: EditorView, from: number, to: number) {
              target.dispatch({
                selection: { anchor: from, head: to },
                scrollIntoView: true,
              });
              target.focus();
            },
          },
        ],
      }));
      view.dispatch(setDiagnostics(view.state, withActions));
    },
    setInvalid(invalid) {
      view.contentDOM.setAttribute("aria-invalid", String(invalid));
    },
    focusAndSelect(from, to) {
      const safeFrom = Math.max(0, Math.min(from, view.state.doc.length));
      const safeTo = Math.max(safeFrom, Math.min(to, view.state.doc.length));
      view.dispatch({
        selection: { anchor: safeFrom, head: safeTo },
        scrollIntoView: true,
      });
      view.focus();
    },
    destroy() {
      view.destroy();
    },
  };
}
