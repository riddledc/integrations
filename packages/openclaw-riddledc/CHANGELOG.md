# @riddledc/openclaw-riddledc

<<<<<<< HEAD
## 0.8.0

### Minor Changes

- 023d538: Add navigation_timeout parameter to server_preview and build_preview tools (5-120s, default 30s). Controls Playwright page.goto() timeout independently from readiness_timeout.
- d3ea5d6: Add persistent browser session tools (riddle_session_create, riddle_session_list, riddle_session_run, riddle_session_destroy) for multi-step auth flows and authenticated agent workflows.

=======
>>>>>>> 023d538 (Add navigation_timeout parameter to preview tools)
## 0.5.6

### Patch Changes

- 4000fad: Add async job submission and polling. Set `async: true` on `riddle_run`, `riddle_script`, or `riddle_steps` to get the `job_id` back immediately without waiting for completion. Use the new `riddle_poll` tool to check job status and fetch results when ready.

## 0.5.3

### Patch Changes

- Add riddle_visual_diff tool for pixel-level page comparison

## 0.5.2

### Patch Changes

- Fix data extraction artifacts not appearing in sync responses. Add data/urls/dataset/sitemap to default includes for riddle_steps and riddle_script.

## 0.5.0

### Minor Changes

- Add riddle_scrape, riddle_map, riddle_crawl convenience tools for data extraction. Update riddle_steps and riddle_script descriptions with new sandbox helpers (scrape, map, crawl) and include types (data, urls, dataset, sitemap).

## 0.4.0

### Minor Changes

- 0739661: Add first-class auth parameters (cookies, localStorage, headers) to all Riddle tools for better discoverability and type hints.

## 0.2.0

### Minor Changes

- a251d72: Initial public release.
