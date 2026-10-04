import { createUniqueId, type JSX } from "solid-js";
import { Label } from "@blog/mobile-h5-solid-atoms";
import { FieldControlContext } from "@blog/mobile-h5-solid-atoms/field-context";

export interface FieldProps {
  readonly label: string;
  readonly content: JSX.Element;
}

export function Field(props: FieldProps) {
  const controlId = createUniqueId();
  return (
    <FieldControlContext.Provider value={controlId}>
      <div class="m-field">
        <Label content={props.label} controlId={controlId} options={{}} />
        <div class="m-field-control">{props.content}</div>
      </div>
    </FieldControlContext.Provider>
  );
}
