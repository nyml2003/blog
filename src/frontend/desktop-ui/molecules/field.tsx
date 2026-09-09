import type { JSX } from "solid-js";

export type FieldProps = {
  control: JSX.Element;
  controlId: string;
  label: JSX.Element;
};

export function Field(props: FieldProps) {
  return (
    <div class="d-ui-field">
      <label for={props.controlId}>{props.label}</label>
      <div class="d-ui-field-control">{props.control}</div>
    </div>
  );
}
