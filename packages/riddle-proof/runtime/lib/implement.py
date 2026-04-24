"""Implement: confirm that code work now exists between recon and verify.

This stage does not make code changes itself. It records that implementation
has happened on the after worktree so verify does not run against an untouched
branch.
"""

import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import load_state, save_state, git, shell_quote


def unique_nonempty(items):
    seen = set()
    values = []
    for item in items:
        text = str(item or '').strip()
        if not text or text in seen:
            continue
        seen.add(text)
        values.append(text)
    return values


def parse_status_paths(lines):
    paths = []
    for line in lines:
        text = str(line or '').rstrip()
        if not text:
            continue
        path = text[3:] if len(text) > 3 else text
        if ' -> ' in path:
            path = path.split(' -> ', 1)[1]
        path = path.strip()
        if path:
            paths.append(path)
    return unique_nonempty(paths)


s = load_state()
after_dir = (s.get('after_worktree') or '').strip()
if not after_dir or not os.path.exists(after_dir):
    raise SystemExit('after_worktree not found. Run setup first.')

base_branch = s.get('base_branch', 'main')
base_ref = (s.get('before_ref') or '').strip() or ('origin/' + base_branch)
dirty = [ln for ln in git('git status --short', after_dir).stdout.splitlines() if ln.strip()]
dirty_paths = parse_status_paths(dirty)

diff_probes = []


def run_diff_probe(label, command):
    result = git(command, after_dir)
    paths = unique_nonempty(result.stdout.splitlines())
    diff_probes.append({
        'label': label,
        'command': command,
        'returncode': result.returncode,
        'paths': paths[:20],
        'path_count': len(paths),
    })
    return result, paths

diff_cmd = 'git diff --name-only ' + shell_quote(base_ref) + '...HEAD'
diff_result, committed = run_diff_probe('requested_base', diff_cmd)
if diff_result.returncode != 0:
    fallback_base = base_branch
    fallback_result, committed = run_diff_probe('branch_base', 'git diff --name-only ' + shell_quote(fallback_base) + '...HEAD')
if diff_result.returncode != 0 and not committed:
    fallback, committed = run_diff_probe('head_parent', 'git diff --name-only HEAD~1 HEAD')

changed = unique_nonempty(dirty_paths + committed)
authored = bool((s.get('capture_script') or '').strip()) and bool((s.get('proof_plan') or '').strip())

detection = {
    'outcome': 'changes_detected' if changed else 'no_changes_detected',
    'diff_detected': bool(changed),
    'worktree_path': after_dir,
    'base_branch': base_branch,
    'base_ref_requested': base_ref,
    'dirty_status_lines': dirty[:20],
    'dirty_paths': dirty_paths[:20],
    'dirty_path_count': len(dirty_paths),
    'committed_paths': committed[:20],
    'committed_path_count': len(committed),
    'changed_paths': changed[:20],
    'changed_path_count': len(changed),
    'diff_probes': diff_probes[:6],
    'authored_inputs_ready': authored,
}

if changed:
    detection_summary = (
        'Implementation detection found material changes '
        f'(dirty={len(dirty_paths)}, committed={len(committed)}, changed={len(changed)}).'
    )
else:
    probe_labels = ', '.join([probe.get('label', '') for probe in diff_probes if probe.get('label')]) or 'no probes'
    detection_summary = (
        'Implementation detection found no material code changes '
        f'(dirty={len(dirty_paths)}, committed={len(committed)}, changed=0; probes={probe_labels}).'
    )

s['implementation_detection'] = detection
s['implementation_detection_summary'] = detection_summary

if not changed:
    s['implementation_status'] = 'changes_missing'
    s['implementation_summary'] = 'No implementation detected on the after worktree.'
    s['changed_files'] = []
    s['stage'] = 'implement'
    save_state(s)
    raise SystemExit('No implementation detected on the after worktree. Make the code changes, then rerun riddle-proof-implement.')

summary = 'Implementation detected in ' + str(len(changed)) + ' file(s): ' + ', '.join(changed[:8])
if len(changed) > 8:
    summary += ', ...'

s['implementation_status'] = 'changes_detected'
s['implementation_summary'] = summary
s['changed_files'] = changed[:20]
s['stage'] = 'implement'
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
