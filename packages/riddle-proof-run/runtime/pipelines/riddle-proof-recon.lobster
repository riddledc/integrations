name: riddle-proof-recon
# Riddle Proof — Recon
# Recon now owns baseline discovery.
# Flow: hypothesize -> capture -> observe -> checkpoint for supervising-agent judgment -> bounded retry.
# Run after setup, before implementation and verify.
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
      ref = s.get('requested_reference') or s.get('reference', 'both')
      print('RECON — ' + s.get('mode', 'server').upper() + ' / reference=' + ref)
      print('Proof goal: ' + s.get('change_request', ''))
      print('Success criteria: ' + (s.get('success_criteria') or '(none provided)'))
      print('Verification mode: ' + s.get('verification_mode', 'proof'))
      print('Proof plan status: ' + s.get('proof_plan_status', 'pending_recon'))
      print('Server path hint: ' + (s.get('server_path') or '(derive during recon)'))
      if ref in ('before', 'both'):
          wt = s.get('before_worktree', '')
          print('Before worktree: ' + wt + (' (exists)' if os.path.exists(wt) else ' (MISSING)'))
      print('After worktree: ' + s.get('after_worktree', ''))
      PYEOF

  - id: run_recon
    command: |
      RP="${RIDDLE_PROOF_DIR:-/root/.openclaw/extensions/riddle-proof-run/runtime}"
      python3 "${RP}/lib/recon.py"

  - id: summarize_recon
    command: |
      python3 << 'PYEOF'
      import json, os
      state_file = os.environ.get('RIDDLE_PROOF_STATE_FILE', '/tmp/riddle-proof-state.json')
      s = json.load(open(state_file))
      r = s.get('recon_results', {})
      baselines = r.get('baselines', {})
      hypothesis = r.get('hypothesis', {})
      print('='*50)
      print('RECON REVIEW')
      print('='*50)
      print('Summary: ' + (s.get('recon_summary') or '(none)'))
      print('Recon status: ' + (s.get('recon_status') or '(unknown)'))
      print('Hypothesis path: ' + (hypothesis.get('target_path') or '(none)'))
      print('Hypothesis source: ' + (hypothesis.get('path_source') or '(none)'))
      for line in r.get('route_hints', [])[:8]:
          print('Route hint: ' + line)
      for line in r.get('keyword_hits', [])[:10]:
          print('Keyword hit: ' + line)
      if baselines.get('before'):
          print('Before baseline: ' + baselines['before'].get('url', '(none)'))
      if baselines.get('prod'):
          print('Prod baseline: ' + baselines['prod'].get('url', '(none)'))
      latest = (r.get('attempt_history') or [])[-1:] 
      if latest:
          print('Latest attempt result: ' + latest[0].get('result', '(unknown)'))
      if s.get('recon_assessment_request') or s.get('recon_decision_request'):
          req = s.get('recon_assessment_request') or s.get('recon_decision_request', {})
          print('Recon attempts remaining: ' + str(req.get('attempts_remaining', '(unknown)')))

      print()
      print('PROOF GOAL: ' + s.get('change_request', ''))
      print('SUCCESS CRITERIA: ' + (s.get('success_criteria') or '(none provided)'))
      print()
      print('REVIEW CHECKLIST:')
      print('  1. Did recon capture the correct before / prod baseline context?')
      print('  2. If recon is blocked, what next path or wait selector should the supervising agent try next?')
      print('  3. Once recon is ready, what exact interaction or state should verify reproduce on the after build?')
      print('  4. What final capture_script should verify run on the recon-established path?')
      print('  5. What code work needs to happen before verify?')
      print()
      print('Recon should finish with observed baselines and a concrete proof-plan request.')
      PYEOF
