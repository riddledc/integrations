"""Recon: capture baseline evidence with bounded, agent-guided replanning.

Recon now follows an explicit loop:
1. derive the current capture plan from persisted state
2. capture the requested baselines once with that plan
3. evaluate the observation packet
4. either finalize recon or checkpoint for the calling agent to choose the next plan

The calling agent owns the planner step between attempts by resuming the workflow
with updated state inputs such as server_path or wait_for_selector.
"""

import json, os, re, sys
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import (  # noqa: E402
    append_capture_diagnostic,
    apply_auth_context,
    build_capture_script,
    capture_static_preview,
    enrich_capture_payload,
    has_auth_context,
    invoke_retry,
    load_state,
    prepare_server_preview,
    save_state,
    should_use_static_preview,
    summarize_capture_artifacts,
)
import subprocess as sp

MAX_RECON_ATTEMPTS = 4
MIN_BODY_TEXT_LENGTH = 50
MIN_INTERACTIVE_ELEMENTS = 1
HYDRATION_WAIT_MS = 1500
PAGE_STATE_PREFIX = 'RIDDLE_PROOF_STATE:'
PROOF_EVIDENCE_PREFIX = 'RIDDLE_PROOF_EVIDENCE:'

s = load_state()
after_dir = (s.get('after_worktree') or '').strip()
before_dir = (s.get('before_worktree') or '').strip()
if not after_dir or not os.path.exists(after_dir):
    raise SystemExit('after_worktree not found. Run setup first.')


def run(cmd, cwd, timeout=30):
    return sp.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def read_json(path):
    if not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def detect_framework(pkg):
    deps = {}
    for key in ('dependencies', 'devDependencies'):
        deps.update(pkg.get(key, {}))
    if 'next' in deps:
        return 'next'
    if 'react-router-dom' in deps or 'react-router' in deps:
        return 'react-router'
    if 'vite' in deps:
        return 'vite'
    if 'react' in deps:
        return 'react'
    return 'unknown'


def extract_tokens(change_request):
    stop = {
        'the', 'and', 'with', 'that', 'this', 'have', 'more', 'mainly', 'into',
        'from', 'your', 'then', 'than', 'just', 'make', 'need', 'want', 'test',
        'end', 'proof', 'run', 'tweak', 'fix', 'issue', 'page', 'view'
    }
    out = []
    for word in re.findall(r'[a-z0-9]+', (change_request or '').lower()):
        if len(word) < 4 or word in stop or word in out:
            continue
        out.append(word)
    return out[:6]


EXCLUDED_DIRS = {
    '.git', '.next', '.turbo', '.cache', '.vercel', 'coverage', 'dist', 'build',
    'node_modules', 'out', 'storybook-static', 'vendor',
}
SOURCE_EXTENSIONS = {
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte',
    '.html', '.css', '.scss', '.mdx',
}
SOURCE_ROOTS = ('src', 'app', 'pages', 'components', 'routes')
ROUTE_LITERAL_PATTERNS = [
    re.compile(r'\b(?:path|to|href)\s*=\s*\{\s*["\']([^"\']+)["\']\s*\}'),
    re.compile(r'\b(?:path|to|href)\s*=\s*["\']([^"\']+)["\']'),
    re.compile(r'\b(?:path|to|href)\s*:\s*["\']([^"\']+)["\']'),
    re.compile(r'\bnavigate\s*\(\s*["\']([^"\']+)["\']'),
]


def iter_source_lines(root, max_files=500, max_bytes=512 * 1024):
    roots = []
    for name in SOURCE_ROOTS:
        probe = os.path.join(root, name)
        if os.path.exists(probe):
            roots.append(probe)
    if not roots:
        roots = [root]

    seen = set()
    files_seen = 0
    for start in roots:
        for dirpath, dirnames, filenames in os.walk(start):
            dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIRS and not d.startswith('.')]
            for filename in filenames:
                if files_seen >= max_files:
                    return
                _, ext = os.path.splitext(filename)
                if ext not in SOURCE_EXTENSIONS and not filename.lower().startswith(('app.', 'routes')):
                    continue
                probe = os.path.join(dirpath, filename)
                if probe in seen:
                    continue
                seen.add(probe)
                try:
                    if os.path.getsize(probe) > max_bytes:
                        continue
                    with open(probe, errors='ignore') as handle:
                        for line_no, line in enumerate(handle, 1):
                            yield os.path.relpath(probe, root), line_no, line.rstrip()
                    files_seen += 1
                except Exception:
                    continue


def normalize_route_literal(candidate):
    item = (candidate or '').strip()
    if not item or item.startswith(('http://', 'https://', '#', 'mailto:', 'tel:', '//')):
        return ''
    if not item.startswith('/'):
        return ''
    return item


def extract_route_literals(line):
    routes = []
    for pattern in ROUTE_LITERAL_PATTERNS:
        for match in pattern.findall(line or ''):
            route = normalize_route_literal(match)
            if route and route not in routes:
                routes.append(route)
    return routes


def collect_route_hints(root):
    hints = []
    route_marker_re = re.compile(r'createBrowserRouter|createRoutesFromElements|<Route\b|\bpath\s*:')
    for rel_path, line_no, line in iter_source_lines(root):
        route_literals = extract_route_literals(line)
        if not (route_literals or route_marker_re.search(line)):
            continue
        hint = f'{rel_path}:{line_no}:{line.strip()[:240]}'
        if hint not in hints:
            hints.append(hint)
        if len(hints) >= 12:
            return hints
    return hints


def collect_keyword_hits(root, tokens):
    hits = []
    for token in tokens:
        token_lower = token.lower()
        token_hits = 0
        for rel_path, line_no, line in iter_source_lines(root):
            if token_lower not in line.lower():
                continue
            hit = f'{rel_path}:{line_no}:{line.strip()[:240]}'
            if hit not in hits:
                hits.append(hit)
                token_hits += 1
            if len(hits) >= 18:
                return hits
            if token_hits >= 6:
                break
    return hits


def route_candidates(route_hints, prod_url=''):
    candidates = []

    def add(candidate, reason):
        item = (candidate or '').strip()
        if not item or not item.startswith('/'):
            return
        if item.startswith(('/src/', '/app/', '/pages/', '/components/', '/routes/', '/assets/', '/public/')):
            return
        if any(item.endswith(ext) for ext in ('.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.png', '.jpg', '.svg', '.json')):
            return
        if item not in [x['path'] for x in candidates]:
            candidates.append({'path': item, 'reason': reason})

    parsed_prod = urlparse((prod_url or '').strip())
    if parsed_prod.path and parsed_prod.path.strip() and parsed_prod.path != '/':
        add(parsed_prod.path, 'prod_url path')

    for hint in route_hints:
        code_fragment = hint.split(':', 2)[-1]
        for route in extract_route_literals(code_fragment):
            add(route, 'route literal')
            if len(candidates) >= 8:
                return candidates

    add('/', 'fallback root')
    return candidates


def score_route_candidate(path, tokens):
    if not tokens:
        return 0
    path_lower = (path or '').lower()
    compact_path = re.sub(r'[^a-z0-9]+', '', path_lower)
    score = 0
    for token in tokens:
        token_lower = token.lower()
        compact_token = re.sub(r'[^a-z0-9]+', '', token_lower)
        if not compact_token:
            continue
        if token_lower in path_lower or compact_token in compact_path:
            score += 4
        elif compact_path in compact_token and len(compact_path) > 4:
            score += 2
    if path == '/':
        score -= 1
    return score


def choose_target_path(explicit_path, prod_url, route_hints, tokens=None, explicit_source=''):
    explicit = (explicit_path or '').strip()
    explicit_source = (explicit_source or '').strip()
    is_meaningful_explicit = bool(explicit) and (explicit != '/' or bool(explicit_source))
    if is_meaningful_explicit:
        return explicit if explicit.startswith('/') else '/' + explicit
    candidates = route_candidates(route_hints, prod_url)
    if candidates:
        scored = sorted(
            candidates,
            key=lambda item: (score_route_candidate(item.get('path', ''), tokens or []), -candidates.index(item)),
            reverse=True,
        )
        if scored and score_route_candidate(scored[0].get('path', ''), tokens or []) > 0:
            return scored[0]['path']
        non_root = [candidate for candidate in candidates if candidate.get('path') != '/']
        if len(non_root) == 1:
            return non_root[0]['path']
        for candidate in candidates:
            if candidate.get('path') == '/':
                return '/'
        return candidates[0]['path']
    return '/'


def detect_static_reason(project_dir, state):
    return should_use_static_preview(project_dir, state) if state.get('mode', 'server') == 'server' else ''


def extract_screenshot_url(payload, preferred_label=''):
    preferred_names = []
    label = (preferred_label or '').strip()
    if label:
        preferred_names = [
            label,
            label + '.png',
            label + '.jpg',
            label + '.jpeg',
            label + '.webp',
        ]
    outputs = payload.get('outputs') or []
    for item in outputs:
        name = item.get('name', '')
        if name in preferred_names and 'error' not in name:
            return item.get('url', '')
    for item in outputs:
        name = item.get('name', '')
        if name.endswith(('.png', '.jpg', '.jpeg', '.webp')) and 'error' not in name:
            return item.get('url', '')
    screenshots = payload.get('screenshots') or []
    for item in screenshots:
        name = item.get('name', '')
        if name in preferred_names and 'error' not in name:
            return item.get('url', '')
    if screenshots:
        return screenshots[0].get('url', '')
    return ''


def iter_console_messages(console):
    if isinstance(console, list):
        for entry in console:
            if isinstance(entry, str):
                yield entry
            elif isinstance(entry, dict):
                text = entry.get('text') or entry.get('message') or ''
                if isinstance(text, str):
                    yield text
        return

    if isinstance(console, dict):
        entries = console.get('entries') or {}
        if isinstance(entries, dict):
            for bucket in ('log', 'info', 'warn', 'error'):
                values = entries.get(bucket) or []
                if not isinstance(values, list):
                    continue
                for entry in values:
                    if isinstance(entry, str):
                        yield entry
                    elif isinstance(entry, dict):
                        text = entry.get('text') or entry.get('message') or ''
                        if isinstance(text, str):
                            yield text


def is_proof_telemetry_console_message(text):
    return isinstance(text, str) and (
        text.startswith(PAGE_STATE_PREFIX)
        or text.startswith(PROOF_EVIDENCE_PREFIX)
    )


def extract_page_state(payload):
    for text in iter_console_messages(payload.get('console') or []):
        if isinstance(text, str) and text.startswith(PAGE_STATE_PREFIX):
            try:
                return json.loads(text[len(PAGE_STATE_PREFIX):])
            except Exception:
                continue
    result = payload.get('result') or {}
    if isinstance(result, dict):
        page_state = result.get('pageState')
        if isinstance(page_state, dict):
            return page_state
    return None


def list_value(value):
    return value if isinstance(value, list) else []


def semantic_anchor_count(page_state):
    if not isinstance(page_state, dict):
        return 0
    headings = [item for item in list_value(page_state.get('headings')) if str(item).strip()]
    buttons = [item for item in list_value(page_state.get('buttons')) if str(item).strip()]
    links = [
        item for item in list_value(page_state.get('links'))
        if isinstance(item, dict) and (str(item.get('text') or '').strip() or str(item.get('href') or '').strip())
    ]
    large = [
        item for item in list_value(page_state.get('largeVisibleElements'))
        if isinstance(item, dict) and (str(item.get('text') or '').strip() or item.get('tag') == 'canvas')
    ]
    return len(headings) + len(buttons) + len(links) + len(large) + int(page_state.get('canvasCount') or 0)


def has_enriched_page_state(page_state):
    return isinstance(page_state, dict) and any(
        key in page_state
        for key in ('visibleTextSample', 'headings', 'buttons', 'links', 'canvasCount', 'largeVisibleElements')
    )


def normalize_observed_path(value):
    path = (value or '').strip()
    if not path:
        return ''
    path = path.split('?', 1)[0].split('#', 1)[0]
    if not path.startswith('/'):
        parsed = urlparse(path)
        path = parsed.path or path
    parts = path.split('/')
    if len(parts) >= 4 and parts[1] == 's':
        path = '/' + '/'.join(parts[3:])
    return path.rstrip('/') or '/'


def build_probe_capture_script(base_script='', screenshot_label=''):
    pieces = []
    script = (base_script or '').strip()
    if script:
        pieces.append(script.rstrip(';') + ';')
    pieces.extend([
        f'await page.waitForTimeout({HYDRATION_WAIT_MS});',
        'const pageState = await page.evaluate(() => {',
        '  const textOf = (el) => ((el && el.innerText) || (el && el.textContent) || "").replace(/\\s+/g, " ").trim();',
        '  const isVisible = (el) => {',
        '    if (!el || !el.getBoundingClientRect) return false;',
        '    const rect = el.getBoundingClientRect();',
        '    const style = window.getComputedStyle(el);',
        '    return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none";',
        '  };',
        '  const textList = (selector, limit) => Array.from(document.querySelectorAll(selector)).filter(isVisible).map((el) => textOf(el).slice(0, 160)).filter(Boolean).slice(0, limit);',
        '  const links = Array.from(document.querySelectorAll("a[href]")).filter(isVisible).map((el) => ({ text: textOf(el).slice(0, 120), href: el.getAttribute("href") || "" })).filter((item) => item.text || item.href).slice(0, 12);',
        '  const largeVisibleElements = Array.from(document.body ? document.body.querySelectorAll("main, section, article, [role=main], canvas, button, a, h1, h2, h3, [data-testid], [class], [id]") : []).filter(isVisible).map((el) => {',
        '    const rect = el.getBoundingClientRect();',
        '    const className = typeof el.className === "string" ? el.className : "";',
        '    return { tag: el.tagName.toLowerCase(), id: el.id || "", className: className.slice(0, 120), text: textOf(el).slice(0, 120), area: Math.round(rect.width * rect.height) };',
        '  }).sort((a, b) => b.area - a.area).slice(0, 10);',
        '  const visibleText = document.body ? textOf(document.body) : "";',
        '  return {',
        '    bodyTextLength: visibleText.length,',
        '    visibleTextSample: visibleText.slice(0, 800),',
        '    interactiveElements: document.querySelectorAll("button, input, [role=button], canvas, a[href]").length,',
        '    visibleInteractiveElements: Array.from(document.querySelectorAll("button, input, [role=button], canvas, a[href]")).filter(isVisible).length,',
        '    headings: textList("h1, h2, [role=heading]", 8),',
        '    buttons: textList("button, [role=button]", 12),',
        '    links,',
        '    canvasCount: document.querySelectorAll("canvas").length,',
        '    largeVisibleElements,',
        '    pathname: window.location.pathname,',
        '    title: document.title,',
        '  };',
        '});',
        'console.log(' + json.dumps(PAGE_STATE_PREFIX) + ' + JSON.stringify(pageState));',
    ])
    label = (screenshot_label or '').strip()
    if label and 'saveScreenshot' not in script:
        pieces.append('await saveScreenshot(' + json.dumps(label) + ');')
    pieces.append('return { pageState };')
    return ' '.join(pieces)


def evaluate_capture_quality(payload, expected_path):
    payload = enrich_capture_payload(payload)
    details = {
        'has_screenshot': False,
        'body_text_length': 0,
        'interactive_elements': 0,
        'visible_interactive_elements': 0,
        'has_errors': False,
        'observed_path': '',
        'observed_path_raw': '',
        'title': '',
        'visible_text_sample': '',
        'headings': [],
        'buttons': [],
        'links': [],
        'canvas_count': 0,
        'large_visible_elements': [],
        'semantic_anchor_count': 0,
        'capture_error_messages': [],
        'artifact_summary': summarize_capture_artifacts(payload),
    }

    screenshot_url = extract_screenshot_url(payload)
    details['has_screenshot'] = bool(screenshot_url)
    if not screenshot_url:
        return {
            'valid': False,
            'reason': 'no screenshot in capture',
            'telemetry_ready': False,
            'details': details,
        }

    page_state = extract_page_state(payload)
    if isinstance(page_state, dict):
        raw_observed_path = page_state.get('pathname', '')
        details.update({
            'body_text_length': page_state.get('bodyTextLength', 0),
            'interactive_elements': page_state.get('interactiveElements', 0),
            'visible_interactive_elements': page_state.get('visibleInteractiveElements', page_state.get('interactiveElements', 0)),
            'observed_path': normalize_observed_path(raw_observed_path),
            'observed_path_raw': raw_observed_path,
            'title': page_state.get('title', ''),
            'visible_text_sample': page_state.get('visibleTextSample', ''),
            'headings': list_value(page_state.get('headings'))[:8],
            'buttons': list_value(page_state.get('buttons'))[:12],
            'links': list_value(page_state.get('links'))[:12],
            'canvas_count': page_state.get('canvasCount', 0),
            'large_visible_elements': list_value(page_state.get('largeVisibleElements'))[:10],
            'semantic_anchor_count': semantic_anchor_count(page_state),
        })
    else:
        details.update({
            'body_text_length': MIN_BODY_TEXT_LENGTH + 100,
            'interactive_elements': MIN_INTERACTIVE_ELEMENTS + 1,
            'visible_interactive_elements': MIN_INTERACTIVE_ELEMENTS + 1,
            'observed_path': expected_path,
            'observed_path_raw': expected_path,
        })

    console = payload.get('console') or []
    for text in iter_console_messages(console):
        if is_proof_telemetry_console_message(text):
            continue
        if isinstance(text, str) and ('error' in text.lower() or 'failed' in text.lower()):
            details['has_errors'] = True
            if len(details['capture_error_messages']) < 3:
                details['capture_error_messages'].append(text[:500])
            break
    proof_json = payload.get('_proof_json') or {}
    if isinstance(proof_json, dict) and proof_json.get('script_error'):
        details['has_errors'] = True
        details['capture_error_messages'].append(str(proof_json.get('script_error'))[:500])

    reasons = []
    if details['body_text_length'] < MIN_BODY_TEXT_LENGTH:
        reasons.append(f'blank/near-blank page (text length: {details["body_text_length"]})')
    if details['interactive_elements'] < MIN_INTERACTIVE_ELEMENTS:
        reasons.append(f'not interactive enough ({details["interactive_elements"]} interactive elements)')
    if has_enriched_page_state(page_state) and details['semantic_anchor_count'] < 1:
        reasons.append('no visible semantic UI anchors in page capture')
    if details['has_errors']:
        reasons.append('page has console/runtime errors')

    observed_path = normalize_observed_path(details.get('observed_path'))
    normalized_expected = (expected_path or '').rstrip('/') or '/'
    if expected_path and observed_path and observed_path != normalized_expected:
        raw_observed = details.get('observed_path_raw') or details.get('observed_path') or observed_path
        reasons.append(f'wrong route: expected {expected_path}, got {raw_observed}')

    semantic_ready = (not has_enriched_page_state(page_state)) or details['semantic_anchor_count'] >= 1
    telemetry_ready = (
        details['has_screenshot']
        and details['body_text_length'] >= MIN_BODY_TEXT_LENGTH
        and details['interactive_elements'] >= MIN_INTERACTIVE_ELEMENTS
        and semantic_ready
        and not details['has_errors']
    )

    return {
        'valid': len(reasons) == 0,
        'reason': '; '.join(reasons) if reasons else 'ok',
        'telemetry_ready': telemetry_ready,
        'details': details,
    }


def clean_next_cache(project_dir):
    if os.path.exists(os.path.join(project_dir, '.next')):
        sp.run('rm -rf .next', shell=True, cwd=project_dir, capture_output=True)


def build_project(project_dir, label):
    build_cmd = s.get('build_command', 'npm run build')
    print('Building ' + label + ' workspace...')
    result = sp.run(build_cmd, shell=True, cwd=project_dir, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise SystemExit(label.capitalize() + ' build failed during recon: ' + result.stderr[:500])
    return {
        'stdout': result.stdout[-500:],
        'stderr': result.stderr[-500:],
        'command': build_cmd,
    }


def capture_workspace_baseline(project_dir, label, plan, capture_script=''):
    clean_next_cache(project_dir)
    build_meta = build_project(project_dir, label)
    static_reason = detect_static_reason(project_dir, s)
    wait_for_selector = (plan.get('wait_for_selector') or '').strip()
    target_path = plan.get('target_path') or '/'

    if s.get('mode', 'server') == 'server' and not static_reason:
        build_dir, server_command, server_exclude = prepare_server_preview(project_dir, s)
        server_args = {
            'directory': build_dir,
            'image': s['server_image'],
            'command': server_command,
            'port': int(s['server_port']),
            'wait_until': 'domcontentloaded',
            'readiness_timeout': 180,
            'timeout': 300,
            'env': {'PORT': str(s['server_port']), 'HOSTNAME': '0.0.0.0'},
            'exclude': server_exclude,
            'path': target_path,
            'readiness_path': '/' if has_auth_context(s) else target_path,
            'script': build_probe_capture_script(capture_script, label),
        }
        if s.get('color_scheme'):
            server_args['color_scheme'] = s['color_scheme']
        if wait_for_selector:
            server_args['wait_for_selector'] = wait_for_selector
        apply_auth_context(s, server_args)

        shot = invoke_retry('riddle_server_preview', server_args, retries=2, timeout=420)
        append_capture_diagnostic(s, label, 'riddle_server_preview', server_args, shot)
        return {
            'source': label + '_worktree',
            'mode': 'server',
            'path': target_path,
            'capture_url': target_path,
            'url': extract_screenshot_url(shot, label),
            'static_fallback_reason': '',
            'build': build_meta,
            'raw': shot,
        }

    state_for_capture = dict(s)
    state_for_capture['wait_for_selector'] = wait_for_selector
    if static_reason:
        print('Recon capture (' + label + ') using static preview fallback: ' + static_reason)
    capture = capture_static_preview(state_for_capture, project_dir, label, build_probe_capture_script(capture_script, label), timeout=300, target_path=target_path)
    raw = (capture.get('raw') or {}).get('capture') or {}
    append_capture_diagnostic(
        s,
        label,
        'riddle_static_preview',
        {'target_path': target_path, 'static_fallback_reason': static_reason},
        raw,
    )
    preview_id_key = label + '_preview_id'
    if capture.get('preview_id'):
        s[preview_id_key] = capture.get('preview_id', '')
    return {
        'source': label + '_worktree',
        'mode': 'static' if s.get('mode', 'server') == 'static' else 'server-with-static-fallback',
        'path': target_path,
        'capture_url': capture.get('capture_url', target_path),
        'url': capture.get('url', '') or extract_screenshot_url(raw, label),
        'static_fallback_reason': static_reason,
        'build': build_meta,
        'raw': raw,
    }


def capture_prod_baseline(prod_url, plan, capture_script=''):
    target_url = (prod_url or '').strip()
    if not target_url:
        raise SystemExit('Requested prod baseline in recon, but prod_url is missing.')
    wait_for_selector = (plan.get('wait_for_selector') or '').strip()
    script = build_capture_script(target_url, build_probe_capture_script(capture_script, 'prod'), 'prod', wait_for_selector)
    args = {'script': script, 'timeout_sec': 60}
    apply_auth_context(s, args)
    print('Recon capture (prod) at ' + target_url)
    shot = invoke_retry('riddle_script', args, retries=3, timeout=180)
    append_capture_diagnostic(s, 'prod', 'riddle_script', args, shot)
    return {
        'source': 'prod_url',
        'mode': 'remote',
        'path': urlparse(target_url).path or (plan.get('target_path') or '/'),
        'capture_url': target_url,
        'url': extract_screenshot_url(shot, 'prod'),
        'static_fallback_reason': '',
        'raw': shot,
    }


def baseline_record(capture, observation):
    return {
        'source': capture.get('source'),
        'mode': capture.get('mode'),
        'path': capture.get('path'),
        'capture_url': capture.get('capture_url'),
        'url': capture.get('url'),
        'static_fallback_reason': capture.get('static_fallback_reason', ''),
        'artifact_summary': summarize_capture_artifacts(capture.get('raw') or {}),
        'observation': observation,
    }


def build_observation_packet(label, expected_path, capture=None, error=''):
    if error:
        return {
            'label': label,
            'ok': False,
            'reason': error,
            'telemetry_ready': False,
            'capture_url': capture.get('capture_url') if capture else '',
            'url': capture.get('url') if capture else '',
            'details': {'error': error},
        }

    payload = (capture or {}).get('raw') or {}
    quality = evaluate_capture_quality(payload, expected_path)
    return {
        'label': label,
        'ok': bool((capture or {}).get('url')) and quality['valid'],
        'reason': quality['reason'],
        'telemetry_ready': quality['telemetry_ready'],
        'capture_url': (capture or {}).get('capture_url', ''),
        'url': (capture or {}).get('url', ''),
        'details': quality['details'],
    }


def clear_saved_baselines(state):
    state['before_cdn'] = ''
    state['prod_cdn'] = ''


def diff_plan(previous_plan, current_plan):
    changes = {}
    for key in ('target_path', 'wait_for_selector', 'reference'):
        if (previous_plan or {}).get(key) != (current_plan or {}).get(key):
            changes[key] = {
                'from': (previous_plan or {}).get(key),
                'to': (current_plan or {}).get(key),
            }
    return changes


pkg = read_json(os.path.join(after_dir, 'package.json')) or {}
scripts = pkg.get('scripts') or {}
git_status = run('git status --short', after_dir, timeout=20).stdout.strip().splitlines()
tokens = extract_tokens(s.get('change_request', ''))
route_hints = collect_route_hints(after_dir)
keyword_hits = collect_keyword_hits(after_dir, tokens)
requested_reference = s.get('requested_reference') or s.get('reference', 'before')
route_options = route_candidates(route_hints, s.get('prod_url', ''))
server_path_source = s.get('server_path_source') or ''
initial_target_path = choose_target_path(s.get('server_path', ''), s.get('prod_url', ''), route_hints, tokens, server_path_source)
selected_route = next((item for item in route_options if item.get('path') == initial_target_path), None)
initial_hypothesis = {
    'target_path': initial_target_path,
    'path_source': ('state.server_path:' + server_path_source) if (s.get('server_path') or '').strip() and (s.get('server_path') != '/' or server_path_source) else ((selected_route or {}).get('reason') or 'fallback root'),
    'reference': requested_reference,
    'mode': s.get('mode', 'server'),
    'wait_for_selector': (s.get('wait_for_selector') or '').strip(),
    'route_candidates': route_options[:6],
    'notes': [
        'Recon captures one bounded attempt at a time, then checkpoints for the calling agent to pick the next plan.',
        'Verify should reuse the baseline established here instead of rediscovering route and state late.',
    ],
}

existing_recon = s.get('recon_results') or {}
attempt_history = list(existing_recon.get('attempt_history') or [])
plan_history = list(existing_recon.get('plan_history') or [])
decision_history = list(existing_recon.get('decision_history') or [])
max_attempts = int(existing_recon.get('max_attempts') or MAX_RECON_ATTEMPTS)
if max_attempts < 1 or max_attempts > MAX_RECON_ATTEMPTS:
    max_attempts = MAX_RECON_ATTEMPTS

previous_assessment = s.get('recon_assessment') or {}
assessment_source = str(previous_assessment.get('source') or s.get('recon_assessment_source') or '').strip().lower()
has_previous_assessment = bool(previous_assessment.get('decision')) and assessment_source in ('supervising_agent', 'supervisor')
attempt_num = len(attempt_history) + 1

current_plan = {
    'attempt': attempt_num,
    'planner': 'supervising_agent' if has_previous_assessment else 'workflow_hypothesis',
    'planner_kind': 'supervising_agent' if has_previous_assessment else 'agent_guided_recon',
    'target_path': initial_target_path,
    'path_source': initial_hypothesis['path_source'],
    'wait_for_selector': (s.get('wait_for_selector') or '').strip(),
    'selector_source': 'state.wait_for_selector' if (s.get('wait_for_selector') or '').strip() else 'none',
    'reference': requested_reference,
    'route_candidates': route_options[:6],
    'keyword_hits': keyword_hits[:10],
}

if has_previous_assessment:
    refined = previous_assessment.get('refined_inputs') or {}
    decision_history.append({
        'attempt': attempt_num,
        'planner': 'supervising_agent',
        'based_on_attempt': len(attempt_history),
        'decision': previous_assessment.get('decision'),
        'summary': previous_assessment.get('summary') or '',
        'continue_with_stage': previous_assessment.get('continue_with_stage') or previous_assessment.get('recommended_stage') or '',
        'escalation_target': previous_assessment.get('escalation_target') or 'agent',
        'confidence': previous_assessment.get('confidence') or '',
        'baseline_understanding': previous_assessment.get('baseline_understanding') or {},
        'refined_inputs': {
            'server_path': refined.get('server_path') or current_plan['target_path'],
            'wait_for_selector': refined.get('wait_for_selector') or current_plan['wait_for_selector'],
            'reference': refined.get('reference') or requested_reference,
        },
        'reasons': previous_assessment.get('reasons') or [],
    })
elif plan_history:
    decision_history.append({
        'attempt': attempt_num,
        'planner': 'calling_agent',
        'based_on_attempt': len(plan_history),
        'changes': diff_plan(plan_history[-1], current_plan),
        'reason': 'Resumed recon with the current state inputs.',
    })

capture_hint = s.get('capture_hint') if isinstance(s.get('capture_hint'), dict) else {}
selected_hint = capture_hint.get('selected') if isinstance(capture_hint.get('selected'), dict) else {}
if capture_hint.get('applied') and selected_hint:
    fallback_changes = {}
    hinted_path = str(selected_hint.get('server_path') or '').strip()
    hinted_selector = str(selected_hint.get('wait_for_selector') or '').strip()
    if hinted_path and current_plan.get('target_path') != hinted_path:
        fallback_changes['server_path'] = {'from': hinted_path, 'to': current_plan.get('target_path')}
    if hinted_selector and current_plan.get('wait_for_selector') != hinted_selector:
        fallback_changes['wait_for_selector'] = {'from': hinted_selector, 'to': current_plan.get('wait_for_selector')}
    if fallback_changes:
        capture_hint['fallback_triggered'] = True
        capture_hint['fallback_reason'] = (
            str(previous_assessment.get('decision') or '').strip() if has_previous_assessment else 'plan_refined'
        ) or 'plan_refined'
        capture_hint['fallback_changes'] = fallback_changes
        s['capture_hint'] = capture_hint

plan_history.append(current_plan)

summary_bits = []
if detect_framework(pkg) != 'unknown':
    summary_bits.append('framework=' + detect_framework(pkg))
if route_hints:
    summary_bits.append('route hints found')
if keyword_hits:
    summary_bits.append('change-request keyword hits found')
summary_bits.append('attempt=' + str(attempt_num) + '/' + str(max_attempts))
summary_bits.append('plan path=' + current_plan['target_path'])
if current_plan['wait_for_selector']:
    summary_bits.append('selector=' + current_plan['wait_for_selector'])
if attempt_num > max_attempts:
    summary_bits.append('attempt budget advisory exceeded')

recon_results = {
    'workspace': {
        'repo_dir': s.get('repo_dir'),
        'before_worktree': before_dir or None,
        'after_worktree': after_dir,
        'reference': s.get('reference', 'before'),
        'requested_reference': requested_reference,
    },
    'app': {
        'name': pkg.get('name') or s.get('repo_short'),
        'framework': detect_framework(pkg),
        'scripts': {k: scripts.get(k) for k in ('dev', 'build', 'start', 'test') if scripts.get(k)},
    },
    'route_hints': route_hints,
    'keyword_hits': keyword_hits,
    'git_status': git_status[:20],
    'hypothesis': initial_hypothesis,
    'status': 'needs_supervisor_judgment',
    'max_attempts': max_attempts,
    'current_plan': current_plan,
    'plan_history': plan_history,
    'decision_history': decision_history,
    'attempt_history': attempt_history,
    'baselines': {},
    'observations': {},
}

required_baselines = []
if requested_reference in ('before', 'both'):
    required_baselines.append('before')
if requested_reference in ('prod', 'both') and (s.get('prod_url') or '').strip():
    required_baselines.append('prod')
elif requested_reference in ('prod', 'both') and not (s.get('prod_url') or '').strip():
    summary_bits.append('prod baseline deferred until prod_url exists')

attempt_observations = {}
attempt_captured_baselines = {}
clear_saved_baselines(s)
s['recon_assessment'] = {}
s['recon_assessment_source'] = None

for label in required_baselines:
    try:
        if label == 'before':
            if not before_dir or not os.path.exists(before_dir):
                raise SystemExit('before_worktree not found but recon baseline requires reference=' + requested_reference)
            capture = capture_workspace_baseline(before_dir, 'before', current_plan, capture_script='')
            expected_path = current_plan['target_path']
        else:
            capture = capture_prod_baseline(s.get('prod_url', ''), current_plan, capture_script='')
            expected_path = urlparse(s.get('prod_url', '')).path or current_plan['target_path']
        observation = build_observation_packet(label, expected_path, capture=capture)
    except SystemExit:
        raise
    except Exception as exc:
        capture = {}
        observation = build_observation_packet(label, current_plan['target_path'], capture=capture, error='exception: ' + str(exc)[:180])

    attempt_observations[label] = observation
    if capture.get('url'):
        attempt_captured_baselines[label] = baseline_record(capture, observation)

attempt_result = 'captured_candidates' if all((attempt_captured_baselines.get(label) or {}).get('url') for label in required_baselines) else 'partial_capture'
attempt_record = {
    'attempt': attempt_num,
    'plan': current_plan,
    'observations': attempt_observations,
    'captured_baselines': attempt_captured_baselines,
    'result': attempt_result,
}
attempt_history.append(attempt_record)
recon_results['attempt_history'] = attempt_history
recon_results['baselines'] = {}
recon_results['status'] = 'needs_supervisor_judgment'
recon_results['selected_attempt'] = {}
recon_results['observations'] = {
    'baseline_keys': sorted(attempt_captured_baselines.keys()),
    'attempts_used': len(attempt_history),
    'attempts_remaining': max(0, max_attempts - len(attempt_history)),
    'attempt_budget_advisory': len(attempt_history) >= max_attempts,
    'latest_result': attempt_result,
    'latest_attempt': attempt_record,
    'observed_target_path': current_plan['target_path'],
}

s['recon_results'] = recon_results
s['recon_hypothesis'] = initial_hypothesis
s['stage'] = 'recon'
s['recon_status'] = 'needs_supervisor_judgment'
s['author_status'] = 'needs_recon_judgment'
s['proof_plan_status'] = 'needs_recon_judgment'

summary_bits.append('captured candidate baselines' if attempt_captured_baselines else 'baseline capture incomplete')
if len(attempt_history) >= max_attempts:
    summary_bits.append('supervising agent should decide whether recon is converging or stuck')

instructions = [
    'Inspect the latest recon observation packet, route hints, and captured screenshot URLs together.',
    'Judge whether the latest before/prod baseline is trustworthy enough to anchor verify.',
    'Do not approve recon just because telemetry_ready is true or a screenshot URL exists.',
    'Use details.visible_text_sample, headings, buttons, links, canvas_count, and large_visible_elements to describe what the baseline visibly contains.',
    'Reject baselines that look like only an app shell, banner, blank route, loading screen, error page, or the wrong feature even if the capture technically has text.',
    'For routed apps, prefer explicit Route/Link/href/navigate path literals over component import paths.',
    'If the baseline is wrong or weak, choose retry_recon with refined server_path and/or wait_for_selector.',
    'If the baseline is trustworthy, choose ready_for_author so the wrapper can promote it and continue into proof authoring.',
    'Before choosing ready_for_author, write a concrete baseline_understanding that names the observed before state, the target UI, the requested change, the proof focus, and the stop condition.',
    'Only choose recon_stuck with escalation_target=human when you conclude the recon loop is genuinely blocked or not converging.',
]
if requested_reference in ('prod', 'both') and not (s.get('prod_url') or '').strip():
    instructions.append('Prod comparison is still deferred until prod_url is available.')
if len(attempt_history) >= max_attempts:
    instructions.append('The original recon attempt budget is now advisory only. Retry only if the new plan is materially better; otherwise declare recon_stuck.')

author_request = {
    'goal': s.get('change_request', ''),
    'success_criteria': s.get('success_criteria', ''),
    'verification_mode': s.get('verification_mode', 'proof'),
    'reference': requested_reference,
    'prod_url_known': bool((s.get('prod_url') or '').strip()),
    'workspace': {
        'after_worktree': after_dir,
        'before_worktree': before_dir or None,
    },
    'hypothesis': initial_hypothesis,
    'current_plan': current_plan,
    'observed_baselines': attempt_captured_baselines,
    'latest_attempt': attempt_record,
    'route_hints': route_hints[:8],
    'keyword_hits': keyword_hits[:10],
    'plan_history': plan_history,
    'decision_history': decision_history,
    'required_outputs': [
        'proof_plan',
        'capture_script',
        'optional server_path',
        'optional wait_for_selector',
    ],
    'available_inputs': {
        'proof_plan': bool((s.get('proof_plan') or '').strip()),
        'capture_script': bool((s.get('capture_script') or '').strip()),
        'server_path': s.get('server_path') or '',
        'wait_for_selector': s.get('wait_for_selector') or '',
    },
    'instructions': [
        'Use the supervising-agent-approved recon path and baselines instead of rediscovering context in verify.',
        'Write the final Playwright capture_script for verify only after recon is explicitly approved.',
        'Do not rely on verify to rediscover the right route or baseline context.',
    ],
}
s['author_request'] = author_request
s['proof_plan_request'] = author_request

recon_assessment_request = {
    'status': 'needs_supervising_agent_assessment',
    'goal': s.get('change_request', ''),
    'success_criteria': s.get('success_criteria', ''),
    'verification_mode': s.get('verification_mode', 'proof'),
    'reference': requested_reference,
    'attempt': attempt_num,
    'max_attempts': max_attempts,
    'attempts_used': len(attempt_history),
    'attempts_remaining': max(0, max_attempts - len(attempt_history)),
    'attempt_budget_advisory': len(attempt_history) >= max_attempts,
    'current_plan': current_plan,
    'latest_attempt': attempt_record,
    'observed_baselines': attempt_captured_baselines,
    'candidate_paths': route_options[:6],
    'route_hints': route_hints[:8],
    'keyword_hits': keyword_hits[:10],
    'fields_agent_may_update': ['recon_assessment_json', 'server_path', 'wait_for_selector', 'reference'],
    'instructions': instructions,
    'quality_gate': {
        'ready_for_author_requires': [
            'baseline screenshot exists',
            'observed route matches the intended user-facing route',
            'visible page content is specific to the requested change, not merely an app shell or banner',
            'the supervising agent can summarize what is visible in the baseline from structured pageState and/or screenshot inspection',
            'the supervising agent has written baseline_understanding before proof authoring or implementation begins',
        ],
        'retry_recon_when': [
            'the path looks like a source/component import rather than an app route',
            'the baseline is blank, mostly shell chrome, loading-only, or generic landing content',
            'visible text/elements do not support the target feature or requested change',
        ],
    },
    'response_schema': {
        'decision': 'retry_recon | ready_for_author | recon_stuck',
        'summary': 'string',
        'baseline_understanding': {
            'reference': 'before | prod | both | unknown',
            'target_route': 'string',
            'before_evidence_url': 'string',
            'visible_before_state': 'string',
            'relevant_elements': ['string'],
            'requested_change': 'string',
            'proof_focus': 'string',
            'stop_condition': 'string',
            'quality_risks': ['string'],
        },
        'continue_with_stage': 'recon | author',
        'escalation_target': 'agent | human',
        'refined_inputs': {
            'server_path': 'string',
            'wait_for_selector': 'string',
            'reference': 'string',
        },
        'reasons': ['string'],
        'confidence': 'high | medium | low',
        'source': 'supervising_agent',
    },
}
s['recon_assessment_request'] = recon_assessment_request
s['recon_decision_request'] = recon_assessment_request
s['recon_summary'] = '; '.join(summary_bits)
save_state(s)

print('RECON RESULTS')
print('=' * 50)
print('Workspace ready: ' + str(bool(s.get('workspace_ready'))))
print('Framework: ' + recon_results['app']['framework'])
if recon_results['app']['scripts']:
    print('Scripts: ' + ', '.join(sorted(recon_results['app']['scripts'].keys())))
print('Current plan path: ' + current_plan['target_path'])
print('Current plan selector: ' + (current_plan['wait_for_selector'] or '(none)'))
print('Recon status: ' + s.get('recon_status', 'unknown'))
if route_hints:
    print('Route hints:')
    for line in route_hints[:8]:
        print('  ' + line)
if keyword_hits:
    print('Keyword hits:')
    for line in keyword_hits[:10]:
        print('  ' + line)
for label, observation in attempt_observations.items():
    print(label.capitalize() + ' observation: ' + observation.get('reason', 'unknown'))
    if observation.get('url'):
        print('  Screenshot: ' + observation.get('url', ''))
print('Proof plan status: ' + s.get('proof_plan_status', 'unknown'))
print(json.dumps({
    'ok': True,
    'recon_status': s.get('recon_status', 'unknown'),
    'proof_plan_status': s.get('proof_plan_status', 'unknown'),
    'recon_assessment_request': s.get('recon_assessment_request', {}),
    'recon_decision_request': s.get('recon_decision_request', {}),
    'proof_plan_request': s.get('proof_plan_request', {}),
    'baselines': recon_results['baselines'],
}, indent=2))
