"""Author: prepare or apply the supervising agent's proof packet.

This stage no longer delegates proof authoring to an embedded alternate model.
Instead it does two things:
- distill recon state into a structured request for the supervising agent
- normalize and persist a supervisor-supplied proof packet for later stages
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import load_state, save_state


RUNTIME_MODEL_HINT = (
    os.environ.get('RIDDLE_PROOF_AUTHOR_RUNTIME_MODEL', '').strip()
    or os.environ.get('OPENCLAW_MODEL', '').strip()
    or os.environ.get('OPENCLAW_DEFAULT_MODEL', '').strip()
    or os.environ.get('OPENCLAW_RUNTIME_MODEL', '').strip()
    or os.environ.get('AGENT_MODEL', '').strip()
    or os.environ.get('DEFAULT_MODEL', '').strip()
    or os.environ.get('MODEL', '').strip()
)


def normalize_path(value):
    path = (value or '').strip()
    if not path:
        return ''
    if not path.startswith('/'):
        path = '/' + path
    return path


def first_non_empty(*values):
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ''


def sanitize_rationale(value):
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    out = []
    for item in value:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
    return out[:6]


def recon_baseline_understanding(state):
    assessment = state.get('recon_assessment') or {}
    understanding = assessment.get('baseline_understanding') or state.get('recon_baseline_understanding') or {}
    return understanding if isinstance(understanding, dict) else {}


def authored_capture_script(existing_script, wait_for_selector=''):
    script = (existing_script or '').strip()
    if script:
        return script
    steps = ['await page.waitForTimeout(1500);']
    selector = (wait_for_selector or '').strip()
    if selector:
        steps.append('await page.waitForSelector(' + json.dumps(selector) + ');')
    steps.append("await saveScreenshot('after-proof');")
    return ' '.join(steps)


def authored_proof_plan(state, reference, target_path, baselines, wait_for_selector=''):
    existing = (state.get('proof_plan') or '').strip()
    if existing:
        return existing

    lines = []
    change_request = (state.get('change_request') or '').strip()
    success_criteria = (state.get('success_criteria') or '').strip()
    verification_mode = (state.get('verification_mode') or 'proof').strip() or 'proof'

    if change_request:
        lines.append('Goal: ' + change_request)
    lines.append('Verification mode: ' + verification_mode)
    if success_criteria:
        lines.append('Success criteria: ' + success_criteria)
    lines.append('Target route: ' + (target_path or '/'))
    lines.append('Reference baseline: ' + reference)
    if baselines.get('before', {}).get('url'):
        lines.append('Reuse recon before baseline: ' + baselines['before']['url'])
    if baselines.get('prod', {}).get('url'):
        lines.append('Reuse recon prod baseline: ' + baselines['prod']['url'])
    baseline_understanding = recon_baseline_understanding(state)
    visible_before = (baseline_understanding.get('visible_before_state') or '').strip()
    proof_focus = (baseline_understanding.get('proof_focus') or '').strip()
    stop_condition = (baseline_understanding.get('stop_condition') or '').strip()
    if visible_before:
        lines.append('Observed before state: ' + visible_before)
    if proof_focus:
        lines.append('Proof focus: ' + proof_focus)
    if stop_condition:
        lines.append('Stop condition: ' + stop_condition)
    if wait_for_selector:
        lines.append('Stabilize capture on selector: ' + wait_for_selector)
    lines.append('After evidence should load the recon-confirmed route and collect the evidence type required by verification_mode without rediscovering baseline context.')
    lines.append('For visual modes this usually means a stable screenshot; for playable/gameplay modes it must also prove accepted input, state/time progression, and playfield/canvas pixel motion; for data, audio, log, metric, or custom modes it may mean structured proofEvidence, JSON artifacts, console observations, or assertions.')
    lines.append('Revise this draft only when the supervising agent concludes the proof needs richer interactions, better sense data, or tighter framing.')
    return '\n'.join(lines)


def author_request_payload(state, reference, baselines, current_plan, hypothesis, fallback_path, fallback_selector):
    recon_results = state.get('recon_results') or {}
    attempt_history = recon_results.get('attempt_history') or []
    trimmed_attempts = []
    for item in attempt_history[-3:]:
        trimmed_attempts.append({
            'attempt': item.get('attempt'),
            'result': item.get('result'),
            'plan': item.get('plan'),
            'observations': item.get('observations'),
        })

    fallback_capture_script = authored_capture_script(state.get('capture_script'), fallback_selector)
    fallback_proof_plan = authored_proof_plan(state, reference, fallback_path, baselines, fallback_selector)

    return {
        'status': 'needs_supervisor_judgment',
        'goal': (state.get('change_request') or '').strip(),
        'success_criteria': (state.get('success_criteria') or '').strip(),
        'verification_mode': (state.get('verification_mode') or 'proof').strip() or 'proof',
        'reference': reference,
        'baseline_understanding': recon_baseline_understanding(state),
        'observed_baselines': baselines,
        'current_plan': current_plan or {},
        'hypothesis': hypothesis or {},
        'route_hints': (state.get('author_request') or {}).get('route_hints') or recon_results.get('route_hints') or [],
        'keyword_hits': (state.get('author_request') or {}).get('keyword_hits') or recon_results.get('keyword_hits') or [],
        'recon_summary': (state.get('recon_summary') or '').strip(),
        'attempt_history_tail': trimmed_attempts,
        'fallback_defaults': {
            'server_path': fallback_path,
            'wait_for_selector': fallback_selector,
            'capture_script': fallback_capture_script,
            'proof_plan': fallback_proof_plan,
        },
        'instructions': [
            'The supervising agent owns proof authoring. Use the recon-confirmed route and baselines instead of inventing a new context.',
            'Treat baseline_understanding as the required before-state review. The proof plan must name the observed before state, requested delta, and stop condition.',
            'Return the authored packet via author_packet_json when possible. You may also set proof_plan, capture_script, server_path, and wait_for_selector directly.',
            'Keep capture_script concise Playwright statements.',
            'For visual/UI proof, include saveScreenshot(\'after-proof\') exactly once.',
            'For playable/gameplay proof, start the experience, send keyboard or pointer input, sample state before/after, measure non-HUD playfield/canvas pixel deltas across time, and set window.__riddleProofEvidence.playability or playability_evidence with version riddle-proof.playability.v1.',
            'For data/audio/log/metric/custom proof, screenshots are optional; set window.__riddleProofEvidence inside page.evaluate to a JSON-serializable object with the measured observations the verifier should judge.',
            'Do not assign globalThis.__riddleProofEvidence, window.__riddleProofEvidence, or self.__riddleProofEvidence outside page.evaluate; the Riddle worker context may not expose those globals safely.',
            'Do not begin capture_script with page.goto unless an in-app navigation is genuinely required after the preview opens the target route.',
            'Only escalate to the human after the supervising agent concludes the workflow is genuinely stuck or not converging.',
        ],
        'response_schema': {
            'proof_plan': 'string',
            'capture_script': 'string',
            'baseline_understanding_used': {
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
            'refined_inputs': {
                'server_path': 'string',
                'wait_for_selector': 'string',
                'reference': 'string',
            },
            'rationale': ['string'],
            'confidence': 'high | medium | low',
            'summary': 'string',
        },
    }


s = load_state()
if s.get('recon_status') not in ('ready_for_proof_plan', 'completed'):
    raise SystemExit('Recon is not ready for proof authoring. Run recon until it produces a usable observation packet first.')

recon_results = s.get('recon_results') or {}
author_request = s.get('author_request') or s.get('proof_plan_request') or {}
baselines = (author_request.get('observed_baselines') or recon_results.get('baselines') or {})
current_plan = author_request.get('current_plan') or recon_results.get('current_plan') or {}
hypothesis = author_request.get('hypothesis') or s.get('recon_hypothesis') or {}
reference = s.get('requested_reference') or s.get('reference') or author_request.get('reference') or 'before'

before_path = ((baselines.get('before') or {}).get('path') or '').strip()
prod_path = ((baselines.get('prod') or {}).get('path') or '').strip()
current_path = (current_plan.get('target_path') or '').strip()
hypothesis_path = (hypothesis.get('target_path') or '').strip()
existing_path = (s.get('server_path') or '').strip()
default_path = normalize_path(first_non_empty(before_path, prod_path, current_path, hypothesis_path, existing_path, '/')) or '/'

default_selector = first_non_empty((s.get('wait_for_selector') or '').strip(), (current_plan.get('wait_for_selector') or '').strip())
default_proof_plan = authored_proof_plan(s, reference, default_path, baselines, default_selector)
default_capture_script = authored_capture_script(s.get('capture_script'), default_selector)

supervisor_packet = s.get('supervisor_author_packet') or {}
if not isinstance(supervisor_packet, dict):
    supervisor_packet = {}

provided_payload = {
    'proof_plan': first_non_empty(supervisor_packet.get('proof_plan'), s.get('proof_plan')),
    'capture_script': first_non_empty(supervisor_packet.get('capture_script'), s.get('capture_script')),
    'baseline_understanding_used': supervisor_packet.get('baseline_understanding_used') or recon_baseline_understanding(s),
    'refined_inputs': supervisor_packet.get('refined_inputs') or {},
    'rationale': supervisor_packet.get('rationale', s.get('supervisor_author_rationale', [])),
    'confidence': first_non_empty(supervisor_packet.get('confidence'), s.get('supervisor_author_confidence'), 'medium').lower(),
    'summary': first_non_empty(supervisor_packet.get('summary'), s.get('supervisor_author_summary')),
}

has_supervisor_packet = bool(provided_payload['proof_plan']) and bool(provided_payload['capture_script'])

if not has_supervisor_packet:
    s['stage'] = 'author'
    s['author_status'] = 'needs_supervisor_judgment'
    s['proof_plan_status'] = 'needs_supervisor_judgment'
    s['author_mode'] = 'supervisor_request'
    s['author_model'] = 'supervising-agent'
    s['author_confidence'] = 'pending'
    s['author_rationale'] = []
    s['author_warnings'] = []
    s['author_runtime_model_hint'] = RUNTIME_MODEL_HINT
    s['author_summary'] = 'Awaiting supervising agent proof packet for recon-confirmed route ' + default_path
    s['proof_assessment'] = s.get('proof_assessment') or {}
    s['author_request'] = author_request_payload(s, reference, baselines, current_plan, hypothesis, default_path, default_selector)
    s['proof_plan_request'] = s['author_request']
    save_state(s)

    print('AUTHOR')
    print('=' * 50)
    print('Proof plan ready: no')
    print('Capture script ready: no')
    print('Authoring owner: supervising agent')
    print('Target path draft: ' + default_path)
    print('Wait for selector draft: ' + (default_selector or '(none)'))
    print(json.dumps({
        'ok': True,
        'author_status': s['author_status'],
        'proof_plan_status': s['proof_plan_status'],
        'author_mode': s['author_mode'],
        'author_model': s['author_model'],
        'server_path': default_path,
        'wait_for_selector': default_selector,
    }, indent=2))
    raise SystemExit(0)

refined = provided_payload['refined_inputs'] if isinstance(provided_payload['refined_inputs'], dict) else {}
refined_path = normalize_path(first_non_empty(refined.get('server_path'), s.get('server_path'), default_path)) or '/'
refined_selector = first_non_empty(refined.get('wait_for_selector'), s.get('wait_for_selector'), default_selector)
refined_reference = first_non_empty(refined.get('reference'), reference) or reference
confidence = provided_payload['confidence'] if provided_payload['confidence'] in ('high', 'medium', 'low') else 'medium'
rationale = sanitize_rationale(provided_payload['rationale'])
summary = provided_payload['summary'] or 'Supervising agent supplied the proof packet from recon observations.'

authored_packet = {
    'proof_plan': provided_payload['proof_plan'],
    'capture_script': provided_payload['capture_script'],
    'baseline_understanding_used': provided_payload['baseline_understanding_used'] if isinstance(provided_payload['baseline_understanding_used'], dict) else {},
    'refined_inputs': {
        'server_path': refined_path,
        'wait_for_selector': refined_selector,
        'reference': refined_reference,
    },
    'rationale': rationale,
    'confidence': confidence,
    'mode': 'supervising_agent',
    'model': ('supervising-agent:' + RUNTIME_MODEL_HINT) if RUNTIME_MODEL_HINT else 'supervising-agent',
    'summary': summary,
}

s['server_path'] = refined_path
if refined_selector:
    s['wait_for_selector'] = refined_selector
elif s.get('wait_for_selector'):
    s['wait_for_selector'] = ''

s['proof_plan'] = authored_packet['proof_plan']
s['capture_script'] = authored_packet['capture_script']
s['author_status'] = 'ready'
s['proof_plan_status'] = 'ready'
s['stage'] = 'author'
s['author_mode'] = 'supervising_agent'
s['author_model'] = authored_packet['model']
s['author_confidence'] = confidence
s['author_rationale'] = rationale
s['author_warnings'] = []
s['author_runtime_model_hint'] = RUNTIME_MODEL_HINT
s['author_packet'] = authored_packet
s['author_summary'] = summary
s['supervisor_author_packet'] = authored_packet
s['author_baseline_understanding_used'] = authored_packet['baseline_understanding_used']

authored_request = dict(author_request_payload(s, refined_reference, baselines, current_plan, hypothesis, refined_path, refined_selector))
authored_request.update({
    'status': 'ready',
    'authoring_mode': 'supervising_agent',
    'authoring_model': authored_packet['model'],
    'confidence': confidence,
    'rationale': rationale,
    'warnings': [],
    'runtime_model_hint': RUNTIME_MODEL_HINT,
    'refined_inputs': authored_packet['refined_inputs'],
    'authored_outputs': {
        'proof_plan': authored_packet['proof_plan'],
        'capture_script': authored_packet['capture_script'],
    },
    'summary': summary,
})
s['author_request'] = authored_request
s['proof_plan_request'] = authored_request

save_state(s)

print('AUTHOR')
print('=' * 50)
print('Proof plan ready: yes')
print('Capture script ready: yes')
print('Authoring owner: supervising agent')
print('Authoring model hint: ' + s['author_model'])
print('Target path: ' + refined_path)
print('Wait for selector: ' + (refined_selector or '(none)'))
print('Reference: ' + str(refined_reference))
if rationale:
    print('Rationale: ' + rationale[0])
print(json.dumps({
    'ok': True,
    'author_status': s['author_status'],
    'proof_plan_status': s['proof_plan_status'],
    'author_mode': s['author_mode'],
    'author_model': s['author_model'],
    'server_path': s.get('server_path', ''),
    'wait_for_selector': s.get('wait_for_selector', ''),
}, indent=2))
