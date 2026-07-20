import { constants, lstat, open } from "node:fs/promises";

export const DEFAULT_MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 256 * 1024 * 1024;
export const MAX_DOCUMENT_SET_BYTES = 512 * 1024 * 1024;

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
  /** Test-only hook used to force a change between reading and the set-level post-read stat. */
  afterRead?: (filePath: string, index: number) => void | Promise<void>;
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

export async function readStableRegularFileSet(
  filePaths: [string, ...string[]],
  maxFileBytes = DEFAULT_MAX_DOCUMENT_BYTES,
  testHooks: StableReadTestHooks = {},
  maxTotalBytes = MAX_DOCUMENT_SET_BYTES,
): Promise<StableReadResult[]> {
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > MAX_DOCUMENT_BYTES) {
    throw new TypeError(`maxFileBytes must be an integer from 1 through ${MAX_DOCUMENT_BYTES}.`);
  }
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    throw new TypeError("filePaths must contain at least one selected source.");
  }
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1
    || maxTotalBytes > MAX_DOCUMENT_SET_BYTES) {
    throw new TypeError(`maxTotalBytes must be an integer from 1 through ${MAX_DOCUMENT_SET_BYTES}.`);
  }
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const opened: Array<{
    filePath: string;
    handle: Awaited<ReturnType<typeof open>>;
    descriptorBefore: StableMetadata;
    bytes: Buffer;
  }> = [];
  let totalBytes = 0;
  try {
    for (let index = 0; index < filePaths.length; index += 1) {
      const filePath = filePaths[index];
      const pathBeforeStats = await lstat(filePath, { bigint: true });
      if (pathBeforeStats.isSymbolicLink()) throw new Error("Selected source must not be a symbolic link.");
      if (!pathBeforeStats.isFile()) throw new Error("Selected source must be a regular file.");
      const pathBefore = metadata(pathBeforeStats as never);
      assertSize(pathBefore.size, maxFileBytes);

      const handle = await open(filePath, constants.O_RDONLY | noFollow);
      let retained = false;
      try {
        const descriptorBeforeStats = await handle.stat({ bigint: true });
        if (!descriptorBeforeStats.isFile()) throw new Error("Selected source must be a regular file.");
        const descriptorBefore = metadata(descriptorBeforeStats as never);
        if (!sameMetadata(pathBefore, descriptorBefore)) {
          throw new Error("Selected source changed while it was being opened.");
        }
        assertSize(descriptorBefore.size, maxFileBytes);
        totalBytes += Number(descriptorBefore.size);
        if (totalBytes > maxTotalBytes) {
          throw new Error(`Selected files exceed the ${maxTotalBytes}-byte total capture limit.`);
        }

        const bytes = await handle.readFile();
        if (bytes.byteLength !== Number(descriptorBefore.size)) {
          throw new Error("Selected source length changed while it was being read.");
        }
        opened.push({ filePath, handle, descriptorBefore, bytes });
        retained = true;
        await testHooks.afterRead?.(filePath, index);
      } finally {
        if (!retained) await handle.close();
      }
    }

    const results: StableReadResult[] = [];
    for (const entry of opened) {
      const descriptorAfter = metadata(await entry.handle.stat({ bigint: true }) as never);
      const pathAfterStats = await lstat(entry.filePath, { bigint: true });
      if (pathAfterStats.isSymbolicLink() || !pathAfterStats.isFile()) {
        throw new Error("Selected source changed type while the snapshot set was being read.");
      }
      const pathAfter = metadata(pathAfterStats as never);
      if (!sameMetadata(entry.descriptorBefore, descriptorAfter)
        || !sameMetadata(descriptorAfter, pathAfter)) {
        throw new Error("Selected source changed while the snapshot set was being read.");
      }
      results.push({
        bytes: entry.bytes,
        identity: { dev: descriptorAfter.dev, ino: descriptorAfter.ino },
      });
    }
    return results;
  } finally {
    for (const entry of [...opened].reverse()) {
      await entry.handle.close();
    }
  }
}

export async function readStableRegularFile(
  filePath: string,
  maxFileBytes = DEFAULT_MAX_DOCUMENT_BYTES,
  testHooks: StableReadTestHooks = {},
): Promise<StableReadResult> {
  const [result] = await readStableRegularFileSet([filePath], maxFileBytes, testHooks);
  return result;
}
