#!/usr/bin/env bash
set -euo pipefail

wrapper_version="${1:-latest}"
core_version="${2:-}"

openclaw_home="${OPENCLAW_HOME:-/root/.openclaw}"
plugin_package="@riddledc/openclaw-riddle-proof"
core_package="@riddledc/riddle-proof"
extension_root="${openclaw_home}/extensions/openclaw-riddle-proof"

replace_extension_root() {
  local root="$1"
  local spec="$2"

  if [[ ! -d "$root" ]]; then
    echo "skip missing extension root: $root"
    return
  fi

  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  npm pack "$spec" --pack-destination "$tmp" >/tmp/openclaw-riddle-proof-pack-name.txt
  local tarball
  tarball="$(cat /tmp/openclaw-riddle-proof-pack-name.txt)"
  tar -xzf "${tmp}/${tarball}" -C "$tmp"

  find "$root" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
  cp -a "${tmp}/package/." "$root"
  npm install --prefix "$root" --omit=dev
  npm prune --prefix "$root" --omit=dev
}

install_managed_projects() {
  local spec="$1"
  local project_root="${openclaw_home}/npm/projects"

  if [[ ! -d "$project_root" ]]; then
    echo "skip missing managed npm project root: $project_root"
    return
  fi

  while IFS= read -r -d '' project; do
    echo "updating managed project: $project"
    npm install --prefix "$project" "$spec"
  done < <(find "$project_root" -mindepth 1 -maxdepth 1 -type d -name 'riddledc-openclaw-riddle-proof-*' -print0)
}

install_shared_core() {
  local version="$1"
  local npm_root="${openclaw_home}/npm"

  if [[ -z "$version" || ! -d "$npm_root" ]]; then
    return
  fi

  npm install --prefix "$npm_root" "${core_package}@${version}"
}

restart_gateway() {
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemctl not found; restart OpenClaw gateway manually"
    return
  fi

  systemctl stop openclaw-gateway.service
  sleep 2
  if command -v fuser >/dev/null 2>&1; then
    fuser -k 18789/tcp || true
  fi
  systemctl start openclaw-gateway.service
  sleep 8
  systemctl is-active openclaw-gateway.service
}

wrapper_spec="${plugin_package}@${wrapper_version}"

replace_extension_root "$extension_root" "$wrapper_spec"
install_managed_projects "$wrapper_spec"
install_shared_core "$core_version"
restart_gateway

echo "extension root:"
npm ls --prefix "$extension_root" "$plugin_package" "$core_package" --depth=1 || true

project_root="${openclaw_home}/npm/projects"
if [[ -d "$project_root" ]]; then
  while IFS= read -r -d '' project; do
    echo "managed project: $project"
    npm ls --prefix "$project" "$plugin_package" "$core_package" --depth=1 || true
  done < <(find "$project_root" -mindepth 1 -maxdepth 1 -type d -name 'riddledc-openclaw-riddle-proof-*' -print0)
fi
