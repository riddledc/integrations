import importlib.util
import json
import os
import shutil
import subprocess as sp
import struct
import sys
import tempfile
import zlib
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / 'lib'
UTIL_PATH = LIB / 'util.py'
PREFLIGHT_PATH = LIB / 'preflight.py'
SETUP_PATH = LIB / 'setup.py'
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


def png_rgba(width, height, pixels):
    raw_rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            row.extend(pixels[(y * width + x) * 4:(y * width + x + 1) * 4])
        raw_rows.append(bytes(row))
    def chunk(kind, data):
        return (
            struct.pack('>I', len(data))
            + kind
            + data
            + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
        )
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(b''.join(raw_rows)))
        + chunk(b'IEND', b'')
    )


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
                    '_artifact_json': {
                        'console.json': {
                            'summary': {'total_entries': 3, 'log_count': 2, 'warn_count': 0, 'error_count': 1, 'info_count': 0},
                            'entries': {
                                'log': [
                                    {'message': 'RIDDLE_PROOF_STATE:' + json.dumps(page_state)},
                                    {'message': 'RIDDLE_PROOF_EVIDENCE:' + json.dumps(proof_evidence)},
                                ],
                                'warn': [],
                                'error': [{'message': 'Uncaught exception: intentional capture script failure after evidence'}],
                                'info': [],
                            },
                        },
                        'proof.json': {
                            'script_error': 'Error: intentional capture script failure after evidence',
                        },
                    },
                }
            if 'attack_ms_after' in script or 'window.__riddleProofEvidence' in script or 'globalThis.__riddleProofEvidence' in script:
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
            if 'prod.example.com/pricing' in script:
                search = '?plan=pro' if 'plan=pro' in script else ''
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/prod.png'}],
                    'outputs': [{'name': 'prod.png', 'url': 'https://cdn.example.com/prod.png'}],
                    'console': state_console({
                        'bodyTextLength': 180,
                        'visibleTextSample': 'Pricing CTA Buy Now',
                        'interactiveElements': 4,
                        'visibleInteractiveElements': 4,
                        'pathname': '/pricing',
                        'search': search,
                        'title': 'Prod',
                        'buttons': ['Buy Now'],
                        'headings': ['Pricing'],
                        'links': [],
                        'canvasCount': 0,
                        'largeVisibleElements': [{'tag': 'button', 'text': 'Buy Now'}],
                    }),
                }
            if 'clickedSkipHashNavigation' in script:
                page_state = {
                    'bodyTextLength': 180,
                    'visibleTextSample': 'Riddle Proof homepage main content',
                    'interactiveElements': 4,
                    'visibleInteractiveElements': 4,
                    'pathname': '/',
                    'search': '',
                    'hash': '#main-content',
                    'title': 'Riddle',
                    'buttons': ['Start Free'],
                    'headings': ['Riddle Proof'],
                    'links': [{'text': 'Skip to main content', 'href': '#main-content'}],
                    'canvasCount': 0,
                    'largeVisibleElements': [{'tag': 'main', 'text': 'Riddle Proof'}],
                }
                proof_evidence = {
                    'before': {'href': 'https://riddledc.com/'},
                    'action': 'clicked Skip to main content',
                    'after': {'href': 'https://riddledc.com/#main-content'},
                    'assertions': {
                        'startedOnHome': True,
                        'hashPreserved': True,
                        'mainContentFocused': True,
                    },
                }
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/hash-after.png'}],
                    'outputs': [{'name': 'after-hash.png', 'url': 'https://cdn.example.com/hash-after.png'}],
                    'result': {'pageState': page_state, 'proofEvidence': proof_evidence},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'RIDDLE_PROOF_EVIDENCE:' + json.dumps(proof_evidence),
                    ],
                    'visual_diff': {
                        'diffPercentage': 1.2,
                        'differentPixels': 12000,
                        'totalPixels': 972000,
                    },
                }
            if 'pricingQueryHashDropsTerminal' in script:
                message = (
                    'page.waitForURL: Timeout 15000ms exceeded.\n'
                    '=========================== logs ===========================\n'
                    'waiting for navigation until "load"\n'
                    '  navigated to "https://riddledc.com/pricing/"'
                )
                page_state = {
                    'bodyTextLength': 260,
                    'visibleTextSample': 'Pricing One rate Browser Compute Example Costs',
                    'interactiveElements': 8,
                    'visibleInteractiveElements': 8,
                    'pathname': '/pricing/',
                    'search': '',
                    'hash': '',
                    'title': 'Pricing',
                    'buttons': [],
                    'headings': ['Pricing', 'Browser Compute'],
                    'links': [{'text': 'Pricing', 'href': '/pricing/?rp_probe=1#pricing-probe'}],
                    'canvasCount': 0,
                    'largeVisibleElements': [{'tag': 'main', 'text': 'Pricing'}],
                }
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/pricing-no-query-hash.png'}],
                    'outputs': [{'name': 'after-pricing-query-hash.png', 'url': 'https://cdn.example.com/pricing-no-query-hash.png'}],
                    'result': {'pageState': page_state},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'Uncaught exception: ' + message,
                    ],
                    '_artifact_json': {
                        'proof.json': {'script_error': message},
                    },
                }
            if 'pricingQueryHashStructuredNegativeControl' in script:
                page_state = {
                    'bodyTextLength': 260,
                    'visibleTextSample': 'Pricing One rate Browser Compute Example Costs',
                    'interactiveElements': 8,
                    'visibleInteractiveElements': 8,
                    'pathname': '/pricing/',
                    'search': '',
                    'hash': '',
                    'title': 'Pricing',
                    'buttons': [],
                    'headings': ['Pricing', 'Browser Compute'],
                    'links': [{'text': 'Pricing', 'href': '/pricing/?rp_probe=1#pricing-probe'}],
                    'canvasCount': 0,
                    'largeVisibleElements': [{'tag': 'main', 'text': 'Pricing'}],
                }
                proof_evidence = {
                    'version': 'riddle-proof.interaction.v1',
                    'probe': 'query-hash-dropped-negative-control',
                    'negativeControl': True,
                    'routeExpectationSource': 'capture_script.expectedUrl',
                    'expectedUrl': 'https://riddledc.com/pricing/?rp_probe=1#pricing-probe',
                    'expectedHref': '/pricing/?rp_probe=1#pricing-probe',
                    'intentionalObservedUrl': 'https://riddledc.com/pricing/',
                    'start': {'href': 'https://riddledc.com/', 'pathname': '/', 'search': '', 'hash': ''},
                    'action': {
                        'type': 'rewrite-pricing-link-click-then-drop-query-hash',
                        'afterClickHref': 'https://riddledc.com/pricing/?rp_probe=1#pricing-probe',
                        'afterClickPathname': '/pricing/',
                        'afterClickSearch': '?rp_probe=1',
                        'afterClickHash': '#pricing-probe',
                        'expectedNavigationReached': True,
                    },
                    'terminal': {
                        'href': 'https://riddledc.com/pricing/',
                        'pathname': '/pricing/',
                        'search': '',
                        'hash': '',
                    },
                    'assertions': {
                        'expectedUrlReachedBeforeDrop': True,
                        'expectedUrlStillPresentAtTerminal': False,
                        'queryDropped': True,
                        'hashDropped': True,
                        'routeExpectationSourceIsCaptureScriptExpectedUrl': True,
                        'shouldTerminalizeAsFailedInteractionCapture': True,
                        'terminalMainVisible': True,
                    },
                    'checks': {
                        'routeMatches': False,
                        'specificMismatchDetected': True,
                    },
                    'errors': [],
                }
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/pricing-negative-control.png'}],
                    'outputs': [{'name': 'after-pricing-negative-control.png', 'url': 'https://cdn.example.com/pricing-negative-control.png'}],
                    'result': {'pageState': page_state, 'proofEvidence': proof_evidence},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'RIDDLE_PROOF_EVIDENCE:' + json.dumps(proof_evidence),
                    ],
                    'visual_diff': {
                        'diffPercentage': 1.2,
                        'differentPixels': 12000,
                        'totalPixels': 972000,
                    },
                }
            if 'pricingQueryHashPassesWithPageStateHashGap' in script:
                page_state = {
                    'bodyTextLength': 260,
                    'visibleTextSample': 'Pricing One rate Browser Compute Example Costs',
                    'interactiveElements': 8,
                    'visibleInteractiveElements': 8,
                    'pathname': '/pricing/',
                    'search': '?rp_probe=1',
                    'hash': '',
                    'title': 'Pricing',
                    'buttons': [],
                    'headings': ['Pricing', 'Browser Compute'],
                    'links': [{'text': 'Pricing', 'href': '/pricing/?rp_probe=1#pricing-probe'}],
                    'canvasCount': 0,
                    'largeVisibleElements': [{'tag': 'main', 'text': 'Pricing'}],
                }
                proof_evidence = {
                    'version': 'riddle-proof.interaction.v1',
                    'routeExpectationSource': 'capture_script.expectedUrl',
                    'expectedUrl': 'https://riddledc.com/pricing/?rp_probe=1#pricing-probe',
                    'terminalPath': '/pricing/',
                    'terminalSearch': '?rp_probe=1',
                    'terminalHash': '#pricing-probe',
                    'terminalUrl': 'https://riddledc.com/pricing/?rp_probe=1#pricing-probe',
                    'start': {'href': 'https://riddledc.com/'},
                    'action': {'type': 'click', 'target': 'Pricing'},
                    'terminal': {
                        'pathname': '/pricing/',
                        'search': '?rp_probe=1',
                        'hash': '#pricing-probe',
                        'href': 'https://riddledc.com/pricing/?rp_probe=1#pricing-probe',
                    },
                    'afterUrl': 'https://riddledc.com/pricing/?rp_probe=1#pricing-probe',
                    'routeMatched': True,
                    'assertions': {
                        'startedOnHome': True,
                        'clickedPricingNavigation': True,
                        'terminalUrlPreserved': True,
                        'pricingContentVisible': True,
                    },
                }
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/pricing-query-hash.png'}],
                    'outputs': [{'name': 'after-pricing-query-hash.png', 'url': 'https://cdn.example.com/pricing-query-hash.png'}],
                    'result': {'pageState': page_state, 'proofEvidence': proof_evidence},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'RIDDLE_PROOF_EVIDENCE:' + json.dumps(proof_evidence),
                    ],
                    'visual_diff': {
                        'diffPercentage': 1.2,
                        'differentPixels': 12000,
                        'totalPixels': 972000,
                    },
                }
            if 'clickedProofNavigationOcLiveShapeNoScreenshot' in script:
                assert '__riddleProofCaptureScriptResult = await ((async () =>' in script
                page_state = {
                    'bodyTextLength': 4113,
                    'visibleTextSample': 'RIDDLE PROOF Turn a URL into evidence an agent can cite.',
                    'interactiveElements': 6,
                    'visibleInteractiveElements': 6,
                    'pathname': '/proof/',
                    'href': 'https://riddledc.com/proof/',
                    'title': 'Riddle Proof',
                    'buttons': ['Proof'],
                    'headings': ['Riddle Proof'],
                    'links': [],
                    'canvasCount': 0,
                    'largeVisibleElements': [{'tag': 'h1', 'text': 'Riddle Proof'}],
                }
                proof_evidence = {
                    'version': 'riddle-proof.interaction.v1',
                    'expectedUrl': 'https://riddledc.com/proof/',
                    'routeExpectationSource': 'capture_script.expectedUrl',
                    'start': {'href': 'https://riddledc.com/', 'pathname': '/'},
                    'action': {'type': 'click', 'target': 'visible Proof navigation link', 'clicked': True},
                    'terminal': {'href': 'https://riddledc.com/proof/', 'pathname': '/proof/'},
                    'assertions': [
                        {'name': 'route expectation source is capture_script.expectedUrl', 'pass': True},
                        {'name': 'terminal URL matched expected proof route', 'pass': True},
                        {'name': 'Proof page content visible', 'pass': True},
                    ],
                    'success': True,
                }
                return {
                    'ok': True,
                    'outputs': [{'name': 'proof.json', 'url': 'https://cdn.example.com/proof.json'}],
                    'result': {'pageState': page_state, 'proofEvidence': proof_evidence},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'RIDDLE_PROOF_EVIDENCE:' + json.dumps(proof_evidence),
                    ],
                }
            if 'clickedProofNavigationOcLiveShape' in script:
                page_state = {
                    'bodyTextLength': 4113,
                    'visibleTextSample': 'RIDDLE PROOF Turn a URL into evidence an agent can cite.',
                    'interactiveElements': 6,
                    'visibleInteractiveElements': 6,
                    'pathname': '/proof/',
                    'href': 'https://riddledc.com/proof/',
                    'title': 'Riddle Proof',
                    'buttons': ['Proof'],
                    'headings': ['Riddle Proof'],
                    'links': [],
                    'canvasCount': 0,
                    'largeVisibleElements': [{'tag': 'h1', 'text': 'Riddle Proof'}],
                }
                proof_evidence = {
                    'version': 'riddle-proof.interaction.v1',
                    'expectedUrl': 'https://riddledc.com/proof/',
                    'routeExpectationSource': 'capture_script.expectedUrl',
                    'startRoute': {'url': 'https://riddledc.com/', 'pathname': '/'},
                    'terminalRoute': {'url': 'https://riddledc.com/proof/', 'pathname': '/proof/'},
                    'action': {'type': 'click', 'target': 'visible Proof navigation link', 'clicked': True},
                    'startState': {'url': 'https://riddledc.com/', 'pathname': '/'},
                    'terminalState': {'url': 'https://riddledc.com/proof/', 'pathname': '/proof/'},
                    'assertions': [
                        {
                            'name': 'route expectation source is capture_script.expectedUrl',
                            'pass': True,
                            'routeExpectationSource': 'capture_script.expectedUrl',
                            'expectedUrl': 'https://riddledc.com/proof/',
                        },
                        {'name': 'start URL is production home', 'pass': True, 'startPathname': '/'},
                        {
                            'name': 'terminal URL matched expected proof route',
                            'pass': True,
                            'terminalUrl': 'https://riddledc.com/proof/',
                        },
                        {'name': 'Proof page content visible', 'pass': True},
                    ],
                    'success': True,
                }
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/proof-after.png'}],
                    'outputs': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/proof-after.png'}],
                    'result': {'pageState': page_state, 'proofEvidence': proof_evidence},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'RIDDLE_PROOF_EVIDENCE:' + json.dumps(proof_evidence),
                    ],
                    'visual_diff': {
                        'diffPercentage': 1.2,
                        'differentPixels': 12000,
                        'totalPixels': 972000,
                    },
                }
            if 'clickedProofNavigation' in script:
                page_state = {
                    'bodyTextLength': 180,
                    'visibleTextSample': 'Proof page Evidence Accepted',
                    'interactiveElements': 2,
                    'visibleInteractiveElements': 2,
                    'pathname': '/proof/',
                    'title': 'Proof',
                    'buttons': ['Proof'],
                    'headings': ['Proof'],
                    'links': [],
                    'canvasCount': 0,
                    'largeVisibleElements': [{'tag': 'h1', 'text': 'Proof'}],
                }
                proof_evidence = {
                    'proofEvidence': {
                        'version': 'riddle-proof.interaction.v1',
                        'start': {'href': 'https://riddledc.com/'},
                        'action': {'type': 'click', 'target': 'Proof'},
                        'terminal': {'href': 'https://riddledc.com/proof/'},
                        'afterUrl': 'https://riddledc.com/proof/',
                        'assertions': {
                            'startedOnHome': True,
                            'clickedProofNavigation': True,
                            'terminalPathIsProof': True,
                            'proofContentVisible': True,
                        },
                    },
                }
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/proof-after.png'}],
                    'outputs': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/proof-after.png'}],
                    'result': {'pageState': page_state, 'proofEvidence': proof_evidence},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'RIDDLE_PROOF_EVIDENCE:' + json.dumps(proof_evidence),
                    ],
                    'visual_diff': {
                        'diffPercentage': 1.2,
                        'differentPixels': 12000,
                        'totalPixels': 972000,
                    },
                }
            if 'clickedHomeNavigationOcTerminalShape' in script:
                page_state = {
                    'bodyTextLength': 180,
                    'visibleTextSample': 'Riddle Proof homepage hero Start Free',
                    'interactiveElements': 4,
                    'visibleInteractiveElements': 4,
                    'pathname': '/',
                    'href': 'https://riddledc.com/',
                    'title': 'Riddle',
                    'buttons': ['Start Free'],
                    'headings': ['Riddle Proof'],
                    'links': [],
                    'canvasCount': 0,
                    'largeVisibleElements': [{'tag': 'h1', 'text': 'Riddle Proof'}],
                }
                proof_evidence = {
                    'version': 'riddle-proof.interaction.v1',
                    'start': {
                        'expectedUrl': 'https://riddledc.com/proof/',
                        'expectedPath': '/proof/',
                        'observedUrl': 'https://riddledc.com/proof/',
                        'observedPath': '/proof/',
                    },
                    'action': {
                        'type': 'click',
                        'target': 'visible Riddle/Home nav link to root',
                        'chosenText': 'Riddle',
                        'chosenHref': '/',
                        'clicked': True,
                    },
                    'terminal': {
                        'expectedUrl': 'https://riddledc.com/',
                        'expectedPath': '/',
                        'routeExpectationSource': 'capture_script.expectedUrl',
                        'observedUrl': 'https://riddledc.com/',
                        'observedPath': '/',
                        'pageReady': True,
                    },
                    'assertions': {
                        'startedOnProofRoute': True,
                        'clickedRootNavLink': True,
                        'terminalUrlMatchedExpected': True,
                        'terminalRouteMatchedRoot': True,
                        'terminalMainVisible': True,
                        'routeExpectationSourceMatched': True,
                    },
                    'errors': [],
                }
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/home-after.png'}],
                    'outputs': [{'name': 'after-home.png', 'url': 'https://cdn.example.com/home-after.png'}],
                    'result': {'pageState': page_state, 'proofEvidence': proof_evidence},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'RIDDLE_PROOF_EVIDENCE:' + json.dumps(proof_evidence),
                    ],
                    'visual_diff': {
                        'diffPercentage': 1.2,
                        'differentPixels': 12000,
                        'totalPixels': 972000,
                    },
                }
            if 'clickedHomeNavigation' in script:
                page_state = {
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
                    'largeVisibleElements': [{'tag': 'h1', 'text': 'Riddle Proof'}],
                }
                proof_evidence = {
                    'before': {'path': '/proof/'},
                    'action': 'clicked Home',
                    'after': {'path': '/'},
                    'assertions': {
                        'startedOnProof': True,
                        'clickedHomeNavigation': True,
                        'terminalPathIsHome': True,
                        'homeContentVisible': True,
                    },
                }
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/home-after.png'}],
                    'outputs': [{'name': 'after-home.png', 'url': 'https://cdn.example.com/home-after.png'}],
                    'result': {'pageState': page_state, 'proofEvidence': proof_evidence},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'RIDDLE_PROOF_EVIDENCE:' + json.dumps(proof_evidence),
                    ],
                    'visual_diff': {
                        'diffPercentage': 1.2,
                        'differentPixels': 12000,
                        'totalPixels': 972000,
                    },
                }
            if 'skipLinkTimeout' in script:
                message = 'locator.click: Timeout 30000ms exceeded'
                page_state = {
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
                    'largeVisibleElements': [{'tag': 'h1', 'text': 'Riddle Proof'}],
                }
                return {
                    'ok': True,
                    'result': {'pageState': page_state},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        message,
                    ],
                    '_artifact_json': {
                        'proof.json': {'script_error': message},
                    },
                }
            if 'interactionThrownAfterFailedEvidence' in script:
                message = 'Error: intentional-riddle-proof-0823-thrown-error-after-failed-evidence'
                page_state = {
                    'bodyTextLength': 180,
                    'visibleTextSample': 'Riddle Proof homepage hero Start Free',
                    'interactiveElements': 4,
                    'visibleInteractiveElements': 4,
                    'pathname': '/',
                    'search': '',
                    'hash': '',
                    'title': 'Riddle',
                    'buttons': ['Start Free'],
                    'headings': ['Riddle Proof'],
                    'links': [],
                    'canvasCount': 0,
                    'largeVisibleElements': [{'tag': 'h1', 'text': 'Riddle Proof'}],
                }
                proof_evidence = {
                    'version': 'riddle-proof.interaction.v1',
                    'evidence_summary': 'Structured interaction evidence was emitted before the diagnostic script threw.',
                    'checks': {
                        'passed': False,
                        'success': False,
                        'proofReady': False,
                    },
                    'capture_error': message,
                }
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/thrown-error-failed-evidence.png'}],
                    'outputs': [{'name': 'after-thrown-error.png', 'url': 'https://cdn.example.com/thrown-error-failed-evidence.png'}],
                    'result': {'pageState': page_state, 'proofEvidence': proof_evidence},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'RIDDLE_PROOF_EVIDENCE:' + json.dumps(proof_evidence),
                        'Uncaught exception: ' + message,
                    ],
                    '_artifact_json': {
                        'proof.json': {'script_error': message},
                    },
                }
            if 'interactionThrownError' in script:
                message = 'Error: intentional-riddle-proof-0811-thrown-error'
                page_state = {
                    'bodyTextLength': 180,
                    'visibleTextSample': 'Riddle Proof homepage hero Start Free',
                    'interactiveElements': 4,
                    'visibleInteractiveElements': 4,
                    'pathname': '/',
                    'search': '',
                    'hash': '',
                    'title': 'Riddle',
                    'buttons': ['Start Free'],
                    'headings': ['Riddle Proof'],
                    'links': [],
                    'canvasCount': 0,
                    'largeVisibleElements': [{'tag': 'h1', 'text': 'Riddle Proof'}],
                }
                return {
                    'ok': True,
                    'screenshots': [{'url': 'https://cdn.example.com/thrown-error.png'}],
                    'outputs': [{'name': 'after-thrown-error.png', 'url': 'https://cdn.example.com/thrown-error.png'}],
                    'result': {'pageState': page_state},
                    'console': [
                        'RIDDLE_PROOF_STATE:' + json.dumps(page_state),
                        'Uncaught exception: ' + message,
                    ],
                    '_artifact_json': {
                        'proof.json': {'script_error': message},
                    },
                }
            if 'after-proof' in script:
                after_url = 'https://cdn.example.com/after-artifact' if 'noVisualDelta' in script else 'https://cdn.example.com/after.png'
                outputs = [{'name': 'after.png', 'url': after_url}]
                if 'proof-session' in script:
                    outputs.append({'name': 'proof-session.json', 'url': 'https://cdn.example.com/proof-session.json'})
                payload = {
                    'ok': True,
                    'screenshots': [{'url': after_url}],
                    'outputs': outputs,
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
                if 'noVisualDelta' not in script:
                    payload['visual_diff'] = {
                        'diffPercentage': 1.2,
                        'differentPixels': 12000,
                        'totalPixels': 972000,
                    }
                return payload
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


def evidence_records(value):
    if isinstance(value, dict):
        records = [value]
        for key in (
            'proofEvidence', 'proof_evidence',
            'interactionEvidence', 'interaction_evidence',
            'evidence',
        ):
            nested = value.get(key)
            if isinstance(nested, (dict, list)):
                records.extend(evidence_records(nested))
        return records
    if isinstance(value, list):
        records = []
        for item in value:
            records.extend(evidence_records(item))
        return records
    return []


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

    static_audit_payload = {
        'bodyTextLength': 61,
        'visibleTextSample': 'Riddle static preview smoke Static preview marker is visible.',
        'interactiveElements': 0,
        'visibleInteractiveElements': 0,
        'pathname': '/s/ps_b7b5f0dc/',
        'title': 'Riddle Preview Smoke',
        'headings': ['Riddle static preview smoke'],
        'buttons': [],
        'links': [],
        'canvasCount': 0,
        'largeVisibleElements': [{'tag': 'h1', 'text': 'Riddle static preview smoke', 'area': 17208}],
    }
    static_audit_evidence = {
        'version': 'riddle-proof.static-smoke.v4',
        'proofReady': True,
        'staticAuditReady': True,
        'interactionExpected': False,
        'interactionNotRequired': True,
        'zeroInteractiveElementsExpected': True,
        'routeMatches': True,
        'titleMatches': True,
        'headingMatches': True,
        'markerMatches': True,
        'normalizedCopyVisible': True,
        'noConsoleErrors': True,
        'noPageErrors': True,
    }
    static_audit_quality = namespace['evaluate_capture_quality']({
        'ok': True,
        'screenshots': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/static-after.png'}],
        'outputs': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/static-after.png'}],
        'console': [
            'RIDDLE_PROOF_STATE:' + json.dumps(static_audit_payload),
            'RIDDLE_PROOF_EVIDENCE:' + json.dumps(static_audit_evidence),
        ],
    }, '/s/ps_b7b5f0dc/', 'visual')
    assert static_audit_quality['valid'] is True, static_audit_quality
    assert static_audit_quality['details']['interactive_ready'] is True
    assert static_audit_quality['details']['static_audit_readiness_override'] is True

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

    targeted_delta = namespace['extract_visual_delta'](
        {
            'ok': True,
            'result': {
                'proofEvidence': {
                    'change_pct': '0.0487',
                    'changed_pixels': 2351,
                    'width': 1280,
                    'height': 900,
                },
            },
        },
        {
            'change_request': 'Add the Riddle Proof recovery smoke badge',
            'success_criteria': 'The recovery smoke badge is visible after verify.',
            'parsed_assertions': [{'kind': 'text_visible', 'text': 'recovery smoke badge'}],
        },
        {
            'after': {
                'visible_text_sample': 'Home page Riddle Proof recovery smoke badge',
                'headings': ['Home page'],
                'buttons': ['Start'],
                'links': [],
            },
            'route': {'after_observed_path': '/'},
        },
    )
    assert targeted_delta['status'] == 'measured'
    assert targeted_delta['passed'] is True
    assert targeted_delta['threshold_mode'] == 'targeted_semantic'
    assert targeted_delta['min_changed_pixels'] == 250
    assert 'targeted-change threshold' in targeted_delta['reason']

    unmatched_targeted_delta = namespace['extract_visual_delta'](
        {
            'ok': True,
            'result': {
                'proofEvidence': {
                    'change_pct': '0.0487',
                    'changed_pixels': 2351,
                    'width': 1280,
                    'height': 900,
                },
            },
        },
        {'change_request': 'Add the billing badge'},
        {'after': {'visible_text_sample': 'Home page unchanged copy'}},
    )
    assert unmatched_targeted_delta['status'] == 'measured'
    assert unmatched_targeted_delta['passed'] is False
    assert unmatched_targeted_delta['threshold_mode'] == 'default'

    generic_page_token_delta = namespace['extract_visual_delta'](
        {
            'ok': True,
            'result': {
                'proofEvidence': {
                    'change_pct': '0.0487',
                    'changed_pixels': 2351,
                    'width': 1280,
                    'height': 900,
                },
            },
        },
        {'change_request': 'Polish the pricing page CTA'},
        {'after': {'visible_text_sample': 'Pricing plans for teams'}},
    )
    assert generic_page_token_delta['status'] == 'measured'
    assert generic_page_token_delta['passed'] is False
    assert generic_page_token_delta['threshold_mode'] == 'default'

    broad_region_targeted_delta = namespace['extract_visual_delta'](
        {
            'ok': True,
            'result': {
                'proofEvidence': {
                    'change_pct': '0.0487',
                    'changed_pixels': 2351,
                    'total_pixels': 1152000,
                    'width': 1280,
                    'height': 900,
                    'changed_region': {'x': 0, 'y': 0, 'width': 1280, 'height': 720},
                },
            },
        },
        {
            'change_request': 'Add the Riddle Proof recovery smoke badge',
            'success_criteria': 'The recovery smoke badge is visible after verify.',
            'parsed_assertions': [{'kind': 'text_visible', 'text': 'recovery smoke badge'}],
        },
        {'after': {'visible_text_sample': 'Home page Riddle Proof recovery smoke badge'}},
    )
    assert broad_region_targeted_delta['status'] == 'measured'
    assert broad_region_targeted_delta['passed'] is False
    assert broad_region_targeted_delta['threshold_mode'] == 'default'
    assert broad_region_targeted_delta['changed_region']['classification'] == 'broad'
    assert broad_region_targeted_delta['localization_support']['supported'] is False

    unmeasured_delta = namespace['extract_visual_delta']({
        'ok': True,
        'screenshots': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
    })
    assert unmeasured_delta['status'] == 'unmeasured'
    assert unmeasured_delta['passed'] is None
    assert unmeasured_delta['diagnostic']['after_screenshot_present'] is True
    assert 'After screenshot artifact is present' in unmeasured_delta['reason']

    visual_diff_delta = namespace['extract_visual_delta']({
        'ok': True,
        'outputs': [{'name': 'visual-diff.json', 'url': 'https://cdn.example.com/visual-diff.json'}],
        '_artifact_json': {
            'visual-diff.json': {
                'changePercent': '1.45',
                'diffPixelCount': 14094,
                'totalPixels': 972000,
                'diffBoundingBox': {'xMin': 10, 'yMin': 20, 'xMax': 110, 'yMax': 70},
            },
        },
    })
    assert visual_diff_delta['status'] == 'measured'
    assert visual_diff_delta['passed'] is True
    assert visual_diff_delta['change_percent'] == 1.45
    assert visual_diff_delta['changed_pixels'] == 14094
    assert visual_diff_delta['changed_region']['x'] == 10
    assert visual_diff_delta['changed_region']['width'] == 100
    assert visual_diff_delta['changed_region']['height'] == 50

    root_region_delta = namespace['extract_visual_delta']({
        'ok': True,
        'visual_diff': {
            'diffPercentage': 0.04,
            'differentPixels': 320,
            'totalPixels': 972000,
            'dimensions': {'width': 1080, 'height': 900},
            'x1': 24,
            'y1': 36,
            'x2': 64,
            'y2': 56,
        },
    })
    assert root_region_delta['status'] == 'measured'
    assert root_region_delta['changed_region']['x'] == 24
    assert root_region_delta['changed_region']['y'] == 36
    assert root_region_delta['changed_region']['width'] == 40
    assert root_region_delta['changed_region']['height'] == 20

    viewport_status = namespace['capture_viewport_matrix_status'](
        {
            'viewport_matrix': [
                {'name': 'phone', 'width': 390, 'height': 844},
                {'name': 'ipad', 'width': 820, 'height': 1180},
            ],
        },
        {
            'outputs': [
                {'name': 'after-proof-phone.png', 'url': 'https://cdn.example.com/phone.png'},
                {'name': 'after-proof-ipad.png', 'url': 'https://cdn.example.com/ipad.png'},
            ],
        },
        'after-proof',
    )
    assert viewport_status['status'] == 'complete'
    assert [item['name'] for item in viewport_status['executed']] == ['phone', 'ipad']
    missing_viewport_status = namespace['capture_viewport_matrix_status'](
        {'viewport_matrix': [{'name': 'phone', 'width': 390, 'height': 844}]},
        {'outputs': [{'name': 'after-proof-desktop.png', 'url': 'https://cdn.example.com/desktop.png'}]},
        'after-proof',
    )
    assert missing_viewport_status['status'] == 'incomplete'
    assert missing_viewport_status['missing'][0]['name'] == 'phone'

    before_png = png_rgba(2, 1, bytes([
        0, 0, 0, 255,
        0, 0, 0, 255,
    ]))
    after_png = png_rgba(2, 1, bytes([
        0, 0, 0, 255,
        255, 255, 255, 255,
    ]))

    def fake_fetch_url_bytes(url, timeout=20, max_bytes=25 * 1024 * 1024):
        if url.endswith('before.png'):
            return before_png
        if url.endswith('after.png'):
            return after_png
        raise AssertionError(f'unexpected image fetch: {url}')

    namespace['fetch_url_bytes'] = fake_fetch_url_bytes
    artifact_image_delta = namespace['measure_visual_delta_from_image_artifacts'](
        'https://riddle-screenshots.example/before.png',
        'https://riddle-screenshots.example/after.png',
    )
    assert artifact_image_delta['status'] == 'measured'
    assert artifact_image_delta['source'] == 'riddle_artifact_image_diff'
    assert artifact_image_delta['changed_pixels'] == 1
    assert artifact_image_delta['change_percent'] == 50
    assert artifact_image_delta['changed_region']['x'] == 1
    assert artifact_image_delta['changed_region']['y'] == 0
    assert artifact_image_delta['changed_region']['width'] == 1
    assert artifact_image_delta['changed_region']['height'] == 1
    assert artifact_image_delta['changed_region']['localized_for_targeted_change'] is True

    fallback_calls = []

    def fake_invoke_retry(tool, args, retries=3, timeout=180):
        fallback_calls.append({'tool': tool, 'args': args, 'retries': retries, 'timeout': timeout})
        return {
            'ok': True,
            'visual_diff': {
                'diffPercentage': 0.82,
                'differentPixels': 7970,
                'totalPixels': 972000,
            },
            'outputs': [{'name': 'visual-diff.png', 'url': 'https://cdn.example.com/visual-diff.png'}],
        }

    namespace['invoke_retry'] = fake_invoke_retry
    namespace['append_capture_diagnostic'] = lambda *args, **kwargs: None
    namespace['fetch_url_bytes'] = lambda *args, **kwargs: (_ for _ in ()).throw(ValueError('image fetch unavailable'))
    fallback_delta = namespace['measure_visual_delta_against_baseline'](
        {'verification_mode': 'visual', 'requested_reference': 'before', 'before_cdn': 'https://cdn.example.com/before.png'},
        {'baseline': {'before': {'url': 'https://cdn.example.com/before.png'}}},
        {'ok': True, 'screenshots': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after.png'}]},
        unmeasured_delta,
    )
    assert fallback_delta['status'] == 'measured'
    assert fallback_delta['source'] == 'riddle_visual_diff'
    assert fallback_delta['comparison']['before_url'] == 'https://cdn.example.com/before.png'
    assert fallback_delta['comparison']['after_url'] == 'https://cdn.example.com/after.png'
    assert fallback_calls[0]['tool'] == 'riddle_visual_diff'

    canvas_payload = {
        'bodyTextLength': 7,
        'visibleTextSample': 'Luge',
        'interactiveElements': 1,
        'visibleInteractiveElements': 1,
        'pathname': '/games/luge-run',
        'title': 'Luge Run',
        'headings': [],
        'buttons': [],
        'links': [],
        'canvasCount': 1,
        'largeVisibleElements': [{'tag': 'canvas', 'text': '', 'area': 420000}],
    }
    canvas_quality = namespace['evaluate_capture_quality']({
        'ok': True,
        'screenshots': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
        'outputs': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
        'console': ['RIDDLE_PROOF_STATE:' + json.dumps(canvas_payload)],
    }, '/games/luge-run', 'visual')
    assert canvas_quality['valid'] is True, canvas_quality
    assert canvas_quality['details']['canvas_capture_ready'] is True
    assert canvas_quality['details']['body_text_ready'] is True
    assert 'blank/near-blank' not in canvas_quality['reason']

    playability_payload = {
        **canvas_payload,
        'interactiveElements': 0,
        'visibleInteractiveElements': 0,
        'largeVisibleElements': [],
    }
    playability_evidence = {
        'input_events': [{'type': 'pointerdown'}],
        'state_delta': {'changed': True, 'changed_keys': ['distance']},
        'canvas_delta': {'changed_pixels': 18000},
        'time_delta_ms': 1300,
    }
    playable_quality = namespace['evaluate_capture_quality']({
        'ok': True,
        'screenshots': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
        'outputs': [{'name': 'after-proof.png', 'url': 'https://cdn.example.com/after-proof.png'}],
        'console': [
            'RIDDLE_PROOF_STATE:' + json.dumps(playability_payload),
            'RIDDLE_PROOF_EVIDENCE:' + json.dumps({'playability': playability_evidence}),
        ],
    }, '/games/luge-run', 'playable')
    assert playable_quality['valid'] is True, playable_quality
    assert playable_quality['details']['playability_ready'] is True
    assert playable_quality['details']['interactive_ready'] is True

    return {
        'ok': True,
        'telemetry_valid': quality['valid'],
        'weak_delta_passed': weak_delta['passed'],
        'canvas_valid': canvas_quality['valid'],
        'playable_valid': playable_quality['valid'],
    }


def run_recon_quality_accepts_canvas_first_routes():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-recon-canvas-quality-'))
    state_path = tempdir / 'state.json'
    try:
        write_state(state_path, {
            'after_worktree': str(tempdir),
            'before_worktree': str(tempdir),
        })
        with temporary_env(RIDDLE_PROOF_STATE_FILE=str(state_path)):
            sys.modules.pop('util', None)
            source = RECON_PATH.read_text()
            helpers_source = source.split('\ndef clean_next_cache', 1)[0]
            namespace = {'__file__': str(RECON_PATH)}
            exec(compile(helpers_source, str(RECON_PATH), 'exec'), namespace)
        canvas_payload = {
            'bodyTextLength': 4,
            'visibleTextSample': 'Game',
            'interactiveElements': 1,
            'visibleInteractiveElements': 1,
            'pathname': '/games/luge-run',
            'title': 'Luge Run',
            'headings': [],
            'buttons': [],
            'links': [],
            'canvasCount': 1,
            'largeVisibleElements': [{'tag': 'canvas', 'text': '', 'area': 420000}],
        }
        quality = namespace['evaluate_capture_quality']({
            'ok': True,
            'screenshots': [{'name': 'before.png', 'url': 'https://cdn.example.com/before.png'}],
            'outputs': [{'name': 'before.png', 'url': 'https://cdn.example.com/before.png'}],
            'console': ['RIDDLE_PROOF_STATE:' + json.dumps(canvas_payload)],
        }, '/games/luge-run')
        assert quality['valid'] is True, quality
        assert quality['details']['canvas_capture_ready'] is True
        assert 'blank/near-blank' not in quality['reason']
        return {'ok': True, 'valid': quality['valid']}
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


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


def run_preflight_records_prod_reference_skip_reason():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-preflight-reference-'))
    args_path = tempdir / 'args.json'
    state_path = tempdir / 'state.json'
    repo_dir = tempdir / 'repo'
    try:
        make_project(repo_dir, "export const routes = [{ path: '/pricing', element: <Pricing /> }];\n")
        args_path.write_text(json.dumps({
            'repo': 'example/repo',
            'repo_dir': str(repo_dir),
            'mode': 'static',
            'reference': 'both',
            'prod_url': '',
            'change_request': 'Make the pricing CTA clearer',
            'commit_message': 'Make the pricing CTA clearer',
            'success_criteria': 'Pricing CTA is visible.',
            'verification_mode': 'text',
            'build_command': BUILD_SCRIPT,
            'build_output': 'build',
            'allow_static_preview_fallback': True,
            'server_path': '/pricing',
        }, indent=2))
        with temporary_env(
            RIDDLE_PROOF_ARGS_FILE=str(args_path),
            RIDDLE_PROOF_STATE_FILE=str(state_path),
        ):
            load_module('util_preflight_reference_skip', UTIL_PATH)
            load_module('preflight_reference_skip', PREFLIGHT_PATH)
        after_preflight = json.loads(state_path.read_text())
        assert after_preflight['requested_reference'] == 'both'
        assert after_preflight['reference'] == 'before'
        assert after_preflight['reference_resolution']['requested_reference'] == 'both'
        assert after_preflight['reference_resolution']['effective_reference'] == 'before'
        assert after_preflight['reference_resolution']['prod_reference_skipped'] is True
        assert after_preflight['reference_resolution']['prod_reference_skip_reason'] == 'prod_url_not_provided'
        return {
            'ok': True,
            'reference_resolution': after_preflight['reference_resolution'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_remote_audit_setup_without_repo():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-remote-audit-'))
    args_path = tempdir / 'args.json'
    state_path = tempdir / 'state.json'
    try:
        args_path.write_text(json.dumps({
            'repo': '',
            'mode': 'server',
            'reference': 'both',
            'prod_url': 'https://prod.example.com/pricing?plan=pro',
            'change_request': 'Audit the current pricing page without a repo checkout.',
            'commit_message': '',
            'success_criteria': 'Current target is captured.',
            'verification_mode': 'visual',
            'implementation_mode': 'none',
            'require_diff': False,
            'allow_code_changes': False,
            'server_image': 'node:20-slim',
            'server_command': 'npm start',
            'server_port': '3000',
        }, indent=2))
        with temporary_env(
            RIDDLE_PROOF_ARGS_FILE=str(args_path),
            RIDDLE_PROOF_STATE_FILE=str(state_path),
        ):
            sys.modules.pop('util', None)
            load_module('util_remote_audit_preflight', UTIL_PATH)
            load_module('preflight_remote_audit', PREFLIGHT_PATH)
            sys.modules.pop('util', None)
            try:
                load_module('setup_remote_audit', SETUP_PATH)
            except SystemExit as exc:
                assert exc.code in (0, None), exc
        state = json.loads(state_path.read_text())
        assert state['remote_audit'] is True
        assert state['workspace_ready'] is True
        assert state['reference'] == 'prod'
        assert state['implementation_status'] == 'not_required'
        assert state['dependency_install']['after'] == 'skipped:remote_audit'
        assert state['server_path'] == '/pricing?plan=pro'
        assert state['recon_status'] == 'ready_for_proof_plan'
        assert state['proof_plan_status'] == 'ready'
        assert state['capture_script'] == 'await page.waitForTimeout(1500);'
        assert state['capture_script_source'] == 'default_remote_audit_current_target'
        return {'ok': True, 'server_path': state['server_path'], 'capture_script_source': state['capture_script_source']}
    finally:
        sys.modules.pop('util', None)
        shutil.rmtree(tempdir, ignore_errors=True)


def run_remote_interaction_audit_setup_requires_authoring():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-remote-interaction-audit-'))
    args_path = tempdir / 'args.json'
    state_path = tempdir / 'state.json'
    try:
        args_path.write_text(json.dumps({
            'repo': '',
            'mode': 'server',
            'reference': 'both',
            'prod_url': 'https://riddledc.com/',
            'change_request': 'Verify Home -> Proof navigation. Start at https://riddledc.com/. Click the visible Proof nav link. Expected terminal URL is https://riddledc.com/proof/.',
            'commit_message': '',
            'success_criteria': 'Terminal URL is https://riddledc.com/proof/ and structured proof evidence is present.',
            'verification_mode': 'interaction',
            'implementation_mode': 'none',
            'require_diff': False,
            'allow_code_changes': False,
            'server_image': 'node:20-slim',
            'server_command': 'npm start',
            'server_port': '3000',
        }, indent=2))
        with temporary_env(
            RIDDLE_PROOF_ARGS_FILE=str(args_path),
            RIDDLE_PROOF_STATE_FILE=str(state_path),
        ):
            sys.modules.pop('util', None)
            load_module('util_remote_interaction_audit_preflight', UTIL_PATH)
            load_module('preflight_remote_interaction_audit', PREFLIGHT_PATH)
            sys.modules.pop('util', None)
            try:
                load_module('setup_remote_interaction_audit', SETUP_PATH)
            except SystemExit as exc:
                assert exc.code in (0, None), exc
        state = json.loads(state_path.read_text())
        assert state['remote_audit'] is True
        assert state['workspace_ready'] is True
        assert state['reference'] == 'prod'
        assert state['implementation_status'] == 'not_required'
        assert state['server_path'] == '/'
        assert state['recon_status'] == 'ready_for_proof_plan'
        assert state['author_status'] == 'needs_authoring'
        assert state['proof_plan_status'] == 'needs_authoring'
        assert state['requested_expected_terminal_path'] == '/proof'
        assert state['expected_terminal_path'] == '/proof'
        assert state['expected_start_path'] == '/'
        assert state['interaction_contract']['start_path'] == '/'
        assert state['interaction_contract']['expected_terminal_path'] == '/proof'
        assert state.get('capture_script', '') == ''
        assert state.get('capture_script_source', '') == ''
        assert 'requires an authored browser interaction capture' in state['author_summary']

        with temporary_env(RIDDLE_PROOF_STATE_FILE=str(state_path)):
            sys.modules.pop('util', None)
            try:
                load_module('author_remote_interaction_audit_request', AUTHOR_PATH)
            except SystemExit as exc:
                assert exc.code in (0, None), exc
        after_author = json.loads(state_path.read_text())
        assert after_author['author_status'] == 'needs_supervisor_judgment'
        assert after_author['author_request']['fallback_defaults']['server_path'] == '/'
        assert after_author['author_request']['fallback_defaults']['expected_start_path'] == '/'
        assert after_author['author_request']['fallback_defaults']['expected_terminal_path'] == '/proof'
        assert after_author['author_request']['fallback_defaults']['capture_script'] == ''
        assert after_author['author_request']['interaction_contract']['expected_terminal_path'] == '/proof'
        return {
            'ok': True,
            'author_status': after_author['author_status'],
            'expected_terminal_path': after_author['expected_terminal_path'],
            'capture_script_source': after_author.get('capture_script_source', ''),
        }
    finally:
        sys.modules.pop('util', None)
        shutil.rmtree(tempdir, ignore_errors=True)


def run_preflight_resumes_visual_proof_session():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-preflight-session-'))
    args_path = tempdir / 'args.json'
    state_path = tempdir / 'state.json'
    repo_dir = tempdir / 'repo'
    try:
        make_project(repo_dir, "export const routes = [{ path: '/pricing', element: <Pricing /> }];\n")
        util = load_module('util_proof_session_builder', UTIL_PATH)
        parent_session = util.build_visual_proof_session({
            'repo': 'example/repo',
            'server_path': '/pricing',
            'reference': 'before',
            'verification_mode': 'visual',
            'target_image_url': 'https://cdn.example.com/spec.png',
            'target_image_hash': 'sha256:spec',
            'viewport_matrix': [
                {'name': 'mobile', 'width': 390, 'height': 844},
                {'name': 'desktop', 'width': 1280, 'height': 900},
            ],
            'deterministic_setup': {'seed': 'pricing-visual-v1'},
            'parsed_assertions': [{'kind': 'text', 'contains': 'Buy Now'}],
            'proof_plan': 'Capture pricing route and compare CTA visual state.',
            'capture_script': "await page.waitForSelector('[data-testid=pricing-cta]'); await saveScreenshot('after-proof');",
            'wait_for_selector': '[data-testid=pricing-cta]',
        }, route='/pricing', observed_after_path='/pricing', status='evidence_captured')

        args_path.write_text(json.dumps({
            'repo': 'example/repo',
            'repo_dir': str(repo_dir),
            'mode': 'static',
            'change_request': 'Continue the pricing visual iteration',
            'commit_message': 'Continue the pricing visual iteration',
            'build_command': BUILD_SCRIPT,
            'build_output': 'build',
            'allow_static_preview_fallback': True,
            'resume_session': json.dumps(parent_session),
        }, indent=2))
        with temporary_env(
            RIDDLE_PROOF_ARGS_FILE=str(args_path),
            RIDDLE_PROOF_STATE_FILE=str(state_path),
        ):
            sys.modules.pop('util', None)
            load_module('preflight_resume_session', PREFLIGHT_PATH)
        after_preflight = json.loads(state_path.read_text())
        assert after_preflight['proof_session_resume']['status'] == 'accepted'
        assert after_preflight['proof_session_resume']['applied_fields']
        assert after_preflight['parent_proof_session']['session_id'] == parent_session['session_id']
        assert after_preflight['server_path'] == '/pricing'
        assert after_preflight['server_path_source'] == 'proof_session'
        assert after_preflight['reference'] == 'before'
        assert after_preflight['verification_mode'] == 'visual'
        assert after_preflight['target_image_url'] == 'https://cdn.example.com/spec.png'
        assert after_preflight['target_image_hash'] == 'sha256:spec'
        assert after_preflight['viewport_matrix'][0]['name'] == 'mobile'
        assert after_preflight['deterministic_setup']['seed'] == 'pricing-visual-v1'
        assert after_preflight['parsed_assertions'][0]['contains'] == 'Buy Now'
        assert after_preflight['proof_plan_status'] == 'ready'
        assert after_preflight['author_status'] == 'ready'

        mismatch_args_path = tempdir / 'mismatch-args.json'
        mismatch_state_path = tempdir / 'mismatch-state.json'
        mismatch_args_path.write_text(json.dumps({
            'repo': 'example/repo',
            'repo_dir': str(repo_dir),
            'mode': 'static',
            'reference': 'before',
            'verification_mode': 'visual',
            'change_request': 'Continue the pricing visual iteration',
            'commit_message': 'Continue the pricing visual iteration',
            'build_command': BUILD_SCRIPT,
            'build_output': 'build',
            'allow_static_preview_fallback': True,
            'server_path': '/wrong',
            'resume_session': json.dumps(parent_session),
        }, indent=2))
        with temporary_env(
            RIDDLE_PROOF_ARGS_FILE=str(mismatch_args_path),
            RIDDLE_PROOF_STATE_FILE=str(mismatch_state_path),
        ):
            try:
                sys.modules.pop('util', None)
                load_module('preflight_resume_session_mismatch', PREFLIGHT_PATH)
            except SystemExit as exc:
                assert 'fingerprint mismatch' in str(exc), exc
            else:
                raise AssertionError('route mismatch should reject resumed proof session')
        mismatch_state = json.loads(mismatch_state_path.read_text())
        assert mismatch_state['proof_session_resume']['status'] == 'fingerprint_mismatch'
        assert any(item['key'] == 'route' for item in mismatch_state['proof_session_resume']['mismatches'])

        return {
            'ok': True,
            'parent_session_id': parent_session['session_id'],
            'fingerprint': after_preflight['proof_session_resume']['fingerprint'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


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


def run_invoke_retry_stops_on_playwright_locator_timeout():
    util = load_module('util_retry_timeout', UTIL_PATH)
    calls = []
    original_invoke = util.invoke
    original_sleep = util.time.sleep

    def fake_invoke(tool, args, timeout=180):
        calls.append({'tool': tool, 'args': args, 'timeout': timeout})
        return {
            'ok': False,
            'error': 'locator.scrollIntoViewIfNeeded: Timeout 30000ms exceeded',
        }

    try:
        util.invoke = fake_invoke
        util.time.sleep = lambda _seconds: None
        result = util.invoke_retry('riddle_script', {'script': 'await page.locator("a").click();'}, retries=3, timeout=60)
        assert result['ok'] is False
        assert len(calls) == 1, calls
        calls.clear()
        generic = util.invoke_retry('riddle_preview', {'directory': '/tmp/nope'}, retries=3, timeout=60)
        assert generic['ok'] is False
        assert len(calls) == 3, calls
    finally:
        util.invoke = original_invoke
        util.time.sleep = original_sleep


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
        assert after_author['author_request']['fallback_defaults']['expected_start_path'] == '/pricing'
        assert after_author['author_request']['fallback_defaults']['expected_terminal_path'] == ''
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


def run_capture_hint_rejects_route_specific_mode_only_match():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-hint-selection-'))
    try:
        util = load_module('util_hint_selection', UTIL_PATH)
        repo_key = str(tempdir / 'repo')
        state = {
            'repo': repo_key,
            'verification_mode': 'text',
            'change_request': 'Change the Tic Tac Toe reset button label to Reset Board.',
            'success_criteria': 'The Tic Tac Toe page shows Reset Board on /games/tic-tac-toe.',
        }
        _, cache_path = util.load_capture_hint_cache(state)
        cache_file = Path(cache_path)
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps({
            'version': util.CAPTURE_HINT_CACHE_VERSION,
            'hints': [
                {
                    'saved_at': '2026-04-25T00:00:00Z',
                    'verification_mode': 'text',
                    'request_tokens': ['sequencer', 'monkberry', 'drum'],
                    'server_path': '/games/drum-sequencer',
                    'wait_for_selector': '.drum-sequencer h1',
                    'observed_path': '/games/drum-sequencer',
                }
            ],
        }))

        selected = util.select_capture_hint(state)
        applied = util.apply_capture_hint(state)

        assert selected is None, selected
        assert applied is None, applied
        assert 'server_path' not in state, state

        cache_file.write_text(json.dumps({
            'version': util.CAPTURE_HINT_CACHE_VERSION,
            'hints': [
                {
                    'saved_at': '2026-04-25T00:00:00Z',
                    'verification_mode': 'text',
                    'request_tokens': ['games', 'reset', 'board'],
                    'server_path': '/games/drum-sequencer',
                    'wait_for_selector': '.drum-sequencer h1',
                    'observed_path': '/games/drum-sequencer',
                }
            ],
        }))

        weak_token_state = dict(state)
        weak_token_state['success_criteria'] = 'Stale profile text says Neon Step Sequencer on /games/drum-sequencer.'
        weak_token_selected = util.select_capture_hint(weak_token_state)
        weak_token_applied = util.apply_capture_hint(weak_token_state)

        assert weak_token_selected is None, weak_token_selected
        assert weak_token_applied is None, weak_token_applied
        assert 'server_path' not in weak_token_state, weak_token_state

        cache_file.write_text(json.dumps({
            'version': util.CAPTURE_HINT_CACHE_VERSION,
            'hints': [
                {
                    'saved_at': '2026-04-25T00:00:00Z',
                    'verification_mode': 'text',
                    'request_tokens': ['homepage', 'hero'],
                    'server_path': '/',
                    'wait_for_selector': '',
                    'observed_path': '/',
                }
            ],
        }))

        root_state = {
            'repo': repo_key,
            'verification_mode': 'text',
            'change_request': 'Make a tiny harmless copy tweak.',
            'success_criteria': 'The changed copy is visible.',
        }
        root_applied = util.apply_capture_hint(root_state)
        assert root_applied is not None, root_applied
        assert root_state['server_path'] == '/', root_state
        assert root_state['server_path_source'] == 'hint_cache', root_state

        return {'ok': True, 'route_specific_selected': selected, 'root_server_path': root_state['server_path']}
    finally:
        if 'cache_file' in locals():
            cache_file.unlink(missing_ok=True)
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


def run_author_keeps_interaction_start_route():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-supervisor-interaction-start-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'verification_mode': 'interaction',
            'server_path': '/',
            'expected_start_path': '/',
            'before_cdn': 'https://cdn.example.com/before-home.png',
            'recon_results': {
                'baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before-home.png'}},
                'current_plan': {'target_path': '/'},
            },
            'author_request': {
                'current_plan': {'target_path': '/'},
                'observed_baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before-home.png'}},
            },
            'supervisor_author_packet': {
                'proof_plan': 'Start at /, click Proof, and verify the terminal /proof/ route.',
                'capture_script': "clickedProofNavigation(); await saveScreenshot('after-proof');",
                'refined_inputs': {
                    'server_path': '/proof/',
                    'expected_terminal_path': '/proof/',
                    'wait_for_selector': '',
                    'reference': 'before',
                },
                'rationale': ['The interaction starts on home and terminates on Proof.'],
                'confidence': 'high',
                'summary': 'Supervisor supplied the interaction proof packet.',
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('author_supervisor_interaction_start', AUTHOR_PATH)
        after_author = json.loads(state_path.read_text())

        assert after_author['author_status'] == 'ready'
        assert after_author['server_path'] == '/'
        assert after_author['expected_start_path'] == '/'
        assert after_author['expected_terminal_path'] == '/proof/'
        assert after_author['author_packet']['refined_inputs']['server_path'] == '/'
        assert after_author['author_packet']['refined_inputs']['expected_start_path'] == '/'
        assert after_author['author_packet']['refined_inputs']['expected_terminal_path'] == '/proof/'
        assert after_author['author_warnings']
        assert 'terminal interaction route' in after_author['author_warnings'][0]
        return {
            'ok': True,
            'server_path': after_author['server_path'],
            'expected_terminal_path': after_author['expected_terminal_path'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_requests_supervisor_assessment():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-verify-supervisor-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='both', prod_url='https://prod.example.com/pricing')
        state.update({
            'repo': 'example/repo',
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
        assert visual_delta['status'] == 'measured'
        assert visual_delta['passed'] is True
        assert visual_delta['changed_pixels'] == 12000
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
        assert artifact_contract['required']['visual_delta'] is True
        artifact_production = after_verify['proof_assessment_request']['artifact_production']
        assert artifact_production['image_output_count'] >= 1
        assert artifact_production['proof_evidence_present'] is False
        artifact_usage = after_verify['proof_assessment_request']['artifact_usage']
        assert artifact_usage['missing_required_signals'] == []
        assert 'after-capture' in artifact_usage['supervisor_review_signals']
        assert 'baseline_context' in artifact_usage['required_signals']
        assert 'route_semantics' in artifact_usage['available_signals']
        assert 'visual_delta' in artifact_usage['available_signals']
        assert after_verify['proof_assessment_request']['hard_blockers'] == []
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
        proof_session = after_verify['proof_session']
        assert proof_session['version'] == 'riddle-proof.visual-session.v1'
        assert proof_session['repo'] == 'example/repo'
        assert proof_session['route']['path'] == '/pricing'
        assert proof_session['route']['observed_after_path'] == '/pricing'
        assert proof_session['artifacts']['before'] == 'https://cdn.example.com/before.png'
        assert proof_session['artifacts']['prod'] == 'https://cdn.example.com/prod.png'
        assert proof_session['artifacts']['after'] == 'https://cdn.example.com/after.png'
        assert proof_session['artifacts']['session'] == 'https://cdn.example.com/proof-session.json'
        assert proof_session['capture']['wait_for_selector'] == '[data-testid=pricing-cta]'
        assert proof_session['fingerprint_basis']['route'] == '/pricing'
        assert after_verify['proof_session_fingerprint'] == proof_session['fingerprint']
        assert after_verify['proof_session_artifact_url'] == 'https://cdn.example.com/proof-session.json'
        assert after_verify['evidence_bundle']['proof_session']['fingerprint'] == proof_session['fingerprint']
        assert after_verify['proof_assessment_request']['evidence_bundle']['proof_session']['fingerprint'] == proof_session['fingerprint']
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


def run_verify_routes_unmeasured_visual_delta_to_recovery():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-verify-visual-recovery-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'repo': 'example/repo',
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'before_cdn': 'https://cdn.example.com/before-artifact',
            'proof_plan': 'Use the recon-confirmed /pricing route and capture the CTA state once it stabilizes.',
            'capture_script': "noVisualDelta(); await page.waitForSelector('[data-testid=pricing-cta]'); await saveScreenshot('after-proof');",
            'wait_for_selector': '[data-testid=pricing-cta]',
            'recon_results': {
                'baselines': {
                    'before': {'path': '/pricing', 'url': 'https://cdn.example.com/before-artifact'},
                },
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_unmeasured_visual_delta_recovery', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'capture_incomplete'
        assert after_verify['proof_assessment_request'] == {}
        decision_request = after_verify['verify_decision_request']
        assert decision_request['capture_quality']['decision'] == 'revise_capture'
        assert decision_request['recommended_stage'] == 'verify'
        assert decision_request['continue_with_stage'] == 'verify'
        visual_delta = after_verify['evidence_bundle']['after']['visual_delta']
        assert visual_delta['status'] == 'unmeasured'
        assert visual_delta['diagnostic']['visual_diff_fallback']['status'] == 'error'
        assert 'Visual delta recovery' in after_verify['verify_summary']

        return {
            'ok': True,
            'verify_status': after_verify['verify_status'],
            'continue_with_stage': decision_request['continue_with_stage'],
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
                "const evidence = await page.evaluate(() => ({ "
                "modality: 'audio', attack_ms_before: 42, attack_ms_after: 12, "
                "transient_energy_delta_db: 4.8, passed: true })); "
                "return evidence;"
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
        assert 'typeof globalThis !== "undefined"' not in capture_script
        assert '__riddleProofEvidenceRoot.__riddleProofEvidence' not in capture_script
        assert '__riddleProofCaptureScriptResult = await (async () =>' in capture_script
        assert 'attack_ms_after' in supporting['proof_evidence_sample']
        proof_evidence_records = evidence_records(after_verify['evidence_bundle']['proof_evidence'])
        after_proof_evidence_records = evidence_records(after_verify['evidence_bundle']['after']['proof_evidence'])
        assert any(record.get('attack_ms_after') == 12 for record in proof_evidence_records)
        assert any(record.get('attack_ms_after') == 12 for record in after_proof_evidence_records)
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
        assert after_verify['evidence_bundle']['proof_evidence'] is not None
        assert after_verify['evidence_bundle']['proof_evidence']['proof_evidence_present'] is False
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


def run_remote_audit_verify_uses_default_capture_script():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-remote-audit-verify-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='prod', prod_url='https://prod.example.com/pricing?plan=pro')
        state.update({
            'remote_audit': True,
            'workspace_kind': 'remote_audit',
            'mode': 'server',
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'not_required',
            'implementation_mode': 'none',
            'require_diff': False,
            'allow_code_changes': False,
            'server_path': '/pricing?plan=pro',
            'proof_plan': 'Audit the current pricing target.',
            'capture_script': '',
            'recon_results': {'baselines': {}, 'mode': 'remote_audit'},
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_remote_audit_default_capture', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'evidence_captured'
        assert after_verify['capture_script'] == 'await page.waitForTimeout(1500);'
        assert after_verify['capture_script_source'] == 'default_remote_audit_current_target'
        assert after_verify['after_cdn'] == 'https://cdn.example.com/prod.png'
        assert after_verify['evidence_bundle']['after']['visual_delta']['status'] == 'not_applicable'
        assert after_verify['verify_decision_request']['expected_path'] == '/pricing?plan=pro'
        return {
            'ok': True,
            'verify_status': after_verify['verify_status'],
            'capture_script_source': after_verify['capture_script_source'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_remote_interaction_audit_verify_rejects_default_capture():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-remote-interaction-audit-verify-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='prod', prod_url='https://riddledc.com/')
        state.update({
            'remote_audit': True,
            'workspace_kind': 'remote_audit',
            'mode': 'server',
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'not_required',
            'implementation_mode': 'none',
            'require_diff': False,
            'allow_code_changes': False,
            'verification_mode': 'interaction',
            'server_path': '/',
            'expected_start_path': '/',
            'expected_terminal_path': '/proof',
            'requested_expected_terminal_path': '/proof',
            'proof_plan': 'Verify Home -> Proof navigation.',
            'capture_script': '',
            'recon_results': {'baselines': {}, 'mode': 'remote_audit'},
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        try:
            load_module('verify_remote_interaction_audit_rejects_default_capture', VERIFY_PATH)
        except SystemExit as exc:
            assert 'requires an authored browser interaction capture script' in str(exc), exc
        else:
            raise AssertionError('interaction remote audit verify should reject missing capture_script')
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'capture_incomplete'
        assert after_verify.get('capture_script', '') == ''
        assert after_verify.get('capture_script_source', '') == ''
        assert after_verify['verify_decision_request']['capture_quality']['decision'] == 'failed_interaction_capture'
        assert after_verify['verify_decision_request']['capture_quality']['blocking'] is True
        assert 'default remote audit current-target capture is passive' in after_verify['structured_interaction_capture_failure_summary']
        return {
            'ok': True,
            'verify_status': after_verify['verify_status'],
            'capture_quality': after_verify['verify_decision_request']['capture_quality']['decision'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_terminal_route_from_proof_evidence():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-forward-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'interaction',
            'server_path': '/',
            'before_cdn': 'https://cdn.example.com/before-home.png',
            'proof_plan': 'Start at /, click Proof, and verify the terminal /proof/ route.',
            'capture_script': "clickedProofNavigation(); await saveScreenshot('after-proof');",
            'recon_results': {
                'baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before-home.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_terminal_route', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'evidence_captured'
        assert after_verify['route_expectation']['start_path'] == '/'
        assert after_verify['route_expectation']['expected_path'] == '/proof'
        route = after_verify['proof_assessment_request']['semantic_context']['route']
        assert route['expected_start_path'] == '/'
        assert route['expected_after_path'] == '/proof'
        assert route['after_observed_path'] == '/proof'
        assert 'wrong route' not in after_verify['verify_results']['after']['observation']['reason']
        return {
            'ok': True,
            'expected_path': after_verify['route_expectation']['expected_path'],
            'after_observed_path': route['after_observed_path'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_iife_structured_evidence_without_screenshot():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-iife-no-shot-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'interaction',
            'server_path': '/',
            'before_cdn': 'https://cdn.example.com/before-home.png',
            'proof_plan': 'Start at /, click Proof, and verify the terminal /proof/ route.',
            'capture_script': (
                "(async () => { "
                "const evidence = await clickedProofNavigationOcLiveShapeNoScreenshot(); "
                "await saveScreenshot('after-proof'); "
                "return evidence; "
                "})();"
            ),
            'recon_results': {
                'baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before-home.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_iife_no_screenshot', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'evidence_captured'
        assert after_verify['after_cdn'] == ''
        assert after_verify['verify_results']['after']['observation']['valid'] is True
        assert after_verify['verify_results']['after']['observation']['details']['screenshot_required'] is False
        assert after_verify['evidence_bundle']['artifact_contract']['required']['screenshot'] is False
        assert 'screenshot' not in after_verify['evidence_bundle']['artifact_usage']['missing_required_signals']
        assert after_verify['route_expectation']['expected_path'] == '/proof'
        route = after_verify['proof_assessment_request']['semantic_context']['route']
        assert route['expected_after_path'] == '/proof'
        assert route['after_observed_path'] == '/proof'
        assert 'wrong route' not in after_verify['verify_results']['after']['observation']['reason']
        supporting = after_verify['verify_results']['after']['supporting_artifacts']
        assert supporting['proof_evidence_present'] is True
        assert supporting['has_structured_payload'] is True
        return {
            'ok': True,
            'expected_path': after_verify['route_expectation']['expected_path'],
            'after_cdn': after_verify['after_cdn'],
            'screenshot_required': after_verify['verify_results']['after']['observation']['details']['screenshot_required'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_proof_evidence_overrides_stale_expected_path():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-stale-route-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'interaction',
            'server_path': '/',
            'expected_terminal_path': '/state',
            'before_cdn': 'https://cdn.example.com/before-home.png',
            'proof_plan': 'Start at /, click Proof, and verify the terminal /proof/ route.',
            'capture_script': "clickedProofNavigation(); await saveScreenshot('after-proof');",
            'supervisor_author_packet': {
                'proof_plan': 'Click Proof and prove the terminal route.',
                'capture_script': "clickedProofNavigation(); await saveScreenshot('after-proof');",
                'refined_inputs': {
                    'server_path': '/',
                    'expected_terminal_path': '/state',
                },
            },
            'recon_results': {
                'baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before-home.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_stale_route_uses_evidence', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'evidence_captured'
        assert after_verify['route_expectation']['source'] == 'proof_evidence_contract'
        assert after_verify['route_expectation']['expected_path'] == '/proof'
        route = after_verify['proof_assessment_request']['semantic_context']['route']
        assert route['expected_after_path'] == '/proof'
        assert route['after_observed_path'] == '/proof'
        assert 'wrong route' not in after_verify['verify_results']['after']['observation']['reason']
        return {
            'ok': True,
            'expected_path': after_verify['route_expectation']['expected_path'],
            'source': after_verify['route_expectation']['source'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_proof_plan_placeholder_uses_live_evidence():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-placeholder-route-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'interaction',
            'server_path': '/',
            'before_cdn': 'https://cdn.example.com/before-home.png',
            'proof_plan': 'Start at /, click Proof, and verify the terminal pathname /pathname.',
            'capture_script': "clickedProofNavigationOcLiveShape(); await saveScreenshot('after-proof');",
            'recon_results': {
                'baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before-home.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_placeholder_route_uses_evidence', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'evidence_captured'
        assert after_verify['route_expectation']['source'] == 'proof_evidence_contract'
        assert after_verify['route_expectation']['expected_path'] == '/proof'
        route = after_verify['proof_assessment_request']['semantic_context']['route']
        assert route['expected_after_path'] == '/proof'
        assert route['after_observed_path'] == '/proof'
        assert after_verify.get('expected_terminal_path') == '/proof'
        assert '/pathname' not in json.dumps(after_verify['route_expectation'])
        assert 'wrong route' not in after_verify['verify_results']['after']['observation']['reason']
        return {
            'ok': True,
            'expected_path': after_verify['route_expectation']['expected_path'],
            'source': after_verify['route_expectation']['source'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_reverse_terminal_route_from_proof_evidence():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-reverse-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'interaction',
            'server_path': '/proof/',
            'before_cdn': 'https://cdn.example.com/before-proof.png',
            'proof_plan': 'Start at /proof/, click Home, and verify the terminal / route.',
            'capture_script': "clickedHomeNavigation(); await saveScreenshot('after-home');",
            'recon_results': {
                'baselines': {'before': {'path': '/proof/', 'url': 'https://cdn.example.com/before-proof.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_reverse_terminal_route', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'evidence_captured'
        assert after_verify['route_expectation']['start_path'] == '/proof'
        assert after_verify['route_expectation']['expected_path'] == '/'
        route = after_verify['proof_assessment_request']['semantic_context']['route']
        assert route['expected_start_path'] == '/proof'
        assert route['expected_after_path'] == '/'
        assert route['after_observed_path'] == '/'
        assert 'wrong route' not in after_verify['verify_results']['after']['observation']['reason']
        return {
            'ok': True,
            'expected_path': after_verify['route_expectation']['expected_path'],
            'after_observed_path': route['after_observed_path'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_reverse_terminal_expected_url_from_nested_terminal_evidence():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-reverse-oc-shape-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='prod')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'not_required',
            'verification_mode': 'interaction',
            'implementation_mode': 'none',
            'require_diff': False,
            'allow_code_changes': False,
            'server_path': '/proof/',
            'prod_url': 'https://riddledc.com/proof/',
            'prod_cdn': 'https://cdn.example.com/prod-proof.png',
            'proof_plan': 'Start on the proof page, click the visible Riddle/Home root nav link, and trust the structured evidence for the terminal route.',
            'capture_script': "clickedHomeNavigationOcTerminalShape(); await saveScreenshot('after-home');",
            'recon_results': {
                'baselines': {'prod': {'path': '/proof/', 'url': 'https://cdn.example.com/prod-proof.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_reverse_terminal_nested_expected_url', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'evidence_captured'
        assert after_verify['route_expectation']['source'] == 'proof_evidence_contract'
        assert after_verify['route_expectation']['start_path'] == '/proof'
        assert after_verify['route_expectation']['expected_path'] == '/'
        route = after_verify['proof_assessment_request']['semantic_context']['route']
        assert route['expected_start_path'] == '/proof'
        assert route['expected_after_path'] == '/'
        assert route['after_observed_path'] == '/'
        assert 'wrong route' not in after_verify['verify_results']['after']['observation']['reason']
        return {
            'ok': True,
            'expected_path': after_verify['route_expectation']['expected_path'],
            'after_observed_path': route['after_observed_path'],
            'source': after_verify['route_expectation']['source'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_prose_route_noise_uses_proof_evidence():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-prose-noise-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'interaction',
            'server_path': '/proof/',
            'before_cdn': 'https://cdn.example.com/before-proof.png',
            'proof_plan': 'Start on the proof page, click Home, and confirm the home page content is visible.',
            'capture_script': "clickedHomeNavigation(); await saveScreenshot('after-home');",
            'change_request': (
                'Prior wrapper notes mentioned terminal drift to /Your and package '
                '@riddledc/openclaw-riddle-proof, but those are prose diagnostics, not route expectations.'
            ),
            'success_criteria': (
                'Use structured browser evidence for the terminal route; do not parse '
                '/openclaw-riddle-proof from package text as the expected path.'
            ),
            'recon_results': {
                'baselines': {'before': {'path': '/proof/', 'url': 'https://cdn.example.com/before-proof.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_prose_route_noise', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'evidence_captured'
        assert after_verify['route_expectation']['source'] == 'proof_evidence_contract'
        assert after_verify['route_expectation']['expected_path'] == '/'
        route = after_verify['proof_assessment_request']['semantic_context']['route']
        assert route['expected_after_path'] == '/'
        assert route['after_observed_path'] == '/'
        encoded = json.dumps(after_verify, sort_keys=True)
        assert '"expected_path": "/Your"' not in encoded
        assert '"expected_path": "/openclaw-riddle-proof"' not in encoded
        return {
            'ok': True,
            'expected_path': after_verify['route_expectation']['expected_path'],
            'source': after_verify['route_expectation']['source'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_hash_terminal_route_from_proof_evidence():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-hash-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'interaction',
            'server_path': '/',
            'before_cdn': 'https://cdn.example.com/before-home.png',
            'proof_plan': 'Start at /, click the skip link, and verify the terminal /#main-content route.',
            'capture_script': "clickedSkipHashNavigation(); await saveScreenshot('after-hash');",
            'recon_results': {
                'baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before-home.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_hash_terminal_route', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'evidence_captured'
        assert after_verify['route_expectation']['expected_path'] == '/#main-content'
        assert after_verify['route_expectation']['expected_hash'] == '#main-content'
        route = after_verify['proof_assessment_request']['semantic_context']['route']
        assert route['expected_after_path'] == '/#main-content'
        assert route['expected_terminal_hash'] == '#main-content'
        assert route['after_observed_path'] == '/#main-content'
        assert route['after_observed_hash'] == '#main-content'
        assert 'wrong route' not in after_verify['verify_results']['after']['observation']['reason']
        return {
            'ok': True,
            'expected_path': after_verify['route_expectation']['expected_path'],
            'after_observed_hash': route['after_observed_hash'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_authored_query_hash_mismatch_blocks_with_evidence():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-query-hash-mismatch-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'interaction',
            'server_path': '/',
            'before_cdn': 'https://cdn.example.com/before-home.png',
            'proof_plan': 'Start at /, click Pricing, and verify /pricing/?rp_probe=1#pricing-probe.',
            'capture_script': "pricingQueryHashDropsTerminal(); await page.waitForURL('/pricing/?rp_probe=1#pricing-probe');",
            'supervisor_author_packet': {
                'proof_plan': 'Click Pricing and prove the terminal query/hash route.',
                'capture_script': "pricingQueryHashDropsTerminal(); await page.waitForURL('/pricing/?rp_probe=1#pricing-probe');",
                'refined_inputs': {
                    'server_path': '/',
                    'expected_terminal_path': '/pricing/?rp_probe=1#pricing-probe',
                },
            },
            'recon_results': {
                'baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before-home.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_authored_query_hash_mismatch', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        request = after_verify['verify_decision_request']
        assert after_verify['verify_status'] == 'capture_incomplete'
        assert after_verify['merge_recommendation'] == 'do-not-merge'
        assert after_verify['route_expectation']['expected_query'] == 'rp_probe=1'
        assert after_verify['route_expectation']['expected_hash'] == '#pricing-probe'
        capture_quality = request['capture_quality']
        assert capture_quality['decision'] == 'failed_interaction_capture'
        assert request['recommended_stage'] is None
        assert request['continue_with_stage'] is None
        assert capture_quality['blocking'] is True
        assert capture_quality['terminal_blocker'] is True
        quality_text = json.dumps(capture_quality, sort_keys=True)
        assert 'page.waitForURL: Timeout 15000ms exceeded' in quality_text
        assert after_verify['proof_assessment_request'] == {}
        supporting = after_verify['verify_results']['after']['supporting_artifacts']
        assert supporting['proof_evidence_present'] is True
        assert supporting['has_structured_payload'] is True
        synthetic_evidence = after_verify['evidence_bundle']['proof_evidence']
        if isinstance(synthetic_evidence, list):
            synthetic_evidence = next(
                record for record in evidence_records(synthetic_evidence)
                if record.get('version') == 'riddle-proof.interaction.capture-failure.v1'
            )
        assert synthetic_evidence['version'] == 'riddle-proof.interaction.capture-failure.v1'
        assert synthetic_evidence['passed'] is False
        assert synthetic_evidence['authored_proof_evidence_present'] is False
        assert synthetic_evidence['checks']['routeMatches'] is False
        assert synthetic_evidence['expected']['query'] == 'rp_probe=1'
        assert synthetic_evidence['expected']['hash'] == '#pricing-probe'
        assert synthetic_evidence['observed']['path'] == '/pricing'
        assert 'page.waitForURL: Timeout 15000ms exceeded' in synthetic_evidence['capture_error']
        return {
            'ok': True,
            'summary': request['summary'],
            'recommended_stage': request['recommended_stage'],
            'blocking': capture_quality['blocking'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_query_hash_pass_uses_proof_evidence_route():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-query-hash-pass-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'interaction',
            'server_path': '/',
            'before_cdn': 'https://cdn.example.com/before-home.png',
            'proof_plan': 'Start at /, click Pricing, and verify /pricing/?rp_probe=1#pricing-probe.',
            'capture_script': "pricingQueryHashPassesWithPageStateHashGap(); await page.waitForURL('/pricing/?rp_probe=1#pricing-probe');",
            'supervisor_author_packet': {
                'proof_plan': 'Click Pricing and prove the terminal query/hash route.',
                'capture_script': "pricingQueryHashPassesWithPageStateHashGap(); await page.waitForURL('/pricing/?rp_probe=1#pricing-probe');",
                'refined_inputs': {
                    'server_path': '/',
                    'expected_terminal_path': '/pricing/?rp_probe=1#pricing-probe',
                },
            },
            'recon_results': {
                'baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before-home.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_query_hash_pass_uses_proof_evidence_route', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'evidence_captured'
        assert after_verify['merge_recommendation'] == 'pending-supervisor-judgment'
        request = after_verify['verify_decision_request']
        assert 'capture_quality' not in request
        assert request['recommended_stage'] is None
        assert request['continue_with_stage'] is None
        observation = after_verify['verify_results']['after']['observation']
        assert 'wrong route' not in observation['reason']
        details = observation['details']
        assert details['proof_evidence_route_matched'] is True
        assert details['observed_path_source'] == 'proof_evidence'
        route = after_verify['proof_assessment_request']['semantic_context']['route']
        assert route['expected_terminal_query'] == 'rp_probe=1'
        assert route['expected_terminal_hash'] == '#pricing-probe'
        assert route['after_observed_query'] == 'rp_probe=1'
        assert route['after_observed_hash'] == '#pricing-probe'
        assert route['after_observed_path'] == '/pricing?rp_probe=1#pricing-probe'
        return {
            'ok': True,
            'after_observed_path': route['after_observed_path'],
            'after_observed_hash': route['after_observed_hash'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_explicit_expected_url_blocks_dropped_terminal_route():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-explicit-expected-url-mismatch-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'interaction',
            'server_path': '/',
            'before_cdn': 'https://cdn.example.com/before-home.png',
            'proof_plan': 'Start at /, click Pricing, and intentionally prove the query/hash route mismatch.',
            'capture_script': "pricingQueryHashStructuredNegativeControl();",
            'supervisor_author_packet': {
                'proof_plan': 'Use expectedUrl as the route expectation and return structured evidence for the dropped query/hash terminal URL.',
                'capture_script': "pricingQueryHashStructuredNegativeControl();",
                'refined_inputs': {
                    'server_path': '/',
                },
            },
            'recon_results': {
                'baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before-home.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_explicit_expected_url_blocks_dropped_terminal_route', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        request = after_verify['verify_decision_request']
        assert after_verify['verify_status'] == 'capture_incomplete'
        assert after_verify['merge_recommendation'] == 'do-not-merge'
        assert after_verify['route_expectation']['source'] == 'proof_evidence_contract'
        assert after_verify['route_expectation']['expected_path'] == '/pricing?rp_probe=1#pricing-probe'
        assert after_verify['route_expectation']['expected_query'] == 'rp_probe=1'
        assert after_verify['route_expectation']['expected_hash'] == '#pricing-probe'
        assert request['recommended_stage'] is None
        assert request['continue_with_stage'] is None
        capture_quality = request['capture_quality']
        assert capture_quality['decision'] == 'failed_interaction_capture'
        assert capture_quality['blocking'] is True
        assert capture_quality['terminal_blocker'] is True
        assert capture_quality['mismatch']['expected_path'] == '/pricing?rp_probe=1#pricing-probe'
        assert capture_quality['mismatch']['observed_after_path'] in ('/pricing', '/pricing/')
        assert 'Interaction proof terminal route mismatch' in capture_quality['summary']
        assert after_verify['proof_assessment_request'] == {}
        observation = request['latest_observation']
        assert observation['valid'] is False
        assert 'wrong route' in observation['reason']
        supporting = after_verify['verify_results']['after']['supporting_artifacts']
        assert supporting['proof_evidence_present'] is True
        assert supporting['has_structured_payload'] is True
        route = after_verify['evidence_bundle']['semantic_context']['route']
        assert route['expected_terminal_query'] == 'rp_probe=1'
        assert route['expected_terminal_hash'] == '#pricing-probe'
        assert route['after_observed_path'] == '/pricing'
        assert route['after_observed_query'] == ''
        assert route['after_observed_hash'] == ''
        return {
            'ok': True,
            'decision': capture_quality['decision'],
            'summary': capture_quality['summary'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_thrown_error_terminal_blocker():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-thrown-error-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'interaction',
            'server_path': '/',
            'before_cdn': 'https://cdn.example.com/before-home.png',
            'proof_plan': 'Run a diagnostic interaction script that intentionally throws.',
            'capture_script': "interactionThrownError();",
            'recon_results': {
                'baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before-home.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_thrown_error_terminal_blocker', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'capture_incomplete'
        assert after_verify['merge_recommendation'] == 'do-not-merge'
        assert after_verify['proof_assessment_request'] == {}
        capture_quality = after_verify['verify_decision_request']['capture_quality']
        assert capture_quality['decision'] == 'failed_interaction_capture'
        assert capture_quality['recommended_stage'] is None
        assert capture_quality['continue_with_stage'] is None
        assert capture_quality['blocking'] is True
        assert capture_quality['terminal_blocker'] is True
        capture_quality_text = json.dumps(capture_quality, sort_keys=True)
        assert 'intentional-riddle-proof-0811-thrown-error' in capture_quality_text
        assert after_verify['structured_interaction_capture_failure_summary']
        evidence = after_verify['evidence_bundle']['proof_evidence']
        if isinstance(evidence, list):
            evidence = next(
                record for record in evidence_records(evidence)
                if record.get('version') == 'riddle-proof.interaction.capture-failure.v1'
            )
        assert evidence['version'] == 'riddle-proof.interaction.capture-failure.v1'
        assert evidence['checks']['scriptCompleted'] is False
        assert evidence['checks']['authoredEvidenceReturned'] is False
        assert 'intentional-riddle-proof-0811-thrown-error' in evidence['capture_error']
        return {
            'ok': True,
            'decision': capture_quality['decision'],
            'blocking': capture_quality['blocking'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_interaction_thrown_error_after_failed_evidence_terminal_blocker():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-interaction-thrown-after-evidence-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'interaction',
            'server_path': '/',
            'before_cdn': 'https://cdn.example.com/before-home.png',
            'proof_plan': 'Run a diagnostic interaction script that emits failed proof evidence and then intentionally throws.',
            'capture_script': "interactionThrownAfterFailedEvidence();",
            'recon_results': {
                'baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before-home.png'}},
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_interaction_thrown_error_after_failed_evidence_terminal_blocker', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'capture_incomplete'
        assert after_verify['merge_recommendation'] == 'do-not-merge'
        assert after_verify['proof_assessment_request'] == {}
        capture_quality = after_verify['verify_decision_request']['capture_quality']
        assert capture_quality['decision'] == 'failed_interaction_capture'
        assert capture_quality['recommended_stage'] is None
        assert capture_quality['continue_with_stage'] is None
        assert capture_quality['blocking'] is True
        assert capture_quality['terminal_blocker'] is True
        capture_quality_text = json.dumps(capture_quality, sort_keys=True)
        assert 'intentional-riddle-proof-0823-thrown-error-after-failed-evidence' in capture_quality_text
        assert 'proofReady' in capture_quality_text
        assert after_verify['structured_interaction_capture_failure_summary']
        evidence = after_verify['evidence_bundle']['proof_evidence']
        if isinstance(evidence, list):
            evidence = next(
                record for record in evidence_records(evidence)
                if isinstance(record.get('checks'), dict) and record['checks'].get('proofReady') is False
            )
        assert evidence['checks']['passed'] is False
        assert evidence['checks']['success'] is False
        assert evidence['checks']['proofReady'] is False
        assert 'Structured interaction capture blocker' in after_verify['proof_summary']
        return {
            'ok': True,
            'decision': capture_quality['decision'],
            'blocking': capture_quality['blocking'],
        }
    finally:
        shutil.rmtree(tempdir, ignore_errors=True)


def run_verify_capture_retry_surfaces_script_timeout():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-capture-timeout-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'before_cdn': 'https://cdn.example.com/before.png',
            'proof_plan': 'Click the skip link and capture the resulting focus state.',
            'capture_script': "skipLinkTimeout();",
            'recon_results': {
                'baselines': {'before': {'path': '/', 'url': 'https://cdn.example.com/before.png'}},
            },
            'server_path': '/',
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        fake = FakeRiddle()
        load_util_with_fake(fake)
        load_module('verify_capture_timeout_summary', VERIFY_PATH)
        after_verify = json.loads(state_path.read_text())

        assert after_verify['verify_status'] == 'capture_incomplete'
        capture_quality = after_verify['verify_decision_request']['capture_quality']
        assert capture_quality['recommended_stage'] is None
        assert capture_quality['continue_with_stage'] is None
        assert capture_quality['blocking'] is True
        assert capture_quality['terminal_blocker'] is True
        capture_quality_text = json.dumps(capture_quality, sort_keys=True)
        assert 'locator.click: Timeout 30000ms exceeded' in capture_quality_text
        return {
            'ok': True,
            'decision': capture_quality['decision'],
            'summary': capture_quality['summary'],
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


def run_ship_blocks_unmeasured_visual_delta():
    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-ship-visual-delta-'))
    state_path = tempdir / 'state.json'
    try:
        state = base_state(tempdir, reference='before')
        state.update({
            'recon_status': 'ready_for_proof_plan',
            'author_status': 'ready',
            'proof_plan_status': 'ready',
            'implementation_status': 'changes_detected',
            'verification_mode': 'visual',
            'verify_status': 'evidence_captured',
            'before_cdn': 'https://cdn.example.com/before.png',
            'after_cdn': 'https://cdn.example.com/after.png',
            'proof_assessment': {
                'decision': 'ready_to_ship',
                'summary': 'The screenshots look good.',
                'source': 'supervising_agent',
            },
            'proof_assessment_source': 'supervising_agent',
            'evidence_bundle': {
                'verification_mode': 'visual',
                'artifact_contract': {
                    'required': {
                        'baseline_context': True,
                        'route_semantics': True,
                        'screenshot': True,
                        'visual_delta': True,
                    },
                },
                'after': {
                    'screenshot_url': 'https://cdn.example.com/after.png',
                    'observation': {'valid': True, 'reason': 'ok'},
                    'visual_delta': {
                        'status': 'unmeasured',
                        'passed': None,
                        'reason': 'No measured before/after visual delta was found in proof evidence.',
                    },
                },
            },
        })
        write_state(state_path, state)
        os.environ['RIDDLE_PROOF_STATE_FILE'] = str(state_path)

        try:
            load_module('ship_blocks_unmeasured_visual_delta', SHIP_PATH)
        except SystemExit as exc:
            message = str(exc)
            assert 'visual_delta.status=unmeasured' in message, message
            assert 'blocks ready_to_ship' in message, message
            return {'ok': True, 'error': message}
        raise AssertionError('ship should have failed when visual delta was unmeasured')
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


def run_ship_preserves_literal_backticks_in_args():
    sys.modules.pop('util', None)
    source = SHIP_PATH.read_text()
    helpers_source = source.split('\ns = load_state()', 1)[0]
    namespace = {'__file__': str(SHIP_PATH)}
    exec(compile(helpers_source, str(SHIP_PATH), 'exec'), namespace)

    title = 'Change button from `Start Run` to `Launch Run`'
    body = 'Proof request keeps `Start Run` and `Launch Run` literal.'
    args = namespace['gh_pr_create_args'](title, body, 'agent/test-backticks')
    assert args[0:3] == ['gh', 'pr', 'create'], args
    assert args[args.index('--title') + 1] == title, args
    assert args[args.index('--body') + 1] == body, args

    tempdir = Path(tempfile.mkdtemp(prefix='riddle-proof-ship-backticks-'))
    try:
        sp.run(['git', 'init', '-b', 'main'], cwd=tempdir, check=True, capture_output=True, text=True)
        sp.run(['git', 'config', 'user.email', 'test@example.com'], cwd=tempdir, check=True)
        sp.run(['git', 'config', 'user.name', 'Test User'], cwd=tempdir, check=True)
        (tempdir / 'tracked.txt').write_text('literal backticks\n')
        sp.run(['git', 'add', 'tracked.txt'], cwd=tempdir, check=True)

        namespace['git_checked'](['commit', '-m', title], str(tempdir))
        subject = sp.run(
            ['git', 'log', '-1', '--pretty=%s'],
            cwd=tempdir,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        assert subject == title, subject
        return {'ok': True, 'subject': subject}
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
        'preflight_reference_skip_reason': run_preflight_records_prod_reference_skip_reason(),
        'remote_audit_setup_without_repo': run_remote_audit_setup_without_repo(),
        'remote_interaction_audit_setup_requires_authoring': run_remote_interaction_audit_setup_requires_authoring(),
        'preflight_resume_visual_proof_session': run_preflight_resumes_visual_proof_session(),
        'capture_artifact_enrichment': run_capture_artifact_enrichment(),
        'capture_diagnostics_redaction': run_capture_diagnostics_redact_sensitive_values(),
        'apply_auth_context': run_apply_auth_context_passes_supported_auth_payloads(),
        'run_project_build_retries_after_clean_failure': run_project_build_retries_after_clean_failure(),
        'invoke_retry_stops_on_playwright_locator_timeout': run_invoke_retry_stops_on_playwright_locator_timeout(),
        'implement_records_detection_when_changes_missing': run_implement_records_detection_when_changes_missing(),
        'implement_ignores_tool_noise_when_detecting_changes': run_implement_ignores_tool_noise_when_detecting_changes(),
        'verify_quality_ignores_proof_telemetry_console_text': run_verify_quality_ignores_proof_telemetry_console_text(),
        'recon_quality_accepts_canvas_first_routes': run_recon_quality_accepts_canvas_first_routes(),
        'recon_then_author_request': run_recon_then_author_request(),
        'recon_preserves_query_route': run_recon_preserves_query_route(),
        'recon_route_literal_preference': run_recon_prefers_route_literals_over_import_paths(),
        'recon_hint_root_preference': run_recon_prefers_hint_root_over_single_route_literal(),
        'capture_hint_rejects_route_specific_mode_only_match': run_capture_hint_rejects_route_specific_mode_only_match(),
        'author_applies_supervisor_packet': run_author_applies_supervisor_packet(),
        'author_keeps_interaction_start_route': run_author_keeps_interaction_start_route(),
        'verify_requests_supervisor_assessment': run_verify_requests_supervisor_assessment(),
        'verify_routes_unmeasured_visual_delta_to_recovery': run_verify_routes_unmeasured_visual_delta_to_recovery(),
        'verify_structured_evidence_without_screenshot': run_verify_structured_evidence_without_screenshot(),
        'verify_audio_requires_proof_evidence': run_verify_audio_requires_proof_evidence(),
        'verify_audio_rejects_failed_nested_proof_evidence': run_verify_audio_rejects_failed_nested_proof_evidence(),
        'verify_preserves_proof_evidence_on_capture_script_error': run_verify_preserves_proof_evidence_on_capture_script_error(),
        'verify_capture_retry': run_verify_capture_retry(),
        'remote_audit_verify_uses_default_capture_script': run_remote_audit_verify_uses_default_capture_script(),
        'remote_interaction_audit_verify_rejects_default_capture': run_remote_interaction_audit_verify_rejects_default_capture(),
        'verify_interaction_terminal_route_from_proof_evidence': run_verify_interaction_terminal_route_from_proof_evidence(),
        'verify_interaction_iife_structured_evidence_without_screenshot': run_verify_interaction_iife_structured_evidence_without_screenshot(),
        'verify_interaction_proof_evidence_overrides_stale_expected_path': run_verify_interaction_proof_evidence_overrides_stale_expected_path(),
        'verify_interaction_proof_plan_placeholder_uses_live_evidence': run_verify_interaction_proof_plan_placeholder_uses_live_evidence(),
        'verify_interaction_reverse_terminal_route_from_proof_evidence': run_verify_interaction_reverse_terminal_route_from_proof_evidence(),
        'verify_interaction_reverse_terminal_expected_url_from_nested_terminal_evidence': run_verify_interaction_reverse_terminal_expected_url_from_nested_terminal_evidence(),
        'verify_interaction_prose_route_noise_uses_proof_evidence': run_verify_interaction_prose_route_noise_uses_proof_evidence(),
        'verify_interaction_hash_terminal_route_from_proof_evidence': run_verify_interaction_hash_terminal_route_from_proof_evidence(),
        'verify_interaction_authored_query_hash_mismatch_blocks_with_evidence': run_verify_interaction_authored_query_hash_mismatch_blocks_with_evidence(),
        'verify_interaction_query_hash_pass_uses_proof_evidence_route': run_verify_interaction_query_hash_pass_uses_proof_evidence_route(),
        'verify_interaction_explicit_expected_url_blocks_dropped_terminal_route': run_verify_interaction_explicit_expected_url_blocks_dropped_terminal_route(),
        'verify_interaction_thrown_error_terminal_blocker': run_verify_interaction_thrown_error_terminal_blocker(),
        'verify_interaction_thrown_error_after_failed_evidence_terminal_blocker': run_verify_interaction_thrown_error_after_failed_evidence_terminal_blocker(),
        'verify_capture_retry_surfaces_script_timeout': run_verify_capture_retry_surfaces_script_timeout(),
        'missing_baseline_guard': run_verify_missing_baseline(),
        'ship_supervisor_gate': run_ship_missing_supervisor_gate(),
        'ship_blocks_unmeasured_visual_delta': run_ship_blocks_unmeasured_visual_delta(),
        'ship_structured_after_evidence': run_ship_accepts_structured_after_evidence(),
        'ship_discord_thread_target': run_ship_discord_thread_target(),
        'ship_filters_tool_noise_when_staging': run_ship_filters_tool_noise_when_staging(),
        'ship_preserves_literal_backticks_in_args': run_ship_preserves_literal_backticks_in_args(),
        'ship_resolves_real_pr_branch': run_ship_resolves_real_pr_branch(),
    }
    print(json.dumps(payload, indent=2))
