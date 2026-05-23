# web-to-dataset runner example

This is an example Riddle runner bundle that converts web pages into structured outputs.

It implements the `web_to_dataset` task type and supports:

- `crawl`
- `scrape`
- `map`

## Task contract

```json
{
  "job_id": "job_abc123",
  "job_v2": {
    "task": {
      "type": "web_to_dataset",
      "action": "scrape",
      "io": {
        "url": "https://example.com"
      },
      "options": {
        "max_pages": 10,
        "timeout_ms": 600000
      }
    }
  }
}
```

## Output

The runner writes `result.json` in `LOCAL_ARTIFACT_DIR` (or the job directory) with
`success`, `data`, and `error` fields.

## Run manually

```bash
node bin/index.mjs --job /path/to/job.json
```
