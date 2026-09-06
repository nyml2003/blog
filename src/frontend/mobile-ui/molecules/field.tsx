import { createUniqueId, type JSX } from "solid-js";
import { Label } from "../atoms/label";
import { FieldControlContext } from "../atoms/field-context";

export type FieldProps = {
  label: string;
  content: JSX.Element;
};

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
