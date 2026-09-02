"""Preflight, deploy, and record StreakPact V2.

This script never generates an owner key. Deployment requires an explicitly
provided signer and treasury, and the contract/test preflight runs by default.

Environment:
    STREAKPACT_PRIVATE_KEY       required deployment signer
    STREAKPACT_TREASURY          required fee treasury (prefer a multisig)
    STREAKPACT_NETWORK           studionet (default) | localnet

Example:
    python scripts/deploy_streak_pact_v2.py --fee-bps 0 --period-secs 86400
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from eth_account import Account
from genlayer_py import create_client
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import localnet, studionet

ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = ROOT / "contracts" / "streak_pact_v2.py"
TEST_PATH = ROOT / "tests" / "direct" / "test_streak_pact_v2.py"
DEPLOYMENTS_DIR = ROOT / "deployments"
FRONTEND_ENV_PATH = ROOT / "apps" / "streakpact-web" / ".env.local"
DEPLOY_ENV_PATH = ROOT / ".env"
DEPLOY_ENV_KEYS = {
    "STREAKPACT_PRIVATE_KEY",
    "STREAKPACT_TREASURY",
    "STREAKPACT_NETWORK",
}

ADDRESS_PATTERN = re.compile(r"^0x[0-9a-fA-F]{40}$")
FEE_BPS_CAP = 500
MIN_PERIOD_SECS = 60
MAX_PERIOD_SECS = 30 * 24 * 60 * 60
MIN_APPEAL_WINDOW_SECS = 5 * 60
MAX_APPEAL_WINDOW_SECS = 7 * 24 * 60 * 60


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deploy a preflighted StreakPact V2.1 contract")
    parser.add_argument("--fee-bps", type=int, default=0)
    parser.add_argument("--period-secs", type=int, default=86400)
    parser.add_argument("--appeal-window-secs", type=int, default=86400)
    parser.add_argument(
        "--configure-frontend",
        action="store_true",
        help="After a successful deployment, safely upsert the public address in apps/streakpact-web/.env.local",
    )
    parser.add_argument(
        "--skip-preflight",
        action="store_true",
        help="Emergency/local use only; never use for a release deployment",
    )
    return parser.parse_args()


def load_deploy_environment() -> None:
    """Load only StreakPact deployment values from the ignored root .env file."""
    if not DEPLOY_ENV_PATH.exists():
        return
    for raw_line in DEPLOY_ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key not in DEPLOY_ENV_KEYS or os.environ.get(key):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if value:
            os.environ[key] = value


def validate_configuration(args: argparse.Namespace, treasury: str, network_name: str) -> None:
    if not 0 <= args.fee_bps <= FEE_BPS_CAP:
        raise ValueError(f"fee_bps must be between 0 and {FEE_BPS_CAP}")
    if not MIN_PERIOD_SECS <= args.period_secs <= MAX_PERIOD_SECS:
        raise ValueError("period_secs is outside the contract bounds")
    if not MIN_APPEAL_WINDOW_SECS <= args.appeal_window_secs <= MAX_APPEAL_WINDOW_SECS:
        raise ValueError("appeal_window_secs is outside the contract bounds")
    if ADDRESS_PATTERN.fullmatch(treasury) is None:
        raise ValueError("STREAKPACT_TREASURY must be a 20-byte 0x address")
    if network_name == "studionet" and args.fee_bps != 0:
        raise ValueError("StudioNet StreakPact deployments must use --fee-bps 0")


def run_preflight() -> None:
    utf8_env = os.environ.copy()
    utf8_env["PYTHONUTF8"] = "1"
    subprocess.run(
        ["genvm-lint", "check", str(CODE_PATH)],
        cwd=ROOT,
        check=True,
        env=utf8_env,
    )
    subprocess.run(
        [sys.executable, "-m", "pytest", str(TEST_PATH), "-q"],
        cwd=ROOT,
        check=True,
        env=utf8_env,
    )


def extract_contract_address(receipt: dict) -> str:
    decoded = receipt.get("tx_data_decoded", {})
    if decoded.get("contract_address"):
        return decoded["contract_address"]
    data = receipt.get("data", {})
    if data.get("contract_address"):
        return data["contract_address"]
    raise ValueError("deployment receipt did not contain a contract address")


def assert_execution_succeeded(receipt: dict) -> None:
    if receipt.get("error"):
        raise RuntimeError(f"deployment failed: {receipt['error']}")
    if not tx_execution_succeeded(receipt):
        consensus = receipt.get("consensus_data", {})
        leader_receipt = consensus.get("leader_receipt", []) if isinstance(consensus, dict) else []
        if isinstance(leader_receipt, dict):
            leader_receipt = [leader_receipt]
        detail = ""
        if isinstance(leader_receipt, list) and leader_receipt:
            first = leader_receipt[0]
            if isinstance(first, dict):
                detail = str(first.get("genvm_result") or first.get("execution_result") or "")
        suffix = f": {detail[:500]}" if detail else ""
        raise RuntimeError(f"deployment finalized without successful contract execution{suffix}")


def upsert_frontend_environment(contract_address: str) -> None:
    existing_lines = []
    if FRONTEND_ENV_PATH.exists():
        existing_lines = FRONTEND_ENV_PATH.read_text(encoding="utf-8").splitlines()

    replacements = {
        "NEXT_PUBLIC_STREAKPACT_V2_ADDRESS": contract_address,
        "NEXT_PUBLIC_NETWORK_NAME": "StudioNet",
    }
    output_lines = []
    replaced = set()
    for line in existing_lines:
        key = line.split("=", 1)[0].strip() if "=" in line else ""
        if key in replacements:
            output_lines.append(f"{key}={replacements[key]}")
            replaced.add(key)
        else:
            output_lines.append(line)
    for key, value in replacements.items():
        if key not in replaced:
            output_lines.append(f"{key}={value}")

    FRONTEND_ENV_PATH.write_text("\n".join(output_lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    load_deploy_environment()
    private_key = os.environ.get("STREAKPACT_PRIVATE_KEY", "").strip()
    treasury = os.environ.get("STREAKPACT_TREASURY", "").strip()
    if not private_key:
        raise RuntimeError("STREAKPACT_PRIVATE_KEY is required; no key will be generated")
    if not treasury:
        raise RuntimeError("STREAKPACT_TREASURY is required; use a reviewed treasury or multisig")
    network_name = os.environ.get("STREAKPACT_NETWORK", "studionet").strip().lower()
    chains = {"studionet": studionet, "localnet": localnet}
    if network_name not in chains:
        raise ValueError("STREAKPACT_NETWORK must be studionet or localnet")
    validate_configuration(args, treasury, network_name)

    if not args.skip_preflight:
        run_preflight()

    code = CODE_PATH.read_text(encoding="utf-8")
    source_sha256 = hashlib.sha256(code.encode("utf-8")).hexdigest()
    runner_dependency = code.splitlines()[0]
    account = Account.from_key(private_key)
    client = create_client(chain=chains[network_name])
    constructor_args = [treasury, args.fee_bps, args.period_secs, args.appeal_window_secs]

    print(
        f"network={network_name} deployer={account.address} treasury={treasury} "
        f"source_sha256={source_sha256}"
    )
    tx_hash = client.deploy_contract(code=code, account=account, args=constructor_args)
    print(f"transaction={tx_hash}")
    receipt = client.wait_for_transaction_receipt(transaction_hash=tx_hash)
    assert_execution_succeeded(receipt)
    contract_address = extract_contract_address(receipt)

    record = {
        "contract": "StreakPactV2",
        "version": "2.1.0",
        "network": network_name,
        "address": contract_address,
        "transaction_hash": str(tx_hash),
        "deployer": account.address,
        "treasury": treasury,
        "constructor_args": {
            "treasury": treasury,
            "fee_bps": args.fee_bps,
            "period_secs": args.period_secs,
            "appeal_window_secs": args.appeal_window_secs,
        },
        "source_sha256": source_sha256,
        "runner_dependency": runner_dependency,
        "preflight_skipped": args.skip_preflight,
        "deployed_at": datetime.now(timezone.utc).isoformat(),
    }
    DEPLOYMENTS_DIR.mkdir(exist_ok=True)
    output_path = DEPLOYMENTS_DIR / f"streak_pact_v2_{network_name}.json"
    if output_path.exists():
        previous = json.loads(output_path.read_text(encoding="utf-8"))
        previous_address = str(previous.get("address", "unknown")).lower()
        history_dir = DEPLOYMENTS_DIR / "history"
        history_dir.mkdir(exist_ok=True)
        history_path = history_dir / f"streak_pact_v2_{network_name}_{previous_address}.json"
        if not history_path.exists():
            shutil.copy2(output_path, history_path)
    output_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    if args.configure_frontend:
        upsert_frontend_environment(contract_address)
    print(f"deployed={contract_address}")
    print(f"record={output_path}")
    if args.configure_frontend:
        print(f"frontend_env={FRONTEND_ENV_PATH}")
    else:
        print(
            "next_step=set NEXT_PUBLIC_STREAKPACT_V2_ADDRESS to the deployed address "
            "or rerun with --configure-frontend on the intended deployment"
        )


if __name__ == "__main__":
    main()
