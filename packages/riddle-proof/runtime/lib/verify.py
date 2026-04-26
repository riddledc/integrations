"""Verify: capture after evidence against the baseline already established in recon.

Verify no longer discovers baseline context.
It reuses recon-owned before / prod evidence and focuses on the after-proof.
It now treats capture quality as a first-class sub-loop: bad captures stay in verify,
while good captures produce a structured evidence packet that the supervising agent
must assess before the wrapper routes back into author/implement/recon work or ship.
"""

import json, os, sys, time
from urllib.parse import parse_qsl, urlparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import (
    append_capture_diagnostic,
    apply_auth_context,
    capture_static_preview,
    enrich_capture_payload,
    has_auth_context,
    invoke,
    invoke_retry,
    load_state,
    prepare_server_preview,
    record_successful_capture_hint,
    run_project_build,
    save_state,
    should_use_static_preview,
    summarize_capture_artifacts,
)
import subprocess as sp

MIN_BODY_TEXT_LENGTH = 50
MIN_INTERACTIVE_ELEMENTS = 1
HYDRATION_WAIT_MS = 1500
PAGE_STATE_PREFIX = 'RIDDLE_PROOF_STATE:'
PROOF_EVIDENCE_PREFIX = 'RIDDLE_PROOF_EVIDENCE:'
PROOF_EVIDENCE_LOG_PREFIX = 'RIDDLE_PROOF_EVIDENCE '
PROOF_EVIDENCE_PREFIXES = (PROOF_EVIDENCE_PREFIX, PROOF_EVIDENCE_LOG_PREFIX)
IMAGE_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.webp', '.gif')
STRUCTURED_FIRST_MODES = {
    'audio', 'data', 'json', 'log', 'logs', 'metric', 'metrics',
    'telemetry', 'text', 'api',
}
VISUAL_FIRST_MODES = {
    'visual', 'render', 'interaction', 'ui', 'layout', 'screenshot',
    'canvas', 'animation',
}
PROOF_EVIDENCE_REQUIRED_MODES = {'audio'}
MIN_VISUAL_DELTA_PERCENT = 0.5
MIN_VISUAL_CHANGED_PIXELS = 5000
VISUAL_DELTA_PERCENT_KEYS = {
    'change_pct', 'change_percent', 'changed_percent', 'percent_changed',
    'diff_percent', 'visual_delta_percent', 'pixel_change_percent',
}
VISUAL_DELTA_RATIO_KEYS = {
    'change_ratio', 'changed_ratio', 'diff_ratio', 'visual_delta_ratio',
}
VISUAL_CHANGED_PIXEL_KEYS = {
    'changed_pixels', 'changed_pixel_count', 'changedpixels',
    'diff_pixels', 'pixel_delta', 'visual_delta_pixels',
}
VISUAL_TOTAL_PIXEL_KEYS = {
    'total_pixels', 'total_pixel_count', 'pixel_count', 'totalpixels',
}
VISUAL_WIDTH_KEYS = {'width', 'image_width', 'screenshot_width'}
VISUAL_HEIGHT_KEYS = {'height', 'image_height', 'screenshot_height'}


def capture_script_saves_screenshot(script):
    return 'saveScreenshot' in (script or '')


def normalized_verification_mode(value):
    return ((value or 'proof').strip().lower() or 'proof')


def proof_evidence_required_for_mode(verification_mode):
    return normalized_verification_mode(verification_mode) in PROOF_EVIDENCE_REQUIRED_MODES


def screenshot_required_for_mode(verification_mode):
    return normalized_verification_mode(verification_mode) in VISUAL_FIRST_MODES


def auto_screenshot_for_mode(verification_mode):
    return normalized_verification_mode(verification_mode) not in STRUCTURED_FIRST_MODES


def record_verify_phase(phase, status='running', summary=''):
    global s
    ts = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    try:
        current = load_state()
    except Exception:
        current = dict(s)
    runtime_step = current.get('current_runtime_step') if isinstance(current.get('current_runtime_step'), dict) else {}
    if not runtime_step:
        runtime_step = {
            'step': 'verify',
            'action': 'run',
            'status': 'running',
            'started_at': ts,
            'workflow_file': 'riddle-proof-verify.lobster',
        }
    runtime_step['step'] = 'verify'
    runtime_step['action'] = 'run'
    runtime_step['status'] = 'running'
    runtime_step['workflow_file'] = 'riddle-proof-verify.lobster'
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
        'step': 'verify',
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


def payload_has_capture_artifacts(payload):
    if not isinstance(payload, dict):
        return False
    if payload.get('outputs') or payload.get('screenshots') or payload.get('console'):
        return True
    result = payload.get('result')
    if isinstance(result, dict) and result:
        return True
    return False


def capture_payload_error(payload):
    if not isinstance(payload, dict):
        return ''
    if payload.get('ok') is False and not payload_has_capture_artifacts(payload):
        for key in ('error', 'stderr', 'stdout'):
            value = payload.get(key)
            if value:
                return str(value).strip()
        return 'capture tool returned ok=false without artifacts'
    return ''


def abort_capture_failure(state, results, expected_path, message, raw_payload):
    summary = 'After capture failed before usable proof artifacts were produced: ' + str(message).strip()
    record_verify_phase('capture', 'failed', summary)
    observation = {
        'valid': False,
        'reason': summary,
        'telemetry_ready': False,
        'details': {
            'capture_tool_error': str(message).strip(),
            'artifact_summary': summarize_capture_artifacts(raw_payload),
            'observed_path': expected_path,
            'observed_path_raw': expected_path,
        },
    }
    results['after'] = {
        'screenshots': [],
        'raw': raw_payload,
        'observation': observation,
        'supporting_artifacts': collect_supporting_artifacts(raw_payload),
    }
    state['stage'] = 'verify'
    state['after_cdn'] = ''
    state['verify_results'] = results
    state['verify_status'] = 'capture_error'
    state['merge_recommendation'] = 'do-not-merge'
    state['proof_assessment'] = {}
    state['proof_assessment_source'] = None
    state['proof_assessment_request'] = {}
    state['verify_decision_request'] = {
        'status': state['verify_status'],
        'summary': summary,
        'expected_path': expected_path,
        'latest_observation': observation,
        'capture_quality': {
            'decision': 'capture_error',
            'summary': summary,
            'recommended_stage': None,
            'continue_with_stage': None,
            'reasons': [summary],
        },
        'next_stage_options': ['verify', 'recon'],
        'recommended_stage': None,
        'continue_with_stage': None,
        'fields_agent_may_update': ['server_path', 'wait_for_selector'],
        'instructions': [
            'The capture tool failed before producing screenshots or structured evidence.',
            'Fix the runtime/configuration problem before retrying verify.',
            'Do not return to proof authoring unless the capture tool can run and produces low-quality evidence.',
        ],
    }
    state['verify_summary'] = summary
    state['proof_summary'] = summary
    state['evidence_notes'] = [
        'Capture failed before usable proof evidence was produced.',
        'This is a runtime or configuration failure, not a proof-authoring failure.',
    ]
    save_state(state)
    raise SystemExit(summary)


def build_probe_capture_script(base_script='', verification_mode='proof'):
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
        '    search: window.location.search,',
        '    href: window.location.href,',
        '    title: document.title,',
        '  };',
        '});',
        'console.log(' + json.dumps(PAGE_STATE_PREFIX) + ' + JSON.stringify(pageState));',
        'let __riddleProofEvidenceValue = null;',
        'try {',
        '  __riddleProofEvidenceValue = await page.evaluate(() => {',
        '    const root = (typeof window !== "undefined" && window) || (typeof globalThis !== "undefined" && globalThis) || (typeof self !== "undefined" && self) || {};',
        '    return root.__riddleProofEvidence ?? root.riddleProofEvidence ?? null;',
        '  });',
        '} catch {}',
        'if (__riddleProofEvidenceValue === null || __riddleProofEvidenceValue === undefined) {',
        '  const __riddleProofEvidenceRoot = (typeof globalThis !== "undefined" && globalThis) || (typeof window !== "undefined" && window) || (typeof self !== "undefined" && self) || {};',
        '  __riddleProofEvidenceValue = __riddleProofEvidenceRoot.__riddleProofEvidence ?? __riddleProofEvidenceRoot.riddleProofEvidence ?? null;',
        '}',
        'if (__riddleProofEvidenceValue !== null && __riddleProofEvidenceValue !== undefined) {',
        '  try { console.log(' + json.dumps(PROOF_EVIDENCE_PREFIX) + ' + JSON.stringify(__riddleProofEvidenceValue)); }',
        '  catch (err) { console.log(' + json.dumps(PROOF_EVIDENCE_PREFIX) + ' + JSON.stringify({ serialization_error: String(err) })); }',
        '}',
    ])
    if auto_screenshot_for_mode(verification_mode) and not capture_script_saves_screenshot(script):
        pieces.append("await saveScreenshot('after-proof');")
    pieces.append('return { pageState, proofEvidence: __riddleProofEvidenceValue };')
    return ' '.join(pieces)


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
            label + '.gif',
        ]
    outputs = payload.get('outputs') or []
    for item in outputs:
        name = item.get('name', '')
        if name in preferred_names and 'error' not in name:
            return item.get('url', '')
    for item in outputs:
        name = item.get('name', '')
        if name.endswith(IMAGE_EXTENSIONS) and 'error' not in name:
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
        or proof_evidence_console_payload(text) is not None
    )


def proof_evidence_console_payload(text):
    if not isinstance(text, str):
        return None
    for prefix in PROOF_EVIDENCE_PREFIXES:
        if text.startswith(prefix):
            return text[len(prefix):].strip()
    return None


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


def extract_proof_evidence(payload):
    evidence = []
    for text in iter_console_messages(payload.get('console') or []):
        raw_evidence = proof_evidence_console_payload(text)
        if raw_evidence is not None:
            try:
                evidence.append(json.loads(raw_evidence))
            except Exception:
                continue

    result = payload.get('result') or {}
    if isinstance(result, dict):
        for key in ('proofEvidence', 'proof_evidence', 'evidence', 'metrics', 'logs', 'analysis'):
            value = result.get(key)
            if value not in (None, ''):
                evidence.append(value)

    if not evidence:
        return None
    if len(evidence) == 1:
        return evidence[0]
    return evidence


def first_failed_proof_evidence(value):
    if isinstance(value, dict):
        if value.get('proof_evidence_present') is False:
            return value
        for item in value.values():
            failed = first_failed_proof_evidence(item)
            if failed is not None:
                return failed
    elif isinstance(value, list):
        for item in value:
            failed = first_failed_proof_evidence(item)
            if failed is not None:
                return failed
    return None


def failed_proof_evidence_summary(proof_evidence):
    failed = first_failed_proof_evidence(proof_evidence)
    if not isinstance(failed, dict):
        return ''
    failed_checks = []
    checks = failed.get('checks')
    if isinstance(checks, dict):
        failed_checks = [str(key) for key, value in checks.items() if value is False]
    summary = 'Audio proof evidence explicitly reports proof_evidence_present=false.'
    if failed_checks:
        summary += ' Failed checks: ' + ', '.join(failed_checks[:8]) + '.'
    evidence_summary = str(failed.get('evidence_summary') or '').strip()
    if evidence_summary:
        summary += ' Evidence summary: ' + evidence_summary[:300]
    return summary


def compact_value(value, limit=1200):
    try:
        text = json.dumps(value, sort_keys=True)
    except Exception:
        text = str(value)
    if len(text) <= limit:
        return text
    return text[:limit - 20].rstrip() + '...'


def normalize_metric_key(value):
    return ''.join(ch if ch.isalnum() else '_' for ch in str(value or '').strip().lower()).strip('_')


def metric_number(value):
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip().rstrip('%').replace(',', '')
        if not text:
            return None
        try:
            return float(text)
        except Exception:
            return None
    return None


def find_metric_value(value, key_names, depth=0):
    if depth > 7:
        return None
    if isinstance(value, dict):
        for raw_key, raw_value in value.items():
            if normalize_metric_key(raw_key) in key_names:
                number = metric_number(raw_value)
                if number is not None:
                    return number
        for raw_value in value.values():
            number = find_metric_value(raw_value, key_names, depth + 1)
            if number is not None:
                return number
    elif isinstance(value, list):
        for item in value[:60]:
            number = find_metric_value(item, key_names, depth + 1)
            if number is not None:
                return number
    return None


def extract_visual_delta(payload):
    payload = enrich_capture_payload(payload)
    result = payload.get('result') if isinstance(payload, dict) else {}
    proof_json = payload.get('_proof_json') if isinstance(payload, dict) else {}
    proof_evidence = extract_proof_evidence(payload)
    candidates = [
        payload if isinstance(payload, dict) else {},
        result if isinstance(result, dict) else {},
        proof_json if isinstance(proof_json, dict) else {},
        proof_evidence,
    ]

    percent = None
    ratio = None
    changed_pixels = None
    total_pixels = None
    width = None
    height = None
    for candidate in candidates:
        if candidate is None:
            continue
        if percent is None:
            percent = find_metric_value(candidate, VISUAL_DELTA_PERCENT_KEYS)
        if ratio is None:
            ratio = find_metric_value(candidate, VISUAL_DELTA_RATIO_KEYS)
        if changed_pixels is None:
            changed_pixels = find_metric_value(candidate, VISUAL_CHANGED_PIXEL_KEYS)
        if total_pixels is None:
            total_pixels = find_metric_value(candidate, VISUAL_TOTAL_PIXEL_KEYS)
        if width is None:
            width = find_metric_value(candidate, VISUAL_WIDTH_KEYS)
        if height is None:
            height = find_metric_value(candidate, VISUAL_HEIGHT_KEYS)

    if percent is None and ratio is not None:
        percent = ratio * 100 if 0 <= ratio <= 1 else ratio
    if total_pixels is None and width and height:
        total_pixels = width * height
    if percent is None and changed_pixels is not None and total_pixels:
        percent = (changed_pixels / total_pixels) * 100

    if percent is None and changed_pixels is None:
        return {
            'status': 'unmeasured',
            'passed': None,
            'change_percent': None,
            'changed_pixels': None,
            'total_pixels': int(total_pixels) if total_pixels else None,
            'min_change_percent': MIN_VISUAL_DELTA_PERCENT,
            'min_changed_pixels': MIN_VISUAL_CHANGED_PIXELS,
            'reason': 'No measured before/after visual delta was found in proof evidence.',
        }

    percent_pass = percent is not None and percent >= MIN_VISUAL_DELTA_PERCENT
    pixel_pass = changed_pixels is not None and changed_pixels >= MIN_VISUAL_CHANGED_PIXELS
    passed = percent_pass or pixel_pass
    return {
        'status': 'measured',
        'passed': bool(passed),
        'change_percent': round(percent, 4) if percent is not None else None,
        'changed_pixels': int(changed_pixels) if changed_pixels is not None else None,
        'total_pixels': int(total_pixels) if total_pixels is not None else None,
        'min_change_percent': MIN_VISUAL_DELTA_PERCENT,
        'min_changed_pixels': MIN_VISUAL_CHANGED_PIXELS,
        'reason': (
            'Measured visual delta clears the legibility threshold.'
            if passed else
            'Measured visual delta is below the legibility threshold; capture success alone is not proof.'
        ),
    }


def visual_delta_applies(verification_mode):
    return screenshot_required_for_mode(verification_mode)


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
    raw = str(value or '').strip()
    if not raw:
        return ''
    parsed = urlparse(raw.split('#', 1)[0])
    path = parsed.path or ''
    query = parsed.query or ''
    if not path.startswith('/'):
        path = '/' + path.lstrip('/')
    parts = path.split('/')
    if len(parts) >= 4 and parts[1] == 's':
        path = '/' + '/'.join(parts[3:])
    path = path.rstrip('/') or '/'
    return path + (('?' + query) if query else '')


def observed_location_from_page_state(page_state):
    if not isinstance(page_state, dict):
        return ''
    pathname = str(page_state.get('pathname') or '').strip()
    search = str(page_state.get('search') or '').strip()
    if search and not search.startswith('?'):
        search = '?' + search
    if pathname:
        return pathname + search
    return str(page_state.get('href') or '').strip()


def route_matches_expected(expected_path, observed_path):
    expected = normalize_observed_path(expected_path)
    observed = normalize_observed_path(observed_path)
    if not expected or not observed:
        return False
    expected_parsed = urlparse(expected)
    observed_parsed = urlparse(observed)
    expected_pathname = expected_parsed.path.rstrip('/') or '/'
    observed_pathname = observed_parsed.path.rstrip('/') or '/'
    if observed_pathname != expected_pathname:
        return False
    expected_query = parse_qsl(expected_parsed.query, keep_blank_values=True)
    if not expected_query:
        return True
    observed_query = parse_qsl(observed_parsed.query, keep_blank_values=True)
    remaining = list(observed_query)
    for pair in expected_query:
        if pair not in remaining:
            return False
        remaining.remove(pair)
    return True


def collect_supporting_artifacts(payload):
    payload = enrich_capture_payload(payload)
    outputs = payload.get('outputs') or []
    image_outputs = []
    data_outputs = []
    other_outputs = []
    for item in outputs:
        name = item.get('name', '') or ''
        record = {
            'name': name,
            'url': item.get('url', ''),
        }
        if name.endswith(IMAGE_EXTENSIONS):
            image_outputs.append(record)
        elif name.endswith(('.json', '.jsonl', '.csv', '.txt', '.md', '.html')):
            data_outputs.append(record)
        else:
            other_outputs.append(record)

    result = payload.get('result') or {}
    result_keys = list(result.keys()) if isinstance(result, dict) else []
    structured_result_keys = [k for k in result_keys if k not in ('pageState', 'page_state')]
    console_entries = payload.get('console') or []
    proof_evidence = extract_proof_evidence(payload)

    return {
        'image_outputs': image_outputs,
        'data_outputs': data_outputs,
        'other_outputs': other_outputs,
        'result_keys': result_keys,
        'structured_result_keys': structured_result_keys,
        'console_entries': len(console_entries),
        'proof_evidence_present': proof_evidence is not None,
        'proof_evidence_sample': compact_value(proof_evidence) if proof_evidence is not None else '',
        'has_structured_payload': bool(data_outputs or structured_result_keys or proof_evidence is not None),
    }


def artifact_contract_for_mode(verification_mode):
    mode = normalized_verification_mode(verification_mode)
    return {
        'verification_mode': mode,
        'required': {
            'baseline_context': True,
            'route_semantics': True,
            'screenshot': screenshot_required_for_mode(mode),
            'proof_evidence': proof_evidence_required_for_mode(mode),
        },
        'preferred': {
            'page_state': True,
            'structured_payload': mode in STRUCTURED_FIRST_MODES or proof_evidence_required_for_mode(mode),
            'visual_delta': visual_delta_applies(mode),
        },
        'optional': {
            'console_summary': True,
            'json_artifacts': True,
            'image_outputs': True,
        },
    }


def artifact_production_summary(payload, supporting):
    artifact_summary = summarize_capture_artifacts(payload)
    return {
        'output_names': [str(item.get('name') or '') for item in (artifact_summary.get('outputs') or [])[:20]],
        'screenshot_names': [str(item.get('name') or '') for item in (artifact_summary.get('screenshots') or [])[:10]],
        'artifact_json': list(artifact_summary.get('artifact_json') or []),
        'artifact_error_names': sorted((artifact_summary.get('artifact_errors') or {}).keys()),
        'image_output_count': len(supporting.get('image_outputs') or []),
        'data_output_count': len(supporting.get('data_outputs') or []),
        'other_output_count': len(supporting.get('other_outputs') or []),
        'console_entries': int(supporting.get('console_entries') or 0),
        'structured_result_keys': list(supporting.get('structured_result_keys') or []),
        'proof_evidence_present': bool(supporting.get('proof_evidence_present')),
        'has_structured_payload': bool(supporting.get('has_structured_payload')),
    }


def artifact_signal_availability(state, after_observation, supporting, visual_delta, required_baseline_present, semantic_context):
    details = (after_observation or {}).get('details') or {}
    route = (semantic_context or {}).get('route') or {}
    return {
        'baseline_context': bool(required_baseline_present),
        'route_semantics': bool(route.get('after_observed_path') or details.get('observed_path')),
        'screenshot': bool(details.get('has_screenshot')),
        'page_state': bool(
            details.get('visible_text_sample')
            or details.get('headings')
            or details.get('buttons')
            or details.get('links')
            or details.get('semantic_anchor_count')
        ),
        'structured_payload': bool(supporting.get('has_structured_payload')),
        'proof_evidence': bool(supporting.get('proof_evidence_present')),
        'visual_delta': bool((visual_delta or {}).get('status') not in ('', None, 'not_applicable')),
        'console_summary': bool(supporting.get('console_entries')),
        'json_artifacts': bool(supporting.get('data_outputs')),
        'image_outputs': bool(supporting.get('image_outputs')),
        'assertions': bool(state.get('parsed_assertions')),
        'success_criteria': bool((state.get('success_criteria') or '').strip()),
    }


def artifact_usage_summary(state, after_observation, supporting, visual_delta, required_baseline_present, semantic_context, evidence_basis):
    contract = artifact_contract_for_mode(state.get('verification_mode'))
    available = artifact_signal_availability(
        state,
        after_observation,
        supporting,
        visual_delta,
        required_baseline_present,
        semantic_context,
    )
    capture_quality = []
    details = (after_observation or {}).get('details') or {}
    if details.get('has_screenshot'):
        capture_quality.append('screenshot')
    if available.get('page_state'):
        capture_quality.append('page_state')
    if available.get('console_summary'):
        capture_quality.append('console_summary')
    if available.get('structured_payload'):
        capture_quality.append('structured_payload')
    if available.get('proof_evidence'):
        capture_quality.append('proof_evidence')
    if available.get('visual_delta'):
        capture_quality.append('visual_delta')

    required_signals = [key for key, enabled in (contract.get('required') or {}).items() if enabled]
    preferred_signals = [key for key, enabled in (contract.get('preferred') or {}).items() if enabled]
    optional_signals = [key for key, enabled in (contract.get('optional') or {}).items() if enabled]

    return {
        'required_signals': required_signals,
        'preferred_signals': preferred_signals,
        'optional_signals': optional_signals,
        'available_signals': [key for key, enabled in available.items() if enabled],
        'missing_required_signals': [key for key in required_signals if not available.get(key)],
        'capture_quality_signals': capture_quality,
        'supervisor_review_signals': list(evidence_basis or []),
    }


def evaluate_capture_quality(payload, expected_path, verification_mode='proof'):
    payload = enrich_capture_payload(payload)
    mode = normalized_verification_mode(verification_mode)
    supporting = collect_supporting_artifacts(payload)
    structured_ready = bool(supporting.get('has_structured_payload'))
    screenshot_required = screenshot_required_for_mode(mode)
    details = {
        'verification_mode': mode,
        'capture_tool_error': capture_payload_error(payload),
        'has_screenshot': False,
        'screenshot_required': screenshot_required,
        'structured_evidence_present': structured_ready,
        'proof_evidence_present': bool(supporting.get('proof_evidence_present')),
        'proof_evidence_sample': supporting.get('proof_evidence_sample', ''),
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

    page_state = extract_page_state(payload)
    if isinstance(page_state, dict):
        raw_observed_path = observed_location_from_page_state(page_state)
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
    elif screenshot_url:
        details.update({
            'body_text_length': MIN_BODY_TEXT_LENGTH + 100,
            'interactive_elements': MIN_INTERACTIVE_ELEMENTS + 1,
            'visible_interactive_elements': MIN_INTERACTIVE_ELEMENTS + 1,
            'observed_path': expected_path,
            'observed_path_raw': expected_path,
        })
    else:
        details.update({
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
    if details['capture_tool_error']:
        reasons.append('capture tool failed: ' + details['capture_tool_error'])
    if screenshot_required and not details['has_screenshot']:
        reasons.append('no screenshot in capture for visual verification mode')
    if not details['has_screenshot'] and not structured_ready:
        reasons.append('no screenshot or structured proof evidence in capture')

    should_enforce_visual_readiness = screenshot_required or (details['has_screenshot'] and not structured_ready)
    if should_enforce_visual_readiness and details['body_text_length'] < MIN_BODY_TEXT_LENGTH:
        reasons.append(f'blank/near-blank page (text length: {details["body_text_length"]})')
    if should_enforce_visual_readiness and details['interactive_elements'] < MIN_INTERACTIVE_ELEMENTS:
        reasons.append(f'not interactive enough ({details["interactive_elements"]} interactive elements)')
    if should_enforce_visual_readiness and has_enriched_page_state(page_state) and details['semantic_anchor_count'] < 1:
        reasons.append('no visible semantic UI anchors in page capture')
    if details['has_errors']:
        reasons.append('page has console/runtime errors')

    observed_path = normalize_observed_path(details.get('observed_path'))
    if isinstance(page_state, dict) and expected_path and observed_path and not route_matches_expected(expected_path, observed_path):
        raw_observed = details.get('observed_path_raw') or details.get('observed_path') or observed_path
        reasons.append(f'wrong route: expected {expected_path}, got {raw_observed}')

    semantic_ready = (not has_enriched_page_state(page_state)) or details['semantic_anchor_count'] >= 1
    visual_ready = (
        details['has_screenshot']
        and details['body_text_length'] >= MIN_BODY_TEXT_LENGTH
        and details['interactive_elements'] >= MIN_INTERACTIVE_ELEMENTS
        and semantic_ready
        and not details['has_errors']
    )
    telemetry_ready = (visual_ready or structured_ready) and not details['has_errors']

    return {
        'valid': len(reasons) == 0 and telemetry_ready,
        'reason': '; '.join(reasons) if reasons else 'ok',
        'telemetry_ready': telemetry_ready,
        'details': details,
    }


def build_capture_retry_decision(after_observation, required_baseline_present, proof_evidence_blocker=''):
    reasons = []
    if not required_baseline_present:
        reasons.append('Recon baseline is missing, so verify should return to recon instead of guessing a new reference context.')
        return {
            'decision': 'needs_recon',
            'summary': 'Verify is blocked on a missing recon baseline.',
            'recommended_stage': 'recon',
            'continue_with_stage': 'recon',
            'reasons': reasons,
        }

    if proof_evidence_blocker:
        reasons.append(proof_evidence_blocker)
        decision = 'missing_proof_evidence'
        if 'proof_evidence_present=false' in proof_evidence_blocker:
            decision = 'failed_proof_evidence'
            reasons.append('The capture reached usable page context, but the proof evidence explicitly failed its own required audio gate.')
        else:
            reasons.append('The capture reached usable page context, but the proof script did not emit the structured evidence required for this verification mode.')
        reasons.append('Return to author so the capture script can expose passing proof evidence before verify asks for a supervising-agent judgment.')
        return {
            'decision': decision,
            'summary': proof_evidence_blocker,
            'recommended_stage': 'author',
            'continue_with_stage': 'author',
            'reasons': reasons,
        }

    reason = after_observation.get('reason') or 'after capture is not usable yet'
    reasons.append('The after evidence is not usable yet: ' + reason)
    recommended_stage = 'recon' if 'wrong route' in reason else 'author'
    if recommended_stage == 'recon':
        reasons.append('The capture appears to be on the wrong route or baseline context, so recon should refresh the reference path.')
    else:
        reasons.append('The capture plan itself needs revision, so author should tighten the proof script or framing inputs.')
    return {
        'decision': 'revise_capture',
        'summary': 'Verify needs another internal capture iteration before the evidence can be judged.',
        'recommended_stage': recommended_stage,
        'continue_with_stage': recommended_stage,
        'reasons': reasons,
    }


def compact_semantic_list(value, limit):
    if not isinstance(value, list):
        return []
    return value[:limit]


def semantic_observation(label, observation):
    if not isinstance(observation, dict):
        observation = {}
    details = observation.get('details') or {}
    if not isinstance(details, dict):
        details = {}
    valid = observation.get('valid')
    if valid is None:
        valid = observation.get('ok')
    return {
        'label': label,
        'valid': bool(valid),
        'reason': observation.get('reason', ''),
        'telemetry_ready': bool(observation.get('telemetry_ready')),
        'url': observation.get('url', ''),
        'capture_url': observation.get('capture_url', ''),
        'observed_path': details.get('observed_path', ''),
        'observed_path_raw': details.get('observed_path_raw', ''),
        'title': details.get('title', ''),
        'visible_text_sample': details.get('visible_text_sample', ''),
        'headings': compact_semantic_list(details.get('headings'), 8),
        'buttons': compact_semantic_list(details.get('buttons'), 12),
        'links': compact_semantic_list(details.get('links'), 12),
        'canvas_count': details.get('canvas_count', 0),
        'interactive_elements': details.get('interactive_elements', 0),
        'visible_interactive_elements': details.get('visible_interactive_elements', 0),
        'semantic_anchor_count': details.get('semantic_anchor_count', 0),
        'large_visible_elements': compact_semantic_list(details.get('large_visible_elements'), 10),
    }


def build_semantic_context(state, results, after_observation, expected_path):
    baseline = (results.get('baseline') or {}) if isinstance(results, dict) else {}
    before = (baseline.get('before') or {}) if isinstance(baseline, dict) else {}
    prod = (baseline.get('prod') or {}) if isinstance(baseline, dict) else {}
    before_semantic = semantic_observation('before', before.get('observation') or {})
    prod_semantic = semantic_observation('prod', prod.get('observation') or {})
    after_semantic = semantic_observation('after', after_observation)
    return {
        'expected_path': expected_path,
        'reference': state.get('requested_reference') or state.get('reference', 'both'),
        'requested_change': state.get('change_request', ''),
        'success_criteria': (state.get('success_criteria') or '').strip(),
        'route': {
            'expected_path': expected_path,
            'before_observed_path': before_semantic.get('observed_path') or before.get('path') or '',
            'prod_observed_path': prod_semantic.get('observed_path') or prod.get('path') or '',
            'after_observed_path': after_semantic.get('observed_path') or '',
        },
        'before': before_semantic,
        'prod': prod_semantic,
        'after': after_semantic,
    }


def build_evidence_bundle(state, results, after_payload, after_observation, required_baseline_present, expected_path):
    supporting = collect_supporting_artifacts(after_payload)
    proof_evidence = extract_proof_evidence(after_payload)
    visual_delta = (
        extract_visual_delta(after_payload)
        if visual_delta_applies(state.get('verification_mode'))
        else {'status': 'not_applicable', 'passed': None, 'reason': 'Verification mode does not require visual delta gating.'}
    )
    semantic_context = build_semantic_context(state, results, after_observation, expected_path)
    artifact_contract = artifact_contract_for_mode(state.get('verification_mode'))
    artifact_production = artifact_production_summary(after_payload, supporting)
    artifact_usage = artifact_usage_summary(
        state,
        after_observation,
        supporting,
        visual_delta,
        required_baseline_present,
        semantic_context,
        [],
    )
    return {
        'verification_mode': normalized_verification_mode(state.get('verification_mode')),
        'reference': state.get('requested_reference') or state.get('reference', 'both'),
        'expected_path': expected_path,
        'required_baseline_present': required_baseline_present,
        'baseline': results.get('baseline') or {},
        'semantic_context': semantic_context,
        'artifact_contract': artifact_contract,
        'artifact_production': artifact_production,
        'artifact_usage': artifact_usage,
        'after': {
            'screenshot_url': state.get('after_cdn') or '',
            'observation': after_observation,
            'supporting_artifacts': supporting,
            'proof_evidence': proof_evidence,
            'proof_evidence_sample': compact_value(proof_evidence) if proof_evidence is not None else '',
            'visual_delta': visual_delta,
        },
        'proof_evidence': proof_evidence,
        'proof_evidence_sample': compact_value(proof_evidence) if proof_evidence is not None else '',
        'success_criteria': (state.get('success_criteria') or '').strip(),
        'assertions': state.get('parsed_assertions') or None,
    }


def build_supervisor_assessment_request(state, payload, after_observation, required_baseline_present, expected_path, evidence_bundle=None):
    verification_mode = ((state.get('verification_mode') or 'proof').strip().lower() or 'proof')
    supporting = collect_supporting_artifacts(payload)
    has_assertions = bool(state.get('parsed_assertions'))
    has_success_criteria = bool((state.get('success_criteria') or '').strip())
    evidence_basis = []
    if required_baseline_present:
        evidence_basis.append('recon-baseline')
    if after_observation.get('valid'):
        evidence_basis.append('after-capture')
    if supporting['image_outputs']:
        evidence_basis.append('screenshots')
    if supporting['has_structured_payload']:
        evidence_basis.append('structured-artifacts')
    visual_delta = ((evidence_bundle or {}).get('after') or {}).get('visual_delta') or {}
    if visual_delta.get('status') == 'measured':
        evidence_basis.append('visual-delta')
    semantic_context = ((evidence_bundle or {}).get('semantic_context') or {})
    if semantic_context:
        evidence_basis.append('semantic-context')
    if has_assertions:
        evidence_basis.append('assertions')
    if has_success_criteria:
        evidence_basis.append('success-criteria')

    artifact_contract = (evidence_bundle or {}).get('artifact_contract') if isinstance(evidence_bundle, dict) else None
    if not isinstance(artifact_contract, dict):
        artifact_contract = artifact_contract_for_mode(verification_mode)
    artifact_production = (evidence_bundle or {}).get('artifact_production') if isinstance(evidence_bundle, dict) else None
    if not isinstance(artifact_production, dict):
        artifact_production = artifact_production_summary(payload, supporting)
    artifact_usage = artifact_usage_summary(
        state,
        after_observation,
        supporting,
        visual_delta,
        required_baseline_present,
        semantic_context,
        evidence_basis,
    )
    if isinstance(evidence_bundle, dict):
        evidence_bundle['artifact_contract'] = artifact_contract
        evidence_bundle['artifact_production'] = artifact_production
        evidence_bundle['artifact_usage'] = artifact_usage

    return {
        'status': 'needs_supervising_agent_assessment',
        'verification_mode': verification_mode,
        'expected_path': expected_path,
        'required_baseline_present': required_baseline_present,
        'after_observation': after_observation,
        'supporting_artifacts': supporting,
        'visual_delta': visual_delta,
        'semantic_context': semantic_context,
        'evidence_bundle': evidence_bundle or {},
        'evidence_basis': evidence_basis,
        'artifact_contract': artifact_contract,
        'artifact_production': artifact_production,
        'artifact_usage': artifact_usage,
        'instructions': [
            'The supervising agent owns proof assessment. Inspect the recon baseline(s), after evidence, and any structured artifacts together.',
            'Decide whether the evidence is ready_to_ship or should continue internally through author, implement, or recon.',
            'Do not mark ready_to_ship if the before/prod baseline is blank, shell-only, generic, or not visibly tied to the requested feature.',
            'Use semantic_context.route plus headings/buttons/text anchors to ground route and content judgment before treating a screenshot as wrong-route.',
            'For visual/UI modes, use screenshots plus after_observation.details.visible_text_sample, headings, buttons, links, canvas_count, and large_visible_elements to explain what the proof actually shows.',
            'For visual/UI polish, capture success is not proof. If visual_delta.status=measured and visual_delta.passed=false, choose needs_implementation or needs_richer_proof instead of ready_to_ship.',
            'If visual_delta.status=unmeasured for visual/UI proof, only choose ready_to_ship when the screenshots and page-state details let you name a clearly legible before/after change; otherwise request richer proof or another implementation pass.',
            'For data/audio/log/metrics/custom modes, judge the structured evidence bundle and proof_evidence_sample directly; screenshots are optional supporting context.',
            'The summary must name the concrete change, the target route/UI, what changed in after evidence, and why the stop condition is satisfied.',
            'Only set escalation_target=human when you conclude the workflow has hit a real wall or is not converging.',
            'Pass the judgment back via proof_assessment_json and resume the workflow.',
        ],
        'response_schema': {
            'decision': 'ready_to_ship | needs_richer_proof | revise_capture | needs_recon | needs_implementation',
            'summary': 'string',
            'recommended_stage': 'author | implement | recon | ship | verify',
            'continue_with_stage': 'author | implement | recon | ship | verify',
            'escalation_target': 'agent | human',
            'reasons': ['string'],
            'source': 'supervising_agent',
        },
    }


s = load_state()
capture_script = (s.get('capture_script') or '').strip()
if not capture_script:
    raise SystemExit('capture_script not set in state. Recon should finish homework first, then verify should receive the real capture plan.')

if s.get('implementation_status') not in ('changes_detected', 'completed'):
    raise SystemExit('Implementation not recorded. Make the code changes and run riddle-proof-implement before verify.')

mode = s.get('mode', 'server')
reference = s.get('requested_reference') or s.get('reference', 'both')
prod_url = (s.get('prod_url') or '').strip()
after_dir = s.get('after_worktree', '').strip()
if not after_dir or not os.path.exists(after_dir):
    raise SystemExit('after_worktree not found. Run setup first.')

build_cmd = s.get('build_command', 'npm run build')
recon_baselines = ((s.get('recon_results') or {}).get('baselines') or {})
expected_path = (
    (recon_baselines.get('before') or {}).get('path')
    or (recon_baselines.get('prod') or {}).get('path')
    or ((s.get('recon_hypothesis') or {}).get('target_path'))
    or s.get('server_path')
    or '/'
)
verification_mode = normalized_verification_mode(s.get('verification_mode'))
probe_capture_script = build_probe_capture_script(capture_script, verification_mode)
results = {
    'baseline': {
        'reference': reference,
        'before': None,
        'prod': None,
    }
}

# Refresh auth tokens
if s.get('use_auth', '').lower() in ('true', '1', 'yes'):
    print('Refreshing auth tokens...')
    try:
        auth = invoke('auth_cognito_tokens', {}, timeout=60)
        if auth.get('ok') and auth.get('localStorage'):
            merged_local_storage = dict(auth['localStorage'])
            merged_local_storage.update(s.get('auth_explicit_localStorage') or {})
            s['auth_localStorage'] = merged_local_storage
            print('Auth tokens refreshed.')
        else:
            raise SystemExit('auth_cognito_tokens failed for use_auth=true: ' + str(auth.get('error', '')))
    except Exception as e:
        raise SystemExit('auth_cognito_tokens failed for use_auth=true: ' + str(e))

existing_before = (s.get('before_cdn') or '').strip()
existing_prod = (s.get('prod_cdn') or '').strip()
if reference in ('before', 'both') and not existing_before:
    raise SystemExit('Recon baseline missing: before_cdn is empty. Run recon again and confirm the before baseline succeeds before verify.')
if reference in ('prod', 'both') and prod_url and not existing_prod:
    raise SystemExit('Recon baseline missing: prod_cdn is empty. Run recon again and confirm the prod baseline succeeds before verify.')
if reference == 'prod' and not prod_url:
    raise SystemExit('reference is "prod" but no prod_url provided.')

if existing_before:
    before_baseline = recon_baselines.get('before', {})
    results['baseline']['before'] = {
        'url': existing_before,
        'source': 'recon',
        'path': before_baseline.get('path', s.get('server_path', '')),
        'observation': before_baseline.get('observation') or {},
    }
if existing_prod:
    prod_baseline = recon_baselines.get('prod', {})
    results['baseline']['prod'] = {
        'url': existing_prod,
        'source': 'recon',
        'path': prod_baseline.get('path', s.get('server_path', '')),
        'observation': prod_baseline.get('observation') or {},
    }

print('Verify will reuse recon baseline(s).')
if existing_before:
    print('Before baseline: ' + existing_before)
if existing_prod:
    print('Prod baseline: ' + existing_prod)

# AFTER (always from after worktree)
record_verify_phase('build', 'running', 'Building after worktree for verify capture.')
print('Building after worktree...')
build_attempt = run_project_build(after_dir, build_cmd, timeout=600, clean_cache_dir='.next')
br = build_attempt.get('result')
if build_attempt.get('clean_retry_used'):
    print('Verify build recovered after cleaning .next cache.')
if br.returncode != 0:
    record_verify_phase('build', 'failed', 'After build failed: ' + br.stderr[:300])
    raise SystemExit('After build failed: ' + br.stderr[:500])
if build_attempt.get('attempts'):
    s['verify_build_attempts'] = build_attempt['attempts']
    s['verify_build_clean_retry_used'] = bool(build_attempt.get('clean_retry_used'))
record_verify_phase('build', 'completed', 'After worktree build completed.')

after_payload = {}
static_reason = should_use_static_preview(after_dir, s) if mode == 'server' else ''
record_verify_phase('capture', 'running', 'Capturing after-proof evidence.')
if mode == 'server' and not static_reason:
    build_dir, server_command, server_exclude = prepare_server_preview(after_dir, s)

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
    }
    if s.get('server_path'):
        server_args['path'] = s['server_path']
        server_args['readiness_path'] = '/' if has_auth_context(s) else s['server_path']
    if s.get('color_scheme'):
        server_args['color_scheme'] = s['color_scheme']
    if s.get('wait_for_selector'):
        server_args['wait_for_selector'] = s['wait_for_selector']
    apply_auth_context(s, server_args)
    server_args['script'] = probe_capture_script

    print('Running after server preview from: ' + build_dir)
    shot = invoke_retry('riddle_server_preview', server_args, retries=3, timeout=420)
    append_capture_diagnostic(s, 'after', 'riddle_server_preview', server_args, shot)
    after_payload = shot
    capture_error = capture_payload_error(after_payload)
    if capture_error:
        abort_capture_failure(s, results, expected_path, capture_error, after_payload)
    url = extract_screenshot_url(shot, 'after-proof')
    if not url:
        print('WARNING: After server preview no screenshot.')
    results['after'] = {'screenshots': [{'url': url}] if url else [], 'raw': shot}
    s['after_cdn'] = url

else:
    if static_reason:
        print('Static preview fallback for after capture: ' + static_reason)
    old_id = s.get('after_preview_id', '')
    if old_id:
        invoke('riddle_preview_delete', {'id': old_id}, timeout=30)
    capture = capture_static_preview(s, after_dir, 'after', probe_capture_script, timeout=300, target_path=s.get('server_path', ''))
    s['after_preview_id'] = capture.get('preview_id', '')
    after_payload = ((capture.get('raw') or {}).get('capture') or (capture.get('raw') or {}) or capture)
    append_capture_diagnostic(
        s,
        'after',
        'riddle_static_preview',
        {'target_path': s.get('server_path', ''), 'static_fallback_reason': static_reason},
        after_payload,
    )
    capture_error = capture_payload_error(after_payload)
    if capture_error:
        abort_capture_failure(s, results, expected_path, capture_error, after_payload)
    results['after'] = {'screenshots': [{'url': capture.get('url', '')}] if capture.get('url') else [], 'raw': capture.get('raw')}
    s['after_cdn'] = capture.get('url', '')

after_observation = evaluate_capture_quality(after_payload, expected_path, verification_mode)
results['after']['observation'] = after_observation
results['after']['supporting_artifacts'] = collect_supporting_artifacts(after_payload)
record_verify_phase('capture', 'completed', 'After-proof capture completed.')

# Structured proof summary
record_verify_phase('assessment', 'running', 'Assessing verify evidence bundle.')
s['verify_results'] = results
s['stage'] = 'verify'
assertions = s.get('parsed_assertions')
if assertions:
    s['assertion_status'] = 'specified'
else:
    s['assertion_status'] = 'not_specified'

summary_lines = []
summary_lines.append('Original request: ' + s.get('change_request', ''))
summary_lines.append('Verification mode: ' + s.get('verification_mode', 'proof'))
if s.get('success_criteria'):
    summary_lines.append('Success criteria: ' + s['success_criteria'])
if s.get('implementation_summary'):
    summary_lines.append('Implementation summary: ' + s['implementation_summary'])
if s.get('implementation_notes'):
    summary_lines.append('Implementation notes: ' + s['implementation_notes'])
if isinstance(s.get('changed_files'), list) and s.get('changed_files'):
    summary_lines.append('Changed files: ' + ', '.join(str(item) for item in s['changed_files'][:12]))
if s.get('proof_plan'):
    summary_lines.append('Authored proof plan: ' + s['proof_plan'])
if s.get('supervisor_author_summary'):
    summary_lines.append('Supervisor author summary: ' + str(s['supervisor_author_summary']))
if s.get('supervisor_author_rationale'):
    rationale = s['supervisor_author_rationale']
    if isinstance(rationale, list):
        summary_lines.append('Supervisor author rationale: ' + '; '.join(str(item) for item in rationale[:4]))
    else:
        summary_lines.append('Supervisor author rationale: ' + str(rationale))
if existing_before:
    summary_lines.append('Before baseline (recon): ' + existing_before)
if existing_prod:
    summary_lines.append('Prod baseline (recon): ' + existing_prod)
summary_lines.append('After screenshot: ' + (s.get('after_cdn') or '(none)'))
summary_lines.append('Expected proof path from recon: ' + expected_path)
summary_lines.append('After observation: ' + after_observation['reason'])
supporting = results['after'].get('supporting_artifacts') or {}
if supporting.get('has_structured_payload'):
    basis = []
    if supporting.get('structured_result_keys'):
        basis.append('result keys: ' + ', '.join(str(item) for item in supporting.get('structured_result_keys', [])[:8]))
    if supporting.get('data_outputs'):
        basis.append('data outputs: ' + ', '.join(str((item or {}).get('name', '')) for item in supporting.get('data_outputs', [])[:8]))
    if supporting.get('proof_evidence_present'):
        basis.append('proof evidence: ' + str(supporting.get('proof_evidence_sample', ''))[:400])
    summary_lines.append('Structured after evidence: ' + ('; '.join(basis) if basis else 'present'))
observed_path = (after_observation.get('details') or {}).get('observed_path') or expected_path
summary_lines.append('Observed after path: ' + observed_path)
details = after_observation.get('details') or {}
if details.get('headings'):
    summary_lines.append('Visible headings: ' + '; '.join(str(item) for item in details.get('headings', [])[:6]))
if details.get('buttons'):
    summary_lines.append('Visible buttons: ' + '; '.join(str(item) for item in details.get('buttons', [])[:8]))
if details.get('visible_text_sample'):
    summary_lines.append('Visible text sample: ' + str(details['visible_text_sample'])[:500])
if assertions:
    if isinstance(assertions, list):
        summary_lines.append('Assertions supplied: ' + str(len(assertions)))
    elif isinstance(assertions, dict):
        summary_lines.append('Assertions supplied: yes')

required_baseline_present = True
if reference in ('before', 'both'):
    required_baseline_present = required_baseline_present and bool(existing_before)
if reference in ('prod', 'both') and prod_url:
    required_baseline_present = required_baseline_present and bool(existing_prod)

evidence_bundle = build_evidence_bundle(s, results, after_payload, after_observation, required_baseline_present, expected_path)
s['evidence_bundle'] = evidence_bundle
visual_delta = ((evidence_bundle.get('after') or {}).get('visual_delta') or {})
if visual_delta.get('status') != 'not_applicable':
    summary_lines.append('Visual delta gate: ' + compact_value(visual_delta, limit=700))

proof_evidence_blocker = ''
if proof_evidence_required_for_mode(s.get('verification_mode')):
    proof_evidence = evidence_bundle.get('proof_evidence')
    if proof_evidence is None:
        proof_evidence_blocker = (
            'Audio verification requires proof_evidence_present=true, but the after capture did not emit structured proof evidence.'
        )
    else:
        proof_evidence_blocker = failed_proof_evidence_summary(proof_evidence)
    if proof_evidence_blocker:
        summary_lines.append('Structured proof evidence gate: ' + proof_evidence_blocker)

has_good_evidence = required_baseline_present and after_observation.get('valid') and not proof_evidence_blocker

if has_good_evidence:
    s['capture_hint_saved'] = record_successful_capture_hint(
        s,
        server_path=expected_path or s.get('server_path') or '/',
        wait_for_selector=s.get('wait_for_selector') or '',
        observed_path=observed_path,
        source_stage='verify',
        success_signal='evidence_captured',
    )

if has_good_evidence:
    supervisor_request = build_supervisor_assessment_request(s, after_payload, after_observation, required_baseline_present, expected_path, evidence_bundle)
    s['verify_status'] = 'evidence_captured'
    s['merge_recommendation'] = 'pending-supervisor-judgment'
    s['proof_assessment'] = {}
    s['proof_assessment_source'] = None
    s['proof_assessment_request'] = supervisor_request
    s['verify_decision_request'] = {
        'status': s['verify_status'],
        'summary': 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.',
        'expected_path': expected_path,
        'latest_observation': after_observation,
        'next_stage_options': ['verify', 'author', 'implement', 'ship', 'recon'],
        'recommended_stage': None,
        'continue_with_stage': None,
        'fields_agent_may_update': ['proof_assessment_json', 'capture_script', 'server_path', 'wait_for_selector', 'implementation_notes', 'proof_plan', 'assertions_json'],
        'assessment_request': supervisor_request,
        'instructions': [
            'Inspect the recon baseline(s), after evidence, and any structured artifacts together.',
            'The supervising agent should return a proof_assessment_json payload describing ship vs continued internal iteration.',
            'Do not escalate to the human unless the supervising agent concludes the workflow is genuinely stuck or not converging.',
        ],
    }
    summary_lines.append('Proof assessment: awaiting supervising agent judgment')
    summary_lines.append('Proof next stage: supervising agent decides after reviewing the evidence packet')
else:
    capture_retry = build_capture_retry_decision(after_observation, required_baseline_present, proof_evidence_blocker)
    s['verify_status'] = 'capture_incomplete'
    s['merge_recommendation'] = 'do-not-merge'
    s['proof_assessment'] = {}
    s['proof_assessment_source'] = None
    s['proof_assessment_request'] = {}
    s['verify_decision_request'] = {
        'status': s['verify_status'],
        'summary': capture_retry['summary'],
        'expected_path': expected_path,
        'latest_observation': after_observation,
        'capture_quality': capture_retry,
        'next_stage_options': ['author', 'verify', 'implement', 'recon'],
        'recommended_stage': capture_retry.get('recommended_stage') or 'author',
        'continue_with_stage': capture_retry.get('continue_with_stage') or 'author',
        'fields_agent_may_update': ['capture_script', 'server_path', 'wait_for_selector', 'proof_plan'],
        'instructions': [
            'The after-proof is missing or low quality, so return to author when the capture plan itself needs revision.',
            'Adjust capture_script, server_path, wait_for_selector, and/or proof_plan before rerunning verify.',
            'If the baseline itself is wrong, return to recon instead of forcing verify to rediscover context.',
        ],
    }
    summary_lines.append('Proof assessment: not yet possible because the after capture is still incomplete')
    summary_lines.append('Proof next stage: ' + str(capture_retry.get('recommended_stage') or 'author'))

s['verify_summary'] = '\n'.join(summary_lines)
s['proof_summary'] = s['verify_summary']
s['evidence_notes'] = [
    'Review recon baseline(s), after evidence, and any supervising-agent proof assessment together.',
    'Proof evidence can be screenshots, structured metrics/logs/artifacts, assertions, or a mix.',
    'Treat screenshots as supporting proof, not the only proof source.',
    'Only merge if the evidence satisfies the stated success criteria for the chosen verification_mode.',
]

save_state(s)
record_verify_phase('assessment', 'completed', 'Verify evidence assessment completed.')

assessment_status = 'awaiting_supervising_agent' if s.get('verify_status') == 'evidence_captured' else 'capture_incomplete'

print()
print('=' * 50)
print('EVIDENCE')
print('=' * 50)
print('BEFORE: ' + (existing_before or '(none)'))
if existing_prod:
    print('PROD:   ' + existing_prod)
print('AFTER SCREENSHOT: ' + s.get('after_cdn', '(none)'))
if supporting.get('has_structured_payload'):
    print('AFTER STRUCTURED EVIDENCE: yes')
print('VERIFY STATUS: ' + s.get('verify_status', 'unknown'))
print('ASSERTION STATUS: ' + s.get('assertion_status', 'unknown'))
print('MERGE RECOMMENDATION: ' + s.get('merge_recommendation', ''))
print('PROOF ASSESSMENT: ' + assessment_status)
print()
print('PROOF SUMMARY:')
print(s.get('proof_summary', ''))
print(json.dumps({'ok': True, 'merge_recommendation': s.get('merge_recommendation', ''), 'verify_status': s.get('verify_status', ''), 'proof_assessment': assessment_status}))
