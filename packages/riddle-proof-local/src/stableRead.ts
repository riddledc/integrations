import { constants, lstat, open } from "node:fs/promises";

export const DEFAULT_MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 256 * 1024 * 1024;

type StableMetadata = {
  dev: bigint;
  ino: bigint;
  mode: bigint;
  nlink: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
};

export interface StableReadResult {
  bytes: Buffer;
  identity: { dev: bigint; ino: bigint };
}

export interface StableReadTestHooks {
  /** Test-only hook used to force a change between reading and the post-read stat. */
  afterRead?: () => void | Promise<void>;
}

function metadata(stats: Awaited<ReturnType<typeof lstat>>): StableMetadata {
  const bigintStats = stats as unknown as StableMetadata;
  return {
    dev: BigInt(bigintStats.dev),
    ino: BigInt(bigintStats.ino),
    mode: BigInt(bigintStats.mode),
    nlink: BigInt(bigintStats.nlink),
    size: BigInt(bigintStats.size),
    mtimeNs: BigInt(bigintStats.mtimeNs),
    ctimeNs: BigInt(bigintStats.ctimeNs),
  };
}

function sameMetadata(left: StableMetadata, right: StableMetadata): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function assertSize(size: bigint, maxFileBytes: number): void {
  if (size < 0n || size > BigInt(maxFileBytes)) {
    throw new Error(`Selected file exceeds the ${maxFileBytes}-byte capture limit.`);
  }
}

export async function readStableRegularFile(
  filePath: string,
  maxFileBytes = DEFAULT_MAX_DOCUMENT_BYTES,
  testHooks: StableReadTestHooks = {},
): Promise<StableReadResult> {
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > MAX_DOCUMENT_BYTES) {
    throw new TypeError(`maxFileBytes must be an integer from 1 through ${MAX_DOCUMENT_BYTES}.`);
  }

  const pathBeforeStats = await lstat(filePath, { bigint: true });
  if (pathBeforeStats.isSymbolicLink()) throw new Error("Selected source must not be a symbolic link.");
  if (!pathBeforeStats.isFile()) throw new Error("Selected source must be a regular file.");
  const pathBefore = metadata(pathBeforeStats as never);
  assertSize(pathBefore.size, maxFileBytes);

  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const handle = await open(filePath, constants.O_RDONLY | noFollow);
  try {
    const descriptorBeforeStats = await handle.stat({ bigint: true });
    if (!descriptorBeforeStats.isFile()) throw new Error("Selected source must be a regular file.");
    const descriptorBefore = metadata(descriptorBeforeStats as never);
    if (!sameMetadata(pathBefore, descriptorBefore)) {
      throw new Error("Selected source changed while it was being opened.");
    }
    assertSize(descriptorBefore.size, maxFileBytes);

    const bytes = await handle.readFile();
    if (bytes.byteLength !== Number(descriptorBefore.size)) {
      throw new Error("Selected source length changed while it was being read.");
    }
    await testHooks.afterRead?.();

    const descriptorAfter = metadata(await handle.stat({ bigint: true }) as never);
    const pathAfterStats = await lstat(filePath, { bigint: true });
    if (pathAfterStats.isSymbolicLink() || !pathAfterStats.isFile()) {
      throw new Error("Selected source changed type while it was being read.");
    }
    const pathAfter = metadata(pathAfterStats as never);
    if (!sameMetadata(descriptorBefore, descriptorAfter) || !sameMetadata(descriptorAfter, pathAfter)) {
      throw new Error("Selected source changed while it was being read.");
    }
    return { bytes, identity: { dev: descriptorAfter.dev, ino: descriptorAfter.ino } };
  } finally {
    await handle.close();
  }
}
