---
"@riddledc/riddle-proof": patch
"@riddledc/openclaw-riddle-proof": patch
---

Add main-agent proof review support for OpenClaw Riddle Proof runs.

The reusable harness can now resume from explicit workflow params, and the
OpenClaw wrapper can pause final proof judgment at a structured
`main_agent_proof_review_required` checkpoint. A new `riddle_proof_review` tool
submits the main agent's verdict and resumes the same run.
