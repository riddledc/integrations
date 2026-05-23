# playwright-basic runner example

This is an example Riddle runner bundle that performs a single Playwright-based
task:

- `type: "playwright_basic"`
- `action: "screenshot"` takes a screenshot of a URL and writes it into `screenshots/`.

## Task contract

```json
{
  "job_id": "job_abc123",
  "job_v2": {
    "task": {
      "type": "playwright_basic",
      "action": "screenshot",
      "io": {
        "url": "https://example.com"
      },
      "options": {
        "viewport": { "width": 1280, "height": 720 },
        "timeout_ms": 120000,
        "screenshot_name": "homepage.png",
        "output_dir": "screenshots"
      }
    }
  }
}
```

## Output

The runner writes:

- `result.json` in `LOCAL_ARTIFACT_DIR` (or the job directory).
- `screenshots/<screenshot_name>` as a PNG artifact when the action succeeds.

## Run manually

```bash
node bin/index.mjs --job /path/to/job.json
```
