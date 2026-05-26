# Human Review Rubric

Use this rubric when objective metrics pass but the claim still depends on listening judgment.

## Review packet

Include:

- target URL and route
- selected song or fixture
- mix profile
- proof summary
- screenshots
- compact objective metrics
- section energy, tracked-instrument movement, and loudness consequence rows
- full metrics artifact
- caveats about the render window

## Listener prompts

- Is the intended musical focus audible?
- Does the mix avoid obvious distortion?
- Did the candidate make the section much louder or quieter than requested?
- Are important midrange elements still present on the small-speaker monitor?
- Did the proof window contain the instrument being judged?
- Would a different song section change the verdict?

## Loudness review signals

Loudness metrics are objective review signals. They can show that a candidate made a section much louder or quieter than expected, but they do not prove subjective mix quality.

Use loudness consequence rows to decide what needs listening review first:

- `within_expected_range`: the loudness movement matched the declared intent range.
- `loudness_shift_requires_review`: the candidate may still be valid, but its whole-section loudness movement was larger than expected for the request.
- `existing_guardrail_violation`: an existing hard guardrail such as clipping, headroom, low-level, or required section energy already failed.

## Verdicts

- `accepted`: objective evidence and listening review support the claim.
- `needs_profile_calibration`: the proof window or threshold was wrong.
- `needs_product_change`: the app behavior or mix profile should change.
- `needs_followup`: evidence is useful but the claim was too broad.
