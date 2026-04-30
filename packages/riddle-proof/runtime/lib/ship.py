"""Ship: commit, create PR, post proof artifacts, wait for CI, mark ready, cleanup."""

import json, subprocess as sp, time, os, sys, re
import urllib.error
import urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from util import load_state, save_state, invoke, git


DISCORD_API = 'https://discord.com/api/v10'
SHIP_NOISE_PATHS = ('.codex', '.oc-smoke')
VISUAL_FIRST_MODES = {
    'visual', 'render', 'interaction', 'ui', 'layout', 'screenshot',
    'canvas', 'animation',
}


def read_json_file(path):
    try:
        with open(path) as f:
            return json.load(f)
    except:
        return {}


def openclaw_config_paths():
    paths = []
    if os.environ.get('OPENCLAW_CONFIG'):
        paths.append(os.environ['OPENCLAW_CONFIG'])
    if os.environ.get('OPENCLAW_HOME'):
        paths.append(os.path.join(os.environ['OPENCLAW_HOME'], 'openclaw.json'))
    paths.append(os.path.expanduser('~/.openclaw/openclaw.json'))
    paths.append('/root/.openclaw/openclaw.json')
    return paths


def resolve_discord_bot_token():
    for path in openclaw_config_paths():
        cfg = read_json_file(path)
        token = (((cfg.get('channels') or {}).get('discord') or {}).get('token') or '').strip()
        if token:
            return token
    if os.environ.get('DISCORD_BOT_TOKEN'):
        return os.environ['DISCORD_BOT_TOKEN'].strip()
    return ''


def status_path(line):
    text = str(line or '')
    if len(text) < 4:
        return ''
    path = text[3:].strip()
    if ' -> ' in path:
        path = path.split(' -> ', 1)[-1].strip()
    return path.strip('"')


def is_ship_noise_path(path):
    normalized = str(path or '').strip().lstrip('./')
    return any(normalized == noise or normalized.startswith(noise + '/') for noise in SHIP_NOISE_PATHS)


def committable_status_lines(status_stdout):
    return [
        line for line in str(status_stdout or '').splitlines()
        if line.strip()
        and not is_ship_noise_path(status_path(line))
    ]


def stage_committable_changes(repo_dir):
    git('git add -A -- .', repo_dir)
    for path in SHIP_NOISE_PATHS:
        sp.run(['git', 'reset', '--quiet', '--', path], cwd=repo_dir, capture_output=True, text=True)
    staged = sp.run(['git', 'diff', '--cached', '--name-only'], cwd=repo_dir, capture_output=True, text=True, timeout=30)
    return [
        line.strip() for line in staged.stdout.splitlines()
        if line.strip() and not is_ship_noise_path(line.strip())
    ]


def git_stdout(args, repo_dir, timeout=30):
    result = sp.run(['git'] + args, cwd=repo_dir, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise SystemExit('git ' + ' '.join(args) + ' failed: ' + result.stderr[:300])
    return result.stdout.strip()


def git_checked(args, repo_dir, timeout=120):
    result = sp.run(['git'] + args, cwd=repo_dir, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise SystemExit('git ' + ' '.join(args) + ' failed: ' + (result.stderr or result.stdout)[:300])
    return result


def gh_pr_create_args(title, body, branch):
    return [
        'gh', 'pr', 'create',
        '--draft',
        '--title', str(title or '').strip() or 'Riddle Proof change',
        '--body', str(body or ''),
        '--base', 'main',
        '--head', str(branch or ''),
    ]


def remote_branch_head(repo_dir, branch):
    result = sp.run(['git', 'ls-remote', 'origin', 'refs/heads/' + branch], cwd=repo_dir, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise SystemExit('Failed to inspect remote branch head: ' + result.stderr[:300])
    line = result.stdout.strip().splitlines()[0] if result.stdout.strip() else ''
    return line.split()[0] if line else ''


def fetch_remote_branch(repo_dir, branch):
    return sp.run(
        ['git', 'fetch', 'origin', '+refs/heads/' + branch + ':refs/remotes/origin/' + branch],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        timeout=90,
    )


def push_existing_pr_branch(repo_dir, branch, push_target):
    push = sp.run(
        ['git', 'push', 'origin', push_target, '--force-with-lease=refs/heads/' + branch],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if push.returncode == 0:
        return push, {'mode': 'force-with-lease', 'reconciled': False}

    stderr = push.stderr or ''
    if 'non-fast-forward' not in stderr and 'stale info' not in stderr and 'fetch first' not in stderr:
        return push, {'mode': 'force-with-lease', 'reconciled': False}

    fetch = fetch_remote_branch(repo_dir, branch)
    if fetch.returncode != 0:
        return push, {
            'mode': 'force-with-lease',
            'reconciled': False,
            'fetch_error': fetch.stderr[:300],
        }
    expected_remote_head = remote_branch_head(repo_dir, branch)
    if not expected_remote_head:
        return push, {'mode': 'force-with-lease', 'reconciled': False}

    retry = sp.run(
        ['git', 'push', 'origin', push_target, '--force-with-lease=refs/heads/' + branch + ':' + expected_remote_head],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        timeout=120,
    )
    return retry, {
        'mode': 'force-with-lease-reconciled',
        'reconciled': retry.returncode == 0,
        'previous_remote_head': expected_remote_head,
    }


def record_ship_head(state, repo_dir, branch, push_info):
    local_head = git_stdout(['rev-parse', 'HEAD'], repo_dir)
    remote_head = remote_branch_head(repo_dir, branch)
    state['ship_commit'] = local_head
    state['ship_remote_head'] = remote_head
    state['ship_push'] = push_info
    save_state(state)
    if remote_head != local_head:
        raise SystemExit(
            'Ship exact-commit check failed: local verified commit '
            + local_head
            + ' but remote '
            + branch
            + ' is '
            + (remote_head or '(missing)')
        )
    return {'local_head': local_head, 'remote_head': remote_head}


def truthy(value):
    return str(value or '').strip().lower() in ('1', 'true', 'yes', 'y', 'on')


def is_temp_proof_branch(branch):
    return str(branch or '').strip().startswith('riddle-proof/')


def generated_ship_branch(state):
    source = state.get('change_request') or state.get('commit_message') or 'proof-change'
    slug = re.sub(r'[^a-z0-9]+', '-', str(source).lower())[:42].strip('-') or 'proof-change'
    token = re.sub(r'[^a-z0-9]+', '', str(state.get('run_id') or '').lower())[-6:]
    if not token:
        token = str(int(time.time()))[-6:]
    return 'agent/openclaw/' + slug + '-' + token


def pr_head_branch(repo_dir, pr_ref):
    ref = str(pr_ref or '').strip()
    if not ref:
        return ''
    result = sp.run(
        ['gh', 'pr', 'view', ref, '--json', 'headRefName', '--jq', '.headRefName'],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        return ''
    return result.stdout.strip()


def resolve_ship_branch(state, repo_dir):
    branch = str(state.get('ship_target_branch') or state.get('target_branch') or state.get('branch') or '').strip()
    pr_ref = str(state.get('pr_number') or state.get('pr_url') or '').strip()
    if pr_ref:
        pr_branch = pr_head_branch(repo_dir, pr_ref)
        if pr_branch:
            branch = pr_branch
    after_branch = str(state.get('after_worktree_branch') or '').strip()
    if is_temp_proof_branch(branch) or (after_branch and branch == after_branch):
        if not pr_ref:
            original_branch = branch
            branch = generated_ship_branch(state)
            state['ship_branch_recovered_from'] = original_branch
            state['ship_branch_recovery_reason'] = 'temporary_proof_branch_without_pr'
        else:
            raise SystemExit(
                'Refusing to ship to temporary proof branch: '
                + (branch or '(empty)')
                + '. Expected the real PR head branch; pr_url='
                + str(state.get('pr_url') or '(none)')
            )
    if is_temp_proof_branch(branch):
        raise SystemExit(
            'Refusing to ship to temporary proof branch: '
            + (branch or '(empty)')
            + '. Expected the real PR head branch; pr_url='
            + str(state.get('pr_url') or '(none)')
        )
    if not branch:
        raise SystemExit('No target branch available for ship.')
    state['branch'] = branch
    state['target_branch'] = branch
    state['ship_target_branch'] = branch
    save_state(state)
    return branch


def compact_lines(lines, limit=1900):
    text = '\n'.join([line for line in lines if line]).strip()
    if len(text) <= limit:
        return text
    return text[:limit - 20].rstrip() + '\n...'


def first_url_from_command_output(*parts):
    for part in parts:
        for line in str(part or '').splitlines():
            text = line.strip()
            if text.startswith('http://') or text.startswith('https://'):
                return text
    return ''


def build_ship_report(state, marked_ready=None):
    branch = state.get('target_branch') or state.get('branch') or ''
    if marked_ready is None:
        marked_ready = state.get('marked_ready')
    return {
        'pr_url': state.get('pr_url', ''),
        'pr_branch': branch,
        'branch': branch,
        'shipped_commit': state.get('ship_commit', ''),
        'ship_remote_head': state.get('ship_remote_head', ''),
        'marked_ready': bool(marked_ready),
        'left_draft': bool(state.get('left_draft')),
        'ci_status': state.get('ci_status', ''),
        'proof_comment_url': state.get('proof_comment_url', ''),
        'proof_assessment_comment_url': state.get('proof_assessment_comment_url', ''),
        'before_artifact_url': state.get('before_cdn', ''),
        'prod_artifact_url': state.get('prod_cdn', ''),
        'after_artifact_url': state.get('after_cdn', ''),
    }


def record_ship_report(state, marked_ready=None):
    state['ship_report'] = build_ship_report(state, marked_ready)
    save_state(state)
    return state['ship_report']


def proof_assessment_is_ready(state):
    assessment = state.get('proof_assessment') or {}
    source = str(assessment.get('source') or state.get('proof_assessment_source') or '').strip().lower()
    return (
        source in ('supervising_agent', 'supervisor')
        and assessment.get('decision') == 'ready_to_ship'
        and not visual_delta_ship_blocker(state)
    )


def effective_merge_recommendation(state):
    if proof_assessment_is_ready(state):
        return 'ready_to_ship (supervising-agent proof assessment)'
    return state.get('merge_recommendation') or 'manual review required'


def after_evidence_bundle(state):
    bundle = state.get('evidence_bundle') or {}
    if not isinstance(bundle, dict):
        return {}
    after = bundle.get('after') or {}
    return after if isinstance(after, dict) else {}


def normalized_verification_mode(state):
    bundle = state.get('evidence_bundle') or {}
    if isinstance(bundle, dict) and str(bundle.get('verification_mode') or '').strip():
        return str(bundle.get('verification_mode')).strip().lower()
    return str(state.get('verification_mode') or 'proof').strip().lower() or 'proof'


def visual_delta_required_for_ship(state):
    bundle = state.get('evidence_bundle') or {}
    contract = bundle.get('artifact_contract') if isinstance(bundle, dict) else {}
    required = contract.get('required') if isinstance(contract, dict) else {}
    if isinstance(required, dict) and required.get('visual_delta') is True:
        return True
    return normalized_verification_mode(state) in VISUAL_FIRST_MODES


def visual_delta_for_state(state):
    after = after_evidence_bundle(state)
    visual_delta = after.get('visual_delta') if isinstance(after, dict) else None
    if isinstance(visual_delta, dict):
        return visual_delta
    request = state.get('proof_assessment_request') or {}
    visual_delta = request.get('visual_delta') if isinstance(request, dict) else None
    return visual_delta if isinstance(visual_delta, dict) else {}


def visual_delta_ship_blocker(state):
    if not visual_delta_required_for_ship(state):
        return ''
    visual_delta = visual_delta_for_state(state)
    if visual_delta.get('status') == 'measured' and visual_delta.get('passed') is True:
        return ''
    status = str(visual_delta.get('status') or 'missing')
    if status == 'unmeasured':
        return 'visual_delta.status=unmeasured blocks ready_to_ship for visual/UI proof'
    if status == 'measured' and visual_delta.get('passed') is False:
        return 'visual_delta.status=measured but visual_delta.passed=false blocks ready_to_ship for visual/UI proof'
    reason = str(visual_delta.get('reason') or '').strip()
    if reason:
        return f'visual_delta.status={status} blocks ready_to_ship for visual/UI proof: {reason}'
    return f'visual_delta.status={status} blocks ready_to_ship for visual/UI proof'


def state_has_after_evidence(state):
    if (state.get('after_cdn') or '').strip():
        return True
    after = after_evidence_bundle(state)
    observation = after.get('observation') or {}
    supporting = after.get('supporting_artifacts') or {}
    if not isinstance(observation, dict) or not isinstance(supporting, dict):
        return False
    return bool(
        observation.get('valid')
        and (
            supporting.get('has_structured_payload')
            or supporting.get('proof_evidence_present')
            or observation.get('telemetry_ready')
        )
    )


def evidence_bundle_text(state):
    bundle = state.get('evidence_bundle') or {}
    if not isinstance(bundle, dict):
        return ''
    after = after_evidence_bundle(state)
    observation = after.get('observation') or {}
    supporting = after.get('supporting_artifacts') or {}
    if not isinstance(observation, dict):
        observation = {}
    if not isinstance(supporting, dict):
        supporting = {}

    lines = [
        'Verification mode: ' + str(bundle.get('verification_mode') or state.get('verification_mode') or 'proof'),
        'Expected path: ' + str(bundle.get('expected_path') or ''),
        'After observation: ' + str(observation.get('reason') or 'unknown'),
    ]
    semantic_context = bundle.get('semantic_context') or {}
    if isinstance(semantic_context, dict):
        route = semantic_context.get('route') or {}
        after_semantic = semantic_context.get('after') or {}
        if isinstance(route, dict):
            route_bits = []
            if route.get('before_observed_path'):
                route_bits.append('before=' + str(route.get('before_observed_path')))
            if route.get('prod_observed_path'):
                route_bits.append('prod=' + str(route.get('prod_observed_path')))
            if route.get('after_observed_path'):
                route_bits.append('after=' + str(route.get('after_observed_path')))
            if route_bits:
                lines.append('Observed routes: ' + ', '.join(route_bits))
        if isinstance(after_semantic, dict):
            headings = after_semantic.get('headings') or []
            buttons = after_semantic.get('buttons') or []
            if headings:
                lines.append('After headings: ' + '; '.join(str(item) for item in headings[:6]))
            if buttons:
                lines.append('After buttons: ' + '; '.join(str(item) for item in buttons[:8]))
    basis = []
    if supporting.get('image_outputs'):
        basis.append('images=' + ', '.join(str((item or {}).get('name') or '') for item in supporting.get('image_outputs', [])[:8]))
    if supporting.get('data_outputs'):
        basis.append('data=' + ', '.join(str((item or {}).get('name') or '') for item in supporting.get('data_outputs', [])[:8]))
    if supporting.get('structured_result_keys'):
        basis.append('result_keys=' + ', '.join(str(item) for item in supporting.get('structured_result_keys', [])[:8]))
    if supporting.get('proof_evidence_present'):
        basis.append('proofEvidence=yes')
    if basis:
        lines.append('Evidence basis: ' + '; '.join(basis))
    visual_delta = after.get('visual_delta') or {}
    if isinstance(visual_delta, dict) and visual_delta.get('status') and visual_delta.get('status') != 'not_applicable':
        try:
            lines.append('Visual delta: ' + json.dumps(visual_delta, sort_keys=True)[:900])
        except Exception:
            lines.append('Visual delta: ' + str(visual_delta)[:900])
    sample = str(supporting.get('proof_evidence_sample') or '').strip()
    if sample:
        lines.append('Proof evidence sample: ' + sample[:1200])
    return '\n'.join([line for line in lines if line.strip()])


def proof_assessment_text(state):
    assessment = state.get('proof_assessment') or {}
    if not assessment:
        return ''
    lines = [
        'Decision: ' + str(assessment.get('decision') or 'unknown'),
    ]
    summary = str(assessment.get('summary') or '').strip()
    if summary:
        lines.append('Summary: ' + summary)
    reasons = assessment.get('reasons') or []
    if reasons:
        lines.append('Reasons:')
        for reason in reasons:
            lines.append('- ' + str(reason))
    return '\n'.join(lines)


def discord_message_target(state):
    parent_channel_id = str(state.get('discord_channel') or '').strip()
    thread_id = str(state.get('discord_thread_id') or '').strip()
    source_message_id = str(state.get('discord_message_id') or '').strip()
    target_channel_id = thread_id or parent_channel_id
    if not target_channel_id:
        return {
            'ok': False,
            'reason': 'no discord_channel or discord_thread_id in state',
            'parent_channel_id': parent_channel_id,
            'thread_id': thread_id,
            'source_message_id': source_message_id,
        }

    target = {
        'ok': True,
        'target_channel_id': target_channel_id,
        'parent_channel_id': parent_channel_id,
        'thread_id': thread_id,
        'source_message_id': source_message_id,
        'discord_source_url': str(state.get('discord_source_url') or '').strip(),
    }
    if source_message_id and parent_channel_id and not thread_id:
        target['message_reference'] = {
            'message_id': source_message_id,
            'channel_id': parent_channel_id,
            'fail_if_not_exists': False,
        }
    return target


def post_discord_ready_message(state, marked_ready):
    target = discord_message_target(state)
    if not target.get('ok'):
        return {'ok': False, 'skipped': True, **target}
    target_channel_id = target['target_channel_id']

    previous = state.get('discord_notification') or {}
    if previous.get('ok') and previous.get('pr_url') == state.get('pr_url'):
        return {'ok': True, 'skipped': True, 'reason': 'already sent', 'message_id': previous.get('message_id', '')}

    token = resolve_discord_bot_token()
    if not token:
        return {'ok': False, 'skipped': True, 'reason': 'no Discord bot token available'}

    ci_status = str(state.get('ci_status') or '').strip()
    if state.get('left_draft'):
        ci_line = 'Proof passed; PR was intentionally left draft.'
    elif marked_ready and ci_status == 'no_checks':
        ci_line = 'No CI checks were found; proof passed and the PR was marked ready.'
    elif marked_ready:
        ci_line = 'CI passed and the PR was marked ready.'
    else:
        ci_line = 'CI was not confirmed green yet; review the PR checks before merging.'
    proof_bits = []
    if state.get('before_cdn'):
        proof_bits.append('before: ' + state['before_cdn'])
    if state.get('prod_cdn'):
        proof_bits.append('prod: ' + state['prod_cdn'])
    if state.get('after_cdn'):
        proof_bits.append('after: ' + state['after_cdn'])
    elif state_has_after_evidence(state):
        proof_bits.append('after: structured evidence bundle')

    lines = [
        'Proofed change is ready for review.',
        'PR: ' + state.get('pr_url', ''),
        'Status: ' + ci_line,
        'Change: ' + state.get('change_request', ''),
        'Proof assessment: ' + effective_merge_recommendation(state),
    ]
    if proof_bits:
        lines.append('Proof: ' + ' | '.join(proof_bits))
    if state.get('proof_summary'):
        lines.append('Proof summary: ' + state['proof_summary'])

    payload_obj = {'content': compact_lines(lines)}
    if target.get('message_reference'):
        payload_obj['message_reference'] = target['message_reference']
    payload = json.dumps(payload_obj).encode('utf-8')
    req = urllib.request.Request(
        DISCORD_API + '/channels/' + target_channel_id + '/messages',
        data=payload,
        headers={
            'Authorization': 'Bot ' + token,
            'Content-Type': 'application/json',
            'User-Agent': 'DiscordBot (https://openclaw.dev, 1.0)',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            body = res.read().decode('utf-8')
            data = json.loads(body) if body else {}
            return {
                'ok': 200 <= res.status < 300,
                'status': res.status,
                'channel_id': target_channel_id,
                'parent_channel_id': target.get('parent_channel_id', ''),
                'thread_id': target.get('thread_id', ''),
                'source_message_id': target.get('source_message_id', ''),
                'message_id': data.get('id', ''),
                'pr_url': state.get('pr_url', ''),
            }
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')[:500]
        return {'ok': False, 'status': e.code, 'channel_id': target_channel_id, 'thread_id': target.get('thread_id', ''), 'error': body}
    except Exception as e:
        return {'ok': False, 'status': 0, 'channel_id': target_channel_id, 'thread_id': target.get('thread_id', ''), 'error': str(e)[:500]}


def record_discord_notification(state, marked_ready):
    discord_notification = post_discord_ready_message(state, marked_ready)
    state['discord_notification'] = discord_notification
    save_state(state)
    if discord_notification.get('ok') and not discord_notification.get('skipped'):
        print('Discord notification posted: ' + discord_notification.get('message_id', ''))
    elif discord_notification.get('skipped'):
        print('Discord notification skipped: ' + discord_notification.get('reason', 'unknown'))
    else:
        print('Warning: Discord notification failed: ' + str(discord_notification.get('error') or discord_notification.get('reason') or discord_notification.get('status') or 'unknown')[:200])
    return discord_notification


def post_assessment_comment_if_needed(state, repo_dir, pr_num):
    if state.get('proof_assessment_comment_posted'):
        return {'ok': True, 'skipped': True, 'reason': 'already posted'}
    assessment_text = proof_assessment_text(state)
    if not assessment_text:
        return {'ok': False, 'skipped': True, 'reason': 'no proof assessment text'}
    if not pr_num:
        return {'ok': False, 'skipped': True, 'reason': 'no PR number'}

    body = '## Riddle Proof - Supervising Assessment\n\n'
    body += 'The supervising agent judged this proof ready to ship.\n\n'
    body += '```\n' + assessment_text + '\n```\n'
    comment = sp.run(['gh', 'pr', 'comment', pr_num, '--body', body],
                     cwd=repo_dir, capture_output=True, text=True, timeout=90)
    result = {'ok': comment.returncode == 0}
    if comment.returncode == 0:
        state['proof_assessment_comment_posted'] = True
        url = first_url_from_command_output(comment.stdout, comment.stderr)
        if url:
            result['url'] = url
            state['proof_assessment_comment_url'] = url
        print('Supervising proof assessment comment posted.')
    else:
        result['error'] = comment.stderr[:300]
        print('Warning: supervising proof assessment comment failed: ' + comment.stderr[:200])
    state['proof_assessment_comment'] = result
    save_state(state)
    return result


s = load_state()

before_cdn = s.get('before_cdn', '')
prod_cdn = s.get('prod_cdn', '')
after_cdn = s.get('after_cdn', '')
reference = s.get('requested_reference') or s.get('reference', 'before')
prod_url = (s.get('prod_url') or '').strip()
proof_assessment = s.get('proof_assessment') or {}
proof_source = str(proof_assessment.get('source') or s.get('proof_assessment_source') or '').strip().lower()
if not state_has_after_evidence(s):
    raise SystemExit('No after evidence in state. Run verify first.')
if s.get('verify_status') != 'evidence_captured':
    raise SystemExit('verify_status must be evidence_captured before ship.')
if reference in ('before', 'both') and not before_cdn:
    raise SystemExit('before_cdn is required before ship. Run recon/verify again and preserve the approved baseline.')
if reference in ('prod', 'both'):
    if not prod_url:
        raise SystemExit('prod_url is required when reference=' + reference + ' before ship.')
    if not prod_cdn:
        raise SystemExit('prod_cdn is required before ship. Run recon/verify again and preserve the approved prod baseline.')
visual_delta_blocker = visual_delta_ship_blocker(s)
if visual_delta_blocker:
    raise SystemExit(visual_delta_blocker + '. Rerun verify with measured before/after visual delta or return a non-shipping proof assessment.')
if proof_source not in ('supervising_agent', 'supervisor') or proof_assessment.get('decision') != 'ready_to_ship':
    raise SystemExit('Supervising-agent proof_assessment.decision=ready_to_ship is required before ship.')

s['merge_recommendation'] = effective_merge_recommendation(s)
s['proof_decision'] = proof_assessment.get('decision')
save_state(s)

repo_dir = s['repo_dir']
existing_notification = s.get('discord_notification') or {}
existing_after_dir = (s.get('after_worktree') or s.get('repo_dir') or '').strip()
if s.get('finalized') and s.get('pr_url') and existing_after_dir and not os.path.exists(existing_after_dir):
    marked_ready = bool(s.get('marked_ready'))
    pr_num = s.get('pr_number') or s.get('pr_url', '').rstrip('/').split('/')[-1]
    post_assessment_comment_if_needed(s, repo_dir, pr_num)
    if not existing_notification.get('ok'):
        record_discord_notification(s, marked_ready)
    else:
        print('Discord notification already posted: ' + str(existing_notification.get('message_id') or 'yes'))
    s['stage'] = 'ship'
    s['active_checkpoint'] = 'ship_review'
    report = record_ship_report(s, marked_ready)
    save_state(s)
    print('Ship already finalized; synced final ship side effects without worktree.')
    print(json.dumps({
        'ok': True,
        'pr_url': s.get('pr_url', ''),
        'pr_branch': report.get('pr_branch', ''),
        'shipped_commit': report.get('shipped_commit', ''),
        'marked_ready': marked_ready,
        'left_draft': bool(s.get('left_draft')),
        'ci_status': s.get('ci_status', ''),
        'proof_comment_url': report.get('proof_comment_url', ''),
        'before_artifact_url': report.get('before_artifact_url', ''),
        'after_artifact_url': report.get('after_artifact_url', ''),
        'finalized_retry': True,
        'proof_assessment_comment_posted': bool(s.get('proof_assessment_comment_posted')),
        'discord_notification': s.get('discord_notification'),
        'ship_report': report,
    }))
    raise SystemExit(0)

after_dir = s.get('after_worktree', '').strip() or repo_dir
branch = resolve_ship_branch(s, repo_dir)
push_target = 'HEAD:refs/heads/' + branch
reviewer = s.get('reviewer', 'davisdiehl')
leave_draft = truthy(s.get('leave_draft'))
s['left_draft'] = False
s['ci_status'] = ''
save_state(s)

# Commit and push from after worktree
st = git('git status --porcelain', after_dir)
lines = committable_status_lines(st.stdout)

if lines:
    staged_paths = stage_committable_changes(after_dir)
    if not staged_paths:
        print('Only ship-noise paths changed; skipping commit.')
    if s.get('pr_url'):
        if staged_paths:
            git_checked(['commit', '--amend', '--no-edit'], after_dir)
        push, push_info = push_existing_pr_branch(after_dir, branch, push_target)
    else:
        if staged_paths:
            git_checked(['commit', '-m', s['commit_message']], after_dir)
        push = sp.run(
            ['git', 'push', 'origin', push_target],
            cwd=after_dir,
            capture_output=True,
            text=True,
        )
        push_info = {'mode': 'normal', 'reconciled': False}
    if push.returncode != 0:
        raise SystemExit('Failed to push branch: ' + push.stderr[:300])
    pushed = record_ship_head(s, after_dir, branch, push_info)
    print('Committed and pushed verified commit: ' + pushed['local_head'])
else:
    if s.get('pr_url'):
        push, push_info = push_existing_pr_branch(after_dir, branch, push_target)
    else:
        push = sp.run(
            ['git', 'push', 'origin', push_target],
            cwd=after_dir,
            capture_output=True,
            text=True,
        )
        push_info = {'mode': 'normal', 'reconciled': False}
    if push.returncode != 0:
        raise SystemExit('Failed to push branch: ' + push.stderr[:300])
    pushed = record_ship_head(s, after_dir, branch, push_info)
    print('No uncommitted changes. Branch pushed at verified commit: ' + pushed['local_head'])

# Create PR if needed
if not s.get('pr_url'):
    q = sp.run(['gh', 'pr', 'list', '--head', branch, '--json', 'url,number', '-q', '.[0]'],
               cwd=repo_dir, capture_output=True, text=True)
    pr_url = ''
    if q.stdout.strip():
        try:
            pr = json.loads(q.stdout.strip())
            pr_url = pr.get('url', '')
        except:
            pass
    if not pr_url:
        c = sp.run(gh_pr_create_args(s.get('commit_message', ''), s.get('change_request', ''), branch),
                    cwd=repo_dir, capture_output=True, text=True)
        if c.returncode != 0:
            raise SystemExit('Failed to create PR: ' + (c.stderr or c.stdout)[:500])
        pr_url = c.stdout.strip().splitlines()[-1].strip() if c.returncode == 0 else ''
    s['pr_url'] = pr_url
    s['pr_number'] = pr_url.rstrip('/').split('/')[-1] if pr_url else ''
    save_state(s)
    print('PR: ' + pr_url)

pr_num = s.get('pr_number', '')
if not pr_num:
    raise SystemExit('No PR created. Check gh auth.')

# Post proof comment on PR
body = '## Riddle Proof — Proof of Fix\n\n'
body += '**Goal:** ' + s.get('change_request', '') + '\n\n'
if s.get('success_criteria'):
    body += '**Success criteria:** ' + s['success_criteria'] + '\n\n'
body += '**Verification mode:** ' + s.get('verification_mode', 'proof') + '\n\n'
body += '**Merge recommendation:** ' + effective_merge_recommendation(s) + '\n\n'
if before_cdn:
    body += '### Before\n![' + 'before' + '](' + before_cdn + ')\n\n'
if prod_cdn:
    body += '### Prod\n![' + 'prod' + '](' + prod_cdn + ')\n\n'
if after_cdn:
    body += '### After\n![' + 'after' + '](' + after_cdn + ')\n\n'
else:
    body += '### After evidence\nNo after screenshot was captured for this verification mode; structured evidence is summarized below.\n\n'
bundle_text = evidence_bundle_text(s)
if bundle_text:
    body += '### Evidence bundle\n```\n' + bundle_text + '\n```\n\n'
assessment_text = proof_assessment_text(s)
if assessment_text:
    body += '### Supervising proof assessment\n```\n' + assessment_text + '\n```\n\n'
body += '### Proof summary\n```\n' + (s.get('proof_summary') or 'No summary') + '\n```\n\n'
body += '### Assertion status\n' + s.get('assertion_status', 'unknown') + '\n\n'
notes = s.get('evidence_notes') or []
if notes:
    body += '### Review notes\n'
    for note in notes:
        body += '- ' + note + '\n'
    body += '\n'
body += '---\n*Evidence captured by [Riddle Proof](https://riddledc.com)*\n'

comment = sp.run(['gh', 'pr', 'comment', pr_num, '--body', body],
                 cwd=repo_dir, capture_output=True, text=True, timeout=90)
if comment.returncode != 0:
    print('Warning: PR comment failed: ' + comment.stderr[:200])
else:
    url = first_url_from_command_output(comment.stdout, comment.stderr)
    s['proof_comment_posted'] = True
    if url:
        s['proof_comment_url'] = url
    s['proof_assessment_comment_posted'] = True
    save_state(s)

# Wait for CI, then mark ready + assign reviewer unless explicitly held draft.
marked_ready = False
if leave_draft:
    s['left_draft'] = True
    s['ci_status'] = 'left_draft'
    save_state(s)
    print('PR left draft because leave_draft=true.')
else:
    for attempt in range(30):
        checks = sp.run(['gh', 'pr', 'checks', pr_num, '--json', 'state'],
                        cwd=repo_dir, capture_output=True, text=True, timeout=30)
        if checks.returncode == 0:
            try:
                states = json.loads(checks.stdout)
                if not states:
                    s['ci_status'] = 'no_checks'
                    save_state(s)
                    r = sp.run(['gh', 'pr', 'ready', pr_num],
                               cwd=repo_dir, capture_output=True, text=True, timeout=30)
                    if r.returncode == 0:
                        marked_ready = True
                    sp.run(['gh', 'pr', 'edit', pr_num, '--add-reviewer', reviewer],
                           cwd=repo_dir, capture_output=True, text=True, timeout=30)
                    break
                all_done = all(c.get('state') in ('SUCCESS', 'NEUTRAL', 'SKIPPED') for c in states)
                any_fail = any(c.get('state') == 'FAILURE' for c in states)
                if any_fail:
                    s['ci_status'] = 'failed'
                    save_state(s)
                    print('CI failed. Not marking ready.')
                    break
                if all_done:
                    s['ci_status'] = 'passed'
                    save_state(s)
                    r = sp.run(['gh', 'pr', 'ready', pr_num],
                               cwd=repo_dir, capture_output=True, text=True, timeout=30)
                    if r.returncode == 0:
                        marked_ready = True
                    sp.run(['gh', 'pr', 'edit', pr_num, '--add-reviewer', reviewer],
                           cwd=repo_dir, capture_output=True, text=True, timeout=30)
                    break
            except:
                pass
        else:
            no_checks_text = (checks.stderr + checks.stdout).lower()
            if 'no checks' in no_checks_text or 'no check' in no_checks_text:
                s['ci_status'] = 'no_checks'
                save_state(s)
                r = sp.run(['gh', 'pr', 'ready', pr_num],
                           cwd=repo_dir, capture_output=True, text=True, timeout=30)
                if r.returncode == 0:
                    marked_ready = True
                sp.run(['gh', 'pr', 'edit', pr_num, '--add-reviewer', reviewer],
                       cwd=repo_dir, capture_output=True, text=True, timeout=30)
                break
        time.sleep(10)

if not marked_ready and not leave_draft:
    print('Warning: could not mark PR ready after CI poll')

record_discord_notification(s, marked_ready)

# Clean up
for pid_key in ('before_preview_id', 'after_preview_id'):
    pid = s.get(pid_key, '')
    if pid:
        invoke('riddle_preview_delete', {'id': pid}, timeout=30)
        print('Cleaned up preview: ' + pid)

for wt_key in ('before_worktree', 'after_worktree'):
    wt = s.get(wt_key, '').strip()
    if wt and os.path.exists(wt):
        sp.run('git worktree remove --force ' + wt, shell=True, cwd=repo_dir, capture_output=True)
        print('Cleaned up worktree: ' + wt)
sp.run('git worktree prune', shell=True, cwd=repo_dir, capture_output=True)

after_worktree_branch = s.get('after_worktree_branch', '').strip()
if after_worktree_branch:
    sp.run(['git', 'branch', '-D', after_worktree_branch], cwd=repo_dir, capture_output=True, text=True)

s['finalized'] = True
s['marked_ready'] = marked_ready
s['left_draft'] = bool(s.get('left_draft'))
s['stage'] = 'ship'
s['after_worktree_branch'] = ''
report = record_ship_report(s, marked_ready)
save_state(s)

print()
print('PR: ' + s.get('pr_url', ''))
print('Proof comment posted: yes')
if report.get('proof_comment_url'):
    print('Proof comment URL: ' + report.get('proof_comment_url', ''))
print('Marked ready: ' + str(marked_ready))
print(json.dumps({
    'ok': True,
    'pr_url': s.get('pr_url', ''),
    'pr_branch': report.get('pr_branch', ''),
    'shipped_commit': report.get('shipped_commit', ''),
    'marked_ready': marked_ready,
    'left_draft': bool(s.get('left_draft')),
    'ci_status': s.get('ci_status', ''),
    'proof_comment_url': report.get('proof_comment_url', ''),
    'before_artifact_url': report.get('before_artifact_url', ''),
    'prod_artifact_url': report.get('prod_artifact_url', ''),
    'after_artifact_url': report.get('after_artifact_url', ''),
    'ship_report': report,
}))
