import { z } from "zod";

export const articleHtmlProfileVersion = "article-html/v1" as const;

const sourcePositionSchema = z.object({
  byte: z.number().int().nonnegative(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

export const sourceSpanSchema = z
  .object({
    start: sourcePositionSchema,
    end: sourcePositionSchema,
  })
  .refine((span) => span.end.byte >= span.start.byte, {
    message: "source span end must not precede start",
  });

export type SourcePosition = z.infer<typeof sourcePositionSchema>;
export type SourceSpan = z.infer<typeof sourceSpanSchema>;

export const htmlDiagnosticCodeSchema = z.enum([
  "HTML_UNEXPECTED_EOF",
  "HTML_INVALID_NAME",
  "HTML_UNQUOTED_ATTRIBUTE",
  "HTML_DUPLICATE_ATTRIBUTE",
  "HTML_INVALID_ATTRIBUTE_VALUE",
  "HTML_INVALID_TEXT",
  "HTML_INVALID_ENTITY",
  "HTML_MISMATCHED_TAG",
  "HTML_SELF_CLOSING_FORBIDDEN",
  "HTML_UNSUPPORTED_SYNTAX",
  "HTML_UNSUPPORTED_ELEMENT",
  "HTML_UNSUPPORTED_ATTRIBUTE",
  "HTML_UNSUPPORTED_NESTING",
  "HTML_CLASS_FORBIDDEN",
  "HTML_STYLE_FORBIDDEN",
  "HTML_EVENT_ATTRIBUTE_FORBIDDEN",
  "HTML_IMAGE_FORBIDDEN",
  "HTML_LINK_SCHEME_FORBIDDEN",
  "HTML_LINK_TARGET_REQUIRED",
  "HTML_LINK_REL_REQUIRED",
  "HTML_INVALID_TABLE_SPAN",
  "HTML_RESOURCE_LIMIT",
]);

export type HtmlDiagnosticCode = z.infer<typeof htmlDiagnosticCodeSchema>;

export const htmlDiagnosticSchema = z.object({
  code: htmlDiagnosticCodeSchema,
  severity: z.enum(["error", "warning"]),
  message: z.string().min(1),
  span: sourceSpanSchema,
  profileVersion: z.literal(articleHtmlProfileVersion),
});

export type HtmlDiagnostic = z.infer<typeof htmlDiagnosticSchema>;

export const htmlInspectionSchema = z
  .object({
    profileVersion: z.literal(articleHtmlProfileVersion),
    valid: z.boolean(),
    diagnostics: z.array(htmlDiagnosticSchema),
  })
  .refine(
    (inspection) => {
      const hasError = inspection.diagnostics.some(
        (diagnostic) => diagnostic.severity === "error",
      );
      return inspection.valid === !hasError;
    },
    { message: "valid must agree with error diagnostics" },
  );

export type HtmlInspection = z.infer<typeof htmlInspectionSchema>;

export function parseHtmlInspection(value: unknown): HtmlInspection {
  return htmlInspectionSchema.parse(value);
}
