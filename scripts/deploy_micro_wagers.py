"""Preflight, deploy, and record the StudioNet MicroWagers demo.

Environment:
    MICROWAGERS_PRIVATE_KEY    required deployment signer
    MICROWAGERS_NETWORK        studionet (default) | localnet

Example:
    python scripts/deploy_micro_wagers.py --fee-bps 0 --appeal-window-secs 300
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import localnet, studionet

ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = ROOT / "contracts" / "micro_wagers.py"
TEST_PATH = ROOT / "tests" / "direct" / "test_micro_wagers.py"
DEPLOYMENTS_DIR = ROOT / "deployments"

FEE_BPS_CAP = 1000
MIN_APPEAL_WINDOW_SECS = 5 * 60
MAX_APPEAL_WINDOW_SECS = 7 * 24 * 60 * 60


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Deploy the preflighted MicroWagers StudioNet demo"
    )
    parser.add_argument("--fee-bps", type=int, default=0)
    parser.add_argument("--appeal-window-secs", type=int, default=300)
    parser.add_argument(
        "--skip-preflight",
        action="store_true",
        help="Local debugging only; keep preflight enabled for StudioNet",
    )
    return parser.parse_args()


def validate_configuration(args: argparse.Namespace) -> None:
    if not 0 <= args.fee_bps <= FEE_BPS_CAP:
        raise ValueError(f"fee_bps must be between 0 and {FEE_BPS_CAP}")
    if not MIN_APPEAL_WINDOW_SECS <= args.appeal_window_secs <= MAX_APPEAL_WINDOW_SECS:
        raise ValueError(
            f"appeal_window_secs must be {MIN_APPEAL_WINDOW_SECS}..{MAX_APPEAL_WINDOW_SECS}"
        )


def run_preflight() -> None:
    subprocess.run(
        ["genvm-lint", "check", str(CODE_PATH)],
        cwd=ROOT,
        check=True,
    )
    subprocess.run(
        [sys.executable, "-m", "pytest", str(TEST_PATH), "-q"],
        cwd=ROOT,
        check=True,
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
    serialized = json.dumps(receipt).lower()
    if '"execution_result": "error"' in serialized or '"execution_result": "failed"' in serialized:
        raise RuntimeError("deployment finalized with a contract execution failure")
    if receipt.get("error"):
        raise RuntimeError(f"deployment failed: {receipt['error']}")


def main() -> None:
    args = parse_args()
    validate_configuration(args)

    private_key = os.environ.get("MICROWAGERS_PRIVATE_KEY", "").strip()
    if not private_key:
        raise RuntimeError("MICROWAGERS_PRIVATE_KEY is required; no key will be generated")

    network_name = os.environ.get("MICROWAGERS_NETWORK", "studionet").strip().lower()
    chains = {"studionet": studionet, "localnet": localnet}
    if network_name not in chains:
        raise ValueError("MICROWAGERS_NETWORK must be studionet or localnet")

    if not args.skip_preflight:
        run_preflight()

    code = CODE_PATH.read_text(encoding="utf-8")
    source_sha256 = hashlib.sha256(code.encode("utf-8")).hexdigest()
    runner_dependency = code.splitlines()[0]
    account = Account.from_key(private_key)
    client = create_client(chain=chains[network_name])
    constructor_args = [args.fee_bps, args.appeal_window_secs]

    print(
        f"network={network_name} deployer={account.address} "
        f"source_sha256={source_sha256}"
    )
    tx_hash = client.deploy_contract(code=code, account=account, args=constructor_args)
    print(f"transaction={tx_hash}")
    receipt = client.wait_for_transaction_receipt(transaction_hash=tx_hash)
    assert_execution_succeeded(receipt)
    contract_address = extract_contract_address(receipt)

    record = {
        "contract": "MicroWagers",
        "version": "1.1.0-studionet",
        "network": network_name,
        "address": contract_address,
        "transaction_hash": str(tx_hash),
        "deployer": account.address,
        "treasury": account.address,
        "constructor_args": {
            "fee_bps": args.fee_bps,
            "appeal_window_secs": args.appeal_window_secs,
        },
        "source_sha256": source_sha256,
        "runner_dependency": runner_dependency,
        "preflight_skipped": args.skip_preflight,
        "deployed_at": datetime.now(timezone.utc).isoformat(),
    }
    DEPLOYMENTS_DIR.mkdir(exist_ok=True)
    output_path = DEPLOYMENTS_DIR / f"micro_wagers_{network_name}.json"
    output_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(f"deployed={contract_address}")
    print(f"record={output_path}")


if __name__ == "__main__":
    main()
