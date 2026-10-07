export const PAGE_MOUNT_ELEMENT_ID = "app";

export interface MountDocumentLike {
  getElementById(elementId: string): HTMLElement | null;
}

/** 解析页面挂载点；缺失即抛错（模块求值中止，页面无渲染）。 */
export function requireMountTarget(
  document: MountDocumentLike,
  elementId: string = PAGE_MOUNT_ELEMENT_ID,
): HTMLElement {
  const element = document.getElementById(elementId);
  if (element === null) {
    throw new Error(`Page mount element "#${elementId}" is missing`);
  }
  return element;
}
