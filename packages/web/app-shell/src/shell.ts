export type AppShellPlatform = "desktop" | "mobile";

export type AppShellRegionRole =
  | "banner"
  | "contentinfo"
  | "main"
  | "navigation"
  | "region";

export type AppShellPlaceholderKind = "block" | "line" | "media";

export interface AppShellPlaceholder {
  readonly kind: AppShellPlaceholderKind;
  readonly blockSize: string;
  readonly inlineSize?: string;
  readonly aspectRatio?: number;
}

export interface AppShellRegion {
  readonly id: string;
  readonly role: AppShellRegionRole;
  readonly blockSize: string;
  readonly placeholders: readonly AppShellPlaceholder[];
}

export interface AppShellSpec {
  readonly id: string;
  readonly platform: AppShellPlatform;
  readonly loadingLabel: string;
  readonly regions: readonly AppShellRegion[];
  readonly shimmer?: boolean;
  readonly shimmerDelayMs?: number;
}

export interface RenderedAppShell {
  readonly html: string;
  readonly criticalCss: string;
}

const HTML_ESCAPE_PATTERN = /[&<>"']/g;
const CSS_FORBIDDEN_PATTERN = /[;{}<>]/;
const DEFAULT_SHIMMER_DELAY_MS = 200;
const APP_SHELL_PLATFORMS = new Set<AppShellPlatform>(["desktop", "mobile"]);
const APP_SHELL_REGION_ROLES = new Set<AppShellRegionRole>([
  "banner",
  "contentinfo",
  "main",
  "navigation",
  "region",
]);
const APP_SHELL_PLACEHOLDER_KINDS = new Set<AppShellPlaceholderKind>([
  "block",
  "line",
  "media",
]);

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(HTML_ESCAPE_PATTERN, (character) => entities[character]);
}

function assertCssValue(value: string, name: string): void {
  if (value.trim() === "" || CSS_FORBIDDEN_PATTERN.test(value)) {
    throw new Error(`${name} must be a non-empty CSS value`);
  }
}

function assertPositiveNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

function validateSpec(spec: AppShellSpec): void {
  if (spec.id.trim() === "") throw new Error("id must not be empty");
  if (spec.loadingLabel.trim() === "") {
    throw new Error("loadingLabel must not be empty");
  }
  if (!APP_SHELL_PLATFORMS.has(spec.platform)) {
    throw new Error(`unsupported platform: ${String(spec.platform)}`);
  }
  if (spec.regions.length === 0) {
    throw new Error("regions must contain at least one region");
  }
  if (spec.shimmerDelayMs !== undefined) {
    assertPositiveNumber(spec.shimmerDelayMs, "shimmerDelayMs");
  }

  const regionIds = new Set<string>();
  for (const region of spec.regions) {
    if (region.id.trim() === "") throw new Error("region id must not be empty");
    if (regionIds.has(region.id)) {
      throw new Error(`region id must be unique: ${region.id}`);
    }
    regionIds.add(region.id);
    if (!APP_SHELL_REGION_ROLES.has(region.role)) {
      throw new Error(`unsupported region role: ${String(region.role)}`);
    }
    assertCssValue(region.blockSize, `region ${region.id} blockSize`);

    for (const placeholder of region.placeholders) {
      if (!APP_SHELL_PLACEHOLDER_KINDS.has(placeholder.kind)) {
        throw new Error(
          `unsupported placeholder kind: ${String(placeholder.kind)}`,
        );
      }
      assertCssValue(
        placeholder.blockSize,
        `placeholder in region ${region.id} blockSize`,
      );
      if (placeholder.inlineSize !== undefined) {
        assertCssValue(
          placeholder.inlineSize,
          `placeholder in region ${region.id} inlineSize`,
        );
      }
      if (placeholder.aspectRatio !== undefined) {
        assertPositiveNumber(
          placeholder.aspectRatio,
          `placeholder in region ${region.id} aspectRatio`,
        );
      }
    }
  }
}

function renderPlaceholder(
  placeholder: AppShellPlaceholder,
  regionIndex: number,
  placeholderIndex: number,
): string {
  const className = `loom-app-shell__placeholder loom-app-shell__placeholder--${placeholder.kind}`;
  const index = `${regionIndex}-${placeholderIndex}`;
  return `<div class="${className}" data-loom-shell-placeholder="${index}" aria-hidden="true"></div>`;
}

function renderHtml(spec: AppShellSpec): string {
  const regions = spec.regions
    .map((region, regionIndex) => {
      const placeholders = region.placeholders
        .map((placeholder, placeholderIndex) =>
          renderPlaceholder(placeholder, regionIndex, placeholderIndex),
        )
        .join("");
      return `<section class="loom-app-shell__region" data-loom-shell-region="${escapeHtml(region.id)}" data-loom-shell-region-index="${regionIndex}" role="${region.role}">${placeholders}</section>`;
    })
    .join("");

  return `<div id="${escapeHtml(spec.id)}" class="loom-app-shell loom-app-shell--${spec.platform}" data-loom-app-shell="true" aria-hidden="true"><span class="loom-app-shell__status">${escapeHtml(spec.loadingLabel)}</span>${regions}</div>`;
}

function renderCriticalCss(spec: AppShellSpec): string {
  const shimmer = spec.shimmer === true;
  const delayMs = spec.shimmerDelayMs ?? DEFAULT_SHIMMER_DELAY_MS;
  const regionRules = spec.regions
    .map(
      (region, regionIndex) =>
        `.loom-app-shell--${spec.platform} [data-loom-shell-region-index="${regionIndex}"]{min-block-size:${region.blockSize};}`,
    )
    .join("");
  const placeholderRules = spec.regions
    .flatMap((region, regionIndex) =>
      region.placeholders.map((placeholder, placeholderIndex) => {
        const selector = `.loom-app-shell--${spec.platform} [data-loom-shell-placeholder="${regionIndex}-${placeholderIndex}"]`;
        const declarations = [
          `block-size:${placeholder.blockSize}`,
          placeholder.inlineSize === undefined
            ? undefined
            : `inline-size:${placeholder.inlineSize}`,
          placeholder.aspectRatio === undefined
            ? undefined
            : `aspect-ratio:${placeholder.aspectRatio}`,
        ].filter(
          (declaration): declaration is string => declaration !== undefined,
        );
        return `${selector}{${declarations.join(";")};}`;
      }),
    )
    .join("");

  const baseRules = [
    ".loom-app-shell{box-sizing:border-box;color:var(--loom-shell-ink,inherit);contain:layout paint;display:block;font-family:var(--loom-shell-font,inherit);inset-block-start:0;inset-inline:0;min-block-size:100%;overflow:hidden;pointer-events:none;position:absolute;z-index:1;padding-block-end:var(--loom-shell-bottom-space,0px);background:var(--loom-shell-surface,var(--paper,#f4f1ea));}",
    ".loom-app-shell *,.loom-app-shell *::before,.loom-app-shell *::after{box-sizing:inherit;}",
    ".loom-app-shell + #app{visibility:hidden;}",
    ".loom-app-shell__status{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;clip-path:inset(50%);}",
    ".loom-app-shell__region{display:block;padding:var(--loom-shell-region-padding,16px 18px);}",
    ".loom-app-shell__placeholder + .loom-app-shell__placeholder{margin-block-start:var(--loom-shell-gap,12px);}",
    ".loom-app-shell__placeholder{display:block;max-inline-size:100%;border-radius:var(--loom-shell-radius,4px);background:var(--loom-shell-skeleton,var(--border,#e2e4e8));opacity:.72;}",
  ].join("");
  const motionRules = shimmer
    ? `.loom-app-shell--${spec.platform}{--loom-shell-shimmer-delay:${delayMs}ms;}.loom-app-shell__placeholder{animation:loom-app-shell-shimmer 1.4s linear infinite;animation-delay:var(--loom-shell-shimmer-delay,200ms);}@keyframes loom-app-shell-shimmer{0%,100%{opacity:.62;}50%{opacity:.82;}}@media (prefers-reduced-motion:reduce){.loom-app-shell__placeholder{animation:none;}}`
    : "";
  return `${baseRules}${motionRules}${regionRules}${placeholderRules}`;
}

export function renderAppShell(spec: AppShellSpec): RenderedAppShell {
  validateSpec(spec);
  return {
    html: renderHtml(spec),
    criticalCss: renderCriticalCss(spec),
  };
}
