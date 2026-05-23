# @riddledc/riddle-proof-packs

Reusable starter profile definitions and proof-pack metadata for Riddle Proof.

## Exports

- `RIDDLE_PROOF_PACK_PROFILES`:
  - Canonical profile map keyed by profile name.
- `RIDDLE_PROOF_PACK_MANIFEST`:
  - Array of normalized profile entries with optional `pack_id`, `pack_public_name`, `required_receipts`, and `purpose` metadata.
- `listRiddleProofPackProfiles()`:
  - Returns all normalized profile manifests.
- `listRiddleProofPacks()`:
  - Alias for pack listing used by downstream CLI helpers.
- `getRiddleProofPackProfile(name)`:
  - Fetch a profile by name.
- `getRiddleProofProfilesByPackId(packId)`:
  - Fetch all profiles tagged with a given pack id.
- `getPackEnabledRiddleProofPackProfiles()`:
  - Filter manifest entries that include a pack id.
- `getRiddleProofPackProfileManifest(name)`:
  - Fetch full profile manifest including `sourcePath`, `packPublicName`, and metadata.
- `getRiddleProofPackProfileByPackId(packId)`:
  - Returns first manifest entry for a matching `pack_id`.
- `instantiateRiddleProofProfile(name, options)`:
  - Returns a copy of a profile with optional `url`, `route`, and `target` overrides.

## Proof claims and evidence roles

Riddle Proof proves claims about a running browser/app target. A before/after change proof is one pattern built from smaller proof claims, not the core proof primitive.

### 1) Atomic proof

An atomic proof is the base unit:

- **claim**
  - What the profile is asserting.
- **target**
  - The URL/route/runtime state that is being tested.
- **setup/actions**
  - The steps that drive the target to the evidence-bearing state.
- **evidence**
  - Screenshots, assertions, console/HAR, route text, DOM checks, and any explicit output.
- **verdict**
  - Pass/fail/review status based on whether each atomic evidence receipt is present and valid.

### 2) Evidence-role patterns

- `current_target` (current-target audit)
  - One deployed/preview target. No implementation diff artifacts are required. No measured before/after visual delta is required.
- `reference_candidate` (reference/candidate change proof)
  - Reference/prod/baseline evidence plus candidate/after evidence is compared inside the same workflow. Comparison supports a change claim.
- `interaction_snapshots` (interaction proof)
  - A pre-action and post-action snapshot set is collected in one proof run, e.g. before clicking Play and after clicking Play.

### 3) Naming guidance

- Avoid using `before/after` alone in user-facing docs when describing proof purpose.
- Prefer:
  - `reference_candidate` for change/variance proofs.
  - `pre-action` / `post-action` for snapshots in a single run.
  - `current_target` for audit/profile/no-diff proofs.
- If you encounter `before_cdn` / `after_cdn` in existing payloads, treat those as legacy artifact role names in the change workflow, not as universal proof terminology.

### 4) Pack/report declarations

Each proof pack sample report should state:

- Which evidence-role pattern it uses (`current_target`, `reference_candidate`, or `interaction_snapshots`).
- What the pack does **not** prove.

Profiles are stored under `packs/<slug>/profile.json` and mirrored into the runtime exports.

## Bundled profiles

- `page-content-basic`
- `route-inventory-basic`
- `handled-recovery-list-load`
- `handled-recovery-action-malformed-success`
- `terminal-result-partial-evidence`
- `gameplay-window-call-until`
- `spa-route-exit-state-hygiene`
- `canvas-gameplay`
- `mobile-layout-smoke`
- `auth-smoke`

## Usage

```ts
import {
  getRiddleProofPackProfile,
  getRiddleProofProfilesByPackId,
  instantiateRiddleProofProfile,
} from "@riddledc/riddle-proof-packs";

const profile = getRiddleProofPackProfile("spa-route-exit-state-hygiene");
if (!profile) throw new Error("missing profile");

const hygieneProfiles = getRiddleProofProfilesByPackId("state_hygiene");
const instantiated = instantiateRiddleProofProfile("mobile-layout-smoke", {
  url: "https://example.com",
  route: "/",
  target: { wait_for_selector: "body" },
});

console.log("Using profile", instantiated.name);
```
