name: riddle-proof-setup
# Riddle Proof — Setup
# Creates worktrees, installs deps, validates args.
# Run once before recon/verify/ship.
# Requires RIDDLE_PROOF_DIR env var set to the runtime directory.

args:
  repo:
    default: ""
  branch:
    default: ""
  change_request:
    default: ""
  commit_message:
    default: ""
  prod_url:
    default: ""
  capture_script:
    default: ""
    description: "Optional during setup. Add it before recon/verify once the proof target is clear."
  success_criteria:
    default: ""
    description: "Plain-English definition of what counts as fixed"
  assertions_json:
    default: ""
    description: "Optional JSON object/array of checks to satisfy"
  verification_mode:
    default: "proof"
    description: "proof, visual, interaction, render, data, or custom label"
  reference:
    default: "both"
    description: "What to compare against: prod, before, or both"
  base_branch:
    default: "main"
    description: "Target branch for PR base"
  before_ref:
    default: ""
    description: "Detached baseline ref for before preview; defaults to origin/<base_branch>"
  allow_static_preview_fallback:
    default: "false"
    description: "Allow server mode to fall back to static preview; keep false for routed/interactive apps"
  context:
    default: ""
  reviewer:
    default: "davisdiehl"
  mode:
    default: "server"
    description: "static or server"
  build_command:
    default: "npm run build"
  build_output:
    default: "build"
    description: "Build output directory (static mode only)"
  server_image:
    default: "node:20-slim"
  server_command:
    default: "npm start"
  server_port:
    default: "3000"
  server_path:
    default: ""
  use_auth:
    default: ""
    description: "Set to 'true' to auto-fetch Cognito auth tokens"
  auth_localStorage_json:
    default: ""
    description: "JSON object of localStorage entries to inject before page load"
  auth_cookies_json:
    default: ""
    description: "JSON object or array of cookies to inject before page load"
  auth_headers_json:
    default: ""
    description: "JSON object of request headers to use during proof capture"
  color_scheme:
    default: ""
    description: "Browser color scheme: 'dark' or 'light' (applied before page load)"
  wait_for_selector:
    default: ""
    description: "CSS selector to wait for before capturing screenshot"
  discord_channel:
    default: ""
  discord_thread_id:
    default: ""
  discord_message_id:
    default: ""
  discord_source_url:
    default: ""

steps:

  - id: preflight
    command: |
      python3 << 'PYEOF'
      import json, os
      raw_server_path = """${server_path}""".strip()
      args = {
          'mode': """${mode}""".strip() or 'server',
          'reference': """${reference}""".strip() or 'both',
          'repo': """${repo}""".strip(),
          'branch': """${branch}""".strip(),
          'change_request': """${change_request}""".strip(),
          'commit_message': """${commit_message}""".strip(),
          'prod_url': """${prod_url}""".strip(),
          'capture_script': """${capture_script}""".strip(),
          'success_criteria': """${success_criteria}""".strip(),
          'assertions_json': """${assertions_json}""".strip(),
          'verification_mode': """${verification_mode}""".strip() or 'proof',
          'context': """${context}""".strip(),
          'reviewer': """${reviewer}""".strip() or 'davisdiehl',
          'base_branch': """${base_branch}""".strip() or 'main',
          'before_ref': """${before_ref}""".strip(),
          'allow_static_preview_fallback': """${allow_static_preview_fallback}""".strip(),
          'build_command': """${build_command}""".strip() or 'npm run build',
          'build_output': """${build_output}""".strip() or 'build',
          'server_image': """${server_image}""".strip() or 'node:20-slim',
          'server_command': """${server_command}""".strip() or 'npm start',
          'server_port': """${server_port}""".strip() or '3000',
          'server_path': raw_server_path,
          'server_path_source': 'user' if raw_server_path else '',
          'use_auth': """${use_auth}""".strip(),
          'auth_localStorage_json': """${auth_localStorage_json}""".strip(),
          'auth_cookies_json': """${auth_cookies_json}""".strip(),
          'auth_headers_json': """${auth_headers_json}""".strip(),
          'color_scheme': """${color_scheme}""".strip(),
          'wait_for_selector': """${wait_for_selector}""".strip(),
          'discord_channel': """${discord_channel}""".strip(),
          'discord_thread_id': """${discord_thread_id}""".strip(),
          'discord_message_id': """${discord_message_id}""".strip(),
          'discord_source_url': """${discord_source_url}""".strip(),
      }
      args_file = os.environ.get('RIDDLE_PROOF_ARGS_FILE', '/tmp/riddle-proof-args.json')
      with open(args_file, 'w') as f:
          json.dump(args, f, indent=2)
      PYEOF
      RP="${RIDDLE_PROOF_DIR:-/root/.openclaw/extensions/openclaw-riddle-proof/node_modules/@riddledc/riddle-proof/runtime}"
      python3 "${RP}/lib/preflight.py"

  - id: setup
    command: |
      RP="${RIDDLE_PROOF_DIR:-/root/.openclaw/extensions/openclaw-riddle-proof/node_modules/@riddledc/riddle-proof/runtime}"
      python3 "${RP}/lib/setup.py"
