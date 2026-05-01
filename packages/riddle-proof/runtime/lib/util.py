"""Shared helpers for Riddle Proof pipeline."""

import hashlib, json, os, re, shlex, subprocess as sp, tempfile, time
from urllib.parse import urljoin
from urllib.request import urlopen

STATE_FILE = os.environ.get('RIDDLE_PROOF_STATE_FILE', '/tmp/riddle-proof-state.json')
ARGS_FILE = os.environ.get('RIDDLE_PROOF_ARGS_FILE', '/tmp/riddle-proof-args.json')
RIDDLE_DIRECT_TOOLS = {
    'riddle_preview',
    'riddle_preview_delete',
    'riddle_server_preview',
    'riddle_build_preview',
    'riddle_script',
    'riddle_run',
}
CAPTURE_ARTIFACT_JSON_LIMIT = 256 * 1024
_JSON_ARTIFACT_CACHE = {}
CAPTURE_DIAGNOSTIC_VERSION = 'riddle-proof.capture-diagnostic.v1'
DEBUG_STRING_LIMIT = 2000
CAPTURE_HINT_CACHE_VERSION = 'riddle-proof.capture-hints.v1'
CAPTURE_HINT_CACHE_LIMIT = 12
PROOF_SESSION_VERSION = 'riddle-proof.visual-session.v1'
PROOF_SESSION_FINGERPRINT_VERSION = 'riddle-proof.visual-session.fingerprint.v1'
SENSITIVE_KEY_FRAGMENTS = (
    'authorization',
    'apikey',
    'api_key',
    'cookie',
    'header',
    'localstorage',
    'password',
    'secret',
    'token',
)
HINT_TOKEN_STOPWORDS = {
    'about', 'after', 'agent', 'agents', 'around', 'before', 'browser', 'change',
    'changes', 'clarify', 'component', 'copy', 'debug', 'default', 'evidence',
    'flow', 'homepage', 'improve', 'just', 'main', 'make', 'need', 'normal',
    'page', 'proof', 'report', 'results', 'review', 'run', 'screen', 'script',
    'small', 'status', 'text', 'tiny', 'update', 'user', 'verify', 'visible',
    'workflow',
}


def load_state():
    with open(STATE_FILE) as f:
        return json.load(f)


def save_state(s):
    with open(STATE_FILE, 'w') as f:
        json.dump(s, f, indent=2)


def request_shape_tokens(state, limit=8):
    haystack = ' '.join([
        str(state.get('change_request') or ''),
        str(state.get('context') or ''),
        str(state.get('success_criteria') or ''),
    ]).lower()
    tokens = []
    for word in re.findall(r'[a-z0-9]+', haystack):
        if len(word) < 4 or word in HINT_TOKEN_STOPWORDS or word in tokens:
            continue
        tokens.append(word)
        if len(tokens) >= limit:
            break
    return tokens


def normalize_browser_path(value):
    value = str(value or '').strip()
    if not value.startswith('/'):
        return ''
    value = value.split('#', 1)[0].split('?', 1)[0]
    value = value.rstrip('.,;:)]}')
    if not value.startswith('/'):
        return ''
    value = re.sub(r'/+', '/', value)
    if len(value) > 1:
        value = value.rstrip('/')
    return value.lower() or '/'


def extract_browser_paths(text):
    paths = []
    for match in re.findall(r'/(?:[A-Za-z0-9._~%!$&\'()*+,;=:@-]+/?)+(?:\?[A-Za-z0-9._~%!$&\'()*+,;=:@/?-]*)?', str(text or '')):
        normalized = normalize_browser_path(match)
        if normalized and normalized not in paths:
            paths.append(normalized)
    return paths


def explicit_request_paths(state):
    source_groups = [
        [state.get('server_path'), state.get('expected_path'), state.get('target_path')],
        [state.get('change_request')],
        [state.get('context')],
        [state.get('success_criteria')],
    ]
    for group in source_groups:
        paths = []
        for value in group:
            for path in extract_browser_paths(value):
                if path not in paths:
                    paths.append(path)
        if paths:
            return paths
    return []


def capture_hint_cache_path(state):
    repo_key = str(state.get('repo') or state.get('repo_dir') or '').strip()
    if not repo_key:
        return ''
    digest = hashlib.sha1(repo_key.encode('utf-8')).hexdigest()
    return os.path.join(tempfile.gettempdir(), '.riddle-proof-capture-hints', digest + '.json')


def load_capture_hint_cache(state):
    cache_path = capture_hint_cache_path(state)
    if not cache_path or not os.path.exists(cache_path):
        return ({'version': CAPTURE_HINT_CACHE_VERSION, 'hints': []}, cache_path)
    try:
        with open(cache_path) as f:
            payload = json.load(f)
    except Exception:
        return ({'version': CAPTURE_HINT_CACHE_VERSION, 'hints': []}, cache_path)
    if not isinstance(payload, dict):
        return ({'version': CAPTURE_HINT_CACHE_VERSION, 'hints': []}, cache_path)
    hints = payload.get('hints') if isinstance(payload.get('hints'), list) else []
    payload['version'] = CAPTURE_HINT_CACHE_VERSION
    payload['hints'] = hints
    return payload, cache_path


def select_capture_hint(state):
    payload, cache_path = load_capture_hint_cache(state)
    hints = payload.get('hints') or []
    current_tokens = request_shape_tokens(state)
    requested_paths = explicit_request_paths(state)
    current_mode = str(state.get('verification_mode') or '').strip().lower()
    scored = []
    for hint in hints:
        if not isinstance(hint, dict):
            continue
        server_path = str(hint.get('server_path') or '').strip()
        wait_for_selector = str(hint.get('wait_for_selector') or '').strip()
        if not server_path and not wait_for_selector:
            continue
        hint_path = normalize_browser_path(server_path)
        if requested_paths and hint_path and hint_path not in requested_paths:
            continue
        hint_mode = str(hint.get('verification_mode') or '').strip().lower()
        hint_tokens = [
            str(item).strip().lower()
            for item in (hint.get('request_tokens') or [])
            if str(item).strip()
        ]
        matched_tokens = [token for token in current_tokens if token in hint_tokens]
        mode_matches = bool(current_mode and hint_mode == current_mode)
        root_hint = server_path == '/'
        if not matched_tokens and mode_matches and not root_hint:
            continue
        score = len(matched_tokens) * 3
        if mode_matches:
            score += 2
        if score <= 0:
            continue
        scored.append({
            'score': score,
            'matched_tokens': matched_tokens,
            'selection_reason': 'token_overlap_and_mode' if matched_tokens and current_mode and hint_mode == current_mode else (
                'token_overlap' if matched_tokens else 'verification_mode_match'
            ),
            'hint': hint,
        })

    if not scored:
        return None

    scored.sort(
        key=lambda item: (
            int(item['score']),
            str(item['hint'].get('saved_at') or ''),
        ),
        reverse=True,
    )
    selected = scored[0]
    return {
        'cache_path': cache_path,
        'available_count': len(hints),
        'score': selected['score'],
        'matched_tokens': selected['matched_tokens'],
        'selection_reason': selected['selection_reason'],
        'hint': selected['hint'],
    }


def apply_capture_hint(state):
    selected = select_capture_hint(state)
    if not selected:
        return None

    hint = selected['hint']
    applied_fields = []
    server_path = str(hint.get('server_path') or '').strip()
    wait_for_selector = str(hint.get('wait_for_selector') or '').strip()

    if server_path and not str(state.get('server_path') or '').strip():
        state['server_path'] = server_path
        state['server_path_source'] = 'hint_cache'
        applied_fields.append('server_path')
    if wait_for_selector and not str(state.get('wait_for_selector') or '').strip():
        state['wait_for_selector'] = wait_for_selector
        state['wait_for_selector_source'] = 'hint_cache'
        applied_fields.append('wait_for_selector')

    if not applied_fields:
        return None

    state['capture_hint'] = {
        'source': 'hint_cache',
        'cache_path': selected['cache_path'],
        'applied': True,
        'applied_fields': applied_fields,
        'matched_tokens': selected['matched_tokens'],
        'selection_reason': selected['selection_reason'],
        'available_count': selected['available_count'],
        'selected': {
            'saved_at': str(hint.get('saved_at') or ''),
            'verification_mode': str(hint.get('verification_mode') or ''),
            'server_path': server_path,
            'wait_for_selector': wait_for_selector,
            'observed_path': str(hint.get('observed_path') or ''),
            'proof_profile_name': str(hint.get('proof_profile_name') or ''),
            'request_tokens': hint.get('request_tokens') or [],
        },
        'fallback_triggered': False,
    }
    return state['capture_hint']


def record_successful_capture_hint(state, server_path='', wait_for_selector='', observed_path='', source_stage='verify', success_signal=''):
    server_path = str(server_path or '').strip()
    wait_for_selector = str(wait_for_selector or '').strip()
    if not server_path and not wait_for_selector:
        return {'status': 'skipped_missing_inputs'}

    payload, cache_path = load_capture_hint_cache(state)
    hints = payload.get('hints') or []
    request_tokens = request_shape_tokens(state)
    entry = {
        'saved_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'verification_mode': str(state.get('verification_mode') or '').strip().lower(),
        'request_tokens': request_tokens,
        'request_sample': compact_debug_value(str(state.get('change_request') or '')[:240]),
        'server_path': server_path,
        'wait_for_selector': wait_for_selector,
        'observed_path': str(observed_path or '').strip(),
        'proof_profile_name': str(((state.get('proof_profile') or {}).get('name')) or '').strip(),
        'source_stage': str(source_stage or '').strip(),
        'success_signal': str(success_signal or '').strip(),
    }

    deduped = []
    for hint in hints:
        if not isinstance(hint, dict):
            continue
        if (
            str(hint.get('verification_mode') or '').strip().lower() == entry['verification_mode']
            and str(hint.get('server_path') or '').strip() == entry['server_path']
            and str(hint.get('wait_for_selector') or '').strip() == entry['wait_for_selector']
            and list(hint.get('request_tokens') or []) == entry['request_tokens']
        ):
            continue
        deduped.append(hint)

    next_payload = {
        'version': CAPTURE_HINT_CACHE_VERSION,
        'repo': str(state.get('repo') or state.get('repo_dir') or '').strip(),
        'updated_at': entry['saved_at'],
        'hints': [entry] + deduped[:CAPTURE_HINT_CACHE_LIMIT - 1],
    }
    try:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, 'w') as f:
            json.dump(next_payload, f, indent=2)
    except Exception as exc:
        return {
            'status': 'error',
            'cache_path': cache_path,
            'error': str(exc)[:240],
        }

    return {
        'status': 'saved',
        'cache_path': cache_path,
        'entry': entry,
        'hint_count': len(next_payload['hints']),
    }


def compact_debug_value(value, limit=DEBUG_STRING_LIMIT):
    if isinstance(value, str) and len(value) > limit:
        return value[:limit] + '... [truncated]'
    return value


def stable_json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def sha256_text(value):
    text = str(value or '').strip()
    if not text:
        return ''
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def parse_optional_json(value, field_name):
    if value in (None, ''):
        return None
    if isinstance(value, (dict, list)):
        return value
    if not isinstance(value, str):
        raise SystemExit(field_name + ' must be JSON.')
    text = value.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception as exc:
        raise SystemExit(field_name + ' is not valid JSON: ' + str(exc))


def load_proof_session_source(value):
    source = str(value or '').strip()
    if not source:
        return None
    try:
        if source.startswith('{'):
            session = json.loads(source)
        elif source.startswith(('http://', 'https://')):
            with urlopen(source, timeout=20) as response:
                session = json.loads(response.read(512 * 1024).decode('utf-8'))
        else:
            with open(os.path.abspath(os.path.expanduser(source))) as f:
                session = json.load(f)
    except Exception as exc:
        raise SystemExit('resume_session could not be loaded: ' + str(exc))

    if not isinstance(session, dict):
        raise SystemExit('resume_session must be a JSON object.')
    if session.get('version') != PROOF_SESSION_VERSION:
        raise SystemExit('resume_session has unsupported version: ' + str(session.get('version') or ''))
    if not session.get('session_id'):
        raise SystemExit('resume_session is missing session_id.')
    if not session.get('fingerprint'):
        raise SystemExit('resume_session is missing fingerprint.')
    return session


def apply_proof_session_defaults(state, session):
    if not isinstance(session, dict):
        return []
    applied = []
    route = session.get('route') if isinstance(session.get('route'), dict) else {}
    capture = session.get('capture') if isinstance(session.get('capture'), dict) else {}
    target_image = session.get('target_image') if isinstance(session.get('target_image'), dict) else {}

    defaults = [
        ('server_path', route.get('path'), 'proof_session'),
        ('wait_for_selector', capture.get('wait_for_selector'), 'proof_session'),
        ('proof_plan', capture.get('proof_plan'), 'proof_session'),
        ('capture_script', capture.get('capture_script'), 'proof_session'),
        ('reference', session.get('reference'), 'proof_session'),
        ('verification_mode', session.get('verification_mode'), 'proof_session'),
        ('target_image_url', target_image.get('url'), 'proof_session'),
        ('target_image_hash', target_image.get('hash'), 'proof_session'),
    ]
    for key, value, source in defaults:
        text = str(value or '').strip()
        if text and not str(state.get(key) or '').strip():
            state[key] = text
            applied.append(key)
            if key == 'server_path':
                state['server_path_source'] = source

    if state.get('viewport_matrix_json') in (None, '') and session.get('viewport_matrix') is not None:
        state['viewport_matrix_json'] = json.dumps(session.get('viewport_matrix'))
        applied.append('viewport_matrix_json')
    if state.get('deterministic_setup_json') in (None, '') and session.get('deterministic_setup') is not None:
        state['deterministic_setup_json'] = json.dumps(session.get('deterministic_setup'))
        applied.append('deterministic_setup_json')
    if state.get('assertions_json') in (None, '') and session.get('assertions') is not None:
        state['assertions_json'] = json.dumps(session.get('assertions'))
        applied.append('assertions_json')
    return applied


def visual_session_fingerprint_basis(state, route=''):
    route_value = str(route or state.get('server_path') or '').strip()
    basis = {
        'version': PROOF_SESSION_FINGERPRINT_VERSION,
        'repo': str(state.get('repo') or '').strip() or None,
        'route': route_value or None,
        'wait_for_selector': str(state.get('wait_for_selector') or '').strip() or None,
        'reference': str(state.get('requested_reference') or state.get('reference') or '').strip() or None,
        'verification_mode': str(state.get('verification_mode') or '').strip().lower() or None,
        'target_image_url': str(state.get('target_image_url') or '').strip() or None,
        'target_image_hash': str(state.get('target_image_hash') or '').strip() or None,
        'viewport_matrix': state.get('viewport_matrix'),
        'deterministic_setup': state.get('deterministic_setup'),
        'assertions': state.get('parsed_assertions'),
        'capture_script_hash': sha256_text(state.get('capture_script')),
    }
    return {key: value for key, value in basis.items() if value is not None}


def visual_session_fingerprint_from_basis(basis):
    return hashlib.sha256(stable_json(basis).encode('utf-8')).hexdigest()


def visual_session_fingerprint(state, route=''):
    return visual_session_fingerprint_from_basis(visual_session_fingerprint_basis(state, route=route))


def proof_session_mismatches(state, session, route=''):
    if not isinstance(session, dict):
        return []
    expected = session.get('fingerprint_basis') if isinstance(session.get('fingerprint_basis'), dict) else {}
    actual = visual_session_fingerprint_basis(state, route=route)
    keys = sorted(set(expected.keys()) | set(actual.keys()))
    mismatches = []
    for key in keys:
        if stable_json(expected.get(key)) != stable_json(actual.get(key)):
            mismatches.append({
                'key': key,
                'expected': expected.get(key),
                'actual': actual.get(key),
            })
    return mismatches


def validate_proof_session_resume(state, route=''):
    session = state.get('parent_proof_session')
    if not isinstance(session, dict):
        return {'status': 'not_requested'}
    mismatches = proof_session_mismatches(state, session, route=route)
    if mismatches:
        state['proof_session_resume'] = {
            'status': 'fingerprint_mismatch',
            'parent_session_id': session.get('session_id'),
            'parent_fingerprint': session.get('fingerprint'),
            'mismatches': mismatches,
        }
        raise SystemExit(
            'resume_session fingerprint mismatch: ' +
            ', '.join(item['key'] for item in mismatches[:8])
        )
    state['proof_session_resume'] = {
        'status': 'accepted',
        'parent_session_id': session.get('session_id'),
        'parent_fingerprint': session.get('fingerprint'),
        'fingerprint': visual_session_fingerprint(state, route=route),
    }
    return state['proof_session_resume']


def capture_proof_session_seed(state, route=''):
    parent = state.get('parent_proof_session') if isinstance(state.get('parent_proof_session'), dict) else {}
    basis = visual_session_fingerprint_basis(state, route=route)
    return {
        'version': PROOF_SESSION_VERSION,
        'session_kind': 'capture-seed',
        'run_id': str(state.get('run_id') or '').strip(),
        'parent_session_id': parent.get('session_id') or None,
        'parent_fingerprint': parent.get('fingerprint') or None,
        'fingerprint': visual_session_fingerprint_from_basis(basis),
        'fingerprint_basis': basis,
        'repo': str(state.get('repo') or '').strip(),
        'route': {'path': str(route or state.get('server_path') or '').strip()},
        'reference': str(state.get('requested_reference') or state.get('reference') or '').strip(),
        'verification_mode': str(state.get('verification_mode') or '').strip(),
        'target_image': {
            'url': str(state.get('target_image_url') or '').strip(),
            'hash': str(state.get('target_image_hash') or '').strip(),
        },
        'viewport_matrix': state.get('viewport_matrix'),
        'deterministic_setup': state.get('deterministic_setup'),
        'capture': {
            'proof_plan': str(state.get('proof_plan') or '').strip(),
            'capture_script': str(state.get('capture_script') or '').strip(),
            'wait_for_selector': str(state.get('wait_for_selector') or '').strip(),
        },
        'assertions': state.get('parsed_assertions'),
    }


def proof_session_output_url(payload):
    item = capture_output_item(payload, 'proof-session.json') or capture_output_item(payload, 'proof-session')
    return (item or {}).get('url', '') if item else ''


def build_visual_proof_session(state, route='', observed_after_path='', artifacts=None, evidence=None, status=''):
    parent = state.get('parent_proof_session') if isinstance(state.get('parent_proof_session'), dict) else {}
    basis = visual_session_fingerprint_basis(state, route=route)
    session_id = 'rps_' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '_' + hashlib.sha1(os.urandom(16)).hexdigest()[:8]
    return {
        'version': PROOF_SESSION_VERSION,
        'session_id': session_id,
        'run_id': str(state.get('run_id') or '').strip(),
        'parent_session_id': parent.get('session_id') or None,
        'parent_fingerprint': parent.get('fingerprint') or None,
        'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'fingerprint': visual_session_fingerprint_from_basis(basis),
        'fingerprint_basis': basis,
        'repo': str(state.get('repo') or '').strip(),
        'branch': str(state.get('branch') or state.get('target_branch') or '').strip(),
        'route': {
            'path': str(route or state.get('server_path') or '').strip(),
            'observed_after_path': str(observed_after_path or '').strip(),
        },
        'reference': str(state.get('requested_reference') or state.get('reference') or '').strip(),
        'verification_mode': str(state.get('verification_mode') or '').strip(),
        'target_image': {
            'url': str(state.get('target_image_url') or '').strip(),
            'hash': str(state.get('target_image_hash') or '').strip(),
        },
        'viewport_matrix': state.get('viewport_matrix'),
        'deterministic_setup': state.get('deterministic_setup'),
        'capture': {
            'proof_plan': str(state.get('proof_plan') or '').strip(),
            'capture_script': str(state.get('capture_script') or '').strip(),
            'wait_for_selector': str(state.get('wait_for_selector') or '').strip(),
        },
        'assertions': state.get('parsed_assertions'),
        'artifacts': artifacts or {},
        'evidence': evidence or {},
        'status': status,
    }


def redact_for_diagnostics(value):
    if isinstance(value, dict):
        redacted = {}
        for key, child in value.items():
            normalized = ''.join(ch for ch in str(key).lower() if ch.isalnum() or ch == '_')
            if any(fragment.replace('_', '') in normalized.replace('_', '') for fragment in SENSITIVE_KEY_FRAGMENTS):
                redacted[key] = '[redacted]'
            else:
                redacted[key] = redact_for_diagnostics(child)
        return redacted
    if isinstance(value, list):
        return [redact_for_diagnostics(child) for child in value[:50]]
    return compact_debug_value(value)


def capture_diagnostic(label, tool, args, payload):
    payload = payload if isinstance(payload, dict) else {'raw': payload}
    return {
        'version': CAPTURE_DIAGNOSTIC_VERSION,
        'label': label,
        'tool': tool,
        'captured_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'ok': payload.get('ok'),
        'timeout': bool(payload.get('timeout')),
        'error': compact_debug_value(str(payload.get('error') or payload.get('stderr') or '')),
        'args': redact_for_diagnostics({} if args is None else args),
        'artifact_summary': summarize_capture_artifacts(payload),
    }


def append_capture_diagnostic(state, label, tool, args, payload):
    diagnostics = list(state.get('capture_diagnostics') or [])
    diagnostics.append(capture_diagnostic(label, tool, args, payload))
    state['capture_diagnostics'] = diagnostics[-20:]
    return state['capture_diagnostics'][-1]


def truthy(value):
    return str(value or '').strip().lower() in ('1', 'true', 'yes', 'y', 'on')


def has_auth_context(state):
    return bool(
        truthy(state.get('use_auth'))
        or state.get('auth_localStorage')
        or state.get('auth_cookies')
        or state.get('auth_headers')
    )


def apply_auth_context(state, args):
    if state.get('auth_localStorage'):
        args['localStorage'] = state['auth_localStorage']
    if state.get('auth_cookies'):
        args['cookies'] = state['auth_cookies']
    if state.get('auth_headers'):
        args['headers'] = state['auth_headers']
    return args


def direct_riddle_enabled():
    return os.environ.get('RIDDLE_PROOF_DIRECT_RIDDLE', '1').lower() not in ('0', 'false', 'no')


def nested_riddle_fallback_enabled():
    return os.environ.get('RIDDLE_PROOF_ALLOW_NESTED_RIDDLE', '').lower() in ('1', 'true', 'yes')


def nested_non_riddle_enabled():
    return os.environ.get('RIDDLE_PROOF_ALLOW_NESTED_NON_RIDDLE', '').lower() in ('1', 'true', 'yes')


def invoke_riddle_core(tool, args, timeout=180):
    """Call Riddle's shared core package directly, without nested OpenClaw tool invocation."""
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'riddle_core_call.mjs')
    try:
        r = sp.run(
            ['node', script, tool, json.dumps(args)],
            capture_output=True, text=True, timeout=timeout
        )
    except sp.TimeoutExpired as e:
        print('direct_riddle(' + tool + ') TIMED OUT after ' + str(timeout) + 's')
        if e.stdout:
            print('  stdout: ' + e.stdout[:500])
        if e.stderr:
            print('  stderr: ' + e.stderr[:500])
        return {
            'ok': False,
            'timeout': True,
            'error': f'direct_riddle({tool}) timed out after {timeout}s',
            'stdout': (e.stdout or '')[:500],
            'stderr': (e.stderr or '')[:500],
        }

    if r.returncode != 0:
        print('direct_riddle(' + tool + ') FAILED rc=' + str(r.returncode))
        print('  stdout: ' + r.stdout[:500])
        print('  stderr: ' + r.stderr[:500])

    try:
        return json.loads(r.stdout)
    except:
        print('direct_riddle(' + tool + ') JSON parse failed')
        print('  stdout: ' + r.stdout[:500])
        print('  stderr: ' + r.stderr[:500])
        return {'ok': False, 'error': r.stdout[:300], 'stderr': r.stderr[:300]}


def invoke(tool, args, timeout=180):
    """Call an OpenClaw tool via openclaw.invoke CLI."""
    if tool in RIDDLE_DIRECT_TOOLS and direct_riddle_enabled():
        result = invoke_riddle_core(tool, args, timeout=timeout)
        if result.get('ok') or not nested_riddle_fallback_enabled():
            return result
        print('direct_riddle(' + tool + ') failed; falling back to openclaw.invoke because RIDDLE_PROOF_ALLOW_NESTED_RIDDLE is set.')

    if tool not in RIDDLE_DIRECT_TOOLS and not nested_non_riddle_enabled():
        return {
            'ok': False,
            'error': (
                'Nested OpenClaw tool invocation is disabled for ' + tool +
                '. Set RIDDLE_PROOF_ALLOW_NESTED_NON_RIDDLE=1 only if this workflow intentionally needs another plugin.'
            ),
        }

    try:
        r = sp.run(
            ['openclaw.invoke', '--tool', tool, '--args-json', json.dumps(args)],
            capture_output=True, text=True, timeout=timeout
        )
    except sp.TimeoutExpired as e:
        print('invoke(' + tool + ') TIMED OUT after ' + str(timeout) + 's')
        if e.stdout:
            print('  stdout: ' + e.stdout[:500])
        if e.stderr:
            print('  stderr: ' + e.stderr[:500])
        return {
            'ok': False,
            'timeout': True,
            'error': f'invoke({tool}) timed out after {timeout}s',
            'stdout': (e.stdout or '')[:500],
            'stderr': (e.stderr or '')[:500],
        }
    if r.returncode != 0:
        print('invoke(' + tool + ') FAILED rc=' + str(r.returncode))
        print('  stdout: ' + r.stdout[:500])
        print('  stderr: ' + r.stderr[:500])
    try:
        outer = json.loads(r.stdout)
        if 'result' in outer and 'content' in outer['result']:
            for c in outer['result']['content']:
                if c.get('type') == 'text':
                    try:
                        return json.loads(c['text'])
                    except:
                        return {'ok': True, 'raw': c['text']}
        return outer
    except:
        print('invoke(' + tool + ') JSON parse failed')
        print('  stdout: ' + r.stdout[:500])
        print('  stderr: ' + r.stderr[:500])
        return {'ok': False, 'error': r.stdout[:300], 'stderr': r.stderr[:300]}


def invoke_retry(tool, args, retries=3, timeout=180):
    """Call an OpenClaw tool with automatic retries on failure."""
    last_result = None
    for attempt in range(1, retries + 1):
        result = invoke(tool, args, timeout=timeout)
        last_result = result
        # Check for success indicators
        if result.get('ok') or result.get('outputs') or result.get('screenshots'):
            return result
        print(f'invoke_retry({tool}) attempt {attempt}/{retries} failed: {str(result.get("error", "no output"))[:200]}')
        if attempt < retries:
            import time
            time.sleep(5)
    print(f'invoke_retry({tool}) all {retries} attempts failed')
    return last_result or {'ok': False, 'error': 'all retries exhausted'}


def capture_output_item(payload, name):
    if not isinstance(payload, dict):
        return None
    for item in payload.get('outputs') or []:
        if isinstance(item, dict) and item.get('name') == name and item.get('url'):
            return item
    return None


def fetch_json_artifact(url, max_bytes=CAPTURE_ARTIFACT_JSON_LIMIT):
    if not str(url or '').startswith(('http://', 'https://')):
        return None, 'unsupported artifact url'
    if url in _JSON_ARTIFACT_CACHE:
        return _JSON_ARTIFACT_CACHE[url]
    try:
        with urlopen(url, timeout=15) as response:
            data = response.read(max_bytes + 1)
    except Exception as e:
        result = (None, type(e).__name__ + ': ' + str(e))
        _JSON_ARTIFACT_CACHE[url] = result
        return result
    if len(data) > max_bytes:
        result = (None, 'artifact exceeds ' + str(max_bytes) + ' bytes')
        _JSON_ARTIFACT_CACHE[url] = result
        return result
    try:
        result = (json.loads(data.decode('utf-8')), '')
    except Exception as e:
        result = (None, 'json parse failed: ' + str(e))
    _JSON_ARTIFACT_CACHE[url] = result
    return result


def enrich_capture_payload(payload):
    """Attach JSON artifacts that Riddle previews return as URLs instead of inline data."""
    if not isinstance(payload, dict):
        return payload
    enriched = dict(payload)
    artifact_json = dict(enriched.get('_artifact_json') or {})
    artifact_errors = dict(enriched.get('_artifact_errors') or {})

    for name in ('console.json', 'proof.json'):
        if name in artifact_json or name in artifact_errors:
            continue
        item = capture_output_item(enriched, name)
        if not item:
            continue
        data, error = fetch_json_artifact(item.get('url', ''))
        if error:
            artifact_errors[name] = error
        elif data is not None:
            artifact_json[name] = data

    if artifact_json:
        enriched['_artifact_json'] = artifact_json
    if artifact_errors:
        enriched['_artifact_errors'] = artifact_errors

    console_json = artifact_json.get('console.json')
    if console_json is not None and not enriched.get('console'):
        enriched['console'] = console_json

    proof_json = artifact_json.get('proof.json')
    if isinstance(proof_json, dict):
        enriched['_proof_json'] = proof_json
        if not enriched.get('result'):
            for key in ('result', 'script_result', 'return_value', 'value'):
                result = proof_json.get(key)
                if isinstance(result, dict):
                    enriched['result'] = result
                    break

    return enriched


def summarize_capture_artifacts(payload):
    if not isinstance(payload, dict):
        return {}
    enriched = enrich_capture_payload(payload)
    proof_json = enriched.get('_proof_json') or {}
    console_json = (enriched.get('_artifact_json') or {}).get('console.json')
    result = enriched.get('result') if isinstance(enriched.get('result'), dict) else {}
    return {
        'outputs': [
            {'name': item.get('name', ''), 'url': item.get('url', '')}
            for item in (enriched.get('outputs') or [])
            if isinstance(item, dict)
        ][:20],
        'screenshots': [
            {'name': item.get('name', ''), 'url': item.get('url', '')}
            for item in (enriched.get('screenshots') or [])
            if isinstance(item, dict)
        ][:10],
        'artifacts': [
            summarize_capture_artifact_item(item)
            for item in (enriched.get('artifacts') or [])
            if isinstance(item, dict)
        ][:20],
        'result_keys': sorted(result.keys()),
        'artifact_json': sorted((enriched.get('_artifact_json') or {}).keys()),
        'artifact_errors': dict(enriched.get('_artifact_errors') or {}),
        'proof_script_error': bool(isinstance(proof_json, dict) and proof_json.get('script_error')),
        'console_summary': console_json.get('summary', {}) if isinstance(console_json, dict) else {},
    }


def summarize_capture_artifact_item(item):
    summary = {
        'name': item.get('name', ''),
        'kind': item.get('kind'),
        'role': item.get('role'),
        'url': item.get('url'),
        'path': item.get('path'),
        'content_type': item.get('content_type'),
        'size_bytes': item.get('size_bytes'),
        'source': 'artifacts',
    }
    metadata = item.get('metadata')
    if isinstance(metadata, dict):
        summary['metadata_keys'] = sorted(metadata.keys())
    return {key: value for key, value in summary.items() if value not in (None, '')}


def git(cmd, cwd):
    """Run a shell command in a repo directory."""
    return sp.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)


def run_project_build(project_dir, build_cmd, timeout=600, clean_cache_dir='.next'):
    """Build once with existing cache, then retry clean if the cached build fails."""
    attempts = []
    for clean_first in (False, True):
        if clean_first and clean_cache_dir:
            cache_path = os.path.join(project_dir, clean_cache_dir)
            if os.path.exists(cache_path):
                sp.run(
                    'rm -rf ' + shell_quote(clean_cache_dir),
                    shell=True,
                    cwd=project_dir,
                    capture_output=True,
                    text=True,
                )
        result = sp.run(build_cmd, shell=True, cwd=project_dir, capture_output=True, text=True, timeout=timeout)
        attempts.append({
            'clean_first': clean_first,
            'returncode': int(result.returncode),
            'stderr': (result.stderr or '')[:500],
        })
        if result.returncode == 0:
            return {
                'result': result,
                'clean_retry_used': clean_first,
                'attempts': attempts,
            }
        if not clean_cache_dir or clean_first:
            break
    return {
        'result': result,
        'clean_retry_used': False,
        'attempts': attempts,
    }


def load_package_json(project_dir):
    package_json = os.path.join(project_dir, 'package.json')
    if not os.path.exists(package_json):
        return {}
    try:
        with open(package_json) as f:
            return json.load(f)
    except:
        return {}


def truthy(value):
    return str(value or '').strip().lower() in ('1', 'true', 'yes', 'y', 'on')


def should_use_static_preview(project_dir, state):
    if not truthy(state.get('allow_static_preview_fallback')):
        return ''

    build_dir = detect_static_build_dir(project_dir, state)
    if not os.path.exists(os.path.join(build_dir, 'index.html')):
        return ''
    if os.path.exists(os.path.join(project_dir, '.next', 'standalone', 'server.js')):
        return ''

    pkg = load_package_json(project_dir)
    scripts = pkg.get('scripts') or {}
    start_cmd = ' '.join(str(scripts.get(k, '')).lower() for k in ('start', 'preview', 'dev'))
    if 'vite' in start_cmd:
        return 'package.json scripts indicate a Vite static app'
    if 'react-scripts' in start_cmd:
        return 'package.json scripts indicate a static SPA preview'
    if os.path.exists(os.path.join(project_dir, 'server.js')):
        return ''
    server_command = str(state.get('server_command') or '').lower()
    if 'vite' in server_command:
        return 'configured server command points at Vite rather than a standalone server'
    return ''


def capture_script_saves_screenshot(capture_script):
    return 'saveScreenshot' in (capture_script or '')


def join_url_path(base_url, target_path=''):
    base = (base_url or '').strip()
    path = (target_path or '').strip()
    if not path or path == '/':
        return base
    if not base:
        return path
    return urljoin(base.rstrip('/') + '/', path.lstrip('/'))


def build_capture_script(url, capture_script, label, wait_for_selector=''):
    pieces = [
        'await page.goto(' + json.dumps(url) + ');',
    ]
    selector = (wait_for_selector or '').strip()
    if selector:
        pieces.append('await page.waitForSelector(' + json.dumps(selector) + ');')
    pieces.append('await page.waitForTimeout(1500);')
    if (capture_script or '').strip():
        pieces.append((capture_script or '').strip().rstrip(';') + ';')
    if not capture_script_saves_screenshot(capture_script):
        pieces.append('await saveScreenshot(' + json.dumps(label) + ');')
    return ' '.join(pieces)


def capture_static_preview(state, project_dir, label, capture_script, timeout=300, target_path=''):
    build_dir = detect_static_build_dir(project_dir, state)
    if not build_dir:
        return {
            'ok': False,
            'preview_id': '',
            'preview_url': '',
            'url': '',
            'raw': {'ok': False, 'error': 'No static build output found. Tried configured build_output, dist, build, out.'},
        }

    preview = invoke_retry('riddle_preview', {'directory': build_dir, 'label': label}, retries=3, timeout=timeout)
    if not preview.get('ok'):
        return {
            'ok': False,
            'preview_id': preview.get('id', ''),
            'preview_url': preview.get('preview_url') or preview.get('previewUrl') or '',
            'url': '',
            'raw': preview,
        }
    preview_url = preview.get('preview_url') or preview.get('previewUrl') or ''
    preview_id = preview.get('id', '')
    capture_url = join_url_path(preview_url, target_path or state.get('server_path', ''))

    script = build_capture_script(capture_url, capture_script, label, state.get('wait_for_selector', ''))
    args = {'script': script, 'timeout_sec': 60}
    apply_auth_context(state, args)
    shot = invoke_retry('riddle_script', args, retries=3, timeout=max(timeout, 120))
    screenshots = shot.get('screenshots') or []
    url = screenshots[0].get('url', '') if screenshots else ''
    return {
        'ok': bool(url),
        'preview_id': preview_id,
        'preview_url': preview_url,
        'capture_url': capture_url,
        'url': url,
        'raw': {
            'preview': preview,
            'capture': shot,
        },
    }


def shell_quote(value):
    return shlex.quote(str(value))


def detect_static_build_dir(project_dir, state):
    candidates = []
    configured = (state.get('build_output') or '').strip()
    if configured:
        candidates.append(configured)
    candidates += ['dist', 'build', 'out']

    seen = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        build_dir = candidate if os.path.isabs(candidate) else os.path.join(project_dir, candidate)
        if os.path.exists(os.path.join(build_dir, 'index.html')):
            return build_dir
    return ''


def is_vite_project(project_dir):
    pkg = load_package_json(project_dir)
    scripts = pkg.get('scripts') or {}
    script_text = ' '.join(str(v).lower() for v in scripts.values())
    if 'vite' in script_text:
        return True
    for name in ('vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.cjs'):
        if os.path.exists(os.path.join(project_dir, name)):
            return True
    return False


def write_static_spa_server(build_dir):
    server_path = os.path.join(build_dir, 'riddle-proof-server.js')
    server_code = r"""const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOSTNAME || '0.0.0.0';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

function sendFile(res, filePath) {
  res.setHeader('Content-Type', types[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(filePath)
    .on('error', () => {
      res.statusCode = 500;
      res.end('Failed to read file');
    })
    .pipe(res);
}

function safePathFromParts(parts) {
  const filePath = path.join(root, ...parts);
  return filePath.startsWith(root) ? filePath : '';
}

function resolveStaticPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const candidates = [safePathFromParts(parts)];
  for (let i = 1; i < parts.length; i += 1) {
    candidates.push(safePathFromParts(parts.slice(i)));
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) {
        const indexPath = path.join(candidate, 'index.html');
        if (fs.existsSync(indexPath)) return indexPath;
      }
      if (stat.isFile()) return candidate;
    } catch (_) {
      // Try the next stripped base-path candidate before falling back to the SPA shell.
    }
  }
  return '';
}

http.createServer((req, res) => {
  const parsed = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(parsed.pathname || '/');
  const filePath = resolveStaticPath(pathname);
  if (filePath && !filePath.startsWith(root)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  if (filePath) {
    sendFile(res, filePath);
    return;
  }
  sendFile(res, path.join(root, 'index.html'));
}).listen(port, host, () => {
  console.log(`riddle-proof static server listening on http://${host}:${port}`);
});
"""
    with open(server_path, 'w') as f:
        f.write(server_code)
    return server_path


def find_next_standalone_dir(project_dir):
    standalone = os.path.join(project_dir, '.next', 'standalone')
    if not os.path.exists(standalone):
        return ''

    if os.path.exists(os.path.join(standalone, 'server.js')):
        return standalone

    for d in os.listdir(standalone):
        candidate = os.path.join(standalone, d)
        if os.path.exists(os.path.join(candidate, 'server.js')):
            return candidate
    return ''


def prepare_server_preview(project_dir, state):
    """Return (directory, command, exclude) for riddle_server_preview after build."""
    standalone = find_next_standalone_dir(project_dir)
    if standalone:
        sp.run(
            'cp -r ' + shell_quote(os.path.join(project_dir, '.next', 'static')) + ' ' + shell_quote(os.path.join(standalone, '.next', 'static')),
            shell=True,
            capture_output=True,
        )
        sp.run(
            'cp -r ' + shell_quote(os.path.join(project_dir, 'public')) + ' ' + shell_quote(os.path.join(standalone, 'public')) + ' 2>/dev/null',
            shell=True,
            capture_output=True,
        )
        return standalone, 'node server.js', ['.git', '*.log']

    if is_vite_project(project_dir):
        build_dir = detect_static_build_dir(project_dir, state)
        if build_dir:
            write_static_spa_server(build_dir)
            return build_dir, 'node riddle-proof-server.js', ['.git', '*.log', 'node_modules']

    return project_dir, state['server_command'], ['.git', '*.log', 'node_modules']


def prepare_standalone(project_dir):
    """Prepare Next.js standalone dir. Returns the correct build dir path.

    Next.js standalone output may nest under a subdir matching the project
    folder name (e.g. .next/standalone/my-project/server.js). This finds
    the right dir and copies static assets + public into it.
    """
    standalone = project_dir + '/.next/standalone'
    if not os.path.exists(standalone):
        return project_dir

    # Find the dir containing server.js
    if not os.path.exists(standalone + '/server.js'):
        for d in os.listdir(standalone):
            candidate = standalone + '/' + d + '/server.js'
            if os.path.exists(candidate):
                standalone = standalone + '/' + d
                break

    if not os.path.exists(standalone + '/server.js'):
        return project_dir

    # Copy static assets
    sp.run('cp -r ' + project_dir + '/.next/static ' + standalone + '/.next/static',
           shell=True, capture_output=True)
    sp.run('cp -r ' + project_dir + '/public ' + standalone + '/public 2>/dev/null',
           shell=True, capture_output=True)

    # Standalone requires 'node server.js', not 'npm start' / 'next start'
    # Update state if loaded
    try:
        if os.path.exists(STATE_FILE):
            s = json.load(open(STATE_FILE))
            if s.get('server_command') in ('npm start', 'next start'):
                s['server_command'] = 'node server.js'
                json.dump(s, open(STATE_FILE, 'w'), indent=2)
    except:
        pass

    return standalone
