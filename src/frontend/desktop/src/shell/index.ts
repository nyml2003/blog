/**
 * Desktop 壳层出口（PLAN-CODE-LAYOUT-001 R2a）：页面统一从 `../../shell` 引用。
 * CSS 入口的副作用 import 集中在此，保持与旧 `app.tsx` 相同的加载语义。
 */
import "./styles.css";
import "./integration.css";

export type { Article } from "../../../common/contracts/domain";
export { qs, date, shortDate } from "./format";
export { Header } from "./header";
export { Status } from "./status";
export { ArticleBody } from "./article-body";
export { WorkspaceArticleTable } from "./article-table";
export { TShelf } from "./t-shelf";
