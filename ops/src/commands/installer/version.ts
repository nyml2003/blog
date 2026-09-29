export type BuildVersion = readonly [bigint, bigint, bigint];

const BUILD_TAG = /^build-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export function parseBuildVersion(tag: string): BuildVersion | undefined {
  const match = BUILD_TAG.exec(tag);
  if (!match) return undefined;
  return [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])];
}

export function serializeBuildVersion(version: BuildVersion): string {
  if (version.some((part) => part < 0n)) {
    throw new Error('版本号只能包含非负整数');
  }
  return `build-v${version[0]}.${version[1]}.${version[2]}`;
}

export function compareBuildVersion(left: BuildVersion, right: BuildVersion): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }
  return 0;
}
