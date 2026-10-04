export {
  type PagePlatform,
  type PageRegistration,
  type PageRoute,
  pageRoutes,
} from "./types.ts";
export {
  type PageImplementation,
  normalizePageRegistry,
  platformFromOutputPath,
} from "./normalize.ts";
export {
  type PageValidationRule,
  pageValidationRules,
  type PageViolation,
  validatePageRegistry,
} from "./validate.ts";
export {
  generateSiteRoutesManifest,
  siteRoutesManifestFilename,
} from "./generate.ts";
export {
  generatedPagePath,
  generatedPagesDirectory,
  generatePageInputs,
  pageRouteMap,
  pageRoutesManifest,
  pageTemplatePlugin,
  renderPageHtml,
  serializePageRoutes,
} from "./plugins/page-template.ts";
export {
  pageBootstrap,
  type PageBootstrapDependencies,
  type PageBootstrapOptions,
} from "./plugins/page-bootstrap.ts";
export { pageRoutesPlugin } from "./plugins/page-routes.ts";
