"""Implement: confirm that code work now exists between recon and verify.

This stage does not make code changes itself. It records that implementation
has happened on the after worktree so verify does not run against an untouched
branch.
"""

import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import load_state, save_state, git, shell_quote

s = load_state()
after_dir = (s.get('after_worktree') or '').strip()
if not after_dir or not os.path.exists(after_dir):
    raise SystemExit('after_worktree not found. Run setup first.')

base_branch = s.get('base_branch', 'main')
base_ref = (s.get('before_ref') or '').strip() or ('origin/' + base_branch)
dirty = [ln for ln in git('git status --short', after_dir).stdout.splitlines() if ln.strip()]

diff_cmd = 'git diff --name-only ' + shell_quote(base_ref) + '...HEAD'
diff_result = git(diff_cmd, after_dir)
committed = [ln for ln in diff_result.stdout.splitlines() if ln.strip()]
if diff_result.returncode != 0:
    fallback_base = base_branch
    fallback_result = git('git diff --name-only ' + shell_quote(fallback_base) + '...HEAD', after_dir)
    committed = [ln for ln in fallback_result.stdout.splitlines() if ln.strip()]
if diff_result.returncode != 0 and not committed:
    fallback = git('git diff --name-only HEAD~1 HEAD', after_dir)
    committed = [ln for ln in fallback.stdout.splitlines() if ln.strip()]

changed = []
for line in dirty + committed:
    item = line.strip()
    if item and item not in changed:
        changed.append(item)

if not changed:
    raise SystemExit('No implementation detected on the after worktree. Make the code changes, then rerun riddle-proof-implement.')

summary = 'Implementation detected in ' + str(len(changed)) + ' file(s): ' + ', '.join(changed[:8])
if len(changed) > 8:
    summary += ', ...'

s['implementation_status'] = 'changes_detected'
s['implementation_summary'] = summary
s['changed_files'] = changed[:20]
s['stage'] = 'implement'
authored = bool((s.get('capture_script') or '').strip()) and bool((s.get('proof_plan') or '').strip())
if authored:
    s['author_status'] = 'ready'
    s['proof_plan_status'] = 'ready'
else:
    s['author_status'] = s.get('author_status') or 'needs_authoring'
    s['proof_plan_status'] = s.get('proof_plan_status') or 'needs_authoring'
save_state(s)

print('IMPLEMENT')
print('=' * 50)
print(summary)
if s.get('implementation_notes'):
    print('Implementation notes: ' + s['implementation_notes'])
print(json.dumps({'ok': True, 'changed_files': changed[:20]}))
