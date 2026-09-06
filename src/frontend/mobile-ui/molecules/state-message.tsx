import { Show } from "solid-js";
import { Button, Text } from "../atoms";

export type StateMessageKind = "loading" | "empty" | "error";

export type StateMessageProps = {
  kind: StateMessageKind;
  text: string;
  onRetry?: () => void;
};

export function StateMessage(props: StateMessageProps) {
  const icon = () => {
    if (props.kind === "loading") return "◌";
    if (props.kind === "empty") return "○";
    return "!";
  };

  return (
    <div
      aria-live={props.kind === "error" ? "assertive" : "polite"}
      class={`m-state-message is-${props.kind}`}
      role={props.kind === "error" ? "alert" : "status"}
    >
      <span aria-hidden="true" class="m-state-message-icon">
        {icon()}
      </span>
      <Text content={props.text} options={{ as: "p", tone: "muted" }} />
      <Show when={props.onRetry}>
        <Button
          content="重试"
          options={{ onClick: () => props.onRetry?.(), variant: "secondary" }}
        />
      </Show>
    </div>
  );
}
