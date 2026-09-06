import { createComponent, type Component } from "solid-js";
import { render } from "solid-js/web";

export function definePage(Page: Component): void {
  const mount = document.getElementById("app");
  if (!mount) {
    throw new Error('Page mount element "#app" is missing');
  }

  render(() => createComponent(Page, {}), mount);
}
