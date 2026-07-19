import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  captureDocumentSnapshot,
  compareDocumentSnapshotReceipts,
  createDocumentSnapshotGroundingRecipe,
  verifyDocumentSnapshotReceipt,
} from "./snapshot.js";
import type { DocumentSnapshotReceipt } from "./types.js";
import type { DocumentArtifactPolicy, DocumentFileSelection } from "./types.js";

const USAGE = `Usage:
  riddle-proof-local snapshot [options]
  riddle-proof-local verify --receipt <receipt.json>
  riddle-proof-local compare --before <receipt.json> --after <receipt.json>

Select files explicitly:
  --file <role=path>          Repeatable generic file selection
  --original <path>           Shorthand for --file original=path
  --template <path>           Shorthand for --file template=path
  --candidate <path>          Shorthand for --file candidate=path
  --rendered <path>           Shorthand for --file rendered=path
  --media <role=media/type>   Override extension-based media type detection

Receipt controls:
  --policy <mode>             digest_only (default), minimal, or full
  --reference-root <path>     Allow root-relative refs for minimal/full receipts
  --label <text>              Human-readable run label
  --captured-at <iso-time>    Reproducible timestamp override
  --max-file-bytes <number>   Per-file size limit (default 67108864)
  --out <path>                Write receipt JSON; refuses to overwrite
  --grounding-out <path>      Write deterministic grounded-evidence recipe JSON
  --help                      Show this help

The command never contacts a network service and never modifies selected files.
`;

async function readReceipt(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(filePath), "utf8")) as unknown;
}

function parseReceiptPaths(args: string[], allowed: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.includes(flag)) throw new Error(`Unknown option: ${flag}`);
    if (values[flag] !== undefined) throw new Error(`Duplicate option: ${flag}`);
    values[flag] = nextValue(args, index, flag);
    index += 1;
  }
  for (const flag of allowed) {
    if (values[flag] === undefined) throw new Error(`${flag} is required.`);
  }
  return values;
}

function parseAssignment(value: string, flag: string): [string, string] {
  const separator = value.indexOf("=");
  if (separator < 1 || separator === value.length - 1) {
    throw new Error(`${flag} requires role=value.`);
  }
  return [value.slice(0, separator), value.slice(separator + 1)];
}

function nextValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined) throw new Error(`${flag} requires a value.`);
  return value;
}

async function writeExclusive(filePath: string, value: unknown): Promise<void> {
  await writeFile(resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

export async function main(args: string[]): Promise<number> {
  if (args.includes("--help") || args[0] === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (args[0] !== "snapshot" && args[0] !== "verify" && args[0] !== "compare") {
    process.stderr.write(`${USAGE}\nExpected the snapshot, verify, or compare command.\n`);
    return 2;
  }

  try {
    if (args[0] === "verify") {
      const paths = parseReceiptPaths(args, ["--receipt"]);
      const verification = verifyDocumentSnapshotReceipt(await readReceipt(paths["--receipt"]));
      process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
      return verification.ok ? 0 : 1;
    }
    if (args[0] === "compare") {
      const paths = parseReceiptPaths(args, ["--before", "--after"]);
      const before = await readReceipt(paths["--before"]);
      const after = await readReceipt(paths["--after"]);
      const comparison = compareDocumentSnapshotReceipts(
        before as DocumentSnapshotReceipt,
        after as DocumentSnapshotReceipt,
      );
      process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
      return comparison.status === "unchanged" ? 0 : 3;
    }

    const files: DocumentFileSelection[] = [];
    const mediaByRole = new Map<string, string>();
    let artifactPolicy: DocumentArtifactPolicy = "digest_only";
    let referenceRoot: string | undefined;
    let label: string | undefined;
    let capturedAt: string | undefined;
    let maxFileBytes: number | undefined;
    let out: string | undefined;
    let groundingOut: string | undefined;
    for (let index = 1; index < args.length; index += 1) {
      const flag = args[index];
      if (flag === "--file" || flag === "--media") {
        const value = nextValue(args, index, flag);
        const [role, assigned] = parseAssignment(value, flag);
        if (flag === "--file") files.push({ role, path: assigned });
        else mediaByRole.set(role, assigned);
        index += 1;
      } else if (flag === "--original" || flag === "--template"
        || flag === "--candidate" || flag === "--rendered") {
        files.push({ role: flag.slice(2), path: nextValue(args, index, flag) });
        index += 1;
      } else if (flag === "--policy") {
        artifactPolicy = nextValue(args, index, flag) as DocumentArtifactPolicy;
        index += 1;
      } else if (flag === "--reference-root") {
        referenceRoot = nextValue(args, index, flag);
        index += 1;
      } else if (flag === "--label") {
        label = nextValue(args, index, flag);
        index += 1;
      } else if (flag === "--captured-at") {
        capturedAt = nextValue(args, index, flag);
        index += 1;
      } else if (flag === "--max-file-bytes") {
        maxFileBytes = Number(nextValue(args, index, flag));
        index += 1;
      } else if (flag === "--out") {
        out = nextValue(args, index, flag);
        index += 1;
      } else if (flag === "--grounding-out") {
        groundingOut = nextValue(args, index, flag);
        index += 1;
      } else {
        throw new Error(`Unknown option: ${flag}`);
      }
    }

    for (const file of files) file.mediaType = mediaByRole.get(file.role);
    const receipt = await captureDocumentSnapshot({
      files: files as [DocumentFileSelection, ...DocumentFileSelection[]],
      artifactPolicy,
      ...(referenceRoot === undefined ? {} : { referenceRoot }),
      ...(label === undefined ? {} : { label }),
      ...(capturedAt === undefined ? {} : { capturedAt }),
      ...(maxFileBytes === undefined ? {} : { maxFileBytes }),
    });
    const verification = verifyDocumentSnapshotReceipt(receipt);
    if (!verification.ok) throw new Error(`Internal receipt verification failed: ${verification.errors.join("; ")}`);

    if (out === undefined) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    else await writeExclusive(out, receipt);
    if (groundingOut !== undefined) {
      await writeExclusive(groundingOut, createDocumentSnapshotGroundingRecipe(receipt));
    }
    if (out !== undefined) {
      process.stderr.write(`Captured ${receipt.snapshot.artifacts.length} stable file(s) as ${receipt.snapshot.snapshot_id}.\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export { USAGE };
