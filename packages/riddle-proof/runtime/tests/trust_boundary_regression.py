import importlib.util
import io
import json
import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

SMOKE_PATH = Path(__file__).resolve().with_name('recon_verify_smoke.py')


def load_smoke_module():
    spec = importlib.util.spec_from_file_location('riddle_proof_recon_verify_smoke', SMOKE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


CASES = [
    {
        'name': 'route-change-forward-pass',
        'covers': ['route-changing interactions', 'proof-evidence-present'],
        'function': 'run_verify_interaction_terminal_route_from_proof_evidence',
        'expected_terminal': 'pass',
    },
    {
        'name': 'route-change-retry-state-drift-ignored',
        'covers': ['route-changing interactions', 'proof-evidence-present'],
        'function': 'run_verify_interaction_proof_evidence_overrides_stale_expected_path',
        'expected_terminal': 'pass',
    },
    {
        'name': 'route-change-reverse-pass',
        'covers': ['route-changing interactions'],
        'function': 'run_verify_interaction_reverse_terminal_route_from_proof_evidence',
        'expected_terminal': 'pass',
    },
    {
        'name': 'route-change-reverse-nested-terminal-url-pass',
        'covers': ['route-changing interactions', 'proof-evidence-present'],
        'function': 'run_verify_interaction_reverse_terminal_expected_url_from_nested_terminal_evidence',
        'expected_terminal': 'pass',
    },
    {
        'name': 'route-prose-noise-ignored',
        'covers': ['route-changing interactions', 'proof-evidence-present'],
        'function': 'run_verify_interaction_prose_route_noise_uses_proof_evidence',
        'expected_terminal': 'pass',
    },
    {
        'name': 'query-hash-trailing-slash-pass',
        'covers': ['query/hash/trailing-slash URLs', 'proof-evidence-present'],
        'function': 'run_verify_interaction_query_hash_pass_uses_proof_evidence_route',
        'expected_terminal': 'pass',
    },
    {
        'name': 'query-hash-dropped-specific-blocker',
        'covers': ['query/hash/trailing-slash URLs', 'invalid browser evidence'],
        'function': 'run_verify_interaction_authored_query_hash_mismatch_blocks_with_evidence',
        'expected_terminal': 'specific_blocker',
    },
    {
        'name': 'query-hash-dropped-structured-negative-blocker',
        'covers': ['query/hash/trailing-slash URLs', 'invalid browser evidence', 'proof-evidence-present'],
        'function': 'run_verify_interaction_explicit_expected_url_blocks_dropped_terminal_route',
        'expected_terminal': 'specific_blocker',
    },
    {
        'name': 'same-page-hash-pass',
        'covers': ['same-page hashes'],
        'function': 'run_verify_interaction_hash_terminal_route_from_proof_evidence',
        'expected_terminal': 'pass',
    },
    {
        'name': 'missing-selector-timeout-specific-blocker',
        'covers': ['missing selectors', 'timeouts'],
        'function': 'run_verify_capture_retry_surfaces_script_timeout',
        'expected_terminal': 'specific_blocker',
    },
    {
        'name': 'thrown-error-preserves-structured-evidence',
        'covers': ['thrown errors', 'proof-evidence-present'],
        'function': 'run_verify_preserves_proof_evidence_on_capture_script_error',
        'expected_terminal': 'specific_blocker',
    },
    {
        'name': 'interaction-thrown-error-specific-blocker',
        'covers': ['thrown errors', 'invalid browser evidence'],
        'function': 'run_verify_interaction_thrown_error_terminal_blocker',
        'expected_terminal': 'specific_blocker',
    },
    {
        'name': 'structured-proof-without-screenshot-pass',
        'covers': ['proof-evidence-present'],
        'function': 'run_verify_structured_evidence_without_screenshot',
        'expected_terminal': 'pass',
    },
    {
        'name': 'proof-evidence-absent-specific-blocker',
        'covers': ['proof-evidence-absent'],
        'function': 'run_verify_audio_requires_proof_evidence',
        'expected_terminal': 'specific_blocker',
    },
    {
        'name': 'no-diff-prod-audit-default-capture-pass',
        'covers': ['no-diff prod audits'],
        'function': 'run_remote_audit_verify_uses_default_capture_script',
        'expected_terminal': 'pass',
    },
]


GENERIC_FAILURE_MARKERS = (
    'codex_invalid_json',
    'codex_no_final_response',
    'codex_timeout',
    'max_iterations_reached',
    'stage_iteration_limit_reached',
    'unhandled_checkpoint',
)


def compact_logs(stdout, stderr):
    text = (stdout.getvalue() + '\n' + stderr.getvalue()).strip()
    lines = [line for line in text.splitlines() if line.strip()]
    return lines[-20:]


def run_case(module, case):
    stdout = io.StringIO()
    stderr = io.StringIO()
    try:
        with redirect_stdout(stdout), redirect_stderr(stderr):
            result = getattr(module, case['function'])()
        encoded = json.dumps(result, sort_keys=True)
        for marker in GENERIC_FAILURE_MARKERS:
            assert marker not in encoded, f'{case["name"]} leaked generic failure marker {marker}'
        return {
            'ok': True,
            'name': case['name'],
            'covers': case['covers'],
            'expected_terminal': case['expected_terminal'],
            'result': result,
        }
    except Exception as exc:
        return {
            'ok': False,
            'name': case['name'],
            'error': str(exc),
            'traceback': traceback.format_exc(limit=8),
            'logs': compact_logs(stdout, stderr),
        }


def main():
    module = load_smoke_module()
    results = [run_case(module, case) for case in CASES]
    failed = [result for result in results if not result['ok']]
    payload = {
        'ok': not failed,
        'suite': 'riddle-proof.trust-boundary-regression',
        'case_count': len(results),
        'failed': failed,
        'results': results,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
