"""Preflight: validate args and initialize state file.

Reads args from RIDDLE_PROOF_ARGS_FILE, defaulting to /tmp/riddle-proof-args.json.
Supports both static and server modes.
reference: 'prod', 'before', or 'both' (default: 'both')
capture_script: optional at setup and recon; required before verify.
"""

import json, os, re, time, uuid, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import (
    STATE_FILE,
    ARGS_FILE,
    apply_proof_session_defaults,
    invoke,
    load_package_json,
    load_proof_session_source,
    save_state,
    validate_proof_session_resume,
)

def truthy(value):
    return str(value or '').strip().lower() in ('1', 'true', 'yes', 'y', 'on')


def parse_json_arg(key, expected, default):
    raw = s.get(key)
    if raw in (None, ''):
        return default
    if isinstance(raw, expected):
        return raw
    if not isinstance(raw, str):
        raise SystemExit(key + ' must be JSON ' + '/'.join(t.__name__ for t in expected) + '.')
    text = raw.strip()
    if not text:
        return default
    try:
        parsed = json.loads(text)
    except Exception as e:
        raise SystemExit(key + ' is not valid JSON: ' + str(e))
    if not isinstance(parsed, expected):
        raise SystemExit(key + ' must decode to ' + '/'.join(t.__name__ for t in expected) + '.')
    return parsed

args_file = ARGS_FILE
if not os.path.exists(args_file):
    raise SystemExit('No args file. Lobster wrapper must write ' + args_file + ' first.')

with open(args_file) as f:
    s = json.load(f)

resume_session_source = (s.get('resume_session') or '').strip()
if resume_session_source:
    parent_proof_session = load_proof_session_source(resume_session_source)
    s['parent_proof_session'] = parent_proof_session
    s['parent_proof_session_id'] = parent_proof_session.get('session_id')
    s['proof_session_resume'] = {
        'status': 'loaded',
        'source': 'inline_json' if resume_session_source.startswith('{') else resume_session_source,
        'parent_session_id': parent_proof_session.get('session_id'),
        'parent_fingerprint': parent_proof_session.get('fingerprint'),
        'applied_fields': apply_proof_session_defaults(s, parent_proof_session),
    }

mode = (s.get('mode') or '').strip().lower()
reference = s.get('reference', 'both')
requested_reference = reference
reference_note = ''
verification_mode = (s.get('verification_mode') or 'proof').strip() or 'proof'
s['verification_mode'] = verification_mode
s['success_criteria'] = (s.get('success_criteria') or '').strip()
raw_assertions = (s.get('assertions_json') or '').strip()
allow_static_preview_fallback = str(s.get('allow_static_preview_fallback') or '').strip().lower() in ('1', 'true', 'yes', 'y', 'on')
s['allow_static_preview_fallback'] = allow_static_preview_fallback
s['leave_draft'] = truthy(s.get('leave_draft'))
for key in ('discord_channel', 'discord_thread_id', 'discord_message_id', 'discord_source_url'):
    s[key] = (s.get(key) or '').strip()

discord_url_match = re.search(r'discord(?:app)?\.com/channels/[^/]+/([^/?#]+)/([^/?#]+)', s.get('discord_source_url') or '')
if discord_url_match:
    discord_container_id, discord_message_id = discord_url_match.groups()
    if not s.get('discord_message_id'):
        s['discord_message_id'] = discord_message_id
    if not s.get('discord_thread_id') and (not s.get('discord_channel') or discord_container_id != s.get('discord_channel')):
        # The URL's channel component is the exact message container. If it
        # differs from the parent channel, it is the thread ID; if no parent is
        # known, it still works as a POST target.
        s['discord_thread_id'] = discord_container_id

# Validate reference
if reference not in ('prod', 'before', 'both'):
    raise SystemExit('Invalid reference: ' + reference + '. Must be prod, before, or both.')
s['reference'] = reference
prod_url_present = bool((s.get('prod_url') or '').strip())
s['reference_resolution'] = {
    'requested_reference': requested_reference,
    'effective_reference': reference,
    'prod_reference_requested': requested_reference in ('prod', 'both'),
    'prod_url_present': prod_url_present,
    'prod_reference_skipped': False,
    'prod_reference_skip_reason': '',
}

# Infer a reasonable commit title during setup instead of forcing the caller to
# fill boilerplate that can be derived from the requested change.
if not (s.get('commit_message') or '').strip():
    s['commit_message'] = (s.get('change_request') or '').strip()

# Setup should not block on a missing production URL. If prod comparison was
# requested but prod_url is not known yet, continue with a before-only setup so
# the repo homework can happen first.
if reference in ('prod', 'both') and not prod_url_present:
    s['requested_reference'] = reference
    reference = 'before'
    s['reference'] = reference
    reference_note = 'prod_url not provided; setup will continue with reference=before until prod is known.'
    s['reference_resolution'].update({
        'effective_reference': reference,
        'prod_reference_skipped': True,
        'prod_reference_skip_reason': 'prod_url_not_provided',
        'note': reference_note,
    })

# Parse optional assertions JSON
parsed_assertions = None
if raw_assertions:
    try:
        parsed_assertions = json.loads(raw_assertions)
    except Exception as e:
        raise SystemExit('assertions_json is not valid JSON: ' + str(e))
s['parsed_assertions'] = parsed_assertions
s['viewport_matrix'] = parse_json_arg('viewport_matrix_json', (dict, list), None)
s['deterministic_setup'] = parse_json_arg('deterministic_setup_json', (dict, list), None)

# Generate branch if not provided. The riddle-proof/* namespace is reserved for
# temporary proof worktrees, so never let a user-supplied branch use it as the
# real PR branch.
requested_branch = (s.get('branch') or '').strip()
if not requested_branch or requested_branch.startswith('riddle-proof/'):
    slug = re.sub(r'[^a-z0-9]+', '-', (s.get('change_request') or 'proof-check').lower())[:34].strip('-') or 'proof-check'
    s['branch'] = 'agent/openclaw/' + slug + '-' + uuid.uuid4().hex[:6]
    if requested_branch:
        s['branch_rewritten_from'] = requested_branch
requested_target_branch = (s.get('target_branch') or '').strip()
if requested_target_branch.startswith('riddle-proof/'):
    s['target_branch_rewritten_from'] = requested_target_branch
    requested_target_branch = ''
s['target_branch'] = (requested_target_branch or s.get('branch') or '').strip()
s['ship_target_branch'] = s['target_branch']
if s['target_branch'].startswith('riddle-proof/'):
    raise SystemExit('Invalid target_branch: riddle-proof/* is reserved for temporary proof worktrees.')

# Validate required fields (common)
missing = []
for k in ('repo', 'change_request', 'commit_message'):
    if not s.get(k):
        missing.append(k)

# prod_url required only once prod is actively part of the comparison
if reference in ('prod', 'both') and not s.get('prod_url', '').strip():
    missing.append('prod_url (required when reference=' + reference + ')')

# Mode-specific validation
if mode == 'server':
    for k in ('server_image', 'server_command', 'server_port'):
        if not s.get(k):
            missing.append(k)

# Derived fields
repo_short = s['repo'].split('/')[-1] if s.get('repo') else ''
s['repo_short'] = repo_short
base_branch = (s.get('base_branch') or 'main').strip() or 'main'
s['base_branch'] = base_branch
if not (s.get('before_ref') or '').strip() and not (s.get('base_ref') or '').strip():
    s['before_ref'] = 'origin/' + base_branch
workspace = os.environ.get('OPENCLAW_WORKSPACE')
if not workspace:
    for candidate in ('/mnt/efs/openclaw/workspace', os.path.expanduser('~/.openclaw/workspace')):
        if os.path.exists(candidate):
            workspace = candidate
            break
workspace = workspace or os.path.expanduser('~/.openclaw/workspace')
s['repo_dir'] = s.get('repo_dir') or (workspace + '/' + repo_short if repo_short else '')

if not mode:
    repo_dir = s.get('repo_dir', '')
    pkg = load_package_json(repo_dir) if repo_dir else {}
    scripts = pkg.get('scripts') or {}
    script_blob = ' '.join(str(scripts.get(k, '')).lower() for k in ('start', 'preview', 'dev'))
    mode = 'static' if 'vite' in script_blob or 'react-scripts' in script_blob else 'server'
s['mode'] = mode or 'static'
mode = s['mode']

run_id = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + uuid.uuid4().hex[:8]
s['run_id'] = run_id
s['stage'] = 'preflight'
s['status'] = 'ready' if not missing else 'needs_input'
s['missing'] = missing

if s.get('parent_proof_session') and not missing:
    try:
        s['proof_session_resume'] = {
            **(s.get('proof_session_resume') or {}),
            **validate_proof_session_resume(s, route=s.get('server_path') or ''),
        }
    except SystemExit:
        save_state(s)
        raise

# Auth context can be supplied directly for public-plugin use, while use_auth
# remains a private/configured Cognito helper for Riddle-owned environments.
explicit_local_storage = parse_json_arg('auth_localStorage_json', (dict,), {})
explicit_cookies = parse_json_arg('auth_cookies_json', (dict, list), {})
explicit_headers = parse_json_arg('auth_headers_json', (dict,), {})
s['auth_explicit_localStorage'] = explicit_local_storage
s['auth_cookies'] = explicit_cookies
s['auth_headers'] = explicit_headers
s['auth_localStorage'] = dict(explicit_local_storage)

if truthy(s.get('use_auth')):
    print('Fetching Cognito auth tokens...')
    auth = invoke('auth_cognito_tokens', {}, timeout=60)
    if auth.get('ok') and auth.get('localStorage'):
        merged_local_storage = dict(auth['localStorage'])
        merged_local_storage.update(explicit_local_storage)
        s['auth_localStorage'] = merged_local_storage
        print('Auth tokens fetched (' + str(len(auth['localStorage'])) + ' keys)')
    else:
        raise SystemExit('Failed to fetch auth tokens for use_auth=true: ' + str(auth.get('error', 'unknown')))

# Init capture/proof fields
s['before_cdn'] = ''
s['after_cdn'] = ''
s['prod_cdn'] = ''
s['before_preview_id'] = ''
s['after_preview_id'] = ''
s['before_worktree'] = ''
s['after_worktree'] = ''
s['after_worktree_branch'] = ''
s['pr_url'] = s.get('pr_url', '')
s['pr_number'] = s.get('pr_number', '')
s['recon_results'] = {}
s['verify_results'] = {}
s['capture_diagnostics'] = []
s['review_passed'] = False
s['finalized'] = False
s['proof_summary'] = ''
s['proof_plan'] = (s.get('proof_plan') or '').strip()
s['proof_plan_request'] = s.get('proof_plan_request') or {}
s['author_request'] = s.get('author_request') or {}
s['author_summary'] = ''
authored = bool((s.get('capture_script') or '').strip()) and bool((s.get('proof_plan') or '').strip())
s['author_status'] = 'ready' if authored else 'pending_recon'
s['proof_plan_status'] = 'ready' if authored else 'pending_recon'
s['recon_summary'] = ''
s['recon_hypothesis'] = s.get('recon_hypothesis') or {}
s['assertion_status'] = 'not_run'
s['merge_recommendation'] = ''
s['evidence_notes'] = []
s['implementation_status'] = 'pending_recon'
s['implementation_summary'] = ''
s['implementation_notes'] = (s.get('implementation_notes') or '').strip()

print('RIDDLE PROOF — PREFLIGHT (' + mode.upper() + ' / ' + reference.upper() + ')')
print('=' * 50)
display_keys = ['repo', 'branch', 'target_branch', 'ship_target_branch', 'base_branch', 'before_ref', 'change_request', 'commit_message',
                'reference', 'verification_mode', 'success_criteria', 'prod_url', 'build_command',
                'allow_static_preview_fallback', 'resume_session', 'target_image_url', 'target_image_hash']
if mode == 'server':
    display_keys += ['server_image', 'server_command', 'server_port', 'server_path']
if s.get('auth_localStorage'):
    print('auth: localStorage loaded (' + str(len(s['auth_localStorage'])) + ' keys)')
if s.get('auth_cookies'):
    print('auth: cookies supplied')
if s.get('auth_headers'):
    print('auth: headers supplied (' + str(len(s['auth_headers'])) + ' keys)')
for k in display_keys:
    v = str(s.get(k, ''))
    if len(v) > 120:
        v = v[:120] + '...'
    print(k + ': ' + v)
if parsed_assertions is not None:
    print('assertions_json: parsed')
if s.get('viewport_matrix') is not None:
    print('viewport_matrix_json: parsed')
if s.get('deterministic_setup') is not None:
    print('deterministic_setup_json: parsed')
if s.get('proof_session_resume'):
    print('proof_session_resume: ' + str((s.get('proof_session_resume') or {}).get('status') or 'loaded'))
if not (s.get('capture_script') or '').strip():
    print('NOTE: capture_script can be added later after recon and before verify.')
if reference_note:
    print('NOTE: ' + reference_note)
if missing:
    print('MISSING: ' + ', '.join(missing))
print('=' * 50)

# The TypeScript harness writes runtime observability fields before Lobster
# starts. Preflight initializes the main state file, so preserve those fields
# rather than making status polling go blind during setup.
if os.path.exists(STATE_FILE):
    try:
        with open(STATE_FILE) as existing_state_file:
            existing_state = json.load(existing_state_file)
    except Exception:
        existing_state = {}
    for runtime_key in ('current_runtime_step', 'last_runtime_step', 'runtime_events', 'runtime_updated_at'):
        if runtime_key in existing_state:
            s[runtime_key] = existing_state[runtime_key]

save_state(s)

if missing:
    raise SystemExit('Missing required fields: ' + ', '.join(missing))
print(json.dumps({'ok': True, 'run_id': run_id, 'mode': mode, 'reference': reference, 'verification_mode': verification_mode}))
