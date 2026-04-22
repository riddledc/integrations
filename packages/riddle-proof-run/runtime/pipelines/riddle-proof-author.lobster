name: riddle-proof-author
# Riddle Proof — Author
# Consumes recon observation state and turns it into a reusable proof packet.
# Produces proof_plan, capture_script, and any refined capture inputs.
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
      if s.get('recon_status') not in ('ready_for_proof_plan', 'completed'):
          raise SystemExit('Recon has not produced a usable observation packet yet. Run recon first.')
      print('AUTHOR')
      print('Proof goal: ' + s.get('change_request', ''))
      print('Recon summary: ' + (s.get('recon_summary') or '(not run)'))
      print('Current proof plan status: ' + (s.get('proof_plan_status') or '(unknown)'))
      PYEOF

  - id: run_author
    command: |
      RP="${RIDDLE_PROOF_DIR:-/root/.openclaw/extensions/riddle-proof-run/runtime}"
      python3 "${RP}/lib/author.py"
