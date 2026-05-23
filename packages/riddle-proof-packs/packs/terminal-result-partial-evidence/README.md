# terminal-result-partial-evidence

Terminal Result Partial Evidence proof pack profile. Include this profile JSON directly in any profile-mode execution path.

## Proof claims and evidence roles

- evidence_role: `interaction_snapshots`
- atomic claim
  - claim: partial terminal evidence path is honest when a run finishes in an error/timeout state.
  - target: `/playground` console workflow.
  - setup/actions: submit a terminal payload that returns partial evidence and capture pre-action and post-action result evidence.
  - evidence: screenshot/log/ HAR indicators, status text polarity, and explicit no-failure copy checks.
  - verdict: pass when terminal result markers align with the returned contract and all artifact classes are present.
- does not prove
  - successful terminal execution path.
  - correctness of backend command execution semantics.
  - long-running timeout recovery workflows.

## Usage

Load the profile JSON from `profile.json` and supply it to profile mode or a local runner input file.
