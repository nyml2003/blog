import type { JSX } from "solid-js";
import {
  assertOptions,
  assertProps,
  optionalString,
  requireContent,
  requireString,
} from "./config";

type LabelOptions = {
  id: string;
};
export type LabelProps = {
  content: JSX.Element;
  controlId: string;
  options: Partial<LabelOptions>;
};

export function Label(props: LabelProps) {
  assertProps("Label", props);
  assertOptions("Label", props.options);
  requireContent("Label", "content", props.content);
  const controlId = requireString("Label", "controlId", props.controlId);
  const id = optionalString("Label", "options.id", props.options.id);

  return (
    <label class="m-atom-label" for={controlId} id={id}>
      {props.content}
    </label>
  );
}
