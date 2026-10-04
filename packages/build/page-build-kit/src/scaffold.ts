import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validatePageRegistry } from "./validate.ts";
import type { PagePlatform, PageRegistration } from "./types.ts";

// 脚手架生成的是"允许重复"的声明样板（设计原则：该重复时重复）：
// 入口与页面文件是普通代码，生成后各自演化，不与任何机制耦合。
// 写入前先以"当前注册表 + 假想条目"过校验器，违例则不落任何文件。
// 真实 fs/进程访问由宿主 glue 提供（本包保持纯函数）。

export interface ScaffoldSpec {
  readonly platform: PagePlatform;
  readonly id: string;
  readonly title: string;
  readonly alias: string;
}

export interface ScaffoldFile {
  readonly path: string;
  readonly content: string;
}

export interface ScaffoldPlan {
  readonly spec: ScaffoldSpec;
  readonly slice: string;
  readonly registration: PageRegistration;
  readonly files: readonly ScaffoldFile[];
  readonly registryEntryText: string;
  readonly expectedRouteText: string;
}

export interface ScaffoldIo {
  readonly read: (path: string) => string;
  readonly write: (path: string, content: string) => void;
  readonly exists: (path: string) => boolean;
  readonly format: (paths: readonly string[]) => void;
}

const ID_PATTERN = /^[a-z0-9-]+$/;
// 与宿主页面标题守卫同源：提前拦截，避免生成后才被测试打回。
const FORBIDDEN_TITLE_WORDS = /\b(?:Blog|Admin|Article|Articles|New|Edit)\b/;

// 模板是数据文件（templates/*.txt）：生成物里的 import 语句若以 TS 源码
// 字符串形式存在，会被平台中立门禁的导入正则误判为真实依赖。
function loadTemplate(name: string): string {
  return readFileSync(
    join(import.meta.dirname, "templates", `${name}.txt`),
    "utf8",
  );
}

function fill(template: string, values: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

function pascalCase(slice: string): string {
  return slice
    .split("-")
    .map((part) =>
      part === "" ? "" : `${part[0]!.toUpperCase()}${part.slice(1)}`,
    )
    .join("");
}

function desktopEntryFile(slice: string, component: string): string {
  return fill(loadTemplate("desktop-entry"), { slice, component });
}

function desktopPageFile(component: string, title: string): string {
  return fill(loadTemplate("desktop-page"), { component, title });
}

function mobileEntryFile(slice: string, component: string): string {
  return fill(loadTemplate("mobile-entry"), { slice, component });
}

function mobilePageFile(component: string, title: string): string {
  return fill(loadTemplate("mobile-page"), { component, title });
}

export function planScaffoldPage(
  spec: ScaffoldSpec,
  registrations: readonly PageRegistration[],
  entryExists: (entry: string) => boolean,
): {
  readonly plan: ScaffoldPlan | undefined;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const prefix = `${spec.platform}-`;
  if (!ID_PATTERN.test(spec.id)) {
    issues.push(`id "${spec.id}" 只允许小写字母、数字与连字符`);
  }
  if (!spec.id.startsWith(prefix)) {
    issues.push(
      `id 必须以 "${prefix}" 开头（与 outputPath/entry 的平台前缀一致）`,
    );
  }
  const slice = spec.id.slice(prefix.length);
  if (slice === "" || !ID_PATTERN.test(slice)) {
    issues.push(`id 去掉平台前缀后必须是合法的 slice 名，得到 "${slice}"`);
  }
  if (spec.title.trim() === "") {
    issues.push("title 不能为空");
  } else if (FORBIDDEN_TITLE_WORDS.test(spec.title)) {
    issues.push(
      "title 不能包含英文品牌词（Blog/Admin/Article/Articles/New/Edit），与页面标题守卫同源",
    );
  }
  if (
    !spec.alias.startsWith("/") ||
    spec.alias.includes("?") ||
    spec.alias.includes("#")
  ) {
    issues.push(`alias "${spec.alias}" 必须以 / 开头且不含查询串或锚点`);
  }
  if (issues.length > 0) return { plan: undefined, issues };

  const component = `${spec.platform === "desktop" ? "Desktop" : "Mobile"}${pascalCase(slice)}Page`;
  const entry = `/bootstrap/${spec.platform}/${slice}.tsx`;
  const outputPath = `${spec.platform}/pages/${slice}/index.html`;
  const registration: PageRegistration = {
    id: spec.id,
    platform: spec.platform,
    outputPath,
    entry,
    title: spec.title,
    description: undefined,
    aliases: [spec.alias],
    bootstrap: spec.platform === "mobile",
  };

  const violations = validatePageRegistry([...registrations, registration], {
    entryExists: (candidate) => candidate === entry || entryExists(candidate),
  });
  issues.push(
    ...violations.map(
      (violation) =>
        `[${violation.rule}] ${violation.pageId}: ${violation.message}`,
    ),
  );
  if (issues.length > 0) return { plan: undefined, issues };

  const files: readonly ScaffoldFile[] =
    spec.platform === "desktop"
      ? [
          {
            path: entry.replace(/^\//, ""),
            content: desktopEntryFile(slice, component),
          },
          {
            path: `desktop/pages/${slice}/page.tsx`,
            content: desktopPageFile(component, spec.title),
          },
        ]
      : [
          {
            path: entry.replace(/^\//, ""),
            content: mobileEntryFile(slice, component),
          },
          {
            path: `mobile/pages/${slice}/page.tsx`,
            content: mobilePageFile(component, spec.title),
          },
        ];

  return {
    plan: {
      spec,
      slice,
      registration,
      files,
      registryEntryText: `  {
    id: "${spec.id}",
    platform: "${spec.platform}",
    outputPath: "${outputPath}",
    entry: "${entry}",
    title: "${spec.title}",
    description: undefined,
    aliases: ["${spec.alias}"],
    bootstrap: ${spec.platform === "mobile"},
  },`,
      expectedRouteText: `  ["${spec.alias}", "${outputPath}"],`,
    },
    issues,
  };
}

/** 把假想登记插入注册表数组的同平台组末尾（与 insertRegistryEntry 的文本位置一致）。 */
export function insertRegistration(
  registrations: readonly PageRegistration[],
  registration: PageRegistration,
): readonly PageRegistration[] {
  let insertAt = registrations.length;
  for (let index = registrations.length - 1; index >= 0; index -= 1) {
    if (registrations[index].platform === registration.platform) {
      insertAt = index + 1;
      break;
    }
  }
  return [
    ...registrations.slice(0, insertAt),
    registration,
    ...registrations.slice(insertAt),
  ];
}

/** 在注册表源码中，把新条目插入到同平台组的末尾（保持 desktop → mobile 分组）。 */
export function insertRegistryEntry(
  source: string,
  entryText: string,
  platform: PagePlatform,
): string {
  const marker = `platform: "${platform}",`;
  const lastPlatform = source.lastIndexOf(marker);
  if (lastPlatform < 0) {
    throw new Error(`注册表源码中找不到 platform 锚点：${marker}`);
  }
  const closing = source.indexOf("\n  },", lastPlatform);
  if (closing < 0) {
    throw new Error("注册表源码中找不到条目收尾锚点（\\n  },）");
  }
  const insertAt = closing + "\n  },".length;
  return `${source.slice(0, insertAt)}\n${entryText}${source.slice(insertAt)}`;
}

/** 在冻结 alias 清单中，把新行插入到同平台路由的末尾。 */
export function insertExpectedRoute(
  source: string,
  rowText: string,
  platform: PagePlatform,
): string {
  const marker = `"${platform}/pages/`;
  const lastPlatform = source.lastIndexOf(marker);
  if (lastPlatform < 0) {
    throw new Error(`冻结清单中找不到平台锚点：${marker}`);
  }
  const rowEnd = source.indexOf("],", lastPlatform);
  if (rowEnd < 0) {
    throw new Error("冻结清单中找不到行收尾锚点（],）");
  }
  const insertAt = rowEnd + "],".length;
  return `${source.slice(0, insertAt)}\n${rowText}${source.slice(insertAt)}`;
}

export function writeScaffold(
  plan: ScaffoldPlan,
  io: ScaffoldIo,
  fixturePaths: { readonly registry: string; readonly frozenRoutes: string },
): { readonly issues: readonly string[] } {
  const issues: string[] = [];
  for (const file of plan.files) {
    if (io.exists(file.path)) {
      issues.push(`目标文件已存在：${file.path}`);
    }
  }
  const registrySource = io.read(fixturePaths.registry);
  const testSource = io.read(fixturePaths.frozenRoutes);
  if (issues.length > 0) return { issues };

  let patchedRegistry: string;
  let patchedTest: string;
  try {
    patchedRegistry = insertRegistryEntry(
      registrySource,
      plan.registryEntryText,
      plan.spec.platform,
    );
    patchedTest = insertExpectedRoute(
      testSource,
      plan.expectedRouteText,
      plan.spec.platform,
    );
  } catch (error) {
    return { issues: [error instanceof Error ? error.message : String(error)] };
  }

  for (const file of plan.files) {
    io.write(file.path, file.content);
  }
  io.write(fixturePaths.registry, patchedRegistry);
  io.write(fixturePaths.frozenRoutes, patchedTest);
  io.format([fixturePaths.registry, fixturePaths.frozenRoutes]);
  return { issues: [] };
}
