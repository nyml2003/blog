import type { SyncStatus, Workspace } from "../../foundation/api";

const workspaceStatusLabels: Record<string, string> = {
  clean: "无待提交修改",
  saved: "有待提交修改",
  submitting: "正在提交",
  discarding: "正在放弃",
  submitted: "已提交",
  submitted_with_changes: "已提交，另有新修改",
  failed: "操作失败",
};
export const workspaceStatusLabel = (status: Workspace["status"]): string =>
  workspaceStatusLabels[status] ?? status;
export const syncStatusLabel = (status: SyncStatus["status"]): string =>
  ({
    idle: "尚未同步",
    running: "正在同步",
    succeeded: "同步成功",
    failed: "同步失败",
  })[status];
export const workspaceActionPending = (status: Workspace["status"]): boolean =>
  status === "submitting" || status === "discarding";
export const canSubmitWorkspace = (status: Workspace["status"]): boolean =>
  status === "saved" ||
  status === "submitted_with_changes" ||
  status === "failed";
export const canAbandonWorkspace = (status: Workspace["status"]): boolean =>
  status !== "clean" && !workspaceActionPending(status);
export const syncCommit = (status: SyncStatus): string | undefined =>
  status.status === "idle" ? undefined : status.commit;
export const syncArticleCount = (status: SyncStatus): number | undefined =>
  status.status === "succeeded" ? status.articleCount : undefined;
export const syncFailureMessage = (status: SyncStatus): string | undefined =>
  status.status === "failed" ? status.message : undefined;
export const syncLastSuccessCommit = (
  status: SyncStatus,
): string | undefined =>
  status.status === "failed" ? status.lastSuccessCommit : undefined;
