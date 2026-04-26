import importlib.util
import json
import os
import shutil
import subprocess as sp
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / 'lib'
UTIL_PATH = LIB / 'util.py'
RECON_PATH = LIB / 'recon.py'
VERIFY_PATH = LIB / 'verify.py'
AUTHOR_PATH = LIB / 'author.py'
IMPLEMENT_PATH = LIB / 'implement.py'
SHIP_PATH = LIB / 'ship.py'

BUILD_SCRIPT = "python3 -c \"from pathlib import Path; Path('build').mkdir(exist_ok=True); Path('build/index.html').write_text('<html>ok</html>')\""


def state_console(payload):
    payload = dict(payload)
    payload.setdefault('consoleSummary', {'error_count': 0})
    payload.setdefault('failedChecks', [])
    return {
        'entries': {
            'log': [{'message': 'RIDDLE_PROOF_STATE:' + json.dumps(payload)}],
            'warn': [],
            'error': [],
            'info': [],
        },
    }


def load_module(name: str, path: Path):
    sys.modules.pop(name, None)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class FakeRiddle:
    def __init__(self):
        self.calls = []

    def invoke(self, tool, args, timeout=180):
        self.calls.append({'tool': tool, 'args': args, 'timeout': timeout})
        if tool == 'riddle_preview_delete':
            return {'ok': True}
        raise AssertionError(f'unexpected invoke tool: {tool}')

    def invoke_retry(self, tool, args, retries=3, timeout=180):
        self.calls.append({'tool': tool, 'args': args, 'timeout': timeout, 'retries': retries})
        if tool == 'riddle_preview':
            label = args.get('label', 'preview')
            return {
                'ok': True,
                'id': f'pv-{label}',
                'preview_url': f'https://preview.example.com/{label}/',
            }
        if tool == 'riddle_script':
            script = args.get('script', '')
            if 'preview.example.com' in script and '/wrong' in script:
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/wrong.png'}],
                    'outputs': [{'name': 'wrong.png', 'url': 'https://cdn.example.com/wrong.png'}],
                    'console': ['RIDDLE_PROOF_STATE:{"bodyTextLength":5,"interactiveElements":0,"pathname":"/wrong","title":"Wrong"}'],
                }
            if 'audioNoProof' in script:
                page_state = {
                    'bodyTextLength': 96,
                    'visibleTextSample': 'Neon step sequencer audio workbench',
                    'interactiveElements': 0,
                    'visibleInteractiveElements': 0,
                    'pathname': '/s/pv-after/sequencer',
                    'title': 'Sequencer',
                    'buttons': [],
                    'headings': ['Sequencer'],
                    'links': [],
                    'canvasCount': 1,
                    'largeVisibleElements': [{'tag': 'canvas', 'text': ''}],
                }
                return {
                    'ok': True,
                    'outputs': [{'name': 'metrics.json', 'url': 'https://cdn.example.com/metrics.json'}],
                    'result': {'pageState': page_state, 'summary': {'captured': True}},
                    'console': ['RIDDLE_PROOF_STATE:' + json.dumps(page_state)],
                }
            if 'audioFailedProof' in script:
                page_state = {
                    'bodyTextLength': 96,
                    'visibleTextSample': 'Neon step sequencer audio workbench',
                    'interactiveElements': 0,
                    'visibleInteractiveElements': 0,
                    'pathname': '/s/pv-after/sequencer',
                    'title': 'Sequencer',
                    'buttons': [],
                    'headings': ['Sequencer'],
                    'links': [],
                    'canvasCount': 1,
                    'largeVisibleElements': [{'tag': 'canvas', 'text': ''}],
                }
                proof_evidence = {
                    'proof_evidence_present': False,
                    'evidence_summary': 'Structured audio/source proof did not satisfy all required Monkberry release-tail checks.',
                    'checks': {
                        'route_ok': True,
                        'ui_context_ok': True,
                        'source_audio_ok': False,
                        'monkberry_scope_ok': False,
                    },
                    'import_error': 'Failed to fetch dynamically imported module: /src/Games/songs/index.js',
                }
                return {
                    'ok': True,
                    'outputs': [{'name': 'proof.json', 'url': 'https://cdn.example.com/proof.json'}],
                    'result': {'pageState': page_state},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'RIDDLE_PROOF_EVIDENCE ' + json.dumps(proof_evidence),
                    ],
                }
            if 'throwAfterProofEvidence' in script:
                assert '__riddleProofCaptureScriptError' in script
                page_state = {
                    'bodyTextLength': 96,
                    'visibleTextSample': 'Neon step sequencer audio workbench',
                    'interactiveElements': 0,
                    'visibleInteractiveElements': 0,
                    'pathname': '/s/pv-after/sequencer',
                    'title': 'Sequencer',
                    'buttons': [],
                    'headings': ['Sequencer'],
                    'links': [],
                    'canvasCount': 1,
                    'largeVisibleElements': [{'tag': 'canvas', 'text': ''}],
                }
                proof_evidence = {
                    'proof_evidence_present': False,
                    'evidence_summary': 'Captured structured audio evidence before the capture script threw.',
                    'checks': {
                        'route_ok': True,
                        'ui_context_ok': True,
                        'source_audio_ok': False,
                    },
                }
                return {
                    'ok': True,
                    'outputs': [{'name': 'proof.json', 'url': 'https://cdn.example.com/proof.json'}],
                    'result': {'pageState': page_state},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'RIDDLE_PROOF_EVIDENCE:' + json.dumps(proof_evidence),
                    ],
                    '_artifact_json': {
                        'proof.json': {
                            'script_error': 'Error: intentional capture script failure after evidence',
                        },
                    },
                }
            if 'window.__riddleProofEvidence' in script or 'globalThis.__riddleProofEvidence' in script:
                page_state = {
                    'bodyTextLength': 36,
                    'visibleTextSample': 'Neon step sequencer audio workbench',
                    'interactiveElements': 0,
                    'visibleInteractiveElements': 0,
                    'pathname': '/s/pv-after/sequencer',
                    'title': 'Sequencer',
                    'buttons': [],
                    'headings': ['Sequencer'],
                    'links': [],
                    'canvasCount': 1,
                    'largeVisibleElements': [{'tag': 'canvas', 'text': ''}],
                }
                proof_evidence = {
                    'modality': 'audio',
                    'attack_ms_before': 42,
                    'attack_ms_after': 12,
                    'transient_energy_delta_db': 4.8,
                    'passed': True,
                }
                return {
                    'ok': True,
                    'outputs': [{'name': 'metrics.json', 'url': 'https://cdn.example.com/metrics.json'}],
                    'result': {'proofEvidence': proof_evidence},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'RIDDLE_PROOF_EVIDENCE:' + json.dumps(proof_evidence),
                    ],
                }
            if 'after-proof' in script:
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/after.png'}],
                    'outputs': [{'name': 'after.png', 'url': 'https://cdn.example.com/after.png'}],
                    'console': state_console({
                        'bodyTextLength': 180,
                        'visibleTextSample': 'Pricing CTA Buy Now',
                        'interactiveElements': 4,
                        'visibleInteractiveElements': 4,
                        'pathname': '/s/pv-after/pricing',
                        'title': 'After',
                        'buttons': ['Buy Now'],
                        'headings': ['Pricing'],
                        'links': [],
                        'canvasCount': 0,
                        'largeVisibleElements': [{'tag': 'button', 'text': 'Buy Now'}],
                    }),
                }
            if 'prod.example.com/pricing' in script:
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/prod.png'}],
                    'outputs': [{'name': 'prod.png', 'url': 'https://cdn.example.com/prod.png'}],
                    'console': ['RIDDLE_PROOF_STATE:{"bodyTextLength":180,"interactiveElements":4,"pathname":"/pricing","title":"Prod"}'],
                }
            if 'prod.example.com/games/drum-sequencer' in script:
                page_state = {
                    'bodyTextLength': 240,
                    'visibleTextSample': 'Neon Step Sequencer Monkberry Moon Delight Mix Board Play All',
                    'interactiveElements': 8,
                    'visibleInteractiveElements': 8,
                    'pathname': '/games/drum-sequencer',
                    'search': '?song=monkberry-moon-delight-tab&mix=profile',
                    'title': 'Neon Step Sequencer',
                    'buttons': ['Play All', 'Shuffle'],
                    'headings': ['Neon Step Sequencer'],
                    'links': [],
                    'canvasCount': 1,
                    'largeVisibleElements': [{'tag': 'canvas', 'text': ''}],
                }
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/sequencer-prod.png'}],
                    'outputs': [{'name': 'prod.png', 'url': 'https://cdn.example.com/sequencer-prod.png'}],
                    'console': ['RIDDLE_PROOF_STATE:' + json.dumps(page_state)],
                }
            if 'preview.example.com' in script and '/pricing' in script:
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/before.png'}],
                    'outputs': [{'name': 'before.png', 'url': 'https://cdn.example.com/before.png'}],
                    'console': ['RIDDLE_PROOF_STATE:{"bodyTextLength":180,"interactiveElements":4,"pathname":"/pricing","title":"Before"}'],
                }
            if 'preview.example.com' in script and '/games/drum-sequencer' in script:
                page_state = {
                    'bodyTextLength': 240,
                    'visibleTextSample': 'Neon Step Sequencer Monkberry Moon Delight Mix Board Play All',
                    'interactiveElements': 8,
                    'visibleInteractiveElements': 8,
                    'pathname': '/s/pv-before/games/drum-sequencer',
                    'search': '?song=monkberry-moon-delight-tab&mix=profile',
                    'title': 'Neon Step Sequencer',
                    'buttons': ['Play All', 'Shuffle'],
                    'headings': ['Neon Step Sequencer'],
                    'links': [],
                    'canvasCount': 1,
                    'largeVisibleElements': [{'tag': 'canvas', 'text': ''}],
                }
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/sequencer-before.png'}],
                    'outputs': [{'name': 'before.png', 'url': 'https://cdn.example.com/sequencer-before.png'}],
                    'console': state_console(page_state),
                }
            if 'preview.example.com' in script and '/games/tic-tac-toe' in script:
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/tictactoe-before.png'}],
                    'outputs': [{'name': 'before.png', 'url': 'https://cdn.example.com/tictactoe-before.png'}],
                    'console': state_console({
                        'bodyTextLength': 220,
                        'visibleTextSample': 'LilArcade Tic Tac Toe Player X Reset Game',
                        'interactiveElements': 5,
                        'visibleInteractiveElements': 5,
                        'pathname': '/s/pv-before/games/tic-tac-toe',
                        'title': 'TicTacToe',
                        'buttons': ['Reset Game'],
                        'headings': ['Tic Tac Toe'],
                        'links': [],
                        'canvasCount': 0,
                        'largeVisibleElements': [{'tag': 'button', 'text': 'Reset Game'}],
                    }),
                }
            if (
                'preview.example.com' in script
                and '/pricing' not in script
                and '/games/tic-tac-toe' not in script
                and '/wrong' not in script
            ):
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/home-before.png'}],
                    'outputs': [{'name': 'before.png', 'url': 'https://cdn.example.com/home-before.png'}],
                    'console': state_console({
                        'bodyTextLength': 180,
                        'visibleTextSample': 'Riddle Proof homepage hero Start Free',
                        'interactiveElements': 4,
                        'visibleInteractiveElements': 4,
                        'pathname': '/',
                        'title': 'Riddle',
                        'buttons': ['Start Free'],
                        'headings': ['Riddle Proof'],
                        'links': [],
                        'canvasCount': 0,
                        'largeVisibleElements': [{'tag': 'button', 'text': 'Start Free'}],
                    }),
                }
            raise AssertionError(f'unexpected riddle_script payload: {script}')
        raise AssertionError(f'unexpected invoke_retry tool: {tool}')


def make_project(root: Path, route_snippet: str):
    root.mkdir(parents=True, exist_ok=True)
    (root / 'src').mkdir(exist_ok=True)
    (root / 'src' / 'routes.tsx').write_text(route_snippet)
    (root / 'package.json').write_text(json.dumps({
        'name': root.name,
        'scripts': {'build': BUILD_SCRIPT},
        'dependencies': {'react': '18.0.0', 'react-router-dom': '6.0.0'},
    }, indent=2))


def init_git_repo(root: Path):
    sp.run(['git', 'init', '-b', 'main'], cwd=root, check=True, stdout=sp.DEVNULL, stderr=sp.DEVNULL)
    sp.run(['git', 'config', 'user.email', 'proof@example.com'], cwd=root, check=True, stdout=sp.DEVNULL, stderr=sp.DEVNULL)
    sp.run(['git', 'config', 'user.name', 'Proof Test'], cwd=root, check=True, stdout=sp.DEVNULL, stderr=sp.DEVNULL)
    sp.run(['git', 'add', '.'], cwd=root, check=True, stdout=sp.DEVNULL, stderr=sp.DEVNULL)
    sp.run(['git', 'commit', '-m', 'init'], cwd=root, check=True, stdout=sp.DEVNULL, stderr=sp.DEVNULL)


def write_state(path: Path, payload: dict):
    path.write_text(json.dumps(payload, indent=2))


def run_capture_artifact_enrichment():
    util = load_module('util_artifact_enrichment', UTIL_PATH)
    fixtures = {
        'https://cdn.example.com/console.json': {
            'summary': {'total_entries': 1, 'error_count': 1},
            'entries': {
                'log': [],
                'warn': [],
                'error': [{'message': 'page.waitForSelector: Timeout 30000ms exceeded'}],
                'info': [],
            },
        },
        'https://cdn.example.com/proof.json': {
            'script_error': 'page.waitForSelector: Timeout 30000ms exceeded',
            'metrics': {'wall_ms': 30000},
        },
    }

    def fake_fetch_json_artifact(url, max_bytes=0):
        return fixtures[url], ''

    util.fetch_json_artifact = fake_fetch_json_artifact
    payload = {
        'ok': True,
        'outputs': [
            {'name': 'screenshot_1.png', 'url': 'https://cdn.example.com/screenshot_1.png'},
            {'name': 'console.json', 'url': 'https://cdn.example.com/console.json'},
            {'name': 'proof.json', 'url': 'https://cdn.example.com/proof.json'},
        ],
        'screenshots': [{'name': 'screenshot_1.png', 'url': 'https://cdn.example.com/screenshot_1.png'}],
    }

    enriched = util.enrich_capture_payload(payload)
    summary = util.summarize_capture_artifacts(payload)
    assert enriched['console']['summary']['error_count'] == 1
    assert enriched['_proof_json']['script_error'].startswith('page.waitForSelector')
    assert summary['artifact_json'] == ['console.json', 'proof.json']
    assert summary['proof_script_error'] is True
    assert summary['console_summary']['error_count'] == 1

    return {
        'ok': True,
        'artifact_json': summary['artifact_json'],
        'proof_script_error': summary['proof_script_error'],
    }


def run_capture_diagnostics_redact_sensitive_values():
    util = load_module('util_capture_diagnostics', UTIL_PATH)
    state = {}
    args = {
        'script': 'await page.goto("https://example.com");',
        'localStorage': {'accessToken': 'secret-token'},
        'cookies': [{'name': 'session', 'value': 'secret-cookie'}],
        'headers': {'Authorization': 'Bearer secret-token'},
        'nested': {'api_key': 'secret-key', 'safe': 'ok'},
    }
    payload = {
        'ok': False,
        'error': 'page crashed',
        'outputs': [{'name': 'console.json', 'url': 'https://cdn.example.com/console.json'}],
        'artifacts': [{
            'name': 'metering.json',
            'kind': 'json',
            'role': 'diagnostic',
            'path': '/tmp/riddle-proof/metering.json',
            'metadata': {'samples': 64},
        }],
    }
    diagnostic = util.append_capture_diagnostic(state, 'after', 'riddle_server_preview', args, payload)

    assert diagnostic['version'] == 'riddle-proof.capture-diagnostic.v1'
    assert diagnostic['tool'] == 'riddle_server_preview'
    assert diagnostic['args']['script'].startswith('await page.goto')
    assert diagnostic['args']['localStorage'] == '[redacted]'
    assert diagnostic['args']['cookies'] == '[redacted]'
    assert diagnostic['args']['headers'] == '[redacted]'
    assert diagnostic['args']['nested']['api_key'] == '[redacted]'
    assert diagnostic['args']['nested']['safe'] == 'ok'
    assert state['capture_diagnostics'][-1]['artifact_summary']['outputs'][0]['name'] == 'console.json'
    assert state['capture_diagnostics'][-1]['artifact_summary']['artifacts'][0]['metadata_keys'] == ['samples']
    return {'ok': True, 'diagnostics': len(state['capture_diagnostics'])}


def run_apply_auth_context_passes_supported_auth_payloads():
    util = load_module('util_apply_auth_context', UTIL_PATH)
    state = {
        'auth_localStorage': {'token': 'local'},
        'auth_cookies': [{'name': 'session', 'value': 'cookie'}],
        'auth_headers': {'Authorization': 'Bearer header'},
    }
    args = {'script': 'await page.goto("https://example.com");'}
    util.apply_auth_context(state, args)
    assert util.has_auth_context(state) is True
    assert args['localStorage'] == state['auth_localStorage']
    assert args['cookies'] == state['auth_cookies']
    assert args['headers'] == state['auth_headers']
    assert util.has_auth_context({}) is False
    assert util.has_auth_context({'use_auth': 'true'}) is True
    return {'ok': True, 'arg_keys': sorted(args.keys())}


def run_verify_quality_ignores_proof_telemetry_console_text():
    sys.modules.pop('util', None)
    source = VERIFY_PATH.read_text()
    helpers_source = source.split('\ns = load_state()', 1)[0]
    namespace = {'__file__': str(VERIFY_PATH)}
    exec(compile(helpers_source, str(VERIFY_PATH), 'exec'), namespace)

    telemetry_payload = {
        'bodyTextLength': 180,
        'visibleTextSample': 'LilArcade Circle Maze Coin Clicker',
        'interactiveElements': 4,
        'visibleInteractiveElements': 4,
        'pathname': '/',
        'title': 'LilArcade',
        'headings': ['LilArcade'],
        'links': [{'text': 'Circle Maze', 'href': '/games/circle-maze'}],
        'canvasCount': 0,
        'largeVisibleElements': [{'tag': 'h1', 'text': 'LilArcade'}],
        'console_summary': {'error_count': 0},
        'failed_checks': [],
    }
    quality = namespace['evaluate_capture_quality']({
        'ok': True,
        'screenshots': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
        'outputs': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
        'console': [
            'RIDDLE_PROOF_STATE:' + json.dumps(telemetry_payload),
            'RIDDLE_PROOF_EVIDENCE:' + json.dumps({'passed': True, 'error_count': 0}),
        ],
    }, '/', 'visual')
    assert quality['valid'] is True
    assert quality['details']['has_errors'] is False
    assert quality['details']['capture_error_messages'] == []

    runtime_error_quality = namespace['evaluate_capture_quality']({
        'ok': True,
        'screenshots': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
        'outputs': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
        'console': [
            'RIDDLE_PROOF_STATE:' + json.dumps(telemetry_payload),
            'Uncaught TypeError: boom',
        ],
    }, '/', 'visual')
    assert runtime_error_quality['valid'] is False
    assert runtime_error_quality['details']['has_errors'] is True
    assert 'console/runtime errors' in runtime_error_quality['reason']

    query_payload = dict(telemetry_payload)
    query_payload.update({
        'visibleTextSample': 'Neon Step Sequencer Monkberry Moon Delight Mix Board Play All',
        'pathname': '/s/pv-after/games/drum-sequencer',
        'search': '?song=monkberry-moon-delight-tab&mix=profile&utm_source=test',
        'title': 'Neon Step Sequencer',
        'headings': ['Neon Step Sequencer'],
        'buttons': ['Play All'],
        'canvasCount': 1,
    })
    query_quality = namespace['evaluate_capture_quality']({
        'ok': True,
        'screenshots': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
        'outputs': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
        'console': ['RIDDLE_PROOF_STATE:' + json.dumps(query_payload)],
    }, '/games/drum-sequencer?mix=profile&song=monkberry-moon-delight-tab', 'visual')
    assert query_quality['valid'] is True, query_quality
    assert query_quality['details']['observed_path'] == '/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&utm_source=test'
    assert query_quality['details']['observed_path_raw'] == '/s/pv-after/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile&utm_source=test'

    missing_query_quality = namespace['evaluate_capture_quality']({
        'ok': True,
        'screenshots': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
        'outputs': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
        'console': ['RIDDLE_PROOF_STATE:' + json.dumps({**query_payload, 'search': '?song=monkberry-moon-delight-tab'})],
    }, '/games/drum-sequencer?mix=profile&song=monkberry-moon-delight-tab', 'visual')
    assert missing_query_quality['valid'] is False
    assert 'wrong route' in missing_query_quality['reason']

    strong_delta = namespace['extract_visual_delta']({
        'ok': True,
        'result': {
            'proofEvidence': {
                'change_pct': '2.31',
                'changed_pixels': 22395,
                'width': 1080,
                'height': 900,
            },
        },
    })
    assert strong_delta['status'] == 'measured'
    assert strong_delta['passed'] is True
    assert strong_delta['change_percent'] == 2.31
    assert strong_delta['changed_pixels'] == 22395

    weak_delta = namespace['extract_visual_delta']({
        'ok': True,
        'result': {
            'proofEvidence': {
                'change_pct': '0.06',
                'changed_pixels': 616,
                'width': 1080,
                'height': 900,
            },
        },
    })
    assert weak_delta['status'] == 'measured'
    assert weak_delta['passed'] is False
    assert 'below the legibility threshold' in weak_delta['reason']

    unmeasured_delta = namespace['extract_visual_delta']({
        'ok': True,
        'screenshots': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
    })
    assert unmeasured_delta['status'] == 'unmeasured'
    assert unmeasured_delta['passed'] is None

    return {'ok': True, 'telemetry_valid': quality['valid'], 'weak_delta_passed': weak_delta['passed']}


def load_util_with_fake(fake: FakeRiddle):
    util = load_module('util', UTIL_PATH)
    util.invoke = fake.invoke
    util.invoke_retry = fake.invoke_retry
    return util


@contextmanager
def temporary_env(**updates):
    sentinel = object()
    previous = {}
    for key, value in updates.items():
        previous[key] = os.environ.get(key, sentinel)
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    try:
        yield
    finally:
        for key, value in previous.items():
            if value is sentinel:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def base_state(tempdir: Path, *, reference='before', prod_url=''):
    before_dir = tempdir / 'before'
    after_dir = tempdir / 'after'
    make_project(before_dir, "export const routes = [{ path: '/pricing', element: <Pricing /> }];\n")
    make_project(after_dir, "export const routes = [{ path: '/pricing', element: <Pricing /> }];\n")
    return {
        'workspace_ready': True,
        'repo_dir': str(tempdir),
        'before_worktree': str(before_dir),
        'after_worktree': str(after_dir),
        'mode': 'static',
        'reference': reference,
        'requested_reference': reference,
        'prod_url': prod_url,
        'change_request': 'Fix the pricing CTA layout',
        'success_criteria': 'Pricing CTA is visible and aligned on the pricing route.',
        'verification_mode': 'visual',
        'build_command': BUILD_SCRIPT,
        'build_output': 'build',
        'capture_script': '',
        'proof_plan_status': 'pending_recon',
        'author_status': 'pending_recon',
        'implementation_status': 'pending_recon',
        'wait_for_selector': '',
        'server_path': '/pricing',
        'allow_static_preview_fallback': True,
        'auth_localStorage': {},
        'before_cdn': '',
        'after_cdn': '',
        'prod_cdn': '',
        'proof_plan': '',
        'proof_plan_request': {},
        'author_request': {},
        'recon_results': {},
        'recon_decision_request': {},
        'verify_results': {},
        'proof_assessment': {},
        'proof_assessment_request': {},
    }


def run_project_build_retries_after_clean_failure():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-build-retry-'))
    cache_dir = tempdir / '.next'
    cache_dir.mkdir(parents=True, exist_ok=True)
    util = load_module('util_build_retry', UTIL_PATH)
    original_run = util.sp.run
    calls = []

    def fake_run(cmd, *args, **kwargs):
        calls.append(cmd)
        if cmd == 'npm run build':
            build_attempts = calls.count('npm run build')
            if build_attempts == 1:
                return sp.CompletedProcess(cmd, 1, '', 'stale cache')
            return sp.CompletedProcess(cmd, 0, 'ok', '')
        if cmd == 'rm -rf .next':
            shutil.rmtree(cache_dir, ignore_errors=True)
            return sp.CompletedProcess(cmd, 0, '', '')
        raise AssertionError(f'unexpected command: {cmd}')

    try:
        util.sp.run = fake_run
        result = util.run_project_build(str(tempdir), 'npm run build', timeout=30, clean_cache_dir='.next')
        assert result['clean_retry_used'] is True
        assert result['result'].returncode == 0
        assert calls == ['npm run build', 'rm -rf .next', 'npm run build']
        assert not cache_dir.exists()
    finally:
        util.sp.run = original_run
        shutil.rmtree(tempdir)


def run_implement_records_detection_when_changes_missing():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-implement-missing-'))
    state_path = tempdir / 'state.json'
    previous_state_file = os.environ.get('RIDDLE_PROOF_STATE_FILE')
    try:
        state = base_state(tempdir, reference='before')
        after_dir = Path(state['after_worktree'])
        init_git_repo(after_dir)
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'proof_plan': 'Capture the pricing CTA after the implementation is applied.',
            'capture_script': "await page.waitForSelector('[data-testid=pricing-cta]'); await saveScreenshot('after-proof');",
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)
        load_module('util', UTIL_PATH)

        try:
            load_module('implement_changes_missing_state', IMPLEMENT_PATH)
        except SystemExit as exc:
            assert 'No implementation detected on the after worktree.' in str(exc), exc
        else:
            raise AssertionError('implement stage should have halted when no diff exists')

        after_state = json.loads(state_path.read_text())
        assert after_state['implementation_status'] == 'changes_missing'
        assert after_state['implementation_summary'] == 'No implementation detected on the after worktree.'
        assert after_state['changed_files'] == []
        assert after_state['stage'] == 'implement'
        detection = after_state['implementation_detection']
        assert detection['outcome'] == 'no_changes_detected'
        assert detection['diff_detected'] is False
        assert detection['dirty_path_count'] == 0
        assert detection['committed_path_count'] == 0
        assert detection['changed_path_count'] == 0
        assert detection['authored_inputs_ready'] is True
        assert detection['base_ref_requested'] == 'origin/main'
        assert detection['diff_probes'][0]['label'] == 'requested_base'
        assert after_state['implementation_detection_summary'].startswith('Implementation detection found no material code changes')
        return {
            'ok': True,
            'outcome': detection['outcome'],
            'summary': after_state['implementation_detection_summary'],
        }
    finally:
        if previous_state_file is None:
            os.environ.pop('RIDDLE_PROOF_STATE_FILE', None)
        else:
            os.environ['RIDDLE_PROOF_STATE_FILE'] = previous_state_file
        shutil.rmtree(tempdir, ignore_errors=True)


def run_implement_ignores_tool_noise_when_detecting_changes():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-implement-noise-'))
    state_path = tempdir / 'state.json'
    previous_state_file = os.environ.get('RIDDLE_PROOF_STATE_FILE')
    try:
        state = base_state(tempdir, reference='before')
        after_dir = Path(state['after_worktree'])
        init_git_repo(after_dir)
        codex_dir = after_dir / '.codex'
        codex_dir.mkdir(parents=True, exist_ok=True)
        (codex_dir / 'session.json').write_text('{}\n')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'proof_plan': 'Capture the pricing CTA after the implementation is applied.',
            'capture_script': "await page.waitForSelector('[data-testid=pricing-cta]'); await saveScreenshot('after-proof');",
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)
        load_module('util', UTIL_PATH)

        try:
            load_module('implement_ignores_tool_noise', IMPLEMENT_PATH)
        except SystemExit as exc:
            assert 'No implementation detected on the after worktree.' in str(exc), exc
        else:
            raise AssertionError('implement stage should have halted when only tool noise changed')

        after_state = json.loads(state_path.read_text())
        detection = after_state['implementation_detection']
        assert detection['outcome'] == 'no_changes_detected'
        assert detection['diff_detected'] is False
        assert detection['dirty_path_count'] == 0
        assert detection['dirty_path_count_including_noise'] >= 1
        assert any(str(path).startswith('.codex') for path in detection['ignored_dirty_paths'])
        assert detection['changed_path_count'] == 0
        assert after_state['changed_files'] == []
        return {
            'ok': True,
            'ignored_dirty_paths': detection['ignored_dirty_paths'],
        }
    finally:
        if previous_state_file is None:
            os.environ.pop('RIDDLE_PROOF_STATE_FILE', None)
        else:
            os.environ['RIDDLE_PROOF_STATE_FILE'] = previous_state_file
        shutil.rmtree(tempdir, ignore_errors=True)


def run_recon_then_author_request():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-supervisor-request-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='both', prod_url='https://prod.example.com/pricing')
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('recon_supervisor_request', RECON_PATH)
        after_recon = json.loads(state_path.read_text())

        assert after_recon['recon_status'] == 'needs_supervisor_judgment'
        assert after_recon['before_cdn'] == ''
        assert after_recon['prod_cdn'] == ''
        assert after_recon['author_status'] == 'needs_recon_judgment'
        assert after_recon['recon_assessment_request']['status'] == 'needs_supervising_agent_assessment'

        latest_attempt = after_recon['recon_results']['attempt_history'][-1]
        approved_baselines = latest_attempt['captured_baselines']
        after_recon['recon_status'] = 'ready_for_proof_plan'
        after_recon['recon_results']['baselines'] = approved_baselines
        after_recon['recon_results']['selected_attempt'] = latest_attempt
        after_recon['before_cdn'] = approved_baselines['before']['url']
        after_recon['prod_cdn'] = approved_baselines['prod']['url']
        after_recon['author_status'] = 'needs_authoring'
        after_recon['proof_plan_status'] = 'needs_authoring'
        after_recon['recon_assessment_request'] = {}
        after_recon['recon_decision_request'] = {}
        state_path.write_text(json.dumps(after_recon, indent=2))

        fake = FakeRiddle()
        load_util_with_fake(fake)
        with temporary_env(RIDDLE_PROOF_AUTHOR_RUNTIME_MODEL='openai-codex/gpt-5.4'):
            load_module('author_supervisor_request', AUTHOR_PATH)
        after_author = json.loads(state_path.read_text())

        assert after_author['author_status'] == 'needs_supervisor_judgment'
        assert after_author['proof_plan_status'] == 'needs_supervisor_judgment'
        assert after_author['author_mode'] == 'supervisor_request'
        assert after_author['author_model'] == 'supervising-agent'
        assert after_author['author_runtime_model_hint'] == 'openai-codex/gpt-5.4'
        assert after_author['author_request']['status'] == 'needs_supervisor_judgment'
        assert after_author['author_request']['fallback_defaults']['server_path'] == '/pricing'
        assert 'supervising agent owns proof authoring' in after_author['author_request']['instructions'][0].lower()

        return {
            'ok': True,
            'recon_status': after_recon['recon_status'],
            'author_status': after_author['author_status'],
            'author_mode': after_author['author_mode'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_recon_preserves_query_route():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-query-route-'))
    state_path = tempdir / 'state.json'
    try:
        query_route = '/games/drum-sequencer?song=monkberry-moon-delight-tab&mix=profile'
        state = base_state(
            tempdir,
            reference='both',
            prod_url='https://prod.example.com' + query_route,
        )
        state.update({
            'server_path': query_route,
            'change_request': 'Make a tiny harmless visible sequencer helper-copy change.',
            'success_criteria': 'The Monkberry profile sequencer route is loaded and visible.',
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('recon_query_route', RECON_PATH)
        after_recon = json.loads(state_path.read_text())

        latest_attempt = after_recon['recon_results']['attempt_history'][-1]
        before = latest_attempt['captured_baselines']['before']
        prod = latest_attempt['captured_baselines']['prod']
        assert before['path'] == query_route
        assert prod['path'] == query_route
        assert before['observation']['valid'] is True, before['observation']
        assert prod['observation']['valid'] is True, prod['observation']
        assert before['observation']['details']['observed_path'] == query_route
        assert prod['observation']['details']['observed_path'] == query_route
        assert 'wrong route' not in before['observation']['reason']
        assert 'wrong route' not in prod['observation']['reason']
        return {
            'ok': True,
            'before_observed_path': before['observation']['details']['observed_path'],
            'prod_observed_path': prod['observation']['details']['observed_path'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_recon_prefers_route_literals_over_import_paths():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-route-literals-'))
    state_path = tempdir / 'state.json'
    try:
        route_snippet = "const Game = lazy(() => import('./Games/TicTacToe'));\nexport const routes = [{ path: '/games/tic-tac-toe', element: <Game /> }];\n"
        state = base_state(tempdir, reference='before')
        make_project(tempdir / 'before', route_snippet)
        make_project(tempdir / 'after', route_snippet)
        state.update({
            'server_path': '/',
            'server_path_source': '',
            'change_request': 'Change the TicTacToe reset button color',
            'success_criteria': 'The TicTacToe reset button has the requested color on the game route.',
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('recon_route_literal_preference', RECON_PATH)
        after_recon = json.loads(state_path.read_text())

        current_plan = after_recon['recon_results']['current_plan']
        candidate_paths = [item['path'] for item in current_plan['route_candidates']]
        assert current_plan['target_path'] == '/games/tic-tac-toe', current_plan
        assert '/Games/TicTacToe' not in candidate_paths, candidate_paths
        details = after_recon['recon_results']['attempt_history'][-1]['observations']['before']['details']
        assert details['observed_path'] == '/games/tic-tac-toe'
        assert 'Reset Game' in details['visible_text_sample'], details
        assert details['buttons'] == ['Reset Game'], details

        return {
            'ok': True,
            'target_path': current_plan['target_path'],
            'candidate_paths': candidate_paths,
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_recon_prefers_hint_root_over_single_route_literal():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-hint-root-'))
    state_path = tempdir / 'state.json'
    try:
        route_snippet = "export const routes = [{ path: '/docs/riddle-proof/markdown', element: <Docs /> }];\n"
        state = base_state(tempdir, reference='before')
        make_project(tempdir / 'before', route_snippet)
        make_project(tempdir / 'after', route_snippet)
        state.update({
            'server_path': '/',
            'server_path_source': 'hint_cache',
            'capture_hint': {
                'source': 'hint_cache',
                'applied_fields': ['server_path'],
                'selected': {'server_path': '/'},
            },
            'change_request': 'Make a tiny harmless homepage copy tweak',
            'success_criteria': 'The homepage hero copy reflects the tiny tweak.',
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('recon_hint_root_preference', RECON_PATH)
        after_recon = json.loads(state_path.read_text())

        current_plan = after_recon['recon_results']['current_plan']
        candidate_paths = [item['path'] for item in current_plan['route_candidates']]
        assert current_plan['target_path'] == '/', current_plan
        assert current_plan['path_source'] == 'state.server_path:hint_cache', current_plan
        assert '/docs/riddle-proof/markdown' in candidate_paths, candidate_paths
        details = after_recon['recon_results']['attempt_history'][-1]['observations']['before']['details']
        assert details['observed_path'] == '/'
        assert 'Start Free' in details['visible_text_sample'], details
        assert details['buttons'] == ['Start Free'], details

        return {
            'ok': True,
            'target_path': current_plan['target_path'],
            'path_source': current_plan['path_source'],
            'candidate_paths': candidate_paths,
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_author_applies_supervisor_packet():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-supervisor-apply-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'before_cdn': 'https://cdn.example.com/before.png',
            'recon_results': {
                'baselines': {'before': {'path': '/pricing', 'url': 'https://cdn.example.com/before.png'}},
                'current_plan': {'target_path': '/pricing'},
                'attempt_history': [{'attempt': 1, 'result': 'success'}],
            },
            'author_request': {
                'current_plan': {'target_path': '/pricing'},
                'observed_baselines': {'before': {'path': '/pricing', 'url': 'https://cdn.example.com/before.png'}},
            },
            'supervisor_author_packet': {
                'proof_plan': 'Use the recon-confirmed /pricing route and capture the CTA state once it stabilizes.',
                'capture_script': "await page.waitForSelector('[data-testid=pricing-cta]'); await saveScreenshot('after-proof');",
                'refined_inputs': {
                    'server_path': '/pricing',
                    'wait_for_selector': '[data-testid=pricing-cta]',
                    'reference': 'before',
                },
                'rationale': ['Recon already confirmed the route, so authoring should stay on /pricing.'],
                'confidence': 'high',
                'summary': 'Supervisor supplied the proof packet.',
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        with temporary_env(RIDDLE_PROOF_AUTHOR_RUNTIME_MODEL='openai-codex/gpt-5.4'):
            load_module('author_supervisor_apply', AUTHOR_PATH)
        after_author = json.loads(state_path.read_text())

        assert after_author['author_status'] == 'ready'
        assert after_author['proof_plan_status'] == 'ready'
        assert after_author['author_mode'] == 'supervising_agent'
        assert after_author['author_model'] == 'supervising-agent:openai-codex/gpt-5.4'
        assert after_author['wait_for_selector'] == '[data-testid=pricing-cta]'
        assert after_author['proof_plan']
        assert after_author['capture_script']
        assert after_author['author_packet']['mode'] == 'supervising_agent'
        assert after_author['author_request']['status'] == 'ready'
        assert after_author['author_request']['authoring_mode'] == 'supervising_agent'

        return {
            'ok': True,
            'author_status': after_author['author_status'],
            'author_model': after_author['author_model'],
            'wait_for_selector': after_author['wait_for_selector'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_requests_supervisor_assessment():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-verify-supervisor-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='both', prod_url='https://prod.example.com/pricing')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'before_cdn': 'https://cdn.example.com/before.png',
            'prod_cdn': 'https://cdn.example.com/prod.png',
            'proof_plan': 'Use the recon-confirmed /pricing route and capture the CTA state once it stabilizes.',
            'capture_script': "await page.waitForSelector('[data-testid=pricing-cta]'); await saveScreenshot('after-proof');",
            'wait_for_selector': '[data-testid=pricing-cta]',
            'recon_results': {
                'baselines': {
                    'before': {'path': '/pricing', 'url': 'https://cdn.example.com/before.png'},
                    'prod': {'path': '/pricing', 'url': 'https://cdn.example.com/prod.png'},
                },
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_supervisor_assessment', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'evidence_captured'
        assert after_verify['after_cdn'] == 'https://cdn.example.com/after.png'
        assert after_verify['merge_recommendation'] == 'pending-supervisor-judgment'
        assert after_verify['proof_assessment'] == {}
        assert after_verify['proof_assessment_source'] is None
        assert after_verify['proof_assessment_request']['status'] == 'needs_supervising_agent_assessment'
        visual_delta = after_verify['proof_assessment_request']['visual_delta']
        assert visual_delta['status'] == 'unmeasured'
        assert visual_delta['passed'] is None
        semantic_context = after_verify['proof_assessment_request']['semantic_context']
        assert semantic_context['route']['expected_path'] == '/pricing'
        assert semantic_context['route']['after_observed_path'] == '/pricing'
        assert semantic_context['after']['buttons'] == ['Buy Now'], semantic_context
        assert semantic_context['after']['headings'] == ['Pricing'], semantic_context
        assert 'semantic-context' in after_verify['proof_assessment_request']['evidence_basis']
        assert after_verify['proof_assessment_request']['evidence_bundle']['semantic_context']['after']['buttons'] == ['Buy Now']
        artifact_contract = after_verify['proof_assessment_request']['artifact_contract']
        assert artifact_contract['required']['baseline_context'] is True
        assert artifact_contract['required']['screenshot'] is True
        artifact_production = after_verify['proof_assessment_request']['artifact_production']
        assert artifact_production['image_output_count'] >= 1
        assert artifact_production['proof_evidence_present'] is False
        artifact_usage = after_verify['proof_assessment_request']['artifact_usage']
        assert artifact_usage['missing_required_signals'] == []
        assert 'after-capture' in artifact_usage['supervisor_review_signals']
        assert 'baseline_context' in artifact_usage['required_signals']
        assert 'route_semantics' in artifact_usage['available_signals']
        assert after_verify['proof_assessment_request']['evidence_bundle']['artifact_contract']['required']['screenshot'] is True
        assert after_verify['proof_assessment_request']['evidence_bundle']['artifact_production']['image_output_count'] >= 1
        assert after_verify['proof_assessment_request']['evidence_bundle']['artifact_usage']['missing_required_signals'] == []
        assert 'capture success is not proof' in '\n'.join(after_verify['proof_assessment_request']['instructions'])
        assert after_verify['verify_decision_request']['continue_with_stage'] is None
        assert after_verify['verify_results']['baseline']['before']['source'] == 'recon'
        assert after_verify['verify_results']['baseline']['prod']['source'] == 'recon'
        assert after_verify['verify_results']['after']['observation']['valid'] is True
        after_details = after_verify['verify_results']['after']['observation']['details']
        assert after_details['observed_path'] == '/pricing', after_details
        assert after_details['observed_path_raw'] == '/s/pv-after/pricing', after_details
        assert 'Buy Now' in after_details['visible_text_sample'], after_details
        assert after_details['buttons'] == ['Buy Now'], after_details
        runtime_events = after_verify.get('runtime_events') or []
        assert any(event.get('kind') == 'workflow.phase.started' and event.get('step') == 'verify' and event.get('phase') == 'build' for event in runtime_events)
        assert any(event.get('kind') == 'workflow.phase.finished' and event.get('step') == 'verify' and event.get('phase') == 'build' for event in runtime_events)
        assert any(event.get('kind') == 'workflow.phase.started' and event.get('step') == 'verify' and event.get('phase') == 'capture' for event in runtime_events)
        assert any(event.get('kind') == 'workflow.phase.finished' and event.get('step') == 'verify' and event.get('phase') == 'capture' for event in runtime_events)
        assert any(event.get('kind') == 'workflow.phase.started' and event.get('step') == 'verify' and event.get('phase') == 'assessment' for event in runtime_events)
        assert any(event.get('kind') == 'workflow.phase.finished' and event.get('step') == 'verify' and event.get('phase') == 'assessment' for event in runtime_events)

        return {
            'ok': True,
            'verify_status': after_verify['verify_status'],
            'merge_recommendation': after_verify['merge_recommendation'],
            'assessment_status': after_verify['proof_assessment_request']['status'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_structured_evidence_without_screenshot():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-verify-structured-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'before_cdn': 'https://cdn.example.com/before.png',
            'verification_mode': 'audio',
            'server_path': '/sequencer',
            'proof_plan': 'Measure the rendered synth transient envelope and compare attack/energy metrics.',
            'capture_script': (
                "await page.evaluate(() => { "
                "window.__riddleProofEvidence = { "
                "modality: 'audio', attack_ms_before: 42, attack_ms_after: 12, "
                "transient_energy_delta_db: 4.8, passed: true }; });"
            ),
            'recon_results': {
                'baselines': {'before': {'path': '/sequencer', 'url': 'https://cdn.example.com/before.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_structured_evidence', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'evidence_captured'
        assert after_verify['after_cdn'] == ''
        assert after_verify['verify_results']['after']['observation']['valid'] is True
        supporting = after_verify['verify_results']['after']['supporting_artifacts']
        assert supporting['has_structured_payload'] is True
        assert supporting['proof_evidence_present'] is True
        script_calls = [
            call['args']['script']
            for call in fake.calls
            if call['tool'] == 'riddle_script'
        ]
        assert script_calls, 'verify should run a proof capture script'
        capture_script = script_calls[-1]
        assert 'globalThis.__riddleProofEvidence ??' not in capture_script
        assert 'typeof globalThis !== "undefined"' in capture_script
        assert '__riddleProofEvidenceRoot.__riddleProofEvidence' in capture_script
        assert 'attack_ms_after' in supporting['proof_evidence_sample']
        assert after_verify['evidence_bundle']['proof_evidence']['attack_ms_after'] == 12
        assert after_verify['evidence_bundle']['after']['proof_evidence']['attack_ms_after'] == 12
        assert after_verify['proof_assessment_request']['evidence_bundle']['after']['supporting_artifacts']['proof_evidence_present'] is True
        assert 'structured-artifacts' in after_verify['proof_assessment_request']['evidence_basis']
        assert 'semantic-context' in after_verify['proof_assessment_request']['evidence_basis']
        assert after_verify['proof_assessment_request']['semantic_context']['route']['after_observed_path'] == '/sequencer'

        return {
            'ok': True,
            'verify_status': after_verify['verify_status'],
            'after_cdn': after_verify['after_cdn'],
            'structured': supporting['has_structured_payload'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_audio_requires_proof_evidence():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-verify-audio-gate-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'before_cdn': 'https://cdn.example.com/before.png',
            'verification_mode': 'audio',
            'server_path': '/sequencer',
            'proof_plan': 'Measure the rendered synth transient envelope and compare attack/energy metrics.',
            'capture_script': "await page.evaluate(() => { document.body.dataset.audioNoProof = '1'; });",
            'recon_results': {
                'baselines': {'before': {'path': '/sequencer', 'url': 'https://cdn.example.com/before.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_audio_requires_proof_evidence', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'capture_incomplete'
        assert after_verify['proof_assessment_request'] == {}
        observation = after_verify['verify_results']['after']['observation']
        assert observation['valid'] is True
        supporting = after_verify['verify_results']['after']['supporting_artifacts']
        assert supporting['has_structured_payload'] is True
        assert supporting['proof_evidence_present'] is False
        capture_quality = after_verify['verify_decision_request']['capture_quality']
        assert capture_quality['decision'] == 'missing_proof_evidence'
        assert capture_quality['recommended_stage'] == 'author'
        assert 'Audio verification requires proof_evidence_present=true' in capture_quality['summary']
        assert 'Structured proof evidence gate' in after_verify['proof_summary']

        return {
            'ok': True,
            'verify_status': after_verify['verify_status'],
            'decision': capture_quality['decision'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_audio_rejects_failed_nested_proof_evidence():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-verify-audio-failed-gate-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'before_cdn': 'https://cdn.example.com/before.png',
            'verification_mode': 'audio',
            'server_path': '/sequencer',
            'proof_plan': 'Measure the rendered synth transient envelope and compare attack/energy metrics.',
            'capture_script': "await page.evaluate(() => { document.body.dataset.audioFailedProof = '1'; });",
            'recon_results': {
                'baselines': {'before': {'path': '/sequencer', 'url': 'https://cdn.example.com/before.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_audio_rejects_failed_nested_proof_evidence', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'capture_incomplete'
        assert after_verify['proof_assessment_request'] == {}
        observation = after_verify['verify_results']['after']['observation']
        assert observation['valid'] is True
        assert observation['details']['has_errors'] is False
        supporting = after_verify['verify_results']['after']['supporting_artifacts']
        assert supporting['has_structured_payload'] is True
        assert supporting['proof_evidence_present'] is True
        assert 'Failed to fetch dynamically imported module' in supporting['proof_evidence_sample']
        capture_quality = after_verify['verify_decision_request']['capture_quality']
        assert capture_quality['decision'] == 'failed_proof_evidence'
        assert capture_quality['recommended_stage'] == 'author'
        assert 'proof_evidence_present=false' in capture_quality['summary']
        assert 'source_audio_ok' in capture_quality['summary']
        assert 'Structured proof evidence gate' in after_verify['proof_summary']

        return {
            'ok': True,
            'verify_status': after_verify['verify_status'],
            'decision': capture_quality['decision'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_preserves_proof_evidence_on_capture_script_error():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-verify-script-error-evidence-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'before_cdn': 'https://cdn.example.com/before.png',
            'verification_mode': 'audio',
            'server_path': '/sequencer',
            'proof_plan': 'Measure the rendered synth transient envelope and compare attack/energy metrics.',
            'capture_script': (
                "await page.evaluate(() => { "
                "document.body.dataset.throwAfterProofEvidence = '1'; "
                "window.__riddleProofEvidence = { "
                "proof_evidence_present: false, "
                "evidence_summary: 'Captured structured audio evidence before the capture script threw.', "
                "checks: { route_ok: true, ui_context_ok: true, source_audio_ok: false } "
                "}; }); "
                "throw new Error('intentional capture script failure after evidence');"
            ),
            'recon_results': {
                'baselines': {'before': {'path': '/sequencer', 'url': 'https://cdn.example.com/before.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_preserves_script_error_evidence', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'capture_incomplete'
        observation = after_verify['verify_results']['after']['observation']
        assert observation['valid'] is False
        artifact_summary = observation['details']['artifact_summary']
        assert artifact_summary['proof_script_error'] is True
        supporting = after_verify['verify_results']['after']['supporting_artifacts']
        assert supporting['has_structured_payload'] is True
        assert supporting['proof_evidence_present'] is True
        assert 'Captured structured audio evidence before the capture script threw' in supporting['proof_evidence_sample']
        capture_quality = after_verify['verify_decision_request']['capture_quality']
        assert capture_quality['decision'] == 'failed_proof_evidence'
        assert capture_quality['recommended_stage'] == 'author'
        assert 'proof_evidence_present=false' in capture_quality['summary']
        assert 'source_audio_ok' in capture_quality['summary']
        assert 'Structured proof evidence gate' in after_verify['proof_summary']

        return {
            'ok': True,
            'verify_status': after_verify['verify_status'],
            'decision': capture_quality['decision'],
            'proof_script_error': artifact_summary['proof_script_error'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_capture_retry():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-capture-retry-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'before_cdn': 'https://cdn.example.com/before.png',
            'proof_plan': 'Capture the CTA interaction on the pricing route.',
            'capture_script': "await page.goto('https://preview.example.com/wrong/'); await saveScreenshot('after-proof-bad');",
            'recon_results': {
                'baselines': {'before': {'path': '/pricing', 'url': 'https://cdn.example.com/before.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_capture_retry', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'capture_incomplete'
        assert after_verify['merge_recommendation'] == 'do-not-merge'
        assert after_verify['proof_assessment'] == {}
        assert after_verify['proof_assessment_request'] == {}
        assert after_verify['verify_decision_request']['recommended_stage'] in ('author', 'recon')
        assert after_verify['verify_decision_request']['continue_with_stage'] in ('author', 'recon')
        assert after_verify['verify_results']['after']['observation']['valid'] is False

        return {
            'ok': True,
            'verify_status': after_verify['verify_status'],
            'continue_with_stage': after_verify['verify_decision_request']['continue_with_stage'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_missing_baseline():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-missing-baseline-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'proof_plan': 'Capture the CTA interaction on the pricing route.',
            'capture_script': "await saveScreenshot('after-proof');",
            'before_cdn': '',
            'recon_results': {},
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        try:
            load_module('verify_missing_baseline', VERIFY_PATH)
        except SystemExit as exc:
            message = str(exc)
            assert 'Recon baseline missing' in message, message
            return {'ok': True, 'error': message}
        raise AssertionError('verify should have failed when recon baseline was missing')
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_ship_missing_supervisor_gate():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-ship-gate-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verify_status': 'evidence_captured',
            'before_cdn': 'https://cdn.example.com/before.png',
            'after_cdn': 'https://cdn.example.com/after.png',
            'proof_assessment': {},
            'proof_assessment_source': None,
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        try:
            load_module('ship_missing_supervisor_gate', SHIP_PATH)
        except SystemExit as exc:
            message = str(exc)
            assert 'proof_assessment.decision=ready_to_ship' in message, message
            return {'ok': True, 'error': message}
        raise AssertionError('ship should have failed without supervising-agent ready_to_ship assessment')
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_ship_accepts_structured_after_evidence():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-ship-structured-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'repo_dir': str(tempdir),
            'after_worktree': str(tempdir / 'missing-after-worktree'),
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verify_status': 'evidence_captured',
            'before_cdn': 'https://cdn.example.com/before.png',
            'after_cdn': '',
            'proof_assessment': {
                'decision': 'ready_to_ship',
                'summary': 'Structured audio metrics prove the attack increased.',
                'reasons': ['proofEvidence contains the requested transient metric change'],
                'source': 'supervising_agent',
            },
            'proof_assessment_source': 'supervising_agent',
            'evidence_bundle': {
                'verification_mode': 'audio',
                'expected_path': '/sequencer',
                'after': {
                    'observation': {'valid': True, 'telemetry_ready': True, 'reason': 'ok'},
                    'supporting_artifacts': {
                        'has_structured_payload': True,
                        'proof_evidence_present': True,
                        'proof_evidence_sample': '{"attack_ms_after":12,"passed":true}',
                    },
                },
            },
            'finalized': True,
            'pr_url': 'https://github.com/example/repo/pull/1',
            'pr_number': '1',
            'marked_ready': True,
            'proof_assessment_comment_posted': True,
            'discord_notification': {'ok': True, 'pr_url': 'https://github.com/example/repo/pull/1'},
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)
        sys.modules.pop('util', None)

        try:
            load_module('ship_structured_after_evidence', SHIP_PATH)
        except SystemExit as exc:
            assert exc.code == 0 or str(exc) == '0', exc
            after_ship = json.loads(state_path.read_text())
            assert after_ship['stage'] == 'ship'
            assert after_ship['merge_recommendation'].startswith('ready_to_ship')
            assert after_ship['ship_report']['pr_url'] == 'https://github.com/example/repo/pull/1'
            assert after_ship['ship_report']['before_artifact_url'] == 'https://cdn.example.com/before.png'
            return {'ok': True, 'stage': after_ship['stage'], 'after_cdn': after_ship['after_cdn']}
        raise AssertionError('ship should have exited after finalized structured-evidence sync')
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_ship_discord_thread_target():
    sys.modules.pop('util', None)
    source = SHIP_PATH.read_text()
    helpers_source = source.split('\ns = load_state()', 1)[0]
    namespace = {'__file__': str(SHIP_PATH)}
    exec(compile(helpers_source, str(SHIP_PATH), 'exec'), namespace)

    thread_target = namespace['discord_message_target']({
        'discord_channel': 'parent-channel-123',
        'discord_thread_id': 'thread-456',
        'discord_message_id': 'message-789',
        'discord_source_url': 'https://discord.com/channels/guild/thread-456/message-789',
    })
    assert thread_target['ok'] is True
    assert thread_target['target_channel_id'] == 'thread-456'
    assert thread_target['parent_channel_id'] == 'parent-channel-123'
    assert 'message_reference' not in thread_target

    reply_target = namespace['discord_message_target']({
        'discord_channel': 'parent-channel-123',
        'discord_message_id': 'message-789',
    })
    assert reply_target['ok'] is True
    assert reply_target['target_channel_id'] == 'parent-channel-123'
    assert reply_target['message_reference']['message_id'] == 'message-789'
    assert reply_target['message_reference']['channel_id'] == 'parent-channel-123'

    missing_target = namespace['discord_message_target']({'discord_message_id': 'message-789'})
    assert missing_target['ok'] is False
    assert 'discord_channel or discord_thread_id' in missing_target['reason']

    return {'ok': True, 'thread_target': thread_target['target_channel_id'], 'reply_target': reply_target['target_channel_id']}


def run_ship_filters_tool_noise_when_staging():
    sys.modules.pop('util', None)
    source = SHIP_PATH.read_text()
    helpers_source = source.split('\ns = load_state()', 1)[0]
    namespace = {'__file__': str(SHIP_PATH)}
    exec(compile(helpers_source, str(SHIP_PATH), 'exec'), namespace)

    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-ship-stage-'))
    try:
        sp.run(['git', 'init', '-b', 'main'], cwd=tempdir, check=True, capture_output=True, text=True)
        sp.run(['git', 'config', 'user.email', 'test@example.com'], cwd=tempdir, check=True)
        sp.run(['git', 'config', 'user.name', 'Test User'], cwd=tempdir, check=True)
        (tempdir / 'tracked.txt').write_text('before\n')
        sp.run(['git', 'add', 'tracked.txt'], cwd=tempdir, check=True)
        sp.run(['git', 'commit', '-m', 'initial'], cwd=tempdir, check=True, capture_output=True, text=True)

        (tempdir / 'tracked.txt').write_text('after\n')
        (tempdir / 'new-code.txt').write_text('new\n')
        (tempdir / '.codex').write_text('agent scratch\n')
        (tempdir / '.oc-smoke').mkdir()
        (tempdir / '.oc-smoke' / 'err').write_text('smoke noise\n')

        status = sp.run(['git', 'status', '--porcelain'], cwd=tempdir, check=True, capture_output=True, text=True).stdout
        lines = namespace['committable_status_lines'](status)
        assert any('tracked.txt' in line for line in lines), lines
        assert any('new-code.txt' in line for line in lines), lines
        assert not any('.codex' in line for line in lines), lines
        assert not any('.oc-smoke' in line for line in lines), lines

        staged = namespace['stage_committable_changes'](str(tempdir))
        assert 'tracked.txt' in staged, staged
        assert 'new-code.txt' in staged, staged
        assert '.codex' not in staged, staged
        assert '.oc-smoke/err' not in staged, staged

        cached = sp.run(['git', 'diff', '--cached', '--name-only'], cwd=tempdir, check=True, capture_output=True, text=True).stdout.splitlines()
        assert 'tracked.txt' in cached, cached
        assert 'new-code.txt' in cached, cached
        assert '.codex' not in cached, cached
        assert '.oc-smoke/err' not in cached, cached

        return {'ok': True, 'staged': staged}
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_ship_resolves_real_pr_branch():
    sys.modules.pop('util', None)
    source = SHIP_PATH.read_text()
    helpers_source = source.split('\ns = load_state()', 1)[0]

    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-ship-branch-'))
    try:
        state_path = tempdir / 'state.json'
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)
        namespace = {'__file__': str(SHIP_PATH)}
        exec(compile(helpers_source, str(SHIP_PATH), 'exec'), namespace)
        state = {
            'branch': 'riddle-proof/rp_test-after',
            'target_branch': 'riddle-proof/rp_test-after',
            'after_worktree_branch': 'riddle-proof/rp_test-after',
            'pr_number': '257',
            'pr_url': 'https://github.com/example/repo/pull/257',
        }
        write_state(state_path, state)
        namespace['pr_head_branch'] = lambda repo_dir, pr_ref: 'ttt-status-polish-proof'
        branch = namespace['resolve_ship_branch'](state, str(tempdir))
        assert branch == 'ttt-status-polish-proof', branch
        after_state = json.loads(state_path.read_text())
        assert after_state['branch'] == 'ttt-status-polish-proof'
        assert after_state['target_branch'] == 'ttt-status-polish-proof'

        temp_state = {
            'branch': 'riddle-proof/rp_test-after',
            'target_branch': 'riddle-proof/rp_test-after',
            'after_worktree_branch': 'riddle-proof/rp_test-after',
            'change_request': 'Ship a clean proof branch',
            'run_id': 'rp_test_audio_abcdef',
        }
        namespace['pr_head_branch'] = lambda repo_dir, pr_ref: ''
        recovered_branch = namespace['resolve_ship_branch'](temp_state, str(tempdir))
        assert recovered_branch.startswith('agent/openclaw/ship-a-clean-proof-branch-'), recovered_branch
        assert temp_state['ship_branch_recovered_from'] == 'riddle-proof/rp_test-after'

        ambiguous_pr_state = {
            'branch': 'riddle-proof/rp_test-after',
            'target_branch': 'riddle-proof/rp_test-after',
            'after_worktree_branch': 'riddle-proof/rp_test-after',
            'pr_number': '999',
            'pr_url': 'https://github.com/example/repo/pull/999',
        }
        try:
            namespace['resolve_ship_branch'](ambiguous_pr_state, str(tempdir))
        except SystemExit as exc:
            assert 'temporary proof branch' in str(exc), exc
        else:
            raise AssertionError('temporary proof branch should still be rejected for unresolved existing PRs')
        return {'ok': True, 'branch': branch, 'recovered_branch': recovered_branch}
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


if __name__ == '__main__':
    payload = {
        'capture_artifact_enrichment': run_capture_artifact_enrichment(),
        'capture_diagnostics_redaction': run_capture_diagnostics_redact_sensitive_values(),
        'apply_auth_context': run_apply_auth_context_passes_supported_auth_payloads(),
        'run_project_build_retries_after_clean_failure': run_project_build_retries_after_clean_failure(),
        'implement_records_detection_when_changes_missing': run_implement_records_detection_when_changes_missing(),
        'implement_ignores_tool_noise_when_detecting_changes': run_implement_ignores_tool_noise_when_detecting_changes(),
        'verify_quality_ignores_proof_telemetry_console_text': run_verify_quality_ignores_proof_telemetry_console_text(),
        'recon_then_author_request': run_recon_then_author_request(),
        'recon_preserves_query_route': run_recon_preserves_query_route(),
        'recon_route_literal_preference': run_recon_prefers_route_literals_over_import_paths(),
        'recon_hint_root_preference': run_recon_prefers_hint_root_over_single_route_literal(),
        'author_applies_supervisor_packet': run_author_applies_supervisor_packet(),
        'verify_requests_supervisor_assessment': run_verify_requests_supervisor_assessment(),
        'verify_structured_evidence_without_screenshot': run_verify_structured_evidence_without_screenshot(),
        'verify_audio_requires_proof_evidence': run_verify_audio_requires_proof_evidence(),
        'verify_audio_rejects_failed_nested_proof_evidence': run_verify_audio_rejects_failed_nested_proof_evidence(),
        'verify_preserves_proof_evidence_on_capture_script_error': run_verify_preserves_proof_evidence_on_capture_script_error(),
        'verify_capture_retry': run_verify_capture_retry(),
        'missing_baseline_guard': run_verify_missing_baseline(),
        'ship_supervisor_gate': run_ship_missing_supervisor_gate(),
        'ship_structured_after_evidence': run_ship_accepts_structured_after_evidence(),
        'ship_discord_thread_target': run_ship_discord_thread_target(),
        'ship_filters_tool_noise_when_staging': run_ship_filters_tool_noise_when_staging(),
        'ship_resolves_real_pr_branch': run_ship_resolves_real_pr_branch(),
    }
    print(json.dumps(payload, indent=2))
