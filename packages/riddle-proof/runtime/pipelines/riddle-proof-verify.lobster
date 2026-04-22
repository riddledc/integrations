name: riddle-proof-verify
# Riddle Proof — Verify
# Reuses recon-established baselines and captures the after-proof.
# Run after recon and after code changes are on the branch.
# Re-run as many times as needed until the proof is strong.
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
      if s.get('implementation_status') not in ('changes_detected', 'completed'):
          raise SystemExit('Implementation not recorded. Run riddle-proof-implement after making code changes.')
      print('VERIFY — ' + s.get('mode', 'server').upper())
      print('Proof goal: ' + s.get('change_request', ''))
      print('Success criteria: ' + (s.get('success_criteria') or '(none provided)'))
      print('Verification mode: ' + s.get('verification_mode', 'proof'))
      print('Reference: ' + (s.get('requested_reference') or s.get('reference', 'both')))
      print('Proof plan status: ' + s.get('proof_plan_status', 'unknown'))
      print('Before baseline: ' + s.get('before_cdn', '(missing)'))
      if s.get('prod_cdn'):
          print('Prod baseline: ' + s.get('prod_cdn'))
      after_dir = s.get('after_worktree', '')
      print('After worktree: ' + after_dir + (' (exists)' if os.path.exists(after_dir) else ' (MISSING)'))
      PYEOF

  - id: run_verify
    command: |
      RP="${RIDDLE_PROOF_DIR:-/root/.openclaw/extensions/openclaw-riddle-proof/node_modules/@riddledc/riddle-proof/runtime}"
      python3 "${RP}/lib/verify.py"

  - id: present_evidence
    command: |
      python3 << 'PYEOF'
      import json, os
      state_file = os.environ.get('RIDDLE_PROOF_STATE_FILE', '/tmp/riddle-proof-state.json')
      s = json.load(open(state_file))
      print('='*50)
      print('RIDDLE PROOF — EVIDENCE')
      print('='*50)
      print('PROOF GOAL: ' + s.get('change_request', ''))
      print('SUCCESS CRITERIA: ' + (s.get('success_criteria') or '(none provided)'))
      print('MODE: ' + s.get('verification_mode', 'proof'))
      print()
      print('BEFORE (RECON): ' + s.get('before_cdn', '(none)'))
      if s.get('prod_cdn'):
          print('PROD (RECON):   ' + s.get('prod_cdn'))
      print('AFTER:          ' + s.get('after_cdn', '(none)'))
      print()
      print('PROOF SUMMARY:')
      print(s.get('proof_summary', '(not generated)'))
      print()
      print('VERIFY STATUS: ' + s.get('verify_status', 'unknown'))
      print('ASSERTION STATUS: ' + s.get('assertion_status', 'unknown'))
      mr = s.get('merge_recommendation', '')
      if mr:
          print('MERGE RECOMMENDATION: ' + mr)
      pa = s.get('proof_assessment') or {}
      if pa.get('decision'):
          print('PROOF ASSESSMENT: ' + pa.get('decision'))
      next_stage = (s.get('verify_decision_request') or {}).get('continue_with_stage') or (s.get('verify_decision_request') or {}).get('recommended_stage')
      if next_stage:
          print('NEXT INTERNAL STAGE: ' + str(next_stage))
      print()
      print('Review the full proof bundle.')
      print('  - Use continue_from_checkpoint when the internal next stage looks right.')
      print('  - Only escalate to the human if the workflow is not converging.')
      PYEOF
