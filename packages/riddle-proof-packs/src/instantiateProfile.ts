import { normalizeRiddleProofProfile, type RiddleProofProfile } from "@riddledc/riddle-proof";
import { getRiddleProofPackProfileManifest } from "./resolvePack";

export interface RiddleProofPackProfileOverrides {
  /** Override target URL for a particular invocation. */
  url?: string;
  /** Override route for profile launch. */
  route?: string;
  /** Runtime-specific target overrides. */
  target?: Partial<RiddleProofProfile["target"]>;
}

/**
 * Returns an instantiated, validated profile with lightweight invocation overrides applied.
 */
export function instantiateRiddleProofProfile(
  profileName: string,
  options: RiddleProofPackProfileOverrides = {},
): RiddleProofProfile {
  const manifest = getRiddleProofPackProfileManifest(profileName);
  if (!manifest) throw new Error(`Unknown proof pack profile: ${profileName}`);

  const targetOverride = {
    ...manifest.profile.target,
    ...(options.target || {}),
    url: options.url ?? manifest.profile.target.url,
    route: options.route ?? manifest.profile.target.route,
  };

  return normalizeRiddleProofProfile(
    { ...manifest.profile, target: targetOverride },
    {
      url: targetOverride.url,
      route: targetOverride.route,
      viewports: targetOverride.viewports,
    },
  );
}
