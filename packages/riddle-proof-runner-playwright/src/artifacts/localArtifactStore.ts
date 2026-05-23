import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

type ArtifactKind = "json" | "text" | "binary" | "screenshot";

export type LocalArtifactInfo = {
  name: string;
  path: string;
  kind: ArtifactKind;
  bytes: number;
};

type SaveJsonInput = unknown;
type BinaryBlob = string | Buffer | Uint8Array;

const ARTIFACT_SCREENSHOT_DIR = "screenshots";

function safeArtifactName(input: string) {
  const trimmed = String(input || "").trim().replace(/^\.\.?(\/|\\)/g, "").trim();
  const normalized = trimmed.replace(/[/\\]/g, "-").replace(/\s+/g, "-");
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, "-");
  return safe || "artifact";
}

function withDefaultExtension(name: string, extension: string) {
  const safeName = safeArtifactName(name);
  return safeName.toLowerCase().endsWith(extension) ? safeName : `${safeName}${extension}`;
}

function readArtifactBytes(filePath: string) {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

export class LocalArtifactStore {
  private readonly rootDir: string;
  private readonly manifest: LocalArtifactInfo[] = [];
  private readonly screenshotDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
    this.screenshotDir = path.join(this.rootDir, ARTIFACT_SCREENSHOT_DIR);
    mkdirSync(this.rootDir, { recursive: true });
    mkdirSync(this.screenshotDir, { recursive: true });
  }

  getRootDir() {
    return this.rootDir;
  }

  listArtifacts() {
    return [...this.manifest];
  }

  findArtifact(nameOrPath: string) {
    const normalizedName = safeArtifactName(nameOrPath);
    const manifestMatch = this.manifest.find((artifact) =>
      artifact.name === nameOrPath
      || artifact.path === nameOrPath
      || artifact.name === normalizedName
      || artifact.path === normalizedName,
    );
    return manifestMatch;
  }

  writeText(relativePath: string, content: string) {
    const filename = safeArtifactName(relativePath);
    const target = path.join(this.rootDir, filename);
    writeFileSync(target, content, "utf8");
    const info = {
      name: filename,
      path: path.relative(this.rootDir, target),
      kind: "text" as const,
      bytes: readArtifactBytes(target),
    };
    this.upsertArtifact(target, info);
    return info;
  }

  writeJson(relativePath: string, value: SaveJsonInput) {
    const filename = withDefaultExtension(relativePath, ".json");
    const json = JSON.stringify(value, null, 2);
    return this.writeText(filename, json);
  }

  writeScreenshot(
    label: string,
    save: () => Promise<Buffer>,
  ) {
    const filename = withDefaultExtension(safeArtifactName(label), ".png");
    const target = path.join(this.screenshotDir, filename);
    return save().then((buffer) => {
      const binary = buffer as unknown as Uint8Array;
      writeFileSync(target, binary);
      const info = {
        name: filename,
        path: path.join(ARTIFACT_SCREENSHOT_DIR, filename),
        kind: "screenshot" as const,
        bytes: buffer.length,
      };
      this.upsertArtifact(target, info);
      return info;
    });
  }

  writeBinary(relativePath: string, value: BinaryBlob) {
    const filename = safeArtifactName(relativePath);
    const target = path.join(this.rootDir, filename);
    if (typeof value === "string") {
      writeFileSync(target, value, "utf8");
      return {
        name: filename,
        path: path.relative(this.rootDir, target),
        kind: "binary" as const,
        bytes: readArtifactBytes(target),
      };
    }
    const binary = Buffer.from(value as Uint8Array);
    writeFileSync(target, binary as unknown as Uint8Array);
    const info = {
      name: filename,
      path: path.relative(this.rootDir, target),
      kind: "binary" as const,
      bytes: readArtifactBytes(target),
    };
    this.upsertArtifact(target, info);
    return info;
  }

  private upsertArtifact(targetPath: string, info: LocalArtifactInfo) {
    const rel = path.relative(this.rootDir, targetPath);
    const safePath = rel.replace(/^\.\/|^\.\.[/\\]/, "");
    const next = {
      ...info,
      path: safePath,
    };
    const existing = this.manifest.findIndex((entry) => entry.path === safePath);
    if (existing >= 0) this.manifest[existing] = next;
    else this.manifest.push(next);
  }
}

export function createRiddleProofArtifactStore(outputDir: string) {
  return new LocalArtifactStore(outputDir);
}
