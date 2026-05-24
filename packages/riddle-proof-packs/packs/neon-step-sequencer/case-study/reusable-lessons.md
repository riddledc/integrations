# Reusable Lessons

## Atomic proof first

Start with the smallest claim that can produce useful evidence. For Neon, that is not "the mix sounds good"; it is route, contract, source readiness, render metrics, no silence, and no clipping.

## Failure is product input

A failing run should become a clearer classification, not a vague "Riddle caught a bug" headline. Use `product_regression`, `proof_insufficient`, `profile_calibration`, `app_contract_gap`, `runtime_environment_blocked`, and `needs_human_review`.

## App contracts beat scraping

Complex audio state is easier to prove when the app exposes a small redacted proof contract. Scraping visible controls is still useful, but rendered metric agreement needs intentional app state.

## Keep metrics compact

Large metrics belong in artifacts. The summary should answer:

- did the render complete?
- did the mix clip?
- was it silent?
- did the intended metric move?
- what should a human review next?

## Handoff packets beat raw JSON spelunking

The full proof result should remain auditable, but one-off and background loops need a compact handoff object. A good `humanReviewPacket` lists supported and rejected candidates, objective guardrails, restoration status, review-order ranking, and caveats that separate proof from taste.

## Core changes are last

Most ratchet steps should change profile JSON, pack docs, app proof contracts, or app fixtures. Riddle Proof core changes are justified only when the missing primitive applies beyond Neon.

## Loops are generic

A ratchet loop should be domain-neutral: propose a claim candidate, apply its action, collect evidence, classify receipt-level support, restore or keep state, and repeat within a budget. Neon `mix-level-search` is a strategy plugged into that loop, not the loop's identity.

## Use two speeds before deploy

Keep the default proof loop small enough to run often, then use a deeper local sweep when a round is otherwise clean. The fast profile protects iteration speed; the deep profile batches deterministic findings such as proof-window overclaims, missing active lanes, clipping/headroom failures, source readiness gaps, stale state, and restoration failures before deployment.
