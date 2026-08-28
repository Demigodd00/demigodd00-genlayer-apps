"""Run StreakPact's repeatable pre-deployment or post-deployment release gate."""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts" / "streak_pact_v2.py"
DIRECT_TEST_PATH = ROOT / "tests" / "direct" / "test_streak_pact_v2.py"
DEPLOY_SCRIPT_PATH = ROOT / "scripts" / "deploy_streak_pact_v2.py"
RUNNER_PREP_PATH = ROOT / "scripts" / "prepare_gltest_runner.py"
DEPLOYMENT_PATH = ROOT / "deployments" / "streak_pact_v2_studionet.json"
WEB_PATH = ROOT / "apps" / "streakpact-web"
ADDRESS_PATTERN = re.compile(r"^0x[0-9a-fA-F]{40}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check StreakPact StudioNet release readiness")
    parser.add_argument(
        "--require-deployment",
        action="store_true",
        help="Fail unless a current zero-fee StudioNet deployment and matching frontend address exist",
    )
    parser.add_argument("--skip-web", action="store_true", help="Skip pnpm typecheck, build, and audit")
    return parser.parse_args()


def run_check(label: str, command: list[str], cwd: Path = ROOT) -> bool:
    print(f"\n[{label}]")
    utf8_env = os.environ.copy()
    utf8_env["PYTHONUTF8"] = "1"
    result = subprocess.run(command, cwd=cwd, check=False, env=utf8_env)
    if result.returncode == 0:
        print(f"PASS: {label}")
        return True
    print(f"FAIL: {label}")
    return False


def read_env_address() -> str:
    for path in (WEB_PATH / ".env.production.local", WEB_PATH / ".env.local"):
        if not path.exists():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if line.startswith("NEXT_PUBLIC_STREAKPACT_V2_ADDRESS="):
                return line.split("=", 1)[1].strip()
    return ""


def verify_deployment(require_deployment: bool) -> bool:
    print("\n[deployment provenance]")
    if not DEPLOYMENT_PATH.exists():
        message = "PENDING: no permanent StreakPact V2 StudioNet deployment record exists"
        print(message)
        return not require_deployment

    try:
        record = json.loads(DEPLOYMENT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"FAIL: deployment record cannot be read: {error}")
        return False

    code = CONTRACT_PATH.read_text(encoding="utf-8")
    expected_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
    address = str(record.get("address", ""))
    constructor = record.get("constructor_args", {})
    checks = {
        "contract name is StreakPactV2": record.get("contract") == "StreakPactV2",
        "network is StudioNet": record.get("network") == "studionet",
        "address is valid": ADDRESS_PATTERN.fullmatch(address) is not None,
        "source hash matches": record.get("source_sha256") == expected_hash,
        "preflight was not skipped": record.get("preflight_skipped") is False,
        "fee is zero": isinstance(constructor, dict) and constructor.get("fee_bps") == 0,
        "runner pin matches": record.get("runner_dependency") == code.splitlines()[0],
    }
    frontend_address = read_env_address()
    checks["frontend address matches"] = frontend_address.lower() == address.lower()

    for label, passed in checks.items():
        print(f"{'PASS' if passed else 'FAIL'}: {label}")
    return all(checks.values())


def main() -> int:
    args = parse_args()
    results = [
        run_check("GenVM lint and validation", ["genvm-lint", "check", str(CONTRACT_PATH)]),
        run_check("pinned direct-test runner", [sys.executable, str(RUNNER_PREP_PATH)]),
        run_check("direct contract tests", [sys.executable, "-m", "pytest", str(DIRECT_TEST_PATH), "-q"]),
        run_check(
            "deployment script compilation",
            [sys.executable, "-m", "py_compile", str(DEPLOY_SCRIPT_PATH)],
        ),
    ]

    if not args.skip_web:
        pnpm = shutil.which("pnpm") or shutil.which("pnpm.cmd")
        if pnpm is None:
            print("\nFAIL: pnpm is not installed")
            results.append(False)
        else:
            results.extend(
                [
                    run_check("web API safeguards", [pnpm, "test"], WEB_PATH),
                    run_check("web typecheck", [pnpm, "typecheck"], WEB_PATH),
                    run_check("web production build", [pnpm, "build"], WEB_PATH),
                    run_check(
                        "web production dependency audit",
                        [pnpm, "audit", "--prod", "--audit-level=high"],
                        WEB_PATH,
                    ),
                ]
            )

    results.append(verify_deployment(args.require_deployment))
    print("\nStreakPact release gate: " + ("PASS" if all(results) else "FAIL"))
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
