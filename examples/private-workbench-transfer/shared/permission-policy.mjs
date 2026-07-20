export const PERMISSION_ROLES = Object.freeze({
  ADMIN_DIRECTORY: "admin_directory",
  ADMIN_FILE: "admin_file",
  BOOTSTRAP_DIRECTORY: "bootstrap_directory",
  BOOTSTRAP_FILE: "bootstrap_file",
  BOOTSTRAP_EXECUTABLE: "bootstrap_executable",
  PINNED_NODE_DIRECTORY: "pinned_node_directory",
  PINNED_NODE_EXECUTABLE: "pinned_node_executable",
  PROTECTED_ANCESTOR_DIRECTORY: "protected_ancestor_directory",
  PROTECTED_DIRECTORY: "protected_directory",
  PROTECTED_FILE: "protected_file",
});

const VALID_ROLES = new Set(Object.values(PERMISSION_ROLES));

function fixedResult(violations) {
  return Object.freeze({
    ok: violations.length === 0,
    violations: Object.freeze([...new Set(violations)].sort()),
  });
}

// This function is deliberately pure. Production callers must provide identity and
// lstat-derived records; tests can exercise the policy with inert records without
// creating an environment variable, CLI argument, or runtime bypass.
export function evaluateOsBoundaryPolicy(input) {
  const violations = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fixedResult(["POLICY_INPUT_INVALID"]);
  }
  const runtimeUid = input.runtime_uid;
  const runtimeGids = input.runtime_gids;
  const entries = input.entries;
  if (!Number.isSafeInteger(runtimeUid) || runtimeUid <= 0) {
    violations.push("RUNTIME_IDENTITY_NOT_SEPARATE");
  }
  if (!Array.isArray(runtimeGids) || runtimeGids.length < 1
    || runtimeGids.some((gid) => !Number.isSafeInteger(gid) || gid < 0)) {
    violations.push("RUNTIME_GROUPS_INVALID");
  }
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 8192) {
    violations.push("PROTECTED_INVENTORY_INVALID");
    return fixedResult(violations);
  }
  const groups = new Set(Array.isArray(runtimeGids) ? runtimeGids : []);
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || !VALID_ROLES.has(entry.role)
      || !Number.isSafeInteger(entry.uid) || entry.uid < 0
      || !Number.isSafeInteger(entry.gid) || entry.gid < 0
      || !Number.isSafeInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777
      || !["directory", "file"].includes(entry.kind)
      || typeof entry.is_symbolic_link !== "boolean") {
      violations.push("PROTECTED_ENTRY_INVALID");
      continue;
    }
    const directoryRole = entry.role.endsWith("_directory");
    if (entry.is_symbolic_link || (directoryRole ? entry.kind !== "directory" : entry.kind !== "file")) {
      violations.push("PROTECTED_ENTRY_TYPE_INVALID");
    }
    if (entry.uid === runtimeUid) violations.push("RUNTIME_OWNS_PROTECTED_ENTRY");

    if (entry.role === PERMISSION_ROLES.PROTECTED_ANCESTOR_DIRECTORY) {
      const runtimeUsesGroupClass = groups.has(entry.gid);
      const accessDigit = runtimeUsesGroupClass
        ? (entry.mode >> 3) & 0o7
        : entry.mode & 0o7;
      if ((accessDigit & 0o1) === 0) violations.push("RUNTIME_ANCESTOR_TRAVERSE_MISSING");
      if ((accessDigit & 0o2) !== 0) violations.push("RUNTIME_CAN_REPLACE_PROTECTED_TREE");
      continue;
    }

    if (!groups.has(entry.gid)) violations.push("RUNTIME_GROUP_ACCESS_MISSING");

    if (entry.role === PERMISSION_ROLES.ADMIN_DIRECTORY && entry.mode !== 0o550) {
      violations.push("ADMIN_DIRECTORY_MODE_INVALID");
    } else if (entry.role === PERMISSION_ROLES.ADMIN_FILE && entry.mode !== 0o440) {
      violations.push("ADMIN_FILE_MODE_INVALID");
    } else if (entry.role === PERMISSION_ROLES.BOOTSTRAP_DIRECTORY && entry.mode !== 0o555) {
      violations.push("BOOTSTRAP_DIRECTORY_MODE_INVALID");
    } else if (entry.role === PERMISSION_ROLES.BOOTSTRAP_FILE && entry.mode !== 0o444) {
      violations.push("BOOTSTRAP_FILE_MODE_INVALID");
    } else if (entry.role === PERMISSION_ROLES.BOOTSTRAP_EXECUTABLE && entry.mode !== 0o555) {
      violations.push("BOOTSTRAP_EXECUTABLE_MODE_INVALID");
    } else if (entry.role === PERMISSION_ROLES.PINNED_NODE_DIRECTORY && entry.mode !== 0o755) {
      violations.push("PINNED_NODE_DIRECTORY_MODE_INVALID");
    } else if (entry.role === PERMISSION_ROLES.PINNED_NODE_EXECUTABLE && entry.mode !== 0o555) {
      violations.push("PINNED_NODE_EXECUTABLE_MODE_INVALID");
    } else if ((entry.role === PERMISSION_ROLES.PROTECTED_DIRECTORY
      || entry.role === PERMISSION_ROLES.PROTECTED_FILE)
      && (entry.mode & 0o022) !== 0) {
      violations.push("PROTECTED_ENTRY_WRITABLE_BY_RUNTIME_CLASS");
    }

    if (entry.role === PERMISSION_ROLES.PROTECTED_DIRECTORY && entry.mode !== 0o750) {
      violations.push("PROTECTED_DIRECTORY_MODE_INVALID");
    } else if (entry.role === PERMISSION_ROLES.PROTECTED_FILE && entry.mode !== 0o640) {
      violations.push("PROTECTED_FILE_MODE_INVALID");
    }

    if ((entry.mode & 0o040) === 0
      || (directoryRole && (entry.mode & 0o010) === 0)) {
      violations.push("RUNTIME_GROUP_ACCESS_MISSING");
    }
  }
  return fixedResult(violations);
}
