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


def run_failure(args, cwd, env=None):
    result = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True, timeout=120)
    if result.returncode == 0:
        raise AssertionError(f"{' '.join(args)} unexpectedly succeeded\nstdout:\n{result.stdout}")
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
        png_bytes = bytes.fromhex(
            "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de"
            "0000000c49444154789c63606060000000040001f61738550000000049454e44ae426082"
        )
        before_screenshot = artifacts / "before-proof.png"
        before_screenshot.write_bytes(png_bytes)
        screenshot = artifacts / "after-proof.png"
        screenshot.write_bytes(
            png_bytes
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
            "requested_reference": "before",
            "reference": "before",
            "verify_status": "evidence_captured",
            "before_cdn": before_screenshot.as_uri(),
            "after_cdn": screenshot.as_uri(),
            "assertion_status": "passed",
            "proof_summary": "All assertions passed.",
            "proof_assessment_source": "supervising_agent",
            "proof_assessment": {
                "assessment_id": "assessment_ship_artifact_test",
                "source": "supervising_agent",
                "decision": "ready_to_ship",
                "summary": "Evidence is strong enough to ship.",
            },
            "checkpoint_summary": {
                "latest_packet_id": "rppkt_ship_artifact_test",
                "latest_response_packet_id": "rppkt_ship_artifact_test",
            },
            "proof_session": {
                "session_id": "session_ship_artifact_test",
                "fingerprint": "fingerprint_ship_artifact_test",
            },
            "proof_session_fingerprint": "fingerprint_ship_artifact_test",
            "evidence_bundle": {
                "id": "bundle_ship_artifact_test",
                "verification_mode": "proof",
                "proof_session": {
                    "session_id": "session_ship_artifact_test",
                    "fingerprint": "fingerprint_ship_artifact_test",
                },
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
        ship_report = updated.get("ship_report", {})
        assert ship_report.get("after_artifact_url", "").startswith(
            "https://github.com/user-attachments/assets/"
        ), "ship report should expose a GitHub-hosted attachment URL for the after artifact"
        ship_gate = ship_report.get("ship_gate") or {}
        assert ship_gate.get("ok") is True, "public ship report should expose a passing ship gate"
        assert ship_gate.get("required_baselines") == ["before"], (
            "public ship report should expose required baseline obligations"
        )
        gate_evidence = ship_gate.get("evidence") or {}
        assert gate_evidence.get("reference") == "before", "ship gate should expose the reference mode"
        assert gate_evidence.get("before_present") is True, "ship gate should expose baseline presence"
        assert gate_evidence.get("after_present") is True, "ship gate should expose after evidence presence"
        assert gate_evidence.get("verify_status") == "evidence_captured", (
            "ship gate should expose verify status"
        )
        assert gate_evidence.get("proof_assessment_source") == "supervising_agent", (
            "ship gate should expose trusted proof source"
        )
        assert gate_evidence.get("proof_assessment_decision") == "ready_to_ship", (
            "ship gate should expose proof decision"
        )
        assert gate_evidence.get("hard_blockers") == [], "ship gate should expose hard blockers"
        provenance = ship_report.get("proof_provenance") or {}
        assert provenance.get("version") == "riddle-proof.provenance.v1", (
            "ship report should expose proof provenance version"
        )
        assert provenance.get("run_id") == "rp_ship_artifact_test", (
            "ship report provenance should expose the run id"
        )
        assert provenance.get("checkpoint_packet_id") == "rppkt_ship_artifact_test", (
            "ship report provenance should expose the checkpoint packet id"
        )
        assert provenance.get("checkpoint_response_packet_id") == "rppkt_ship_artifact_test", (
            "ship report provenance should expose the checkpoint response packet id"
        )
        assert provenance.get("evidence_bundle_id") == "bundle_ship_artifact_test", (
            "ship report provenance should expose the evidence bundle id"
        )
        assert provenance.get("proof_session_id") == "session_ship_artifact_test", (
            "ship report provenance should expose the proof session id"
        )
        assert provenance.get("proof_session_fingerprint") == "fingerprint_ship_artifact_test", (
            "ship report provenance should expose the proof session fingerprint"
        )
        assert provenance.get("proof_assessment_id") == "assessment_ship_artifact_test", (
            "ship report provenance should expose the proof assessment id"
        )
        assert provenance.get("proof_assessment_source") == "supervising_agent", (
            "ship report provenance should expose the proof assessment source"
        )
        assert provenance.get("proof_assessment_decision") == "ready_to_ship", (
            "ship report provenance should expose the proof assessment decision"
        )
        assert provenance.get("artifact_publication_commit") == publication.get("commit"), (
            "ship report provenance should expose the artifact publication commit"
        )
        assert provenance.get("artifact_manifest_url") == ship_report.get("proof_artifacts_manifest_url"), (
            "ship report provenance should expose the artifact manifest URL"
        )
        assert provenance.get("artifact_source_fingerprint") == publication.get("source_fingerprint"), (
            "ship report provenance should expose the artifact source fingerprint"
        )

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
        assert "### Ship gate" in comment, "PR proof comment should include the public ship gate"
        assert "Status: ok" in comment, "PR proof comment should expose passing ship gate status"
        assert "Required baselines: before" in comment, (
            "PR proof comment should expose required baseline obligations"
        )

        artifact_branch = publication.get("branch")
        refs = run(["git", f"--git-dir={origin}", "show-ref", f"refs/heads/{artifact_branch}"], cwd=root)
        assert artifact_branch in refs.stdout, "artifact branch should be pushed to origin"

        invalid_reference_state = {**state, "requested_reference": "none", "reference": "none"}
        state_path.write_text(json.dumps(invalid_reference_state, indent=2), encoding="utf-8")
        invalid_reference = run_failure(["python3", str(SHIP)], cwd=repo, env=env)
        assert "reference must be before, prod, or both; got none" in invalid_reference.stderr, (
            "ship.py should reject unsupported public report reference modes"
        )

        hard_blocker_state = {
            **state,
            "proof_assessment_request": {"hard_blockers": ["structured proof assertion failed"]},
        }
        state_path.write_text(json.dumps(hard_blocker_state, indent=2), encoding="utf-8")
        hard_blocker = run_failure(["python3", str(SHIP)], cwd=repo, env=env)
        assert "proof hard blocker prevents ready_to_ship: structured proof assertion failed" in hard_blocker.stderr, (
            "ship.py should reject hard blockers before publishing a pass report"
        )


if __name__ == "__main__":
    main()
