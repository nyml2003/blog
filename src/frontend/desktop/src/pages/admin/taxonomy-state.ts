import type {
  ContentSyncStatus,
  ContentWorkspaceStatus,
} from "../../../../solid/queries";

const workspaceStatusLabels: Record<ContentWorkspaceStatus, string> = {
  clean: "无待提交修改",
  saved: "有待提交修改",
  submitting: "正在提交",
  discarding: "正在放弃",
  submitted: "已提交",
  submitted_with_changes: "已提交，另有新修改",
  failed: "操作失败",
};

const syncStatusLabels: Record<ContentSyncStatus["status"], string> = {
  idle: "尚未同步",
  running: "正在同步",
  succeeded: "同步成功",
  failed: "同步失败",
};

export const workspaceStatusLabel = (status: ContentWorkspaceStatus): string =>
  workspaceStatusLabels[status];

export const syncStatusLabel = (status: ContentSyncStatus["status"]): string =>
  syncStatusLabels[status];

export const workspaceActionPending = (
  status: ContentWorkspaceStatus,
): boolean => status === "submitting" || status === "discarding";

export const canSubmitWorkspace = (status: ContentWorkspaceStatus): boolean =>
  status === "saved" ||
  status === "submitted_with_changes" ||
  status === "failed";

export const canAbandonWorkspace = (status: ContentWorkspaceStatus): boolean =>
  status !== "clean" && !workspaceActionPending(status);

export const syncCommit = (status: ContentSyncStatus): string | undefined => {
  if (status.status === "idle") return undefined;
  return status.commit;
};

export const syncArticleCount = (
  status: ContentSyncStatus,
): number | undefined => {
  if (status.status !== "succeeded") return undefined;
  return status.articleCount;
};

export const syncFailureMessage = (
  status: ContentSyncStatus,
): string | undefined => {
  if (status.status !== "failed") return undefined;
  return status.message;
};

export const syncLastSuccessCommit = (
  status: ContentSyncStatus,
): string | undefined => {
  if (status.status !== "failed") return undefined;
  return status.lastSuccessCommit;
};
