"""Verify: capture after evidence against the baseline already established in recon.

Verify no longer discovers baseline context.
It reuses recon-owned before / prod evidence and focuses on the after-proof.
It now treats capture quality as a first-class sub-loop: bad captures stay in verify,
while good captures produce a structured evidence packet that the supervising agent
must assess before the wrapper routes back into author/implement/recon work or ship.
"""

import json, os, re, struct, sys, time, zlib
from urllib.parse import parse_qsl, urlparse
from urllib.request import Request, urlopen
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import (
    append_capture_diagnostic,
    apply_auth_context,
    build_capture_script,
    build_visual_proof_session,
    capture_proof_session_seed,
    capture_static_preview,
    capture_viewport_matrix_status,
    enrich_capture_payload,
    has_auth_context,
    invoke,
    invoke_retry,
    join_url_path,
    load_state,
    prepare_server_preview,
    record_successful_capture_hint,
    run_project_build,
    save_state,
    should_use_static_preview,
    proof_session_output_url,
    summarize_capture_artifacts,
    viewport_matrix_return_js,
    viewport_matrix_screenshot_js,
    viewport_matrix_setup_js,
)
import subprocess as sp

MIN_BODY_TEXT_LENGTH = 50
MIN_INTERACTIVE_ELEMENTS = 1
MIN_CANVAS_AREA = 50000
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
PLAYABILITY_MODES = {'playable', 'gameplay', 'game'}
PROOF_EVIDENCE_REQUIRED_MODES = {'audio'}
MIN_VISUAL_DELTA_PERCENT = 0.5
MIN_VISUAL_CHANGED_PIXELS = 5000
TARGETED_VISUAL_DELTA_PERCENT = 0.02
TARGETED_VISUAL_CHANGED_PIXELS = 250
TARGETED_CHANGED_REGION_MAX_AREA_PERCENT = 20
TARGETED_SEMANTIC_STOPWORDS = {
    'about', 'after', 'agent', 'again', 'before', 'browser', 'button',
    'change', 'changed', 'click', 'copy', 'delta', 'does', 'from', 'into',
    'layout', 'mode', 'page', 'proof', 'route', 'screen', 'shows', 'small',
    'target', 'that', 'this', 'until', 'update', 'user', 'verify', 'view',
    'visual', 'with',
}
VISUAL_DELTA_PERCENT_KEYS = {
    'change_pct', 'change_percent', 'changed_percent', 'percent_changed',
    'diff_percent', 'visual_delta_percent', 'pixel_change_percent',
    'changepercent', 'changedpercent', 'percentchanged', 'diffpercent',
    'visualdeltapercent', 'pixelchangepercent', 'difference_percent',
    'differencepercent', 'diff_percentage', 'diffpercentage',
    'mismatch_percent', 'mismatchpercent', 'percentage', 'percent',
}
VISUAL_DELTA_RATIO_KEYS = {
    'change_ratio', 'changed_ratio', 'diff_ratio', 'visual_delta_ratio',
    'changeratio', 'changedratio', 'diffratio', 'visualdeltaratio',
    'difference_ratio', 'differenceratio', 'mismatch_ratio', 'mismatchratio',
}
VISUAL_CHANGED_PIXEL_KEYS = {
    'changed_pixels', 'changed_pixel_count', 'changedpixels',
    'diff_pixels', 'pixel_delta', 'visual_delta_pixels',
    'diffpixels', 'pixeldelta', 'visualdeltapixels', 'different_pixels',
    'differentpixels', 'mismatch_pixels', 'mismatchpixels', 'pixels_changed',
    'pixelschanged', 'diff_pixel_count', 'diffpixelcount',
    'pixel_diff_count', 'pixeldiffcount', 'different_pixel_count',
    'differentpixelcount', 'num_different_pixels', 'numdifferentpixels',
}
VISUAL_TOTAL_PIXEL_KEYS = {
    'total_pixels', 'total_pixel_count', 'pixel_count', 'totalpixels',
}
VISUAL_WIDTH_KEYS = {'width', 'image_width', 'screenshot_width'}
VISUAL_HEIGHT_KEYS = {'height', 'image_height', 'screenshot_height'}
VISUAL_CHANGED_REGION_KEYS = {
    'changed_region', 'changedregion', 'diff_region', 'diffregion',
    'difference_region', 'differenceregion', 'changed_bounds',
    'changedbounds', 'diff_bounds', 'diffbounds', 'difference_bounds',
    'differencebounds', 'bounding_box', 'boundingbox', 'bbox', 'bounds',
}
VISUAL_REGION_X_KEYS = {'x', 'left', 'min_x', 'minx'}
VISUAL_REGION_Y_KEYS = {'y', 'top', 'min_y', 'miny'}
VISUAL_REGION_WIDTH_KEYS = {'width', 'w'}
VISUAL_REGION_HEIGHT_KEYS = {'height', 'h'}
VISUAL_REGION_RIGHT_KEYS = {'right', 'max_x', 'maxx'}
VISUAL_REGION_BOTTOM_KEYS = {'bottom', 'max_y', 'maxy'}


def capture_script_saves_screenshot(script):
    return 'saveScreenshot' in (script or '')


def explicitly_false(value):
    if value is False:
        return True
    if isinstance(value, str):
        return value.strip().lower() in ('false', '0', 'no', 'off')
    return False


def audit_no_diff_mode(state):
    implementation_mode = str(state.get('implementation_mode') or '').strip().lower()
    workflow_mode = str(state.get('workflow_mode') or '').strip().lower()
    return (
        state.get('implementation_status') == 'not_required'
        or implementation_mode in ('none', 'audit', 'no_implementation', 'no-implementation')
        or workflow_mode == 'audit'
        or explicitly_false(state.get('require_diff'))
        or explicitly_false(state.get('allow_code_changes'))
    )


def implementation_ready_for_verify(state):
    if audit_no_diff_mode(state):
        return True
    return state.get('implementation_status') in ('changes_detected', 'completed')


def visual_delta_required_for_state(state):
    return visual_delta_applies(state.get('verification_mode')) and not audit_no_diff_mode(state)


def audit_current_capture_url(state, prod_url, expected_path):
    target = (prod_url or '').strip()
    server_path = (state.get('server_path') or '').strip()
    if target:
        parsed = urlparse(target)
        if server_path and server_path != '/' and (not parsed.path or parsed.path == '/'):
            return join_url_path(target, server_path)
        return target
    fallback = (state.get('target_url') or state.get('url') or '').strip()
    if fallback:
        return fallback
    return ''


def capture_current_target(state, target_url, label, capture_script, timeout=300):
    script = build_capture_script(target_url, capture_script, label, state.get('wait_for_selector', ''), state.get('viewport_matrix'))
    args = {'script': script, 'timeout_sec': 60}
    apply_auth_context(state, args)
    shot = invoke_retry('riddle_script', args, retries=3, timeout=max(timeout, 120))
    screenshots = shot.get('screenshots') or []
    url = screenshots[0].get('url', '') if screenshots else extract_screenshot_url(shot, label)
    return {
        'ok': bool(url),
        'capture_url': target_url,
        'url': url,
        'raw': shot,
    }


def baseline_payload_from_recon(state, results):
    baseline = (results.get('baseline') or {}) if isinstance(results, dict) else {}
    selected = baseline.get('prod') or baseline.get('before') or {}
    url = selected.get('url') if isinstance(selected, dict) else ''
    if not url:
        return {'ok': False, 'error': 'Audit/no-diff verify has no current target URL and no recon screenshot to reuse.'}
    return {
        'ok': True,
        'screenshots': [{'name': 'after-proof', 'url': url}],
        'result': {
            'audit_no_diff_reused_recon_baseline': True,
            'baseline_source': selected.get('source') or 'recon',
            'path': selected.get('path') or state.get('server_path') or '',
        },
    }


def normalized_verification_mode(value):
    return ((value or 'proof').strip().lower() or 'proof')


def proof_evidence_required_for_mode(verification_mode):
    mode = normalized_verification_mode(verification_mode)
    return mode in PROOF_EVIDENCE_REQUIRED_MODES or mode in PLAYABILITY_MODES


def screenshot_required_for_mode(verification_mode):
    mode = normalized_verification_mode(verification_mode)
    return mode in VISUAL_FIRST_MODES or mode in PLAYABILITY_MODES


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


def build_probe_capture_script(base_script='', verification_mode='proof', proof_session_seed=None, viewport_matrix=None):
    pieces = []
    script = (base_script or '').strip()
    pieces.extend(viewport_matrix_setup_js(viewport_matrix))
    pieces.append('let __riddleProofCaptureScriptError = null;')
    pieces.append('let __riddleProofCaptureScriptResult = null;')
    if script:
        pieces.extend([
            'try {',
            '__riddleProofCaptureScriptResult = await (async () => {',
            script.rstrip(';') + ';',
            '})();',
            '} catch (err) {',
            '  __riddleProofCaptureScriptError = err;',
            '}',
        ])
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
        'let __riddleProofEvidenceValue = __riddleProofCaptureScriptResult ?? null;',
        'if (__riddleProofEvidenceValue === null || __riddleProofEvidenceValue === undefined) { try {',
        '  __riddleProofEvidenceValue = await page.evaluate(() => {',
        '    const root = (typeof window !== "undefined" && window) || {};',
        '    return root.__riddleProofEvidence ?? root.riddleProofEvidence ?? null;',
        '  });',
        '} catch {} }',
        'if (__riddleProofEvidenceValue !== null && __riddleProofEvidenceValue !== undefined) {',
        '  try { console.log(' + json.dumps(PROOF_EVIDENCE_PREFIX) + ' + JSON.stringify(__riddleProofEvidenceValue)); }',
        '  catch (err) { console.log(' + json.dumps(PROOF_EVIDENCE_PREFIX) + ' + JSON.stringify({ serialization_error: String(err) })); }',
        '}',
    ])
    viewport_screenshot_lines = viewport_matrix_screenshot_js('after-proof', viewport_matrix)
    if auto_screenshot_for_mode(verification_mode) and viewport_screenshot_lines:
        pieces.extend(viewport_screenshot_lines)
    elif auto_screenshot_for_mode(verification_mode) and not capture_script_saves_screenshot(script):
        pieces.append("await saveScreenshot('after-proof');")
    if isinstance(proof_session_seed, dict):
        pieces.append(
            'try { if (typeof saveJson === "function") await saveJson("proof-session", ' +
            json.dumps(proof_session_seed) +
            '); } catch {}'
        )
    pieces.append('if (__riddleProofCaptureScriptError) throw __riddleProofCaptureScriptError;')
    pieces.append('return { pageState, proofEvidence: __riddleProofEvidenceValue, viewportMatrix: ' + viewport_matrix_return_js() + ' };')
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
    payload = enrich_capture_payload(payload)
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


PLAYABILITY_EVIDENCE_VERSION = 'riddle-proof.playability.v1'
PLAYABILITY_ASSESSMENT_VERSION = 'riddle-proof.playability.assessment.v1'
PLAYABILITY_CONTAINER_KEYS = (
    'playability', 'playability_evidence', 'playabilityEvidence',
    'playable', 'gameplay', 'gameplay_evidence', 'gameplayEvidence',
)
PLAYABILITY_INPUT_KEYS = (
    'inputAccepted', 'inputObserved', 'inputReceived', 'controlsWorked',
    'keyboardWorked', 'pointerWorked', 'touchWorked', 'steeringInputAccepted',
    'userInputObserved',
)
PLAYABILITY_STATE_KEYS = (
    'stateChanged', 'gameStateChanged', 'playStarted', 'simulationAdvanced',
    'distanceAdvanced', 'scoreChanged', 'hudChanged', 'positionChanged',
    'speedChanged',
)
PLAYABILITY_MOTION_KEYS = (
    'motionObserved', 'visualMotion', 'canvasChanged', 'pixelChanged',
    'playfieldMoved', 'playfieldPixelsChanged', 'nonHudPixelsChanged',
    'animationAdvanced', 'frameChanged', 'framesChanged',
)
PLAYABILITY_TIME_KEYS = (
    'timeProgressed', 'clockAdvanced', 'animationAdvanced',
    'simulationAdvanced', 'playStarted',
)
PLAYABILITY_PERCENT_KEYS = (
    'changed_percent', 'change_percent', 'percent_changed', 'diff_percent',
    'motion_percent', 'pixel_change_percent',
)
PLAYABILITY_RATIO_KEYS = (
    'changed_ratio', 'change_ratio', 'diff_ratio', 'motion_ratio',
    'pixel_change_ratio',
)
PLAYABILITY_PIXEL_KEYS = (
    'changed_pixels', 'changed_pixel_count', 'diff_pixels', 'motion_pixels',
    'pixel_delta', 'changedPixels',
)
PLAYABILITY_AVG_DELTA_KEYS = (
    'average_delta', 'avg_delta', 'mean_delta', 'avg_abs_delta',
    'mean_abs_delta',
)
PLAYABILITY_TIME_DELTA_KEYS = (
    'time_delta_ms', 'elapsed_ms', 'duration_ms', 'sample_duration_ms',
    'animation_delta_ms',
)
PLAYABILITY_THRESHOLDS = {
    'min_changed_percent': 0.5,
    'min_changed_pixels': 1000,
    'min_average_delta': 1,
    'min_time_delta_ms': 250,
}


def _numeric(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except Exception:
            return None
    return None


def _numeric_from_keys(record, keys):
    if not isinstance(record, dict):
        return None
    for key in keys:
        value = _numeric(record.get(key))
        if value is not None:
            return value
    return None


def _true_for_any_key(record, keys):
    return isinstance(record, dict) and any(record.get(key) is True for key in keys)


def _percent_from(record):
    percent = _numeric_from_keys(record, PLAYABILITY_PERCENT_KEYS)
    if percent is not None:
        return percent
    ratio = _numeric_from_keys(record, PLAYABILITY_RATIO_KEYS)
    if ratio is not None:
        return ratio * 100 if ratio <= 1 else ratio
    return None


def _parse_json_if_possible(value):
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or text[0] not in '[{':
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def _has_playability_shape(record):
    if not isinstance(record, dict):
        return False
    if record.get('version') == PLAYABILITY_EVIDENCE_VERSION:
        return True
    shape_keys = (
        'input_events', 'state_delta', 'pixel_delta', 'canvas_delta',
        'motion_delta', 'playfield_delta', 'time_delta_ms',
    )
    if any(key in record for key in shape_keys):
        return True
    assertions = record.get('assertions') if isinstance(record.get('assertions'), dict) else record
    return any(
        key in assertions
        for key in (
            PLAYABILITY_INPUT_KEYS
            + PLAYABILITY_STATE_KEYS
            + PLAYABILITY_MOTION_KEYS
            + PLAYABILITY_TIME_KEYS
        )
    )


def extract_playability_evidence(value, seen=None, depth=0):
    if depth > 6 or value is None:
        return None
    if seen is None:
        seen = set()
    parsed = _parse_json_if_possible(value)
    if parsed is not None:
        return extract_playability_evidence(parsed, seen, depth + 1)
    if isinstance(value, list):
        ident = id(value)
        if ident in seen:
            return None
        seen.add(ident)
        for item in value:
            found = extract_playability_evidence(item, seen, depth + 1)
            if found is not None:
                return found
        return None
    if not isinstance(value, dict):
        return None
    ident = id(value)
    if ident in seen:
        return None
    seen.add(ident)
    if _has_playability_shape(value):
        return value
    for key in PLAYABILITY_CONTAINER_KEYS:
        if key in value:
            found = extract_playability_evidence(value.get(key), seen, depth + 1)
            if found is not None:
                return found
            if isinstance(value.get(key), bool):
                return {'assertions': {key: value.get(key)}}
    for item in value.values():
        found = extract_playability_evidence(item, seen, depth + 1)
        if found is not None:
            return found
    return None


def assess_playability_evidence(value):
    evidence = extract_playability_evidence(value)
    metrics = {}
    required = {
        'input': True,
        'state_change': True,
        'motion': True,
        'time_progression': True,
    }
    if not isinstance(evidence, dict):
        return {
            'version': PLAYABILITY_ASSESSMENT_VERSION,
            'evidence_present': False,
            'passed': False,
            'input_observed': False,
            'state_changed': False,
            'motion_observed': False,
            'time_progressed': False,
            'concerns': ['playability evidence is missing'],
            'metrics': metrics,
            'thresholds': dict(PLAYABILITY_THRESHOLDS),
            'required': required,
            'evidence_keys': [],
        }

    assertions = evidence.get('assertions') if isinstance(evidence.get('assertions'), dict) else evidence
    input_events = []
    for key in ('input_events', 'inputs', 'interactions'):
        if isinstance(evidence.get(key), list):
            input_events.extend(evidence.get(key))
    input_count = _numeric_from_keys(evidence, ('input_event_count', 'input_count', 'interaction_count'))
    input_observed = bool(
        _true_for_any_key(assertions, PLAYABILITY_INPUT_KEYS)
        or input_events
        or (input_count is not None and input_count > 0)
    )

    state_delta = evidence.get('state_delta') if isinstance(evidence.get('state_delta'), dict) else evidence.get('stateDelta')
    changed_keys = []
    if isinstance(state_delta, dict):
        raw_keys = state_delta.get('changed_keys') or state_delta.get('changedKeys') or []
        if isinstance(raw_keys, list):
            changed_keys = raw_keys
    state_numeric_delta = _numeric_from_keys(evidence, (
        'distance_delta', 'score_delta', 'position_delta', 'speed_delta', 'hud_delta',
    ))
    if changed_keys:
        metrics['state_changed_keys'] = changed_keys
    if state_numeric_delta is not None:
        metrics['state_numeric_delta'] = state_numeric_delta
    state_changed = bool(
        _true_for_any_key(assertions, PLAYABILITY_STATE_KEYS)
        or (isinstance(state_delta, dict) and state_delta.get('changed') is True)
        or changed_keys
        or (state_numeric_delta is not None and abs(state_numeric_delta) > 0)
    )

    motion_observed = _true_for_any_key(assertions, PLAYABILITY_MOTION_KEYS)
    if not motion_observed:
        for source in (
            evidence.get('playfield_delta'), evidence.get('playfieldDelta'),
            evidence.get('non_hud_delta'), evidence.get('nonHudDelta'),
            evidence.get('pixel_delta'), evidence.get('pixelDelta'),
            evidence.get('canvas_delta'), evidence.get('canvasDelta'),
            evidence.get('motion_delta'), evidence.get('motionDelta'),
            evidence.get('visual_delta'), evidence.get('visualDelta'),
            evidence,
        ):
            if not isinstance(source, dict):
                continue
            percent = _percent_from(source)
            pixels = _numeric_from_keys(source, PLAYABILITY_PIXEL_KEYS)
            average_delta = _numeric_from_keys(source, PLAYABILITY_AVG_DELTA_KEYS)
            if percent is not None:
                metrics['changed_percent'] = percent
            if pixels is not None:
                metrics['changed_pixels'] = pixels
            if average_delta is not None:
                metrics['average_delta'] = average_delta
            motion_observed = bool(
                (percent is not None and percent >= PLAYABILITY_THRESHOLDS['min_changed_percent'])
                or (pixels is not None and pixels >= PLAYABILITY_THRESHOLDS['min_changed_pixels'])
                or (average_delta is not None and average_delta >= PLAYABILITY_THRESHOLDS['min_average_delta'])
            )
            if motion_observed:
                break

    time_delta = _numeric_from_keys(evidence, PLAYABILITY_TIME_DELTA_KEYS)
    if time_delta is None and isinstance(state_delta, dict):
        time_delta = _numeric_from_keys(state_delta, PLAYABILITY_TIME_DELTA_KEYS)
    if time_delta is not None:
        metrics['time_delta_ms'] = time_delta
    time_progressed = bool(
        _true_for_any_key(assertions, PLAYABILITY_TIME_KEYS)
        or (time_delta is not None and time_delta >= PLAYABILITY_THRESHOLDS['min_time_delta_ms'])
    )

    explicit_failure = bool(
        evidence.get('passed') is False
        or evidence.get('playable') is False
        or assertions.get('playabilityPassed') is False
        or any(assertions.get(key) is False for key in (
            PLAYABILITY_INPUT_KEYS
            + PLAYABILITY_STATE_KEYS
            + PLAYABILITY_MOTION_KEYS
            + PLAYABILITY_TIME_KEYS
        ))
    )

    concerns = []
    if not input_observed:
        concerns.append('no accepted player input was observed')
    if not state_changed:
        concerns.append('game state did not measurably change')
    if not motion_observed:
        concerns.append('playfield/canvas pixels did not measurably change')
    if not time_progressed:
        concerns.append('play time or animation time did not measurably progress')
    if explicit_failure:
        concerns.append('playability evidence includes an explicit failed assertion')

    return {
        'version': PLAYABILITY_ASSESSMENT_VERSION,
        'evidence_present': True,
        'passed': bool(input_observed and state_changed and motion_observed and time_progressed and not explicit_failure),
        'input_observed': input_observed,
        'state_changed': state_changed,
        'motion_observed': motion_observed,
        'time_progressed': time_progressed,
        'concerns': concerns,
        'metrics': metrics,
        'thresholds': dict(PLAYABILITY_THRESHOLDS),
        'required': required,
        'evidence_keys': list(evidence.keys()),
    }


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


def targeted_semantic_tokens(value, limit=24):
    text = ''
    try:
        text = json.dumps(value, sort_keys=True) if isinstance(value, (dict, list)) else str(value or '')
    except Exception:
        text = str(value or '')
    tokens = []
    for token in re.findall(r'[a-z0-9]+', text.lower()):
        if len(token) < 4 or token in TARGETED_SEMANTIC_STOPWORDS or token in tokens:
            continue
        tokens.append(token)
        if len(tokens) >= limit:
            break
    return tokens


def semantic_visible_text_for_delta(state=None, semantic_context=None):
    chunks = []
    after = (semantic_context or {}).get('after') if isinstance(semantic_context, dict) else {}
    for source in [after or {}]:
        if not isinstance(source, dict):
            continue
        for key in ('visible_text_sample', 'title'):
            if source.get(key):
                chunks.append(str(source.get(key)))
        for key in ('headings', 'buttons', 'links', 'large_visible_elements'):
            value = source.get(key)
            try:
                chunks.append(json.dumps(value, sort_keys=True))
            except Exception:
                chunks.append(str(value))
    return ' '.join(chunks).lower()


def targeted_assertion_text_sources(value, depth=0):
    if depth > 8:
        return []
    sources = []
    if isinstance(value, list):
        for item in value:
            sources.extend(targeted_assertion_text_sources(item, depth + 1))
        return sources
    if not isinstance(value, dict):
        return sources

    assertion_type = str(value.get('type') or value.get('kind') or '').strip().lower()
    text_keys = (
        'text', 'contains', 'pattern', 'label', 'copy', 'expected',
        'expected_text', 'expectedText', 'visible_text', 'visibleText',
    )
    text_values = [
        value.get(key)
        for key in text_keys
        if isinstance(value.get(key), str) and value.get(key).strip()
    ]
    type_is_textual = any(marker in assertion_type for marker in (
        'text', 'copy', 'visible', 'contains', 'label', 'heading', 'button', 'link', 'badge',
    ))
    if text_values and (type_is_textual or not assertion_type):
        sources.extend(text_values)

    for key in ('assertions', 'checks', 'expected', 'match', 'matches'):
        nested = value.get(key)
        if isinstance(nested, (dict, list)):
            sources.extend(targeted_assertion_text_sources(nested, depth + 1))
    return sources


def visual_delta_semantic_support(state=None, semantic_context=None):
    state = state if isinstance(state, dict) else {}
    visible_text = semantic_visible_text_for_delta(state, semantic_context)
    if not visible_text:
        return {
            'supported': False,
            'matched_tokens': [],
            'reason': 'no semantic text sample was available for targeted visual-delta thresholds',
        }

    assertion_sources = targeted_assertion_text_sources(state.get('parsed_assertions'))
    assertion_tokens = []
    for source in assertion_sources:
        for token in targeted_semantic_tokens(source):
            if token not in assertion_tokens:
                assertion_tokens.append(token)
    if not assertion_tokens:
        return {
            'supported': False,
            'matched_tokens': [],
            'reason': 'targeted visual-delta thresholds require text/visible assertions for the intended small change',
        }

    matched_assertion_tokens = [token for token in assertion_tokens if token in visible_text]
    context_tokens = []
    for source in (state.get('success_criteria'), state.get('change_request'), state.get('proof_plan')):
        for token in targeted_semantic_tokens(source):
            if token not in context_tokens:
                context_tokens.append(token)
    matched_context_tokens = [token for token in context_tokens if token in visible_text]
    return {
        'supported': len(matched_assertion_tokens) >= 1,
        'matched_tokens': (matched_assertion_tokens + [token for token in matched_context_tokens if token not in matched_assertion_tokens])[:12],
        'matched_assertion_tokens': matched_assertion_tokens[:12],
        'matched_context_tokens': matched_context_tokens[:12],
        'reason': 'text assertions matched visible after evidence' if matched_assertion_tokens else 'no text assertion tokens matched visible after evidence',
    }


def normalize_changed_region(value, total_pixels=None, changed_pixels=None, image_width=None, image_height=None, dimension_mismatch=False):
    if not isinstance(value, dict):
        return None

    x = find_metric_value(value, VISUAL_REGION_X_KEYS)
    y = find_metric_value(value, VISUAL_REGION_Y_KEYS)
    width = find_metric_value(value, VISUAL_REGION_WIDTH_KEYS)
    height = find_metric_value(value, VISUAL_REGION_HEIGHT_KEYS)
    right = find_metric_value(value, VISUAL_REGION_RIGHT_KEYS)
    bottom = find_metric_value(value, VISUAL_REGION_BOTTOM_KEYS)

    if width is None and x is not None and right is not None and right > x:
        width = right - x
    if height is None and y is not None and bottom is not None and bottom > y:
        height = bottom - y
    if x is None and width is not None and right is not None:
        x = right - width
    if y is None and height is not None and bottom is not None:
        y = bottom - height

    if x is None or y is None or width is None or height is None:
        return None
    if width <= 0 or height <= 0:
        return None

    x = int(round(x))
    y = int(round(y))
    width = int(round(width))
    height = int(round(height))
    area_pixels = width * height
    changed = metric_number(changed_pixels)
    total = metric_number(total_pixels)
    image_w = metric_number(image_width)
    image_h = metric_number(image_height)
    area_percent = (area_pixels / total) * 100 if total and total > 0 else None
    width_percent = (width / image_w) * 100 if image_w and image_w > 0 else None
    height_percent = (height / image_h) * 100 if image_h and image_h > 0 else None
    density = (changed / area_pixels) if changed is not None and area_pixels > 0 else None
    absolute_small_region = area_pixels <= max(TARGETED_VISUAL_CHANGED_PIXELS, int(changed or 0), 1)
    percent_localized = area_percent is not None and area_percent <= TARGETED_CHANGED_REGION_MAX_AREA_PERCENT
    localized = bool(not dimension_mismatch and (absolute_small_region or percent_localized))
    if dimension_mismatch:
        classification = 'geometry_change'
    elif absolute_small_region or (area_percent is not None and area_percent <= 1):
        classification = 'point_or_icon'
    elif localized:
        classification = 'localized'
    else:
        classification = 'broad'

    return {
        'present': True,
        'x': x,
        'y': y,
        'width': width,
        'height': height,
        'right': x + width,
        'bottom': y + height,
        'area_pixels': area_pixels,
        'area_percent': round(area_percent, 4) if area_percent is not None else None,
        'width_percent': round(width_percent, 4) if width_percent is not None else None,
        'height_percent': round(height_percent, 4) if height_percent is not None else None,
        'changed_pixel_density': round(density, 6) if density is not None else None,
        'localized_for_targeted_change': localized,
        'classification': classification,
        'dimension_mismatch': bool(dimension_mismatch),
    }


def find_changed_region(value, total_pixels=None, changed_pixels=None, image_width=None, image_height=None, depth=0):
    if depth > 7:
        return None
    if isinstance(value, dict):
        for raw_key, raw_value in value.items():
            if normalize_metric_key(raw_key) in VISUAL_CHANGED_REGION_KEYS:
                region = normalize_changed_region(
                    raw_value,
                    total_pixels=total_pixels,
                    changed_pixels=changed_pixels,
                    image_width=image_width,
                    image_height=image_height,
                )
                if region is not None:
                    return region
        for raw_value in value.values():
            region = find_changed_region(raw_value, total_pixels, changed_pixels, image_width, image_height, depth + 1)
            if region is not None:
                return region
    elif isinstance(value, list):
        for item in value[:60]:
            region = find_changed_region(item, total_pixels, changed_pixels, image_width, image_height, depth + 1)
            if region is not None:
                return region
    return None


def visual_delta_region_support(changed_region=None):
    if not isinstance(changed_region, dict) or not changed_region.get('present'):
        return {
            'available': False,
            'supported': None,
            'reason': 'no changed-region metadata was available for targeted visual-delta localization',
        }
    if changed_region.get('dimension_mismatch'):
        return {
            'available': True,
            'supported': False,
            'reason': 'changed-region metadata reports a screenshot geometry change',
            'classification': changed_region.get('classification'),
        }
    if changed_region.get('localized_for_targeted_change') is True:
        return {
            'available': True,
            'supported': True,
            'reason': 'changed pixels are localized enough for a targeted visual change',
            'classification': changed_region.get('classification'),
            'area_percent': changed_region.get('area_percent'),
        }
    return {
        'available': True,
        'supported': False,
        'reason': 'changed pixels are too broad for a targeted visual change',
        'classification': changed_region.get('classification'),
        'area_percent': changed_region.get('area_percent'),
    }


def visual_delta_thresholds_for_context(state=None, semantic_context=None, changed_region=None):
    semantic = visual_delta_semantic_support(state, semantic_context)
    localization = visual_delta_region_support(changed_region)
    if semantic.get('supported') and localization.get('supported') is not False:
        return {
            'mode': 'targeted_semantic',
            'min_change_percent': TARGETED_VISUAL_DELTA_PERCENT,
            'min_changed_pixels': TARGETED_VISUAL_CHANGED_PIXELS,
            'default_min_change_percent': MIN_VISUAL_DELTA_PERCENT,
            'default_min_changed_pixels': MIN_VISUAL_CHANGED_PIXELS,
            'semantic_support': semantic,
            'localization_support': localization,
        }
    return {
        'mode': 'default',
        'min_change_percent': MIN_VISUAL_DELTA_PERCENT,
        'min_changed_pixels': MIN_VISUAL_CHANGED_PIXELS,
        'semantic_support': semantic,
        'localization_support': localization,
    }


def visual_delta_pass_reason(source_label, passed, thresholds):
    mode = (thresholds or {}).get('mode')
    if passed and mode == 'targeted_semantic':
        return source_label + ' clears the targeted-change threshold with matching semantic/text evidence.'
    if passed:
        return source_label + ' clears the legibility threshold.'
    if mode == 'targeted_semantic':
        return source_label + ' is below even the targeted-change threshold; capture success alone is not proof.'
    return source_label + ' is below the legibility threshold; capture success alone is not proof.'


def extract_visual_delta(payload, state=None, semantic_context=None):
    payload = enrich_capture_payload(payload)
    result = payload.get('result') if isinstance(payload, dict) else {}
    proof_json = payload.get('_proof_json') if isinstance(payload, dict) else {}
    artifact_json = payload.get('_artifact_json') if isinstance(payload, dict) else {}
    proof_evidence = extract_proof_evidence(payload)
    screenshot_url = extract_screenshot_url(payload)
    artifact_summary = summarize_capture_artifacts(payload)
    candidates = [
        payload if isinstance(payload, dict) else {},
        result if isinstance(result, dict) else {},
        proof_json if isinstance(proof_json, dict) else {},
        payload.get('visual_diff') if isinstance(payload, dict) and isinstance(payload.get('visual_diff'), dict) else {},
        payload.get('visualDiff') if isinstance(payload, dict) and isinstance(payload.get('visualDiff'), dict) else {},
        result.get('visual_diff') if isinstance(result, dict) and isinstance(result.get('visual_diff'), dict) else {},
        result.get('visualDiff') if isinstance(result, dict) and isinstance(result.get('visualDiff'), dict) else {},
        artifact_json.get('visual-diff.json') if isinstance(artifact_json, dict) and isinstance(artifact_json.get('visual-diff.json'), dict) else {},
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

    changed_region = None
    for candidate in candidates:
        if candidate is None:
            continue
        changed_region = find_changed_region(candidate, total_pixels, changed_pixels, width, height)
        if changed_region is not None:
            break

    if percent is None and changed_pixels is None:
        has_artifacts = bool(
            screenshot_url
            or artifact_summary.get('outputs')
            or artifact_summary.get('screenshots')
            or artifact_summary.get('artifact_json')
        )
        reason = 'No measured before/after visual delta was found in proof evidence.'
        if screenshot_url:
            reason = (
                'After screenshot artifact is present, but no measured before/after visual delta metrics were emitted; '
                'the comparator did not run or did not publish change_percent/changed_pixels.'
            )
        elif has_artifacts:
            reason = (
                'Capture artifacts are present, but no measured before/after visual delta metrics were emitted; '
                'the comparator did not run or did not publish change_percent/changed_pixels.'
            )
        return {
            'status': 'unmeasured',
            'passed': None,
            'change_percent': None,
            'changed_pixels': None,
            'total_pixels': int(total_pixels) if total_pixels else None,
            'min_change_percent': MIN_VISUAL_DELTA_PERCENT,
            'min_changed_pixels': MIN_VISUAL_CHANGED_PIXELS,
            'reason': reason,
            'diagnostic': {
                'after_screenshot_present': bool(screenshot_url),
                'proof_evidence_present': proof_evidence is not None,
                'artifact_output_count': len(artifact_summary.get('outputs') or []),
                'artifact_screenshot_count': len(artifact_summary.get('screenshots') or []),
                'artifact_json': list(artifact_summary.get('artifact_json') or []),
                'expected_metric_keys': {
                    'percent': sorted(VISUAL_DELTA_PERCENT_KEYS),
                    'changed_pixels': sorted(VISUAL_CHANGED_PIXEL_KEYS),
                    'total_pixels': sorted(VISUAL_TOTAL_PIXEL_KEYS),
                },
            },
        }

    thresholds = visual_delta_thresholds_for_context(state, semantic_context, changed_region)
    min_percent = thresholds['min_change_percent']
    min_pixels = thresholds['min_changed_pixels']
    percent_pass = percent is not None and percent >= min_percent
    pixel_pass = changed_pixels is not None and changed_pixels >= min_pixels
    passed = percent_pass or pixel_pass
    return {
        'status': 'measured',
        'passed': bool(passed),
        'change_percent': round(percent, 4) if percent is not None else None,
        'changed_pixels': int(changed_pixels) if changed_pixels is not None else None,
        'total_pixels': int(total_pixels) if total_pixels is not None else None,
        'min_change_percent': min_percent,
        'min_changed_pixels': min_pixels,
        'threshold_mode': thresholds.get('mode'),
        'semantic_support': thresholds.get('semantic_support'),
        'localization_support': thresholds.get('localization_support'),
        'changed_region': changed_region,
        'reason': visual_delta_pass_reason('Measured visual delta', passed, thresholds),
    }


def visual_delta_baseline_candidate(state, results):
    reference = str(state.get('requested_reference') or state.get('reference') or 'both').strip().lower()
    baseline = (results.get('baseline') or {}) if isinstance(results, dict) else {}
    candidates = []
    if reference in ('before', 'both', ''):
        candidates.append(('before', (baseline.get('before') or {}).get('url') if isinstance(baseline.get('before'), dict) else ''))
    if reference in ('prod', 'production', 'both'):
        candidates.append(('prod', (baseline.get('prod') or {}).get('url') if isinstance(baseline.get('prod'), dict) else ''))
    candidates.extend([
        ('before', state.get('before_cdn') or ''),
        ('prod', state.get('prod_cdn') or ''),
    ])
    for label, url in candidates:
        text = str(url or '').strip()
        if text:
            return {'label': label, 'url': text}
    return {'label': '', 'url': ''}


def image_artifact_url(value):
    text = str(value or '').strip()
    if not text:
        return False
    parsed = urlparse(text)
    if parsed.scheme != 'https':
        return False
    path = parsed.path.lower()
    return path.endswith(IMAGE_EXTENSIONS)


def fetch_url_bytes(url, timeout=20, max_bytes=25 * 1024 * 1024):
    request = Request(
        url,
        headers={
            'User-Agent': 'riddle-proof-visual-delta/1.0',
            'Accept': 'image/png,image/jpeg,image/webp,image/*;q=0.8,*/*;q=0.1',
        },
    )
    with urlopen(request, timeout=timeout) as response:
        content_length = response.headers.get('Content-Length')
        if content_length:
            try:
                if int(content_length) > max_bytes:
                    raise ValueError('image artifact exceeds max fetch size')
            except ValueError:
                raise
            except Exception:
                pass
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError('image artifact exceeds max fetch size')
    return data


def _png_paeth(a, b, c):
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def decode_png_rgba(data):
    if not isinstance(data, (bytes, bytearray)) or not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('unsupported image format; expected PNG artifact')
    offset = 8
    width = height = bit_depth = color_type = interlace = None
    idat = []
    while offset + 8 <= len(data):
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        chunk_type = data[offset + 4:offset + 8]
        chunk_data = data[offset + 8:offset + 8 + length]
        offset += 12 + length
        if chunk_type == b'IHDR':
            width, height, bit_depth, color_type, _compression, _filter, interlace = struct.unpack('>IIBBBBB', chunk_data)
        elif chunk_type == b'IDAT':
            idat.append(chunk_data)
        elif chunk_type == b'IEND':
            break
    if not width or not height or bit_depth != 8 or interlace != 0:
        raise ValueError('unsupported PNG artifact; requires 8-bit non-interlaced PNG')
    channels_by_type = {0: 1, 2: 3, 4: 2, 6: 4}
    channels = channels_by_type.get(color_type)
    if not channels:
        raise ValueError('unsupported PNG color type')
    raw = zlib.decompress(b''.join(idat))
    stride = width * channels
    rows = []
    pos = 0
    previous = bytearray(stride)
    for _row in range(height):
        if pos >= len(raw):
            raise ValueError('truncated PNG data')
        filter_type = raw[pos]
        pos += 1
        scanline = bytearray(raw[pos:pos + stride])
        pos += stride
        for index in range(stride):
            left = scanline[index - channels] if index >= channels else 0
            up = previous[index]
            up_left = previous[index - channels] if index >= channels else 0
            if filter_type == 1:
                scanline[index] = (scanline[index] + left) & 0xff
            elif filter_type == 2:
                scanline[index] = (scanline[index] + up) & 0xff
            elif filter_type == 3:
                scanline[index] = (scanline[index] + ((left + up) // 2)) & 0xff
            elif filter_type == 4:
                scanline[index] = (scanline[index] + _png_paeth(left, up, up_left)) & 0xff
            elif filter_type != 0:
                raise ValueError('unsupported PNG filter')
        rows.append(bytes(scanline))
        previous = scanline
    rgba = bytearray(width * height * 4)
    out = 0
    for row in rows:
        for index in range(0, len(row), channels):
            if color_type == 0:
                gray = row[index]
                rgba[out:out + 4] = bytes((gray, gray, gray, 255))
            elif color_type == 2:
                rgba[out:out + 4] = bytes((row[index], row[index + 1], row[index + 2], 255))
            elif color_type == 4:
                gray = row[index]
                rgba[out:out + 4] = bytes((gray, gray, gray, row[index + 1]))
            else:
                rgba[out:out + 4] = bytes((row[index], row[index + 1], row[index + 2], row[index + 3]))
            out += 4
    return {'width': width, 'height': height, 'rgba': bytes(rgba)}


def compare_rgba_images(before_image, after_image, threshold=10):
    before_width = int(before_image.get('width') or 0)
    before_height = int(before_image.get('height') or 0)
    after_width = int(after_image.get('width') or 0)
    after_height = int(after_image.get('height') or 0)
    before_rgba = before_image.get('rgba') or b''
    after_rgba = after_image.get('rgba') or b''
    overlap_width = min(before_width, after_width)
    overlap_height = min(before_height, after_height)
    total_pixels = max(before_width * before_height, after_width * after_height)
    changed_pixels = total_pixels - (overlap_width * overlap_height)
    min_x = min_y = None
    max_x = max_y = None
    dimension_mismatch = before_width != after_width or before_height != after_height
    if dimension_mismatch and total_pixels > 0:
        min_x = 0
        min_y = 0
        max_x = max(before_width, after_width) - 1
        max_y = max(before_height, after_height) - 1
    for y in range(overlap_height):
        before_row = y * before_width * 4
        after_row = y * after_width * 4
        for x in range(overlap_width):
            b = before_row + x * 4
            a = after_row + x * 4
            if max(
                abs(before_rgba[b] - after_rgba[a]),
                abs(before_rgba[b + 1] - after_rgba[a + 1]),
                abs(before_rgba[b + 2] - after_rgba[a + 2]),
                abs(before_rgba[b + 3] - after_rgba[a + 3]),
            ) > threshold:
                changed_pixels += 1
                min_x = x if min_x is None else min(min_x, x)
                min_y = y if min_y is None else min(min_y, y)
                max_x = x if max_x is None else max(max_x, x)
                max_y = y if max_y is None else max(max_y, y)
    change_percent = (changed_pixels / total_pixels) * 100 if total_pixels else None
    changed_region = None
    if min_x is not None and min_y is not None and max_x is not None and max_y is not None:
        changed_region = normalize_changed_region(
            {
                'x': min_x,
                'y': min_y,
                'width': max_x - min_x + 1,
                'height': max_y - min_y + 1,
            },
            total_pixels=total_pixels,
            changed_pixels=changed_pixels,
            image_width=max(before_width, after_width),
            image_height=max(before_height, after_height),
            dimension_mismatch=dimension_mismatch,
        )
    return {
        'changed_pixels': changed_pixels,
        'total_pixels': total_pixels,
        'change_percent': change_percent,
        'changed_region': changed_region,
        'before_width': before_width,
        'before_height': before_height,
        'after_width': after_width,
        'after_height': after_height,
    }


def measure_visual_delta_from_image_artifacts(before_url, after_url, state=None, semantic_context=None):
    if not (image_artifact_url(before_url) and image_artifact_url(after_url)):
        return {
            'status': 'skipped',
            'reason': 'before/after URLs are not direct HTTPS image artifacts',
        }
    try:
        before_image = decode_png_rgba(fetch_url_bytes(before_url))
        after_image = decode_png_rgba(fetch_url_bytes(after_url))
        comparison = compare_rgba_images(before_image, after_image)
    except Exception as exc:
        return {
            'status': 'error',
            'error': type(exc).__name__ + ': ' + str(exc)[:300],
        }
    changed_pixels = comparison.get('changed_pixels')
    total_pixels = comparison.get('total_pixels')
    percent = comparison.get('change_percent')
    changed_region = comparison.get('changed_region')
    thresholds = visual_delta_thresholds_for_context(state, semantic_context, changed_region)
    min_percent = thresholds['min_change_percent']
    min_pixels = thresholds['min_changed_pixels']
    percent_pass = percent is not None and percent >= min_percent
    pixel_pass = changed_pixels is not None and changed_pixels >= min_pixels
    passed = bool(percent_pass or pixel_pass)
    return {
        'status': 'measured',
        'passed': passed,
        'change_percent': round(percent, 4) if percent is not None else None,
        'changed_pixels': int(changed_pixels) if changed_pixels is not None else None,
        'total_pixels': int(total_pixels) if total_pixels is not None else None,
        'min_change_percent': min_percent,
        'min_changed_pixels': min_pixels,
        'threshold_mode': thresholds.get('mode'),
        'semantic_support': thresholds.get('semantic_support'),
        'localization_support': thresholds.get('localization_support'),
        'changed_region': changed_region,
        'source': 'riddle_artifact_image_diff',
        'reason': visual_delta_pass_reason('Measured visual delta from before/after screenshot artifacts', passed, thresholds),
        'comparison': {
            'before_url': before_url,
            'after_url': after_url,
            'before_width': comparison.get('before_width'),
            'before_height': comparison.get('before_height'),
            'after_width': comparison.get('after_width'),
            'after_height': comparison.get('after_height'),
        },
    }


def add_visual_delta_diagnostic(visual_delta, key, value):
    updated = dict(visual_delta or {})
    diagnostic = dict(updated.get('diagnostic') or {})
    diagnostic[key] = value
    updated['diagnostic'] = diagnostic
    return updated


def measure_visual_delta_against_baseline(state, results, after_payload, current_visual_delta, semantic_context=None):
    if not visual_delta_required_for_state(state):
        return current_visual_delta
    if isinstance(current_visual_delta, dict) and current_visual_delta.get('status') == 'measured':
        return current_visual_delta

    baseline = visual_delta_baseline_candidate(state, results)
    before_url = baseline.get('url') or ''
    after_url = extract_screenshot_url(after_payload, 'after-proof') or str(state.get('after_cdn') or '').strip()
    if not before_url or not after_url:
        missing = []
        if not before_url:
            missing.append('baseline screenshot')
        if not after_url:
            missing.append('after screenshot')
        return add_visual_delta_diagnostic(
            current_visual_delta,
            'visual_diff_fallback',
            {
                'status': 'skipped',
                'reason': 'missing ' + ' and '.join(missing),
                'baseline_label': baseline.get('label') or '',
                'before_url_present': bool(before_url),
                'after_url_present': bool(after_url),
            },
        )

    artifact_delta = measure_visual_delta_from_image_artifacts(before_url, after_url, state, semantic_context)
    append_capture_diagnostic(state, 'visual_delta', 'riddle_artifact_image_diff', {
        'baseline_label': baseline.get('label') or '',
        'before_url': before_url,
        'after_url': after_url,
    }, artifact_delta)
    if isinstance(artifact_delta, dict) and artifact_delta.get('status') == 'measured':
        artifact_delta['comparison']['baseline_label'] = baseline.get('label') or ''
        return artifact_delta
    current_visual_delta = add_visual_delta_diagnostic(
        current_visual_delta,
        'artifact_image_diff',
        artifact_delta,
    )

    args = {
        'url_before': before_url,
        'url_after': after_url,
        'delay_ms': 250,
        'timeout_sec': 60,
    }
    try:
        payload = invoke_retry('riddle_visual_diff', args, retries=2, timeout=180)
        append_capture_diagnostic(state, 'visual_delta', 'riddle_visual_diff', args, payload)
    except Exception as exc:
        return add_visual_delta_diagnostic(
            current_visual_delta,
            'visual_diff_fallback',
            {
                'status': 'error',
                'error': type(exc).__name__ + ': ' + str(exc)[:300],
                'baseline_label': baseline.get('label') or '',
            },
        )

    measured = extract_visual_delta(payload, state, semantic_context)
    if isinstance(measured, dict) and measured.get('status') == 'measured':
        measured['source'] = 'riddle_visual_diff'
        measured['comparison'] = {
            'baseline_label': baseline.get('label') or '',
            'before_url': before_url,
            'after_url': after_url,
        }
        if isinstance(payload, dict):
            diff_url = extract_screenshot_url(payload, 'visual-diff') or extract_screenshot_url(payload, 'diff')
            if diff_url:
                measured['comparison']['diff_url'] = diff_url
            measured['artifact_summary'] = summarize_capture_artifacts(payload)
        return measured

    updated = add_visual_delta_diagnostic(
        current_visual_delta,
        'visual_diff_fallback',
        {
            'status': 'unmeasured',
            'baseline_label': baseline.get('label') or '',
            'before_url': before_url,
            'after_url': after_url,
            'payload_ok': payload.get('ok') if isinstance(payload, dict) else None,
            'payload_error': str(payload.get('error') or payload.get('stderr') or '')[:500] if isinstance(payload, dict) else '',
            'artifact_summary': summarize_capture_artifacts(payload) if isinstance(payload, dict) else {},
        },
    )
    reason = str(updated.get('reason') or '').strip()
    suffix = ' Riddle visual_diff fallback ran but did not publish a recognizable numeric delta.'
    updated['reason'] = (reason + suffix).strip() if reason else suffix.strip()
    return updated


def visual_delta_applies(verification_mode):
    return screenshot_required_for_mode(verification_mode)


def visual_delta_passes_ship_gate(visual_delta):
    return (
        isinstance(visual_delta, dict)
        and visual_delta.get('status') == 'measured'
        and visual_delta.get('passed') is True
    )


def visual_delta_blocker_for_mode(verification_mode, visual_delta):
    if not visual_delta_applies(verification_mode):
        return ''
    if visual_delta_passes_ship_gate(visual_delta):
        return ''
    if not isinstance(visual_delta, dict):
        status = 'missing'
        reason = 'No visual_delta object was found in proof evidence.'
    else:
        status = str(visual_delta.get('status') or 'missing')
        reason = str(visual_delta.get('reason') or '').strip()
    if status == 'unmeasured':
        detail = f' Reason: {reason}' if reason else ''
        return 'visual_delta.status=unmeasured blocks ready_to_ship for visual/UI proof; capture a measured before/after visual delta or choose needs_richer_proof.' + detail
    if status == 'measured' and isinstance(visual_delta, dict) and visual_delta.get('passed') is False:
        return 'visual_delta.status=measured but visual_delta.passed=false blocks ready_to_ship for visual/UI proof; the measured change did not clear the threshold.'
    if reason:
        return f'visual_delta.status={status} blocks ready_to_ship for visual/UI proof: {reason}'
    return f'visual_delta.status={status} blocks ready_to_ship for visual/UI proof.'


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


def canvas_capture_signal(page_state):
    if not isinstance(page_state, dict):
        return {
            'canvas_ready': False,
            'canvas_count': 0,
            'large_canvas_area': 0,
        }
    large_canvas_area = 0
    for item in list_value(page_state.get('largeVisibleElements')):
        if not isinstance(item, dict) or item.get('tag') != 'canvas':
            continue
        area = metric_number(item.get('area')) or 0
        if area > large_canvas_area:
            large_canvas_area = area
    canvas_count = int(metric_number(page_state.get('canvasCount')) or 0)
    return {
        'canvas_ready': bool(canvas_count > 0 and large_canvas_area >= MIN_CANVAS_AREA),
        'canvas_count': canvas_count,
        'large_canvas_area': int(large_canvas_area),
        'min_canvas_area': MIN_CANVAS_AREA,
    }


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
    playability_assessment = assess_playability_evidence(proof_evidence)

    return {
        'image_outputs': image_outputs,
        'data_outputs': data_outputs,
        'other_outputs': other_outputs,
        'result_keys': result_keys,
        'structured_result_keys': structured_result_keys,
        'console_entries': len(console_entries),
        'proof_evidence_present': proof_evidence is not None,
        'proof_evidence_sample': compact_value(proof_evidence) if proof_evidence is not None else '',
        'playability_evidence_present': bool(playability_assessment.get('evidence_present')),
        'playability_ready': bool(playability_assessment.get('passed')),
        'playability_assessment': playability_assessment,
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
            'playability': mode in PLAYABILITY_MODES,
            'visual_delta': visual_delta_applies(mode),
        },
        'preferred': {
            'page_state': True,
            'structured_payload': mode in STRUCTURED_FIRST_MODES or proof_evidence_required_for_mode(mode),
        },
        'optional': {
            'console_summary': True,
            'json_artifacts': True,
            'image_outputs': True,
        },
    }


def artifact_contract_for_state(state):
    contract = artifact_contract_for_mode(state.get('verification_mode'))
    if audit_no_diff_mode(state):
        contract['required']['visual_delta'] = False
        contract['optional']['visual_delta'] = True
    return contract


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
        'playability_evidence_present': bool(supporting.get('playability_evidence_present')),
        'playability_ready': bool(supporting.get('playability_ready')),
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
        'playability': bool(supporting.get('playability_ready')),
        'visual_delta': visual_delta_passes_ship_gate(visual_delta),
        'console_summary': bool(supporting.get('console_entries')),
        'json_artifacts': bool(supporting.get('data_outputs')),
        'image_outputs': bool(supporting.get('image_outputs')),
        'assertions': bool(state.get('parsed_assertions')),
        'success_criteria': bool((state.get('success_criteria') or '').strip()),
    }


def artifact_usage_summary(state, after_observation, supporting, visual_delta, required_baseline_present, semantic_context, evidence_basis):
    contract = artifact_contract_for_state(state)
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
    if available.get('playability'):
        capture_quality.append('playability')
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
    playability_ready = mode in PLAYABILITY_MODES and bool(supporting.get('playability_ready'))
    screenshot_required = screenshot_required_for_mode(mode)
    details = {
        'verification_mode': mode,
        'capture_tool_error': capture_payload_error(payload),
        'has_screenshot': False,
        'screenshot_required': screenshot_required,
        'structured_evidence_present': structured_ready,
        'proof_evidence_present': bool(supporting.get('proof_evidence_present')),
        'playability_ready': playability_ready,
        'canvas_capture_ready': False,
        'large_canvas_area': 0,
        'min_canvas_area': MIN_CANVAS_AREA,
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
        canvas_signal = canvas_capture_signal(page_state)
        details.update({
            'canvas_capture_ready': canvas_signal['canvas_ready'],
            'large_canvas_area': canvas_signal['large_canvas_area'],
            'min_canvas_area': canvas_signal['min_canvas_area'],
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
    canvas_ready = bool(details.get('canvas_capture_ready'))
    body_text_ready = details['body_text_length'] >= MIN_BODY_TEXT_LENGTH or canvas_ready or playability_ready
    interactive_ready = details['interactive_elements'] >= MIN_INTERACTIVE_ELEMENTS or canvas_ready or playability_ready
    semantic_ready = (not has_enriched_page_state(page_state)) or details['semantic_anchor_count'] >= 1 or canvas_ready or playability_ready
    details['body_text_ready'] = body_text_ready
    details['interactive_ready'] = interactive_ready
    details['semantic_ready'] = semantic_ready
    details['canvas_or_playability_override'] = bool(should_enforce_visual_readiness and (canvas_ready or playability_ready))

    if should_enforce_visual_readiness and not body_text_ready:
        reasons.append(f'blank/near-blank page (text length: {details["body_text_length"]})')
    if should_enforce_visual_readiness and not interactive_ready:
        reasons.append(f'not interactive enough ({details["interactive_elements"]} interactive elements)')
    if should_enforce_visual_readiness and has_enriched_page_state(page_state) and not semantic_ready:
        reasons.append('no visible semantic UI anchors in page capture')
    if details['has_errors']:
        reasons.append('page has console/runtime errors')

    observed_path = normalize_observed_path(details.get('observed_path'))
    if isinstance(page_state, dict) and expected_path and observed_path and not route_matches_expected(expected_path, observed_path):
        raw_observed = details.get('observed_path_raw') or details.get('observed_path') or observed_path
        reasons.append(f'wrong route: expected {expected_path}, got {raw_observed}')

    visual_ready = (
        details['has_screenshot']
        and body_text_ready
        and interactive_ready
        and semantic_ready
        and not details['has_errors']
    )
    telemetry_ready = (visual_ready or structured_ready or playability_ready) and not details['has_errors']

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


def build_visual_delta_recovery_decision(verification_mode, visual_delta, visual_delta_blocker=''):
    if not visual_delta_applies(verification_mode):
        return None
    if visual_delta_passes_ship_gate(visual_delta):
        return None
    if not isinstance(visual_delta, dict):
        status = 'missing'
    else:
        status = str(visual_delta.get('status') or 'missing')
    if status == 'measured':
        return None
    reason = visual_delta_blocker or visual_delta_blocker_for_mode(verification_mode, visual_delta)
    diagnostic = visual_delta.get('diagnostic') if isinstance(visual_delta, dict) else {}
    reasons = [
        reason or 'Required visual_delta evidence is incomplete.',
        'Stay in verify so the same run can retry capture/comparison recovery before proof review.',
    ]
    fallback = diagnostic.get('visual_diff_fallback') if isinstance(diagnostic, dict) else None
    artifact_diff = diagnostic.get('artifact_image_diff') if isinstance(diagnostic, dict) else None
    if isinstance(artifact_diff, dict) and artifact_diff.get('error'):
        reasons.append('Artifact image diff failed: ' + str(artifact_diff.get('error'))[:300])
    if isinstance(fallback, dict) and fallback.get('error'):
        reasons.append('Riddle visual_diff fallback failed: ' + str(fallback.get('error'))[:300])
    return {
        'decision': 'revise_capture',
        'summary': reason or 'Verify needs measured visual_delta evidence before proof review.',
        'recommended_stage': 'verify',
        'continue_with_stage': 'verify',
        'reasons': reasons,
        'visual_delta_status': status,
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
    playability_assessment = assess_playability_evidence(proof_evidence)
    playability_evidence = extract_playability_evidence(proof_evidence)
    semantic_context = build_semantic_context(state, results, after_observation, expected_path)
    viewport_matrix = (results.get('after') or {}).get('viewport_matrix') or capture_viewport_matrix_status(state, after_payload, 'after-proof')
    if audit_no_diff_mode(state):
        visual_delta = {
            'status': 'not_applicable',
            'passed': None,
            'reason': 'Audit/no-diff verification judges current target evidence directly and does not require a before/after implementation delta.',
        }
    else:
        visual_delta = (
            extract_visual_delta(after_payload, state, semantic_context)
            if visual_delta_applies(state.get('verification_mode'))
            else {'status': 'not_applicable', 'passed': None, 'reason': 'Verification mode does not require visual delta gating.'}
        )
    visual_delta = measure_visual_delta_against_baseline(state, results, after_payload, visual_delta, semantic_context)
    artifact_contract = artifact_contract_for_state(state)
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
    observed_after_path = ((semantic_context.get('route') or {}).get('after_observed_path')) or ''
    proof_session_artifact_url = proof_session_output_url(after_payload)
    outputs = []
    for item in after_payload.get('outputs') or []:
        if not isinstance(item, dict):
            continue
        outputs.append({
            'name': str(item.get('name') or ''),
            'url': str(item.get('url') or ''),
            'type': str(item.get('type') or item.get('kind') or ''),
        })
    proof_session = build_visual_proof_session(
        state,
        route=expected_path,
        observed_after_path=observed_after_path,
        artifacts={
            'before': state.get('before_cdn') or '',
            'prod': state.get('prod_cdn') or '',
            'after': state.get('after_cdn') or '',
            'session': proof_session_artifact_url,
            'outputs': outputs,
        },
        evidence={
            'visual_delta': visual_delta,
            'playability_assessment': playability_assessment,
            'semantic_context': semantic_context,
            'artifact_contract': artifact_contract,
            'artifact_usage': artifact_usage,
            'viewport_matrix': viewport_matrix,
        },
        status='evidence_captured' if after_observation.get('valid') else 'capture_incomplete',
    )
    return {
        'verification_mode': normalized_verification_mode(state.get('verification_mode')),
        'reference': state.get('requested_reference') or state.get('reference', 'both'),
        'expected_path': expected_path,
        'required_baseline_present': required_baseline_present,
        'baseline': results.get('baseline') or {},
        'semantic_context': semantic_context,
        'viewport_matrix': viewport_matrix,
        'artifact_contract': artifact_contract,
        'artifact_production': artifact_production,
        'artifact_usage': artifact_usage,
        'after': {
            'screenshot_url': state.get('after_cdn') or '',
            'observation': after_observation,
            'supporting_artifacts': supporting,
            'proof_evidence': proof_evidence,
            'playability_evidence': playability_evidence,
            'playability_assessment': playability_assessment,
            'proof_evidence_sample': compact_value(proof_evidence) if proof_evidence is not None else '',
            'visual_delta': visual_delta,
        },
        'proof_evidence': proof_evidence,
        'playability_evidence': playability_evidence,
        'playability_assessment': playability_assessment,
        'proof_evidence_sample': compact_value(proof_evidence) if proof_evidence is not None else '',
        'success_criteria': (state.get('success_criteria') or '').strip(),
        'assertions': state.get('parsed_assertions') or None,
        'proof_session': proof_session,
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
    if supporting.get('playability_ready'):
        evidence_basis.append('playability')
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
        artifact_contract = artifact_contract_for_state(state)
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
    viewport_matrix = (evidence_bundle or {}).get('viewport_matrix') if isinstance(evidence_bundle, dict) else None
    if isinstance(evidence_bundle, dict):
        evidence_bundle['artifact_contract'] = artifact_contract
        evidence_bundle['artifact_production'] = artifact_production
        evidence_bundle['artifact_usage'] = artifact_usage
    visual_delta_blocker = '' if audit_no_diff_mode(state) else visual_delta_blocker_for_mode(verification_mode, visual_delta)
    hard_blockers = [visual_delta_blocker] if visual_delta_blocker else []
    if verification_mode in PLAYABILITY_MODES and not supporting.get('playability_ready'):
        assessment = supporting.get('playability_assessment') or {}
        concerns = assessment.get('concerns') if isinstance(assessment, dict) else []
        detail = '; '.join(str(item) for item in concerns[:4]) if isinstance(concerns, list) else ''
        hard_blockers.append(
            'playability evidence blocks ready_to_ship for playable/gameplay proof'
            + (f': {detail}' if detail else '.')
        )

    instructions = [
        'The supervising agent owns proof assessment. Inspect the recon baseline(s), after evidence, and any structured artifacts together.',
        'Decide whether the evidence is ready_to_ship or should continue internally through author, implement, or recon.',
        'Hard blockers cannot be overridden by supervisor judgment; if hard_blockers is non-empty, do not choose ready_to_ship.',
        'Do not mark ready_to_ship if the before/prod baseline is blank, shell-only, generic, or not visibly tied to the requested feature.',
        'Use semantic_context.route plus headings/buttons/text anchors to ground route and content judgment before treating a screenshot as wrong-route.',
        'For visual/UI modes, use screenshots plus after_observation.details.visible_text_sample, headings, buttons, links, canvas_count, and large_visible_elements to explain what the proof actually shows.',
    ]
    if audit_no_diff_mode(state):
        instructions.append(
            'Audit/no-diff mode intentionally has implementation_status=not_required and visual_delta.status=not_applicable; judge the current target evidence directly instead of requiring an implementation diff.'
        )
    else:
        instructions.append(
            'For visual/UI polish, capture success is not proof. If visual_delta.status is unmeasured, missing, not_applicable, or measured with passed=false, choose needs_implementation or needs_richer_proof instead of ready_to_ship.'
        )
    instructions.extend([
        'For playable/gameplay proof, screenshots are supporting evidence only. Do not mark ready_to_ship unless playability_assessment.passed is true and the proof shows accepted input, state/time progression, and playfield/canvas pixel motion.',
        'For data/audio/log/metrics/custom modes, judge the structured evidence bundle and proof_evidence_sample directly; screenshots are optional supporting context.',
        'The summary must name the concrete change, the target route/UI, what changed in after evidence, and why the stop condition is satisfied.',
        'Only set escalation_target=human when you conclude the workflow has hit a real wall or is not converging.',
        'Pass the judgment back via proof_assessment_json and resume the workflow.',
    ])

    return {
        'status': 'needs_supervising_agent_assessment',
        'verification_mode': verification_mode,
        'expected_path': expected_path,
        'required_baseline_present': required_baseline_present,
        'after_observation': after_observation,
        'supporting_artifacts': supporting,
        'visual_delta': visual_delta,
        'semantic_context': semantic_context,
        'viewport_matrix': viewport_matrix,
        'evidence_bundle': evidence_bundle or {},
        'evidence_basis': evidence_basis,
        'artifact_contract': artifact_contract,
        'artifact_production': artifact_production,
        'artifact_usage': artifact_usage,
        'hard_blockers': hard_blockers,
        'instructions': instructions,
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

no_implementation_mode = audit_no_diff_mode(s)
if not implementation_ready_for_verify(s):
    raise SystemExit('Implementation not recorded. Make the code changes and run riddle-proof-implement before verify.')
if no_implementation_mode and s.get('implementation_status') != 'not_required':
    s['implementation_status'] = 'not_required'
    s['implementation_mode'] = s.get('implementation_mode') or 'none'
    if 'require_diff' not in s:
        s['require_diff'] = False
    if 'allow_code_changes' not in s:
        s['allow_code_changes'] = False

mode = s.get('mode', 'server')
reference = s.get('requested_reference') or s.get('reference', 'both')
prod_url = (s.get('prod_url') or '').strip()
after_dir = s.get('after_worktree', '').strip()
if not no_implementation_mode and (not after_dir or not os.path.exists(after_dir)):
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
proof_session_seed = capture_proof_session_seed(s, expected_path)
probe_capture_script = build_probe_capture_script(capture_script, verification_mode, proof_session_seed, s.get('viewport_matrix'))
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

after_payload = {}
if no_implementation_mode:
    record_verify_phase('build', 'completed', 'Audit/no-diff mode skips after-worktree build.')
    current_url = audit_current_capture_url(s, prod_url, expected_path)
    record_verify_phase('capture', 'running', 'Capturing current target evidence for audit/no-diff verify.')
    if current_url:
        print('Audit/no-diff verify capture at: ' + current_url)
        capture = capture_current_target(s, current_url, 'after-proof', probe_capture_script, timeout=300)
        after_payload = capture.get('raw') or capture
        append_capture_diagnostic(
            s,
            'after',
            'riddle_script',
            {'target_url': current_url, 'audit_no_diff': True},
            after_payload,
        )
        capture_error = capture_payload_error(after_payload)
        if capture_error:
            abort_capture_failure(s, results, expected_path, capture_error, after_payload)
        results['after'] = {'screenshots': [{'url': capture.get('url', '')}] if capture.get('url') else [], 'raw': after_payload}
        s['after_cdn'] = capture.get('url', '')
        s['after_capture_source'] = 'audit_current_target'
        s['audit_current_url'] = current_url
    else:
        print('Audit/no-diff verify has no current target URL; reusing recon screenshot as current evidence.')
        after_payload = baseline_payload_from_recon(s, results)
        append_capture_diagnostic(
            s,
            'after',
            'recon_baseline_reuse',
            {'audit_no_diff': True},
            after_payload,
        )
        capture_error = capture_payload_error(after_payload)
        if capture_error:
            abort_capture_failure(s, results, expected_path, capture_error, after_payload)
        url = extract_screenshot_url(after_payload, 'after-proof')
        results['after'] = {'screenshots': [{'url': url}] if url else [], 'raw': after_payload}
        s['after_cdn'] = url
        s['after_capture_source'] = 'audit_recon_baseline'
else:
    # AFTER (from after worktree)
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

after_viewport_matrix = capture_viewport_matrix_status(s, after_payload, 'after-proof')
after_observation = evaluate_capture_quality(after_payload, expected_path, verification_mode)
details = after_observation.get('details') if isinstance(after_observation.get('details'), dict) else {}
details['viewport_matrix'] = after_viewport_matrix
after_observation['details'] = details
if after_viewport_matrix.get('status') == 'incomplete':
    missing_names = [
        str(item.get('name') or item.get('slug') or '').strip()
        for item in after_viewport_matrix.get('missing') or []
        if str(item.get('name') or item.get('slug') or '').strip()
    ]
    missing_text = ', '.join(missing_names[:8]) or 'requested viewport screenshots'
    reason = 'missing requested viewport evidence: ' + missing_text
    after_observation['valid'] = False
    after_observation['telemetry_ready'] = False
    after_observation['reason'] = (
        (after_observation.get('reason') + '; ' + reason)
        if after_observation.get('reason') and after_observation.get('reason') != 'ok'
        else reason
    )
s['viewport_matrix_status'] = after_viewport_matrix
results['after']['observation'] = after_observation
results['after']['supporting_artifacts'] = collect_supporting_artifacts(after_payload)
results['after']['viewport_matrix'] = after_viewport_matrix
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
if after_viewport_matrix.get('status') not in ('not_requested', ''):
    summary_lines.append('Viewport matrix: ' + after_viewport_matrix.get('status', 'unknown') + ' (' + str(len(after_viewport_matrix.get('executed') or [])) + '/' + str(len(after_viewport_matrix.get('requested') or [])) + ' captured)')
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
s['proof_session'] = evidence_bundle.get('proof_session') or {}
s['proof_session_fingerprint'] = (s.get('proof_session') or {}).get('fingerprint') or ''
s['proof_session_artifact_url'] = ((s.get('proof_session') or {}).get('artifacts') or {}).get('session') or ''
if s.get('proof_session'):
    summary_lines.append(
        'Proof session: ' +
        str((s.get('proof_session') or {}).get('session_id') or '') +
        ' ' +
        str((s.get('proof_session') or {}).get('fingerprint') or '')[:12]
    )
if s.get('proof_session_artifact_url'):
    summary_lines.append('Proof session artifact: ' + s['proof_session_artifact_url'])
visual_delta = ((evidence_bundle.get('after') or {}).get('visual_delta') or {})
if visual_delta.get('status') != 'not_applicable':
    summary_lines.append('Visual delta gate: ' + compact_value(visual_delta, limit=700))
visual_delta_blocker = '' if no_implementation_mode else visual_delta_blocker_for_mode(s.get('verification_mode'), visual_delta)
if visual_delta_blocker:
    summary_lines.append('Visual delta hard gate: ' + visual_delta_blocker)

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

visual_delta_recovery = build_visual_delta_recovery_decision(
    s.get('verification_mode'),
    visual_delta,
    visual_delta_blocker,
) if not no_implementation_mode else None
if visual_delta_recovery:
    summary_lines.append('Visual delta recovery: ' + visual_delta_recovery['summary'])

has_good_evidence = (
    required_baseline_present
    and after_observation.get('valid')
    and not proof_evidence_blocker
    and not visual_delta_recovery
)

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
    next_stage_options = ['verify', 'author', 'recon'] if no_implementation_mode else ['verify', 'author', 'implement', 'ship', 'recon']
    fields_agent_may_update = ['proof_assessment_json', 'capture_script', 'server_path', 'wait_for_selector', 'proof_plan', 'assertions_json']
    if not no_implementation_mode:
        fields_agent_may_update.append('implementation_notes')
    s['verify_decision_request'] = {
        'status': s['verify_status'],
        'summary': 'Verify captured usable evidence and is waiting for supervising-agent proof assessment.',
        'expected_path': expected_path,
        'latest_observation': after_observation,
        'next_stage_options': next_stage_options,
        'recommended_stage': None,
        'continue_with_stage': None,
        'fields_agent_may_update': fields_agent_may_update,
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
    capture_retry = visual_delta_recovery or build_capture_retry_decision(after_observation, required_baseline_present, proof_evidence_blocker)
    next_stage_options = ['author', 'verify', 'recon'] if no_implementation_mode else ['author', 'verify', 'implement', 'recon']
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
        'next_stage_options': next_stage_options,
        'recommended_stage': capture_retry.get('recommended_stage') or 'author',
        'continue_with_stage': capture_retry.get('continue_with_stage') or 'author',
        'fields_agent_may_update': ['capture_script', 'server_path', 'wait_for_selector', 'proof_plan'],
        'instructions': [
            'The after-proof evidence packet is incomplete, so use the recommended stage before proof review.',
            'Adjust capture_script, server_path, wait_for_selector, and/or proof_plan only when the recommended stage is author.',
            'If recommended_stage=verify, rerun verify so capture/comparison recovery can continue without changing proof authorship.',
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
