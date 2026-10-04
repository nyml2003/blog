import { platformFromOutputPath } from "./normalize.ts";
import type { PageRegistration } from "./types.ts";

export const pageValidationRules = [
  "id-format",
  "id-unique",
  "title-required",
  "alias-required",
  "alias-format",
  "alias-unique",
  "alias-output-path-conflict",
  "output-path-format",
  "output-path-unique",
  "platform-consistency",
  "entry-format",
  "entry-exists",
  "bootstrap-mobile-only",
  "shell-mobile-only",
] as const;

export type PageValidationRule = (typeof pageValidationRules)[number];

export interface PageViolation {
  readonly rule: PageValidationRule;
  readonly pageId: string | undefined;
  readonly message: string;
}

export interface PageValidationDependencies {
  /** entry（形如 "/bootstrap/desktop/home.tsx"）对应文件是否存在；宿主提供真实实现。 */
  readonly entryExists: (entry: string) => boolean;
}

// bootstrap/shell 只允许 mobile 的依据：宿主构建链的内联引导与 app shell
// 移除逻辑当前只在 mobile 平台提供；desktop 页面开启任一能力都会得到
// 无法解除的错误行为。
const MOBILE_ONLY_BUILD_CAPABILITIES = "当前构建链只在 mobile 平台提供该能力";

const ID_PATTERN = /^[a-z0-9-]+$/;

function segmentsOf(path: string): readonly string[] {
  return path.split("/");
}

export function validatePageRegistry(
  registrations: readonly PageRegistration[],
  dependencies: PageValidationDependencies,
): readonly PageViolation[] {
  const violations: PageViolation[] = [];
  const seenIds = new Map<string, string>();
  const seenAliases = new Map<string, string>();
  const seenOutputPaths = new Map<string, string>();
  const outputPaths: string[] = [];

  for (const page of registrations) {
    if (!ID_PATTERN.test(page.id)) {
      violations.push({
        rule: "id-format",
        pageId: page.id,
        message: "页面 id 只允许小写字母、数字与连字符（后端路由清单同样约束）",
      });
    }
    const idOwner = seenIds.get(page.id);
    if (idOwner !== undefined) {
      violations.push({
        rule: "id-unique",
        pageId: page.id,
        message: `页面 id 与 ${idOwner} 重复`,
      });
    } else {
      seenIds.set(page.id, page.id);
    }

    if (page.title.trim() === "") {
      violations.push({
        rule: "title-required",
        pageId: page.id,
        message: "title 不能为空（生成 HTML 的 <title> 与守卫测试依赖它）",
      });
    }

    if (page.aliases.length === 0) {
      violations.push({
        rule: "alias-required",
        pageId: page.id,
        message: "至少注册一个 alias，否则页面没有任何对外入口",
      });
    }
    for (const alias of page.aliases) {
      if (
        !alias.startsWith("/") ||
        alias.includes("?") ||
        alias.includes("#")
      ) {
        violations.push({
          rule: "alias-format",
          pageId: page.id,
          message: `alias "${alias}" 必须以 / 开头且不含查询串或锚点`,
        });
      }
      const aliasOwner = seenAliases.get(alias);
      if (aliasOwner !== undefined) {
        violations.push({
          rule: "alias-unique",
          pageId: page.id,
          message: `alias "${alias}" 与 ${aliasOwner} 重复`,
        });
      } else {
        seenAliases.set(alias, page.id);
      }
    }

    const segments = segmentsOf(page.outputPath);
    const hasEmptySegment = segments.some((segment) => segment === "");
    const escapesRoot = segments.includes("..");
    if (
      page.outputPath === "" ||
      page.outputPath.startsWith("/") ||
      hasEmptySegment ||
      escapesRoot
    ) {
      violations.push({
        rule: "output-path-format",
        pageId: page.id,
        message: `outputPath "${page.outputPath}" 必须是非空相对路径，不含 //、.. 或前导 /`,
      });
    }
    const outputPathOwner = seenOutputPaths.get(page.outputPath);
    if (outputPathOwner !== undefined) {
      violations.push({
        rule: "output-path-unique",
        pageId: page.id,
        message: `outputPath "${page.outputPath}" 与 ${outputPathOwner} 重复`,
      });
    } else {
      seenOutputPaths.set(page.outputPath, page.id);
      outputPaths.push(page.outputPath);
    }

    const derivedPlatform = platformFromOutputPath(page.outputPath);
    if (derivedPlatform !== page.platform) {
      violations.push({
        rule: "platform-consistency",
        pageId: page.id,
        message:
          `声明的 platform "${page.platform}" 与 outputPath 首段 "${derivedPlatform ?? "(无平台前缀)"}" 必须指向同一平台世界`,
      });
    }

    // 入口已按平台统一（main.tsx + data-page-id），不再逐页检查入口文件。
    // page.entry 字段保留为文档值，构建系统用 platformEntry() 派生实际入口。

    if (page.bootstrap && page.platform !== "mobile") {
      violations.push({
        rule: "bootstrap-mobile-only",
        pageId: page.id,
        message: `bootstrap: true 的页面必须是 mobile（${MOBILE_ONLY_BUILD_CAPABILITIES}）`,
      });
    }
    if (page.shell !== undefined && page.platform !== "mobile") {
      violations.push({
        rule: "shell-mobile-only",
        pageId: page.id,
        message: `配置 shell 的页面必须是 mobile（${MOBILE_ONLY_BUILD_CAPABILITIES}）`,
      });
    }
  }

  for (const page of registrations) {
    for (const alias of page.aliases) {
      if (outputPaths.includes(alias.replace(/^\//, ""))) {
        violations.push({
          rule: "alias-output-path-conflict",
          pageId: page.id,
          message: `alias "${alias}" 与某个页面的 outputPath 冲突（会遮蔽静态产物路径）`,
        });
      }
    }
  }

  return violations;
}
