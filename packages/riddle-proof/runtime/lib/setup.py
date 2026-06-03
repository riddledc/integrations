"""Setup: create worktrees, install deps, validate args, write state.

Idempotent — safe to re-run. Creates per-run worktrees under disk-backed
scratch storage by default:
  /var/tmp/riddle-proof/.riddle-proof-worktrees/riddle-proof-<run_id>-before
  /var/tmp/riddle-proof/.riddle-proof-worktrees/riddle-proof-<run_id>-after
"""

import json, subprocess as sp, os, sys, shutil, time, tempfile
from urllib.parse import urlparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import load_state, save_state, git, shell_quote
from util import apply_capture_hint

s = load_state()
repo = (s.get('repo') or '').strip()
branch = (s.get('target_branch') or s['branch']).strip()
repo_dir = s.get('repo_dir', '')
base_branch = s.get('base_branch', 'main')
before_ref_arg = (s.get('before_ref') or s.get('base_ref') or '').strip()
mode = s.get('mode', 'server')
reference = s.get('reference', 'both')  # prod, before, both
run_id = (s.get('run_id') or '').strip()
SAFE_RUN_ID = ''.join(ch if ch.isalnum() or ch in ('-', '_') else '-' for ch in run_id) or 'run'

AFTER_WORKTREE_BRANCH = 'riddle-proof/' + SAFE_RUN_ID + '-after'
LEGACY_WORKTREE_DIRS = ('/tmp/riddle-proof-before', '/tmp/riddle-proof-after')
DEFAULT_SCRATCH_ROOT = '/var/tmp/riddle-proof'

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
    configured = (os.environ.get('RIDDLE_PROOF_WORKTREE_ROOT') or '').strip()
    if configured:
        return os.path.abspath(os.path.expanduser(configured))
    state_worktree_root = (s.get('worktree_root') or '').strip()
    legacy_tmp_root = os.path.abspath(os.path.join(tempfile.gettempdir(), '.riddle-proof-worktrees'))
    if state_worktree_root and os.path.abspath(os.path.expanduser(state_worktree_root)) != legacy_tmp_root:
        return os.path.abspath(os.path.expanduser(state_worktree_root))
    if os.environ.get('RIDDLE_PROOF_USE_WORKSPACE_WORKTREE_ROOT', '').strip().lower() in ('1', 'true', 'yes'):
        repo_parent = os.path.dirname(os.path.abspath(repo_dir))
        return os.path.join(repo_parent, '.riddle-proof-worktrees')

    # Proof worktrees and dependency caches are large generated data. Keep
    # them on disk-backed scratch storage by default so tmpfs /tmp remains
    # available for small state files and short-lived artifacts.
    scratch_root = (s.get('scratch_root') or os.environ.get('RIDDLE_PROOF_SCRATCH_ROOT') or '').strip()
    if scratch_root:
        return os.path.join(os.path.abspath(os.path.expanduser(scratch_root)), '.riddle-proof-worktrees')
    if os.environ.get('RIDDLE_PROOF_USE_TMP_SCRATCH', '').strip().lower() in ('1', 'true', 'yes'):
        return os.path.join(tempfile.gettempdir(), 'riddle-proof', '.riddle-proof-worktrees')
    return os.path.join(DEFAULT_SCRATCH_ROOT, '.riddle-proof-worktrees')


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


def explicitly_false(value):
    return value is False or str(value or '').strip().lower() in ('false', '0', 'no', 'off')


def audit_no_diff_mode():
    implementation_mode = str(s.get('implementation_mode') or '').strip().lower()
    return (
        implementation_mode in ('none', 'audit', 'no_implementation', 'no-implementation')
        or explicitly_false(s.get('require_diff'))
        or explicitly_false(s.get('allow_code_changes'))
    )


def interaction_verification_mode():
    return str(s.get('verification_mode') or '').strip().lower() in (
        'interaction',
        'interactive',
        'user_flow',
        'user-flow',
        'workflow',
    )


def remote_audit_mode():
    return bool(s.get('remote_audit')) or (
        not repo
        and bool((s.get('prod_url') or '').strip())
        and audit_no_diff_mode()
    )


def remote_audit_target_path():
    explicit = (s.get('server_path') or '').strip()
    if explicit:
        return explicit
    parsed = urlparse((s.get('prod_url') or '').strip())
    path = parsed.path or '/'
    return path + (('?' + parsed.query) if parsed.query else '')


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


def disk_snapshot(path):
    probe = path
    while probe and not os.path.exists(probe):
        parent = os.path.dirname(probe)
        if parent == probe:
            break
        probe = parent
    try:
        usage = shutil.disk_usage(probe or tempfile.gettempdir())
    except Exception as exc:
        return {
            'path': path,
            'probe_path': probe or tempfile.gettempdir(),
            'error': str(exc)[:200],
        }
    used = usage.total - usage.free
    percent_used = round((used / usage.total) * 100, 1) if usage.total else 0
    return {
        'path': path,
        'probe_path': probe or tempfile.gettempdir(),
        'total_bytes': usage.total,
        'used_bytes': used,
        'free_bytes': usage.free,
        'percent_used': percent_used,
    }


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

if remote_audit_mode():
    target_path = remote_audit_target_path()
    s['remote_audit'] = True
    s['workspace_kind'] = 'remote_audit'
    s['repo_dir'] = ''
    s['worktree_root'] = ''
    s['scratch_root'] = DEFAULT_SCRATCH_ROOT
    s['before_worktree'] = ''
    s['after_worktree'] = ''
    s['after_worktree_branch'] = ''
    s['before_ref'] = ''
    s['before_ref_source'] = ''
    s['workspace_ready'] = True
    s['stage'] = 'author'
    s['implementation_status'] = 'not_required'
    s['implementation_mode'] = s.get('implementation_mode') or 'none'
    s['require_diff'] = False
    s['allow_code_changes'] = False
    s['server_path'] = s.get('server_path') or target_path
    s['server_path_source'] = s.get('server_path_source') or 'prod_url'
    s['recon_status'] = 'ready_for_proof_plan'
    s['recon_summary'] = 'Remote audit/no-diff run uses prod_url as the current target and skips repo worktrees.'
    s['recon_hypothesis'] = {
        'target_path': target_path,
        'path_source': 'prod_url',
        'reference': s.get('reference') or 'prod',
        'mode': s.get('mode') or 'server',
        'wait_for_selector': (s.get('wait_for_selector') or '').strip(),
        'notes': ['Remote audit/no-diff setup skipped repository checkout and dependency staging.'],
    }
    s['recon_results'] = {
        'status': 'ready_for_proof_plan',
        'mode': 'remote_audit',
        'hypothesis': s['recon_hypothesis'],
        'baselines': {},
        'attempt_history': [],
        'route_hints': [],
        'keyword_hits': [],
        'max_attempts': 0,
    }
    has_capture_script = bool((s.get('capture_script') or '').strip())
    needs_authored_interaction_capture = interaction_verification_mode() and not has_capture_script
    if needs_authored_interaction_capture:
        s['author_status'] = 'needs_authoring'
        s['proof_plan_status'] = 'needs_authoring'
        s['proof_plan'] = (s.get('proof_plan') or '').strip()
        s['author_summary'] = 'Remote interaction audit requires an authored browser interaction capture before verify.'
        s['capture_script_source'] = ''
    else:
        s['author_status'] = 'ready'
        s['proof_plan_status'] = 'ready'
        s['proof_plan'] = (s.get('proof_plan') or 'Audit the current prod_url target and capture current evidence without requiring a repo diff.').strip()
    if not has_capture_script and not needs_authored_interaction_capture:
        s['capture_script'] = 'await page.waitForTimeout(1500);'
        s['capture_script_source'] = 'default_remote_audit_current_target'
    s['dependency_install'] = {
        'shared': 'skipped:remote_audit',
        'before': 'skipped:remote_audit',
        'after': 'skipped:remote_audit',
    }
    s['scratch_disk_after_setup'] = disk_snapshot(DEFAULT_SCRATCH_ROOT)
    save_state(s)
    print('Remote audit/no-diff setup: repo worktrees and dependency staging skipped.')
    print('Current target: ' + (s.get('prod_url') or ''))
    print(json.dumps({'ok': True, 'remote_audit': True}))
    sys.exit(0)

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
s['scratch_root'] = os.path.dirname(WORKTREE_ROOT)
try:
    cache_result = workspace_core('dependency-cache-root', {'projectDir': AFTER_DIR}, timeout=30)
    s['dependency_cache_root'] = cache_result.get('cacheRoot') or ''
except Exception as exc:
    s['dependency_cache_root_error'] = str(exc)[:200]
capture_hint = apply_capture_hint(s)
if capture_hint and capture_hint.get('applied_fields'):
    print('Applied last-good capture hint: ' + ', '.join(capture_hint.get('applied_fields') or []))
save_state(s)
print('Prepared workspace via ' + setup.get('source', 'workspace_core') + ': ' + repo_dir)
os.makedirs(WORKTREE_ROOT, exist_ok=True)
s['scratch_disk_before_cleanup'] = disk_snapshot(WORKTREE_ROOT)
scratch_cleanup = prune_scratch_worktrees(WORKTREE_ROOT, (BEFORE_DIR, AFTER_DIR), repo_dir)
if scratch_cleanup.get('removed') or scratch_cleanup.get('errors'):
    print('Scratch cleanup: removed ' + str(len(scratch_cleanup.get('removed') or [])) + ' stale proof worktree(s)')
s['scratch_cleanup'] = scratch_cleanup
s['scratch_disk_after_cleanup'] = disk_snapshot(WORKTREE_ROOT)
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
        'verifyPackageJson': False,
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
    'verifyPackageJson': False,
}, timeout=300)
print('After worktree: ' + AFTER_DIR + ' (' + AFTER_WORKTREE_BRANCH + ' -> ' + branch + ')')
apply_repo_profile(AFTER_DIR)
save_state(s)

target_dependency_dirs = [AFTER_DIR]
if reference in ('before', 'both'):
    target_dependency_dirs.append(BEFORE_DIR)

reuse_source = repo_dir if env_flag('RIDDLE_PROOF_USE_ACTIVE_WORKSPACE_DEPS', False) and os.path.exists(os.path.join(repo_dir, 'package.json')) else ''
shared_reuse_source = compatible_reuse_source(reuse_source, target_dependency_dirs)
shared_status = ''
if shared_reuse_source:
    shared_status = ensure_deps_phase('shared_deps', shared_reuse_source, summary='Ensuring shared repository dependencies.')
    if shared_status:
        print('Shared deps status: ' + shared_status)
elif os.path.exists(os.path.join(repo_dir, 'package.json')):
    record_setup_phase(
        'shared_deps',
        'completed',
        'skipped: active workspace dependency reuse disabled; proof worktrees use scratch cache',
    )
    print('Shared deps skipped: active workspace dependency reuse disabled; proof worktrees use scratch cache')

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
s['scratch_disk_after_setup'] = disk_snapshot(WORKTREE_ROOT)
if not (s.get('capture_script') or '').strip():
    s['proof_plan_status'] = 'pending_recon'
save_state(s)

print('Setup complete.')
if reference in ('before', 'both'):
    print('  Before: ' + BEFORE_DIR + ' (detached ' + (before_ref or before_ref_arg) + ')')
print('  After:  ' + AFTER_DIR + ' (' + AFTER_WORKTREE_BRANCH + ' -> ' + branch + ')')
print(json.dumps({'ok': True}))
