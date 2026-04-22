name: riddle-proof-ship
# Riddle Proof — Ship
# Commits, creates PR, posts proof artifacts, waits for CI, marks ready.
# Cleans up worktrees and preview sites.
# Requires RIDDLE_PROOF_DIR env var set to the runtime directory.

steps:

  - id: check_state
    command: |
      python3 << 'PYEOF'
      import json, os
      state_file = os.environ.get('RIDDLE_PROOF_STATE_FILE', '/tmp/riddle-proof-state.json')
      s = json.load(open(state_file))
      if not s.get('after_cdn'):
          raise SystemExit('No after evidence. Run verify first.')
      print('SHIP')
      print('  Proof goal: ' + s.get('change_request', ''))
      print('  Commit: ' + s.get('commit_message', ''))
      print('  Before: ' + s.get('before_cdn', '(none)'))
      print('  After:  ' + s.get('after_cdn', ''))
      print('  Assertion status: ' + s.get('assertion_status', 'unknown'))
      mr = s.get('merge_recommendation', '')
      if mr:
          print('  Merge recommendation: ' + mr)
      pr = s.get('pr_url', '')
      if pr:
          print('  PR: ' + pr + ' (will update)')
      else:
          print('  PR: will create draft')
      PYEOF

  - id: ship
    command: |
      RP="${RIDDLE_PROOF_DIR:-/root/.openclaw/extensions/riddle-proof-run/runtime}"
      python3 "${RP}/lib/ship.py"
