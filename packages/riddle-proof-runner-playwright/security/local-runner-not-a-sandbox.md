# Local Playwright Runner Security Note

`@riddledc/riddle-proof-runner-playwright` executes profile scripts inside your
process using controlled globals. It is **not a security sandbox** by itself.

Use it for:

- CI and local debugging where scripts are trusted.
- Offline/offline proof generation in controlled environments.

Do not use it to execute untrusted profile inputs.
