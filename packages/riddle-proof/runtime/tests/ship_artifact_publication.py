import json
import os
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SHIP = ROOT / "runtime" / "lib" / "ship.py"


def run(args, cwd, env=None):
    result = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise AssertionError(
            f"{' '.join(args)} failed\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def write_fake_gh(path):
    path.write_text(
        """#!/usr/bin/env python3
import json
import os
import sys

args = sys.argv[1:]
if args[:3] == ["repo", "view", "--json"]:
    if "isPrivate" in args:
        print("true")
    else:
        print("example/test-repo")
    raise SystemExit(0)
if args and args[0] == "image":
    image_paths = [arg for arg in args[1:] if not arg.startswith("--") and arg != "example/test-repo"]
    for index, image_path in enumerate(image_paths):
        print(f"![{os.path.basename(image_path)}](https://github.com/user-attachments/assets/00000000-0000-4000-8000-{index:012d})")
    raise SystemExit(0)
if args[:2] == ["pr", "list"]:
    print("")
    raise SystemExit(0)
if args[:2] == ["pr", "create"]:
    print("https://github.com/example/test-repo/pull/321")
    raise SystemExit(0)
if args[:2] == ["pr", "comment"]:
    body = ""
    if "--body" in args:
        body = args[args.index("--body") + 1]
    with open(os.environ["FAKE_GH_COMMENT_BODY"], "w") as f:
        f.write(body)
    print("https://github.com/example/test-repo/pull/321#issuecomment-999")
    raise SystemExit(0)
if args[:2] == ["pr", "checks"]:
    print("[]")
    raise SystemExit(0)
if args[:2] == ["pr", "ready"]:
    raise SystemExit(0)
if args[:2] == ["pr", "edit"]:
    raise SystemExit(0)
print("unknown gh command: " + " ".join(args), file=sys.stderr)
raise SystemExit(1)
""",
        encoding="utf-8",
    )
    path.chmod(0o755)


def main():
    with tempfile.TemporaryDirectory(prefix="riddle-proof-ship-artifacts-") as tmp:
        root = Path(tmp)
        origin = root / "origin.git"
        repo = root / "repo"
        artifacts = root / "artifacts"
        bin_dir = root / "bin"
        state_path = root / "state.json"
        comment_body_path = root / "comment.md"
        artifacts.mkdir()
        bin_dir.mkdir()

        run(["git", "init", "--bare", str(origin)], cwd=root)
        run(["git", "init", str(repo)], cwd=root)
        run(["git", "config", "user.name", "Test User"], cwd=repo)
        run(["git", "config", "user.email", "test@example.com"], cwd=repo)
        run(["git", "remote", "add", "origin", str(origin)], cwd=repo)
        run(["git", "checkout", "-b", "agent/proof-artifact-test"], cwd=repo)
        (repo / "README.md").write_text("initial\n", encoding="utf-8")
        run(["git", "add", "README.md"], cwd=repo)
        run(["git", "commit", "-m", "Initial"], cwd=repo)
        (repo / "README.md").write_text("changed\n", encoding="utf-8")

        # Tiny valid PNG header/body is enough for GitHub Markdown image embedding.
        screenshot = artifacts / "after-proof.png"
        screenshot.write_bytes(
            bytes.fromhex(
                "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de"
                "0000000c49444154789c63606060000000040001f61738550000000049454e44ae426082"
            )
        )
        proof_json = artifacts / "proof.json"
        proof_json.write_text(
            json.dumps(
                {
                    "version": "riddle-proof.test.v1",
                    "assertions": [{"name": "proof image published", "passed": True}],
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        write_fake_gh(bin_dir / "gh")
        state = {
            "repo_dir": str(repo),
            "branch": "agent/proof-artifact-test",
            "target_branch": "agent/proof-artifact-test",
            "run_id": "rp_ship_artifact_test",
            "change_request": "Prove PR artifact publication.",
            "commit_message": "Test proof artifact publication",
            "success_criteria": "The PR proof comment embeds a GitHub-hosted image.",
            "verification_mode": "proof",
            "requested_reference": "none",
            "reference": "none",
            "verify_status": "evidence_captured",
            "after_cdn": screenshot.as_uri(),
            "assertion_status": "passed",
            "proof_summary": "All assertions passed.",
            "proof_assessment_source": "supervising_agent",
            "proof_assessment": {
                "source": "supervising_agent",
                "decision": "ready_to_ship",
                "summary": "Evidence is strong enough to ship.",
            },
            "evidence_bundle": {
                "verification_mode": "proof",
                "after": {
                    "observation": {"valid": True, "reason": "ok", "telemetry_ready": True},
                    "supporting_artifacts": {
                        "has_structured_payload": True,
                        "proof_evidence_present": True,
                        "image_outputs": [{"name": "after-proof.png", "url": screenshot.as_uri()}],
                        "data_outputs": [{"name": "proof.json", "url": proof_json.as_uri()}],
                    },
                },
            },
            "verify_results": {
                "after": {
                    "raw": {
                        "outputs": [
                            {"name": "after-proof.png", "url": screenshot.as_uri(), "path": str(screenshot)},
                            {"name": "proof.json", "url": proof_json.as_uri(), "path": str(proof_json)},
                        ],
                    },
                },
            },
        }
        state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
        env = {
            **os.environ,
            "PATH": str(bin_dir) + os.pathsep + os.environ.get("PATH", ""),
            "RIDDLE_PROOF_STATE_FILE": str(state_path),
            "FAKE_GH_COMMENT_BODY": str(comment_body_path),
            "DISCORD_BOT_TOKEN": "",
            "OPENCLAW_HOME": str(root / "openclaw-home"),
        }

        run(["python3", str(SHIP)], cwd=repo, env=env)

        updated = json.loads(state_path.read_text(encoding="utf-8"))
        publication = updated.get("proof_artifact_publication") or {}
        assert publication.get("ok") is True, "proof artifact publication should be recorded"
        assert publication.get("artifacts"), "published artifact list should be recorded"
        assert updated.get("ship_report", {}).get("after_artifact_url", "").startswith(
            "https://github.com/user-attachments/assets/"
        ), "ship report should expose a GitHub-hosted attachment URL for the after artifact"

        comment = comment_body_path.read_text(encoding="utf-8")
        assert "file://" not in comment, "PR proof comment must not expose local file URLs"
        assert "raw.githubusercontent.com" not in comment, (
            "PR proof comment must not depend on unauthenticated raw GitHub URLs"
        )
        assert "![after](https://github.com/user-attachments/assets/" in comment, (
            "PR proof comment should embed the GitHub user-attachments screenshot when available"
        )
        assert "[proof.json](https://github.com/example/test-repo/blob/" in comment, (
            "PR proof comment should link the structured proof JSON"
        )
        assert "Proof artifacts:" in comment, "PR proof comment should link the artifact bundle"

        artifact_branch = publication.get("branch")
        refs = run(["git", f"--git-dir={origin}", "show-ref", f"refs/heads/{artifact_branch}"], cwd=root)
        assert artifact_branch in refs.stdout, "artifact branch should be pushed to origin"


if __name__ == "__main__":
    main()
