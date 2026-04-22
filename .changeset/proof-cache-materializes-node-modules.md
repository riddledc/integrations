---
"@riddledc/riddle-proof": patch
"@riddledc/openclaw-riddle-proof": patch
---

Materialize cached Riddle Proof node_modules with hardlinks or copies instead of symlinks so server-preview tarballs cannot be rejected for symlinked dependency directories.
