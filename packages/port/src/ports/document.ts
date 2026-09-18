export interface DocumentPort {
  readRootAttribute(name: string): string | undefined;
  writeRootAttribute(name: string, value: string): void;
}
