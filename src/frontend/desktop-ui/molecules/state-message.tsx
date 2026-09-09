import type { JSX } from "solid-js";

export type StateMessageKind = "loading" | "empty" | "error" | "success";

export type StateMessageProps = {
  content: JSX.Element;
  kind: StateMessageKind;
};

export function StateMessage(props: StateMessageProps) {
  const isError = () => props.kind === "error";
  const isLoading = () => props.kind === "loading";

  return (
    <div
      aria-busy={isLoading() ? "true" : undefined}
      aria-live={isError() ? "assertive" : "polite"}
      class={`d-ui-state-message d-ui-state-message--${props.kind}`}
      role={isError() ? "alert" : "status"}
    >
      {props.content}
    </div>
  );
}
