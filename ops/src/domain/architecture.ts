export interface Violation { file: string; message: string }
export function checkWebBoundaries(files: readonly string[], source: (file: string) => string): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const text = source(file);
    if (file.includes('/web/desktop/') && /from ['"].*web\/mobile|from ['"].*mobile\/src/.test(text)) violations.push({ file, message: 'desktop must not import mobile UI' });
    if (file.includes('/web/mobile/') && /from ['"].*web\/desktop|from ['"].*desktop\/src/.test(text)) violations.push({ file, message: 'mobile must not import desktop UI' });
    if (file.includes('/web/common/') && /\.(tsx|jsx)|from ['"].*(desktop|mobile)\//.test(text)) violations.push({ file, message: 'common must not depend on UI' });
  }
  return violations;
}
