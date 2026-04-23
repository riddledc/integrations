"""Setup: create worktrees, install deps, validate args, write state.

Idempotent — safe to re-run. Creates per-run worktrees under the active
local temp storage by default:
  /tmp/.riddle-proof-worktrees/riddle-proof-<run_id>-before
  /tmp/.riddle-proof-worktrees/riddle-proof-<run_id>-after
"""

import json, subprocess as sp, os, sys, shutil, time, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import load_state, save_state, git, shell_quote

s = load_state()
repo = s['repo']
branch = (s.get('target_branch') or s['branch']).strip()
repo_dir = s['repo_dir']
base_branch = s.get('base_branch', 'main')
before_ref_arg = (s.get('before_ref') or s.get('base_ref') or '').strip()
mode = s.get('mode', 'server')
reference = s.get('reference', 'both')  # prod, before, both
run_id = (s.get('run_id') or '').strip()
SAFE_RUN_ID = ''.join(ch if ch.isalnum() or ch in ('-', '_') else '-' for ch in run_id) or 'run'

AFTER_WORKTREE_BRANCH = 'riddle-proof/' + SAFE_RUN_ID + '-after'
LEGACY_WORKTREE_DIRS = ('/tmp/riddle-proof-before', '/tmp/riddle-proof-after')

if branch.startswith('riddle-proof/'):
    raise SystemExit(
        'Setup invariant failed: target_branch uses reserved riddle-proof/* namespace. '
        'Run preflight again so it can choose a real agent/openclaw/* PR branch.'
    )


# In the packaged runtime, the shared workspace helper lives at package-root/lib
# while the stage scripts live under package-root/runtime.
SKILLS_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
WORKSPACE_CORE = os.path.join(SKILLS_ROOT, 'lib', 'workspace-core.mjs')


def dependency_timeout_seconds():
    raw = os.environ.get('RIDDLE_PROOF_INSTALL_TIMEOUT_MS', '').strip()
    try:
        millis = int(raw)
    except Exception:
        millis = 600000
    return max(660, int((millis + 999) / 1000) + 30)


def workspace_core(command, payload, timeout=180):
    if not os.path.exists(WORKSPACE_CORE):
        raise SystemExit('workspace core helper missing: ' + WORKSPACE_CORE)
    try:
        result = sp.run(
            ['node', WORKSPACE_CORE, command, json.dumps(payload)],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except sp.TimeoutExpired:
        raise SystemExit('workspace core timed out for ' + command)

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or '').strip()
        raise SystemExit('workspace core failed for ' + command + ': ' + detail[:300])

    try:
        return json.loads(result.stdout)
    except Exception:
        raise SystemExit('workspace core returned invalid JSON for ' + command + ': ' + result.stdout[:300])


def ensure_deps(project_dir, reuse_from=''):
    payload = {'projectDir': project_dir}
    if reuse_from:
        payload['reuseFrom'] = reuse_from
    result = workspace_core('ensure-deps', payload, timeout=dependency_timeout_seconds())
    return result.get('status', '')


def dependency_fingerprint(project_dir):
    if not project_dir:
        return ''
    result = workspace_core('dependency-fingerprint', {'projectDir': project_dir}, timeout=30)
    return result.get('fingerprint', '') or ''


def record_setup_phase(phase, status='running', summary=''):
    global s
    ts = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    try:
        current = load_state()
    except Exception:
        current = dict(s)
    runtime_step = current.get('current_runtime_step') if isinstance(current.get('current_runtime_step'), dict) else {}
    if not runtime_step:
        runtime_step = {
            'step': 'setup',
            'action': 'run',
            'status': 'running',
            'started_at': ts,
            'workflow_file': 'riddle-proof-setup.lobster',
        }
    runtime_step['phase'] = phase
    runtime_step['phase_status'] = status
    if status == 'running':
        runtime_step['phase_started_at'] = ts
        runtime_step.pop('phase_finished_at', None)
    else:
        runtime_step['phase_finished_at'] = ts
    if summary:
        runtime_step['summary'] = summary
    current['current_runtime_step'] = runtime_step
    events = current.get('runtime_events') if isinstance(current.get('runtime_events'), list) else []
    events.append({
        'ts': ts,
        'kind': 'workflow.phase.' + ('started' if status == 'running' else 'finished'),
        'step': 'setup',
        'phase': phase,
        'summary': summary or (phase + ' ' + status),
        'details': {'status': status},
    })
    current['runtime_events'] = events[-100:]
    current['runtime_updated_at'] = ts
    save_state(current)
    for key in ('current_runtime_step', 'runtime_events', 'runtime_updated_at'):
        if key in current:
            s[key] = current[key]


def ensure_deps_phase(phase, project_dir, reuse_from='', summary=''):
    record_setup_phase(phase, 'running', summary)
    try:
        status = ensure_deps(project_dir, reuse_from=reuse_from)
    except BaseException as exc:
        record_setup_phase(phase, 'failed', str(exc)[:300])
        raise
    record_setup_phase(phase, 'completed', status or 'no dependency install needed')
    return status


def dependencies_match(left_dir, right_dir):
    left = dependency_fingerprint(left_dir)
    right = dependency_fingerprint(right_dir)
    return bool(left and right and left == right)


def compatible_reuse_source(source_dir, target_dirs):
    if not source_dir:
        return ''
    source = dependency_fingerprint(source_dir)
    if not source:
        return ''
    for target_dir in target_dirs:
        if target_dir and dependency_fingerprint(target_dir) == source:
            return source_dir
    return ''


def resolve_worktree_root(repo_dir):
    configured = (s.get('worktree_root') or os.environ.get('RIDDLE_PROOF_WORKTREE_ROOT') or '').strip()
    if configured:
        return os.path.abspath(os.path.expanduser(configured))
    if os.environ.get('RIDDLE_PROOF_USE_WORKSPACE_WORKTREE_ROOT', '').strip().lower() in ('1', 'true', 'yes'):
        repo_parent = os.path.dirname(os.path.abspath(repo_dir))
        return os.path.join(repo_parent, '.riddle-proof-worktrees')

    # Proof worktrees are scratch data. Keep them on local temp storage by
    # default so dependency cache materialization does not crawl across EFS or
    # other shared workspace filesystems.
    return os.path.join(tempfile.gettempdir(), '.riddle-proof-worktrees')


def env_flag(name, default=False):
    raw = os.environ.get(name, '').strip().lower()
    if raw in ('1', 'true', 'yes', 'on'):
        return True
    if raw in ('0', 'false', 'no', 'off'):
        return False
    return default


def env_int(name, default):
    raw = os.environ.get(name, '').strip()
    try:
        value = int(raw)
    except Exception:
        return default
    return value if value > 0 else default


def disk_free_bytes(path):
    probe = path
    while probe and not os.path.exists(probe):
        parent = os.path.dirname(probe)
        if parent == probe:
            break
        probe = parent
    try:
        return shutil.disk_usage(probe or tempfile.gettempdir()).free
    except Exception:
        return 0


def prune_scratch_worktrees(worktree_root, keep_dirs, repo_dir):
    report = {
        'requested': True,
        'worktree_root': worktree_root,
        'removed': [],
        'errors': [],
    }
    if env_flag('RIDDLE_PROOF_KEEP_SCRATCH_WORKTREES', False):
        report['skipped'] = 'RIDDLE_PROOF_KEEP_SCRATCH_WORKTREES'
        return report
    if not worktree_root:
        report['skipped'] = 'missing_worktree_root'
        return report

    root = os.path.abspath(os.path.expanduser(worktree_root))
    temp_root = os.path.abspath(tempfile.gettempdir())
    if root in ('/', temp_root) or not root.endswith('.riddle-proof-worktrees'):
        report['skipped'] = 'unsafe_worktree_root'
        return report
    if not os.path.isdir(root):
        report['skipped'] = 'worktree_root_missing'
        return report

    min_free_bytes = env_int('RIDDLE_PROOF_MIN_SCRATCH_FREE_MB', 2048) * 1024 * 1024
    free_before = disk_free_bytes(root)
    report['free_before_bytes'] = free_before
    report['min_free_bytes'] = min_free_bytes
    if free_before >= min_free_bytes:
        report['skipped'] = 'enough_free_space'
        return report

    keep = set(os.path.abspath(os.path.expanduser(p)) for p in keep_dirs if p)
    candidates = []
    for name in os.listdir(root):
        if not name.startswith('riddle-proof-'):
            continue
        path = os.path.join(root, name)
        resolved = os.path.abspath(path)
        if resolved in keep or not os.path.isdir(path):
            continue
        try:
            mtime = os.path.getmtime(path)
        except Exception:
            mtime = 0
        candidates.append((mtime, path))
    candidates.sort()

    for _, path in candidates:
        if disk_free_bytes(root) >= min_free_bytes:
            break
        removed_by_git = False
        git_error = ''
        if repo_dir and os.path.exists(os.path.join(repo_dir, '.git')):
            remove_result = sp.run(
                'git worktree remove --force ' + shell_quote(path),
                shell=True,
                cwd=repo_dir,
                capture_output=True,
                text=True,
            )
            removed_by_git = remove_result.returncode == 0
            if remove_result.returncode != 0 and os.path.exists(path):
                git_error = (remove_result.stderr or remove_result.stdout or '')[:300]
        if os.path.exists(path):
            shutil.rmtree(path, ignore_errors=True)
        if not os.path.exists(path):
            report['removed'].append({'path': path, 'via': 'git' if removed_by_git else 'filesystem'})
        elif git_error:
            report['errors'].append({'path': path, 'git_error': git_error})

    if repo_dir and os.path.exists(os.path.join(repo_dir, '.git')):
        git('git worktree prune', repo_dir)
    report['free_after_bytes'] = disk_free_bytes(root)
    return report


def cleanup_legacy_branch_worktrees(repo_dir, branch_name):
    if not repo_dir or not os.path.exists(os.path.join(repo_dir, '.git')):
        return
    result = git('git worktree list --porcelain', repo_dir)
    if result.returncode != 0:
        return

    worktrees = []
    current = {}
    for line in result.stdout.splitlines() + ['']:
        if not line.strip():
            if current:
                worktrees.append(current)
                current = {}
            continue
        key, _, value = line.partition(' ')
        if key == 'worktree':
            current['path'] = value.strip()
        elif key == 'branch':
            current['branch'] = value.strip()

    locked_ref = 'refs/heads/' + branch_name
    for wt in worktrees:
        path = wt.get('path', '')
        if not (path.startswith('/tmp/riddle-proof-') and path.endswith('-before')):
            continue
        if wt.get('branch') != locked_ref:
            continue
        print('Removing stale legacy riddle-proof worktree locked to ' + branch_name + ': ' + path)
        sp.run(
            'git worktree remove --force ' + shell_quote(path),
            shell=True,
            cwd=repo_dir,
            capture_output=True,
        )
        if os.path.exists(path):
            shutil.rmtree(path, ignore_errors=True)
    git('git worktree prune', repo_dir)


def ref_exists(repo_dir, ref):
    if not ref:
        return False
    r = git('git rev-parse --verify --quiet ' + shell_quote(ref + '^{commit}'), repo_dir)
    return r.returncode == 0


def resolve_before_ref(repo_dir, base_branch, requested_ref):
    candidates = []
    if requested_ref:
        candidates.append((requested_ref, 'requested'))
    if base_branch:
        candidates.append(('origin/' + base_branch, 'remote_base_branch'))
        candidates.append((base_branch, 'local_base_branch_fallback'))

    for ref, source in candidates:
        if ref_exists(repo_dir, ref):
            return ref, source
    raise SystemExit(
        'Failed to resolve before ref. Tried: ' +
        ', '.join(ref for ref, _ in candidates if ref)
    )


def load_repo_profile(project_dir):
    profile_path = os.path.join(project_dir, '.riddle-proof', 'profile.json')
    if not os.path.exists(profile_path):
        return {}, ''
    try:
        with open(profile_path) as f:
            profile = json.load(f)
    except Exception as exc:
        print('Ignoring invalid Riddle Proof profile: ' + profile_path + ' (' + str(exc)[:180] + ')')
        return {}, profile_path
    if not isinstance(profile, dict):
        print('Ignoring non-object Riddle Proof profile: ' + profile_path)
        return {}, profile_path
    return profile, profile_path


def profile_matches_target(target, haystack):
    keywords = target.get('keywords') if isinstance(target, dict) else []
    if isinstance(keywords, str):
        keywords = [keywords]
    matched = []
    for keyword in keywords if isinstance(keywords, list) else []:
        needle = str(keyword).strip().lower()
        if needle and needle in haystack:
            matched.append(str(keyword).strip())
    name = str(target.get('name') or '').strip()
    if name and name.lower() in haystack and name not in matched:
        matched.append(name)
    return matched


def apply_repo_profile(project_dir):
    profile, profile_path = load_repo_profile(project_dir)
    if not profile:
        return

    haystack = ' '.join([
        str(s.get('change_request') or ''),
        str(s.get('context') or ''),
        str(s.get('server_path') or ''),
        str(s.get('capture_script') or ''),
    ]).lower()

    selected = {}
    matched_keywords = []
    targets = profile.get('targets')
    if isinstance(targets, list):
        for target in targets:
            if not isinstance(target, dict):
                continue
            matched = profile_matches_target(target, haystack)
            if matched:
                selected = target
                matched_keywords = matched
                break

    defaults = profile.get('defaults') if isinstance(profile.get('defaults'), dict) else {}
    merged = dict(defaults)
    if selected:
        merged.update(selected)
    if not merged:
        return

    applied = []
    simple_fields = [
        'mode',
        'build_command',
        'build_output',
        'server_image',
        'server_command',
        'server_port',
        'server_path',
        'wait_for_selector',
        'color_scheme',
        'allow_static_preview_fallback',
        'use_auth',
        'success_criteria',
        'capture_script',
    ]
    for field in simple_fields:
        value = merged.get(field)
        if value is None or str(value).strip() == '':
            continue
        if str(s.get(field) or '').strip():
            continue
        s[field] = str(value).strip()
        applied.append(field)
        if field == 'server_path':
            s['server_path_source'] = 'repo_profile'

    profile_context = str(merged.get('context') or merged.get('proof_context') or '').strip()
    if profile_context:
        existing = str(s.get('context') or '').strip()
        note = 'Riddle Proof repo profile'
        target_name = str(merged.get('name') or '').strip()
        if target_name:
            note += ' (' + target_name + ')'
        note += ': ' + profile_context
        s['context'] = (existing + '\n\n' + note).strip() if existing else note
        applied.append('context')

    if applied:
        s['proof_profile'] = {
            'path': profile_path,
            'name': str(merged.get('name') or '').strip(),
            'matched_keywords': matched_keywords,
            'applied_fields': sorted(set(applied)),
        }
        print('Applied Riddle Proof repo profile: ' + ', '.join(s['proof_profile']['applied_fields']))

# Ensure the repo is cloned and up to date via the shared workspace core.
setup = workspace_core('prepare-repo', {
    'repo': repo,
    'branch': branch,
    'repoDir': repo_dir,
    'baseBranch': base_branch,
    'workspaceRoot': os.environ.get('OPENCLAW_WORKSPACE', ''),
}, timeout=300)
repo_dir = setup.get('repoDir') or repo_dir
branch = setup.get('branch') or branch
target_branch = branch
if target_branch.startswith('riddle-proof/'):
    raise SystemExit(
        'Setup invariant failed: workspace prepared a reserved riddle-proof/* branch instead of a real PR branch.'
    )
WORKTREE_ROOT = resolve_worktree_root(repo_dir)
BEFORE_DIR = os.path.join(WORKTREE_ROOT, 'riddle-proof-' + SAFE_RUN_ID + '-before')
AFTER_DIR = os.path.join(WORKTREE_ROOT, 'riddle-proof-' + SAFE_RUN_ID + '-after')
s['repo_dir'] = repo_dir
s['branch'] = branch
s['target_branch'] = target_branch
s['ship_target_branch'] = target_branch
s['worktree_root'] = WORKTREE_ROOT
save_state(s)
print('Prepared workspace via ' + setup.get('source', 'workspace_core') + ': ' + repo_dir)
os.makedirs(WORKTREE_ROOT, exist_ok=True)
scratch_cleanup = prune_scratch_worktrees(WORKTREE_ROOT, (BEFORE_DIR, AFTER_DIR), repo_dir)
if scratch_cleanup.get('removed') or scratch_cleanup.get('errors'):
    print('Scratch cleanup: removed ' + str(len(scratch_cleanup.get('removed') or [])) + ' stale proof worktree(s)')
s['scratch_cleanup'] = scratch_cleanup
save_state(s)
cleanup_legacy_branch_worktrees(repo_dir, base_branch)

# Clean any stale worktrees for this run and the legacy fixed paths
worktree_cleanup_dirs = []
for candidate in (
    BEFORE_DIR,
    AFTER_DIR,
    s.get('before_worktree'),
    s.get('after_worktree'),
    *LEGACY_WORKTREE_DIRS,
):
    if candidate and candidate not in worktree_cleanup_dirs:
        worktree_cleanup_dirs.append(candidate)

cleanup_branches = []
for candidate in (AFTER_WORKTREE_BRANCH, s.get('after_worktree_branch', '').strip()):
    if candidate and candidate not in cleanup_branches:
        cleanup_branches.append(candidate)

# Create before worktree (only if reference includes 'before')
before_ref = ''
before_ref_source = ''
if reference in ('before', 'both'):
    before_ref, before_ref_source = resolve_before_ref(repo_dir, base_branch, before_ref_arg)
    workspace_core('ensure-worktree', {
        'repoDir': repo_dir,
        'worktreeDir': BEFORE_DIR,
        'ref': before_ref,
        'detach': True,
        'cleanupPaths': worktree_cleanup_dirs,
        'verifyPackageJson': True,
    }, timeout=300)
    print('Before worktree: ' + BEFORE_DIR + ' (' + before_ref + ', source=' + before_ref_source + ')')

    # Patch Next.js config if needed (export -> standalone for server mode)
    if mode == 'server':
        for cf in (BEFORE_DIR + '/next.config.ts', BEFORE_DIR + '/next.config.js', BEFORE_DIR + '/next.config.mjs'):
            if os.path.exists(cf):
                with open(cf) as f:
                    content = f.read()
                if "output: 'export'" in content:
                    with open(cf, 'w') as f:
                        f.write(content.replace("output: 'export'", "output: 'standalone'"))
                    print('Patched before config: export -> standalone')
                break

# Create after worktree
after_cleanup_dirs = [candidate for candidate in worktree_cleanup_dirs if candidate != BEFORE_DIR]
workspace_core('ensure-worktree', {
    'repoDir': repo_dir,
    'worktreeDir': AFTER_DIR,
    'ref': branch,
    'branchName': AFTER_WORKTREE_BRANCH,
    'resetBranch': True,
    'cleanupPaths': after_cleanup_dirs,
    'cleanupBranches': cleanup_branches,
    'verifyPackageJson': True,
}, timeout=300)
print('After worktree: ' + AFTER_DIR + ' (' + AFTER_WORKTREE_BRANCH + ' -> ' + branch + ')')
apply_repo_profile(AFTER_DIR)
save_state(s)

target_dependency_dirs = [AFTER_DIR]
if reference in ('before', 'both'):
    target_dependency_dirs.append(BEFORE_DIR)

reuse_source = repo_dir if os.path.exists(os.path.join(repo_dir, 'package.json')) else ''
shared_reuse_source = compatible_reuse_source(reuse_source, target_dependency_dirs)
shared_status = ''
if shared_reuse_source:
    shared_status = ensure_deps_phase('shared_deps', shared_reuse_source, summary='Ensuring shared repository dependencies.')
    if shared_status:
        print('Shared deps status: ' + shared_status)
elif reuse_source:
    record_setup_phase(
        'shared_deps',
        'completed',
        'skipped: active workspace dependencies differ from proof worktrees',
    )
    print('Shared deps skipped: active workspace dependencies differ from proof worktrees')

before_dep_status = ''
if reference in ('before', 'both'):
    before_dep_status = ensure_deps_phase('before_deps', BEFORE_DIR, reuse_from=shared_reuse_source, summary='Ensuring before-worktree dependencies.')
    print('Before deps status: ' + before_dep_status)

after_reuse_source = ''
if before_dep_status and dependencies_match(BEFORE_DIR, AFTER_DIR):
    after_reuse_source = BEFORE_DIR
elif shared_reuse_source:
    after_reuse_source = shared_reuse_source
after_dep_status = ensure_deps_phase('after_deps', AFTER_DIR, reuse_from=after_reuse_source, summary='Ensuring after-worktree dependencies.')
print('After deps status: ' + after_dep_status)

# Patch Next.js config in after worktree if needed
if mode == 'server':
    for cf in (AFTER_DIR + '/next.config.ts', AFTER_DIR + '/next.config.js', AFTER_DIR + '/next.config.mjs'):
        if os.path.exists(cf):
            with open(cf) as f:
                content = f.read()
            if "output: 'export'" in content:
                with open(cf, 'w') as f:
                    f.write(content.replace("output: 'export'", "output: 'standalone'"))
                print('Patched after config: export -> standalone')
            break

s['before_worktree'] = BEFORE_DIR if reference in ('before', 'both') else ''
s['before_ref'] = before_ref or before_ref_arg
s['before_ref_source'] = before_ref_source
s['after_worktree'] = AFTER_DIR
s['after_worktree_branch'] = AFTER_WORKTREE_BRANCH
s['workspace_ready'] = True
s['stage'] = 'setup'
s['implementation_status'] = 'pending_recon'
s['dependency_install'] = {
    'shared': bool(shared_status),
    'before': before_dep_status,
    'after': after_dep_status,
}
if not (s.get('capture_script') or '').strip():
    s['proof_plan_status'] = 'pending_recon'
save_state(s)

print('Setup complete.')
if reference in ('before', 'both'):
    print('  Before: ' + BEFORE_DIR + ' (detached ' + (before_ref or before_ref_arg) + ')')
print('  After:  ' + AFTER_DIR + ' (' + AFTER_WORKTREE_BRANCH + ' -> ' + branch + ')')
print(json.dumps({'ok': True}))
