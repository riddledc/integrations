import { createHash, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function commandEnv() {
  return { ...process.env, HOME: "/root" };
}

export function shellQuote(value) {
  return `'${String(value ?? "").replace(/'/g, `'"'"'`)}'`;
}

export function run(cmd, cwd, timeoutMs = 30000) {
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    timeout: timeoutMs,
    env: commandEnv(),
  }).trim();
}

export function runSafe(cmd, cwd, timeoutMs = 30000) {
  try {
    return { ok: true, output: run(cmd, cwd, timeoutMs) };
  } catch (error) {
    return {
      ok: false,
      output: error?.stderr?.toString?.() || error?.message || String(error),
    };
  }
}

export function sanitizeFragment(value, fallback = "item") {
  const sanitized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return sanitized || fallback;
}

export function uniqueToken(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${stamp}-${randomUUID().slice(0, 8)}`;
}

export function workspaceRoots({ workspaceRoot = "", currentRepoDir = "" } = {}) {
  const roots = [];
  for (const candidate of [
    workspaceRoot,
    process.env.OPENCLAW_WORKSPACE,
    "/mnt/efs/openclaw/workspace",
    path.resolve(process.env.HOME || "/root", ".openclaw/workspace"),
    currentRepoDir ? path.dirname(currentRepoDir) : "",
  ]) {
    if (candidate && !roots.includes(candidate)) {
      roots.push(candidate);
    }
  }
  return roots;
}

export function resolveRepoDir({ repoName, repoDir = "", workspaceRoot = "", currentRepoDir = "" }) {
  const candidates = [];
  if (repoDir) candidates.push(repoDir);
  if (currentRepoDir) candidates.push(currentRepoDir);
  for (const root of workspaceRoots({ workspaceRoot, currentRepoDir })) {
    candidates.push(path.join(root, repoName));
  }
  for (const candidate of candidates) {
    if (candidate && existsSync(path.join(candidate, ".git"))) {
      return candidate;
    }
  }
  return candidates.find(Boolean) || path.join(workspaceRoots({ workspaceRoot, currentRepoDir })[0] || "/tmp", repoName);
}

export function requireCleanIndex(repoDir, label) {
  const unmerged = runSafe("git ls-files -u", repoDir);
  if (unmerged.ok && unmerged.output.trim()) {
    throw new Error(
      `${label} has unmerged index entries. Resolve conflicts before continuing.\n${unmerged.output
        .trim()
        .split("\n")
        .slice(0, 20)
        .join("\n")}`,
    );
  }
}

export function prepareRepo({
  repo,
  branch,
  repoDir = "",
  baseBranch = "main",
  workspaceRoot = "",
  ensureHttpsRemote = false,
  fetch = true,
} = {}) {
  if (!repo) throw new Error("repo is required");
  if (!branch) throw new Error("branch is required");

  const repoName = repo.split("/").pop() || repo;
  const resolvedRepoDir = resolveRepoDir({ repoName, repoDir, workspaceRoot });
  const hadExistingRepo = existsSync(path.join(resolvedRepoDir, ".git"));
  mkdirSync(path.dirname(resolvedRepoDir), { recursive: true });

  if (hadExistingRepo) {
    if (ensureHttpsRemote) {
      runSafe(`git remote set-url origin https://github.com/${repo}.git`, resolvedRepoDir);
    }
    if (fetch) {
      const fetchResult = runSafe("git fetch --prune origin", resolvedRepoDir, 60000);
      if (!fetchResult.ok) {
        throw new Error(`git fetch failed for ${resolvedRepoDir}: ${fetchResult.output.slice(0, 300)}`);
      }
    }
  } else {
    run(`git clone https://github.com/${repo}.git ${shellQuote(resolvedRepoDir)}`, undefined, 120000);
  }

  const localBranchRef = `refs/heads/${branch}`;
  const remoteBranchRef = `refs/remotes/origin/${branch}`;
  const localExists = runSafe(`git show-ref --verify --quiet ${shellQuote(localBranchRef)}`, resolvedRepoDir);
  if (!localExists.ok) {
    const remoteExists = runSafe(`git show-ref --verify --quiet ${shellQuote(remoteBranchRef)}`, resolvedRepoDir);
    let branchResult;
    if (remoteExists.ok) {
      branchResult = runSafe(`git branch ${shellQuote(branch)} ${shellQuote(`origin/${branch}`)}`, resolvedRepoDir);
    } else {
      const remoteBase = `origin/${baseBranch}`;
      branchResult = runSafe(`git branch ${shellQuote(branch)} ${shellQuote(remoteBase)}`, resolvedRepoDir);
      if (!branchResult.ok) {
        branchResult = runSafe(`git branch ${shellQuote(branch)} ${shellQuote(baseBranch)}`, resolvedRepoDir);
      }
    }
    if (!branchResult.ok) {
      throw new Error(`Failed to prepare workspace branch ${branch}: ${branchResult.output.slice(0, 300)}`);
    }
  }

  return {
    repo,
    repoName,
    repoDir: resolvedRepoDir,
    branch,
    source: hadExistingRepo ? "existing_repo" : "cloned_repo",
  };
}

export function listWorktrees(repoDir) {
  const result = runSafe("git worktree list --porcelain", repoDir, 30000);
  if (!result.ok) return [];
  const worktrees = [];
  let current = {};
  for (const line of [...result.output.split(/\r?\n/), ""]) {
    if (!line.trim()) {
      if (Object.keys(current).length) {
        worktrees.push(current);
        current = {};
      }
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ").trim();
    if (key === "worktree") current.path = value;
    if (key === "branch") current.branch = value.replace(/^refs\/heads\//, "");
    if (key === "HEAD") current.head = value;
    if (key === "detached") current.detached = true;
    if (key === "locked") current.locked = value || true;
    if (key === "prunable") current.prunable = value || true;
  }
  return worktrees;
}

export function findWorktreeByBranch(repoDir, branch) {
  return listWorktrees(repoDir).find((entry) => entry.branch === branch) || null;
}

export function removePath(targetPath) {
  if (!targetPath || !existsSync(targetPath)) return;
  const stat = lstatSync(targetPath);
  if (stat.isSymbolicLink() || stat.isFile()) {
    unlinkSync(targetPath);
    return;
  }
  rmSync(targetPath, { recursive: true, force: true });
}

function samePath(left, right) {
  if (!left || !right) return false;
  return path.resolve(left) === path.resolve(right);
}

export function removeWorktree(repoDir, worktreeDir) {
  if (!worktreeDir) return;
  const registered = listWorktrees(repoDir).some((entry) => samePath(entry.path, worktreeDir));
  if (registered) {
    runSafe(`git worktree remove --force ${shellQuote(worktreeDir)}`, repoDir, 30000);
  }
  if (existsSync(worktreeDir)) {
    removePath(worktreeDir);
  }
  if (registered) {
    runSafe("git worktree prune", repoDir, 30000);
  }
}

export function buildWorktreeDir({ workspaceRoot = "", repoName, branch, role = "after", token = uniqueToken() }) {
  const root = workspaceRoot || workspaceRoots({})[0] || "/tmp";
  const pieces = [sanitizeFragment(repoName, "repo"), sanitizeFragment(role, "after")];
  const branchFragment = sanitizeFragment(branch, "branch");
  if (branchFragment) pieces.push(branchFragment);
  pieces.push(token);
  return path.join(root, pieces.join("-"));
}

export function ensureWorktree({
  repoDir,
  worktreeDir,
  ref,
  branchName = "",
  detach = false,
  resetBranch = false,
  cleanupPaths = [],
  cleanupBranches = [],
  verifyPackageJson = false,
} = {}) {
  if (!repoDir) throw new Error("repoDir is required");
  if (!worktreeDir) throw new Error("worktreeDir is required");
  if (!ref) throw new Error("ref is required");

  for (const candidate of cleanupPaths) {
    if (candidate) removeWorktree(repoDir, candidate);
  }
  runSafe("git worktree prune", repoDir, 30000);
  for (const candidate of cleanupBranches) {
    const branchWorktree = candidate ? findWorktreeByBranch(repoDir, candidate) : null;
    if (branchWorktree?.path) removeWorktree(repoDir, branchWorktree.path);
    if (candidate) runSafe(`git branch -D ${shellQuote(candidate)}`, repoDir, 30000);
  }

  if (existsSync(worktreeDir)) {
    removePath(worktreeDir);
  }

  const command = detach
    ? `git worktree add --detach ${shellQuote(worktreeDir)} ${shellQuote(ref)}`
    : resetBranch
      ? `git worktree add -B ${shellQuote(branchName)} ${shellQuote(worktreeDir)} ${shellQuote(ref)}`
      : `git worktree add ${shellQuote(worktreeDir)} ${shellQuote(branchName || ref)}`;

  const addResult = runSafe(command, repoDir, 60000);
  if (!addResult.ok) {
    throw new Error(addResult.output.slice(0, 300));
  }

  if (verifyPackageJson && !existsSync(path.join(worktreeDir, "package.json"))) {
    const contents = existsSync(worktreeDir) ? JSON.stringify(runSafe(`ls -1 ${shellQuote(worktreeDir)}`).output.split(/\r?\n/).filter(Boolean).slice(0, 50)) : '"DIR NOT FOUND"';
    throw new Error(`Worktree created but package.json missing. Dir contents: ${contents}`);
  }

  return { worktreeDir, branchName: branchName || null, ref, detach };
}

const DEPS_MANIFEST = ".workspace-core-deps.json";

function depsManifestPath(projectDir) {
  return path.join(projectDir, "node_modules", DEPS_MANIFEST);
}

export function computeDependencyFingerprint(projectDir) {
  const packageJson = path.join(projectDir, "package.json");
  if (!existsSync(packageJson)) return "";
  const digest = createHash("sha256");
  for (const name of ["package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"]) {
    const filePath = path.join(projectDir, name);
    if (!existsSync(filePath)) continue;
    digest.update(name);
    digest.update(readFileSync(filePath));
  }
  return digest.digest("hex");
}

export function detectInstallCommand(projectDir) {
  if (!existsSync(path.join(projectDir, "package.json"))) return "";
  if (existsSync(path.join(projectDir, "package-lock.json")) || existsSync(path.join(projectDir, "npm-shrinkwrap.json"))) {
    return "npm ci";
  }
  return "npm install";
}

function readDepsManifest(projectDir) {
  const manifestPath = depsManifestPath(projectDir);
  if (!existsSync(manifestPath)) return {};
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return {};
  }
}

function writeDepsManifest(projectDir, fingerprint, installCmd) {
  const manifestPath = depsManifestPath(projectDir);
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify({ fingerprint, install_cmd: installCmd }, null, 2));
}

function dependencyInstallTimeoutMs() {
  const parsed = Number.parseInt(process.env.RIDDLE_PROOF_INSTALL_TIMEOUT_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600000;
}

export function ensureDeps({ projectDir, reuseFrom = "" } = {}) {
  const fingerprint = computeDependencyFingerprint(projectDir);
  if (!fingerprint) return "no_package_json";

  const existingManifest = readDepsManifest(projectDir);
  if (existingManifest.fingerprint === fingerprint && existsSync(path.join(projectDir, "node_modules"))) {
    return "already_installed";
  }

  if (reuseFrom && path.resolve(reuseFrom) !== path.resolve(projectDir)) {
    const sourceFingerprint = computeDependencyFingerprint(reuseFrom);
    const sourceManifest = readDepsManifest(reuseFrom);
    const sourceModules = path.join(reuseFrom, "node_modules");
    if (sourceFingerprint === fingerprint && sourceManifest.fingerprint === fingerprint && existsSync(sourceModules)) {
      const projectModules = path.join(projectDir, "node_modules");
      removePath(projectModules);
      symlinkSync(sourceModules, projectModules);
      return `reused_from:${reuseFrom}`;
    }
  }

  const installCmd = detectInstallCommand(projectDir);
  if (!installCmd) return "no_install_command";
  const installResult = runSafe(`${installCmd} 2>&1 | tail -5`, projectDir, dependencyInstallTimeoutMs());
  if (!installResult.ok) {
    throw new Error(`dependency install failed in ${projectDir}: ${installResult.output.slice(0, 300)}`);
  }
  writeDepsManifest(projectDir, fingerprint, installCmd);
  return installCmd;
}

function ok(payload) {
  process.stdout.write(`${JSON.stringify({ ok: true, ...payload })}\n`);
}

function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function main() {
  const [, , command, rawPayload = "{}"] = process.argv;
  if (!command) throw new Error("command is required");
  const payload = JSON.parse(rawPayload);

  switch (command) {
    case "prepare-repo":
      ok(prepareRepo(payload));
      return;
    case "find-worktree-by-branch":
      ok({ worktree: findWorktreeByBranch(payload.repoDir, payload.branch) });
      return;
    case "build-worktree-dir":
      ok({ worktreeDir: buildWorktreeDir(payload) });
      return;
    case "ensure-worktree":
      ok(ensureWorktree(payload));
      return;
    case "ensure-deps":
      ok({ status: ensureDeps(payload) });
      return;
    case "dependency-fingerprint":
      ok({ fingerprint: computeDependencyFingerprint(payload.projectDir) });
      return;
    default:
      throw new Error(`Unsupported command: ${command}`);
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (executedPath && fileURLToPath(import.meta.url) === executedPath) {
  main().catch(fail);
}
