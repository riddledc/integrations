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
- `findHumanReviewPacket(proofOrPacket)`:
  - Recursively finds the first `human_review_packet` in a proof artifact or returns `null`.
- `requireHumanReviewPacket(proofOrPacket)`:
  - Same extraction behavior, but throws if no packet is present.
- `formatHumanReviewPacketMarkdown(packet, options)`:
  - Formats a compact Markdown handoff with recommendation, objective receipts, ranking role, proof boundary, listening prompts, and caveats.
- `createHumanReviewPacketArtifacts(proofOrPacket, options)`:
  - Returns `{ packet, json, markdown }` for storing a standalone review packet next to a proof run.
- `createMixingCanonSurrogateReview(proofOrPacket, options)`:
  - Reviews a compact audio-mix human-review packet against conservative development-approval rules and returns an explicit `mixing_canon_surrogate` approval only when the candidate is subtle, metric-supported, guardrail-preserving, reversible, and still framed as requiring listening review.
- `buildNeonApprovedCandidateProfileFromReviewPacket(proofOrPacket, options)`:
  - Builds a Neon approved-candidate profile from a prior human-review packet recommendation, narrowing the approval proof to the already-selected `set_mixer_level` candidate instead of rerunning the full candidate search.
- `createNeonApprovedCandidateProfileArtifacts(proofOrPacket, options)`:
  - Returns `{ packet, candidate, profile, json }` for writing the generated one-candidate approval profile next to a proof run.
- `getNeonApprovedCandidateFromReviewPacket(proofOrPacket)`:
  - Extracts the recommended Neon mixer-level candidate from a human-review packet.
- `createDurableCandidatePatchPlan(proofOrPacket, options)`:
  - Validates an explicitly applied `human_review_packet` and returns a durable patch handoff plan.
- `formatDurableCandidatePatchPlanMarkdown(plan, options)`:
  - Formats the durable handoff without treating approval, ranking, or source application as proof of subjective taste.
- `createDurableCandidatePatchPlanArtifacts(proofOrPacket, options)`:
  - Returns `{ plan, json, markdown }` for storing a durable source/config handoff next to a proof run.
- `buildNeonDurableCurrentTargetProfile(override, options)`:
  - Builds a Neon current-target profile that checks a durable mix override against app contract state, visible mixer text, and basic render guardrails.
- `readActiveNeonDurableMixOverrides(document)`:
  - Reads active durable mix override entries from an app/config document and normalizes bounded mixer levels.
- `createNeonDurableCurrentTargetArtifacts({ override, profileResult }, options)`:
  - Returns `{ summary, json, markdown }` for the final durable current-target proof receipt.

Browser apps that only need the pure audio review heuristics should import the
browser-safe subpath instead of the root package:

```ts
import {
  compareAudioSectionEnergy,
  computeAudioSectionReviewMetric,
  estimateLoudnessStyleLufs,
} from "@riddledc/riddle-proof-packs/audio-mix-heuristics";
```

That subpath exposes the loudness-style and section-energy helpers without the
Node-oriented profile, artifact, or CLI helpers.

Browser or agent code that needs the conservative development approval helper
can import the review subpath:

```ts
import {
  createMixingCanonSurrogateReview,
} from "@riddledc/riddle-proof-packs/audio-mix-review";
```

The review helper can approve a candidate for development application, but it
does not approve subjective taste. It returns `needs_human_review` unless the
packet is already a supported listening-review candidate with objective receipts,
section-energy guardrails, state restoration, review-order-only ranking, and an
explicit proof/taste boundary.

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
- `neon-step-sequencer-fast-mix-health`
- `neon-step-sequencer-source-readiness`
- `neon-step-sequencer-playback-sync`
- `neon-step-sequencer-mix-change-before-after`
- `neon-step-sequencer-mobile-trainer-layout`
- `neon-step-sequencer-full-mix-health-matrix`
- `neon-step-sequencer-explore-songs-and-mixes`
- `neon-step-sequencer-deep-explore-songs-and-mixes`
- `neon-step-sequencer-ratchet-loop-mix-level-search`
- `neon-step-sequencer-ratchet-loop-approved-candidate`
- `neon-step-sequencer-durable-current-target`

## Audio and Neon ratchet packs

The `audio-mix` directory contains reusable audio-proof authoring guidance, a profile template, a metrics schema, a ratchet method, and a human-review rubric.

The `neon-step-sequencer` directory contains the first app-specific ratchet lab under the new architecture. Its profiles declare `current_target` or `interaction_snapshots` evidence-role patterns and explicitly state what they do not prove. The ratchet-loop profiles now expect a compact `humanReviewPacket` for listening handoff: supported/rejected candidates, objective guardrails, state restoration, review-order ranking, taste caveats, and, when explicitly requested, an applied-candidate receipt. The case-study files record the claim, evidence, failure classification, smallest layer changed, and next sharper question for each run.

### Two-speed local ratchet

Neon uses two exploration speeds:

- `neon-step-sequencer-explore-songs-and-mixes` is the fast bounded current-target sweep for normal iteration.
- `neon-step-sequencer-deep-explore-songs-and-mixes` is the slower pre-deploy sweep for batching deterministic app/audio guardrail failures before release.

The deep profile still proves only objective receipts: catalog coverage within bounds, active-lane/proof-window agreement, clipping/headroom, browser health, and state restoration. It does not prove subjective mix taste or that a candidate sounds better.

### Human-review packet handoff

Human-review packets are proof artifacts for subjective follow-up. They are deliberately not taste scores. A packet should say what objective receipts passed, what was preserved, which candidate is ready for listening review, and which caveats remain.

From the CLI:

```sh
riddle-proof-review-packet \
  --proof artifacts/riddle-proof/proof.json \
  --output artifacts/riddle-proof
```

This writes `human-review-packet.json` and `human-review-packet.md` next to the proof run. Use `--stdout` when an agent should read the Markdown handoff immediately.

```ts
import {
  createHumanReviewPacketArtifacts,
  findHumanReviewPacket,
  formatHumanReviewPacketMarkdown,
} from "@riddledc/riddle-proof-packs";

const proof = JSON.parse(await fs.promises.readFile("proof.json", "utf8"));
const packet = findHumanReviewPacket(proof);
if (!packet) throw new Error("proof did not emit a human review packet");

const markdown = formatHumanReviewPacketMarkdown(packet, {
  title: "Neon Human Review Packet",
});
const artifacts = createHumanReviewPacketArtifacts(proof, {
  title: "Neon Human Review Packet",
});

console.log(markdown);
await fs.promises.writeFile("human-review-packet.json", artifacts.json);
await fs.promises.writeFile("human-review-packet.md", artifacts.markdown);
```

### Approved-candidate profile handoff

Once a bounded ratchet loop has already produced a human-review packet, follow-on proof does not need to rerun the whole candidate search just to apply the selected candidate. Build a one-candidate approved profile from the packet recommendation instead:

```ts
import {
  buildNeonApprovedCandidateProfileFromReviewPacket,
  createHumanReviewPacketArtifacts,
} from "@riddledc/riddle-proof-packs";

const proof = JSON.parse(await fs.promises.readFile("proof.json", "utf8"));
const { packet } = createHumanReviewPacketArtifacts(proof, {
  title: "Neon Human Review Packet",
});

const approvedProfile = buildNeonApprovedCandidateProfileFromReviewPacket(packet, {
  url: "http://127.0.0.1:5173",
});

await fs.promises.writeFile("approved-candidate-profile.json", `${JSON.stringify(approvedProfile, null, 2)}\n`);
```

This still proves the applied candidate and preserves the listening-review caveat. It only narrows the candidate generator to the packet recommendation so local ratchet batches do not pay for a duplicate broad search.

When an agent is allowed to stand in for a human during development, make that
surrogate approval explicit and evidence-backed:

```ts
import {
  buildNeonApprovedCandidateProfileFromReviewPacket,
  createMixingCanonSurrogateReview,
} from "@riddledc/riddle-proof-packs";

const surrogate = createMixingCanonSurrogateReview(packet, {
  approvedBy: "codex",
});
if (!surrogate.ok) {
  throw new Error(`needs human review: ${surrogate.failedChecks.join(", ")}`);
}

const approvedProfile = buildNeonApprovedCandidateProfileFromReviewPacket(packet, {
  approval: surrogate.approval,
});
```

This approval mode is intentionally narrow: subtle level edits only, objective
receipts first, no clipping/headroom/low-level violations, state restored, and
ranking used only for review order. It keeps local development moving without
turning metrics into a claim that the mix is better.

### Durable candidate patch handoff

A human-review packet is still not a source edit. Durable patch handoff is the next gate after explicit approval:

1. A bounded proof loop produces a supported candidate.
2. A human or visible surrogate approval mode sets `applyBest`.
3. The packet reports `candidate_applied_for_listening_review`.
4. A durable candidate plan validates that the packet is no longer transient.
5. The app/repo applies a scoped config/source patch.
6. A final `current_target` proof verifies the running app sees the durable state.

The durable plan refuses packets that still say `candidate_ready_for_listening_review`, packets without approval metadata, packets whose `candidateActionsAreTransient` flag is still `true`, and packets that lost the listening-review caveat.

From the CLI:

```sh
riddle-proof-durable-candidate-plan \
  --proof artifacts/riddle-proof/neon-approved-candidate/proof.json \
  --output artifacts/riddle-proof/neon-approved-candidate \
  --source-file src/Games/songs/neon-approved-mix-overrides.json \
  --require-mix-profile
```

This writes `durable-candidate-patch-plan.json` and `durable-candidate-patch-plan.md`. If the packet is not ready for durable application, the plan is still written with `status: "not_ready_for_durable_patch"` and the CLI exits nonzero.

```ts
import {
  createDurableCandidatePatchPlanArtifacts,
} from "@riddledc/riddle-proof-packs";

const proof = JSON.parse(await fs.promises.readFile("proof.json", "utf8"));
const artifacts = createDurableCandidatePatchPlanArtifacts(proof, {
  title: "Neon Durable Candidate Patch Plan",
  sourceFile: "src/Games/songs/neon-approved-mix-overrides.json",
  requireMixProfileId: true,
});

if (!artifacts.plan.ok) {
  throw new Error(`not ready for durable patch: ${artifacts.plan.errors.join(", ")}`);
}

await fs.promises.writeFile("durable-candidate-patch-plan.json", artifacts.json);
await fs.promises.writeFile("durable-candidate-patch-plan.md", artifacts.markdown);
```

### Durable current-target proof

After a durable source/config patch lands, run a separate `current_target` proof. This is not another taste claim. It proves that the deployed or preview app sees the approved durable state through three objective surfaces:

- app contract mixer levels
- app contract mix-profile source levels
- visible mixer text plus basic offline render guardrails

The reusable helper builds the profile from an active durable override:

```ts
import {
  buildNeonDurableCurrentTargetProfile,
  createNeonDurableCurrentTargetArtifacts,
  readActiveNeonDurableMixOverrides,
} from "@riddledc/riddle-proof-packs";

const document = JSON.parse(await fs.promises.readFile("src/Games/songs/neon-approved-mix-overrides.json", "utf8"));
const [override] = readActiveNeonDurableMixOverrides(document);
const profile = buildNeonDurableCurrentTargetProfile(override, {
  url: "https://lilarcade.com",
});

await fs.promises.writeFile("generated-profile.json", `${JSON.stringify(profile, null, 2)}\n`);

// After running the profile with a local or hosted runner:
const profileResult = JSON.parse(await fs.promises.readFile("profile-result.json", "utf8"));
const artifacts = createNeonDurableCurrentTargetArtifacts({ override, profileResult });
await fs.promises.writeFile("durable-current-target-summary.json", artifacts.json);
await fs.promises.writeFile("durable-current-target-summary.md", artifacts.markdown);
```

This proof can catch contract/source disagreements, stale durable overrides, visible-control drift, clipping, and silence/low-level windows. It does not prove subjective mix quality.

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
