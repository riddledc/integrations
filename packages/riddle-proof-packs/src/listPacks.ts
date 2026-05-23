import { RIDDLE_PROOF_PACK_MANIFEST, type RiddleProofPackProfileManifest } from "./pack-data";

/**
 * Returns all known proof pack profiles, in the same order as the manifest definitions.
 */
export function listRiddleProofPackProfiles(): readonly RiddleProofPackProfileManifest[] {
  return RIDDLE_PROOF_PACK_MANIFEST;
}

/**
 * Alias kept for future ergonomic stability.
 */
export function listRiddleProofPacks(): readonly RiddleProofPackProfileManifest[] {
  return RIDDLE_PROOF_PACK_MANIFEST;
}

/**
 * Returns the first matching profile metadata for the provided pack identifier.
 */
export function getRiddleProofPackProfileByPackId(packId: string): RiddleProofPackProfileManifest | undefined {
  const normalized = packId.trim().toLowerCase();
  return RIDDLE_PROOF_PACK_MANIFEST.find(
    (entry) => normalized.length > 0 && entry.packId?.toLowerCase() === normalized,
  );
}

/**
 * Returns every manifest entry that includes an explicit `pack_id`.
 */
export function getPackEnabledRiddleProofPackProfiles(): readonly RiddleProofPackProfileManifest[] {
  return RIDDLE_PROOF_PACK_MANIFEST.filter((entry) => Boolean(entry.packId));
}
