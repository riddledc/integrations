import { normalizeRiddleProofProfile } from "@riddledc/riddle-proof";
import type { RiddleProofProfile } from "@riddledc/riddle-proof";
import authSmokeProfile from "../packs/auth-smoke/profile.json";
import canvasGameplayProfile from "../packs/canvas-gameplay/profile.json";
import gameplayWindowCallUntilProfile from "../packs/gameplay-window-call-until/profile.json";
import handledRecoveryActionMalformedSuccessProfile from "../packs/handled-recovery-action-malformed-success/profile.json";
import handledRecoveryListLoadProfile from "../packs/handled-recovery-list-load/profile.json";
import mobileLayoutSmokeProfile from "../packs/mobile-layout-smoke/profile.json";
import pageContentBasicProfile from "../packs/page-content-basic/profile.json";
import routeInventoryBasicProfile from "../packs/route-inventory-basic/profile.json";
import spaRouteExitStateHygieneProfile from "../packs/spa-route-exit-state-hygiene/profile.json";
import terminalResultPartialEvidenceProfile from "../packs/terminal-result-partial-evidence/profile.json";

interface PackMetadata {
  packId: string | undefined;
  packPublicName: string | undefined;
  requiredReceipts: readonly string[];
  purpose: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const values = value.filter((item): item is string => typeof item === "string").map((item) => item.trim());
  return values.filter((item) => item.length > 0);
}

function toPackMetadata(profile: RiddleProofProfile): PackMetadata {
  const metadata = isRecord(profile.metadata) ? profile.metadata : {};
  return {
    packId: safeString(metadata.pack_id),
    packPublicName: safeString(metadata.pack_public_name),
    requiredReceipts: safeStringArray(metadata.required_receipts),
    purpose: safeString(metadata.purpose),
  };
}

export interface RiddleProofPackProfileManifest {
  /** Profile slug and canonical manifest key. */
  readonly name: string;
  /** Normalized, validated proof profile for runtime consumption. */
  readonly profile: RiddleProofProfile;
  readonly slug: string;
  readonly sourcePath: string;
  readonly packId: string | undefined;
  readonly packPublicName: string | undefined;
  readonly requiredReceipts: readonly string[];
  readonly purpose: string | undefined;
}

const rawProfiles = {
  "page-content-basic": pageContentBasicProfile,
  "route-inventory-basic": routeInventoryBasicProfile,
  "mobile-layout-smoke": mobileLayoutSmokeProfile,
  "spa-route-exit-state-hygiene": spaRouteExitStateHygieneProfile,
  "handled-recovery-list-load": handledRecoveryListLoadProfile,
  "handled-recovery-action-malformed-success": handledRecoveryActionMalformedSuccessProfile,
  "terminal-result-partial-evidence": terminalResultPartialEvidenceProfile,
  "gameplay-window-call-until": gameplayWindowCallUntilProfile,
  "canvas-gameplay": canvasGameplayProfile,
  "auth-smoke": authSmokeProfile,
};

export const RIDDLE_PROOF_PACK_PROFILES: Readonly<Record<string, RiddleProofProfile>> = Object.freeze(
  Object.fromEntries(
    Object.entries(rawProfiles).map(([slug, raw]) => {
      const profile = normalizeRiddleProofProfile(raw);
      const normalizedSlug = profile.name || slug;
      return [normalizedSlug, profile];
    }),
  ),
);

export const RIDDLE_PROOF_PACK_MANIFEST: ReadonlyArray<RiddleProofPackProfileManifest> = Object.freeze(
  Object.entries(rawProfiles).map(([slug, raw]) => {
    const profile = normalizeRiddleProofProfile(raw);
    const metadata = toPackMetadata(profile);
    return Object.freeze({
      name: profile.name,
      profile,
      slug,
      sourcePath: `packs/${slug}/profile.json`,
      ...metadata,
    });
  }),
);
