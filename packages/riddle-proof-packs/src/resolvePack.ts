import {
  RIDDLE_PROOF_PACK_MANIFEST,
  RIDDLE_PROOF_PACK_PROFILES,
  type RiddleProofPackProfileManifest,
} from "./pack-data";

/**
 * Returns profile metadata by canonical profile name.
 */
export function getRiddleProofPackProfileManifest(
  name: string,
): RiddleProofPackProfileManifest | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  return RIDDLE_PROOF_PACK_MANIFEST.find(
    (entry) => entry.name.toLowerCase() === normalized || entry.slug === normalized,
  );
}

/**
 * Returns the profile JSON for a pack profile name or alias.
 */
export function getRiddleProofPackProfile(name: string) {
  return RIDDLE_PROOF_PACK_PROFILES[name];
}

/**
 * Returns every manifest entry with the requested `pack_id`.
 */
export function getRiddleProofProfilesByPackId(packId: string): readonly RiddleProofPackProfileManifest[] {
  const normalized = packId.trim().toLowerCase();
  return RIDDLE_PROOF_PACK_MANIFEST.filter(
    (entry) => normalized.length > 0 && entry.packId?.toLowerCase() === normalized,
  );
}
