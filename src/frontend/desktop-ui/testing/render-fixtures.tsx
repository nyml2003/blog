import { renderToString } from "solid-js/web";
import { ActionLink, Button, Field, StateMessage } from "../index";

export function renderLoadingButton(): string {
  return renderToString(() => (
    <Button
      content="正在保存"
      options={{ state: "loading", type: "submit", variant: "primary" }}
    />
  ));
}

export function renderActionLink(): string {
  return renderToString(() => (
    <ActionLink
      content="发布工作台"
      href="/admin/workspace/index.html"
      options={{ variant: "secondary" }}
    />
  ));
}

export function renderField(): string {
  return renderToString(() => (
    <Field
      control={<textarea id="summary" rows={3} />}
      controlId="summary"
      label="摘要"
    />
  ));
}

export function renderErrorMessage(): string {
  return renderToString(() => (
    <StateMessage content="文章加载失败" kind="error" />
  ));
}

export function renderLoadingMessage(): string {
  return renderToString(() => (
    <StateMessage content="加载中..." kind="loading" />
  ));
}
