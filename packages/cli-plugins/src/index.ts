export interface PluginState {
  readonly extensions: Readonly<Record<string, unknown>>;
}

export function usagePlugin() {
  return { name: 'usage' };
}

export function versionPlugin() {
  return {
    name: 'version',
    configure({ container, version }: { container: import('@fluvient-cli/cli-kit/container.ts').Container; version: string }) {
      container.bind('version', version);
    },
  };
}

export function dryRunPlugin() {
  return { name: 'dry-run' };
}

export function jsonPlugin() {
  return { name: 'json' };
}
