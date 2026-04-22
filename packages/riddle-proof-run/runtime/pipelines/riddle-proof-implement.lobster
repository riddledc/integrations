name: riddle-proof-implement
# Riddle Proof — Implement
# Confirms that real code work exists after recon and before verify.
# Run after making the code changes on the after worktree.
# Requires RIDDLE_PROOF_DIR env var set to the runtime directory.

steps:

  - id: check_state
    command: |
      python3 << 'PYEOF'
      import json, os
      state_file = os.environ.get('RIDDLE_PROOF_STATE_FILE', '/tmp/riddle-proof-state.json')
      s = json.load(open(state_file))
      if not s.get('workspace_ready'):
          raise SystemExit('Workspace not ready. Run riddle-proof-setup first.')
      print('IMPLEMENT')
      print('Proof goal: ' + s.get('change_request', ''))
      print('After worktree: ' + s.get('after_worktree', '') + (' (exists)' if os.path.exists(s.get('after_worktree', '')) else ' (MISSING)'))
      print('Recon summary: ' + (s.get('recon_summary') or '(not run)'))
      PYEOF

  - id: run_implement
    command: |
      RP="${RIDDLE_PROOF_DIR:-/root/.openclaw/extensions/riddle-proof-run/runtime}"
      python3 "${RP}/lib/implement.py"
